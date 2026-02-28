from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import google.generativeai as genai
import os
from dotenv import load_dotenv
from typing import Optional
import io
import time
import json

from voice_service import VoiceService
from rag_service import RAGService
from pharmacy_service import PharmacyService
from ml_engine import analyze_risk, parse_medical_text

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# Initialize FastAPI
app = FastAPI(title="Healthcare AI Assistant", version="2.0.0")

# CORS Configuration
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
_allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Gemini Model
gemini_model = genai.GenerativeModel('gemini-2.5-flash')
chat_sessions = {}

voice_service = VoiceService(api_key=os.getenv("ELEVENLABS_API_KEY"))
rag_service = RAGService(
    supabase_url=os.getenv("VITE_SUPABASE_URL"),
    supabase_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY")
)
pharmacy_service = PharmacyService()

# ==========================================
# Request/Response Models
# ==========================================
class ChatRequest(BaseModel):
    message: str
    language: str = "en"
    user_id: Optional[str] = None
    use_records: bool = False
    use_voice: bool = False  # New: indicates if user used voice input

class ChatResponse(BaseModel):
    success: bool
    response: str
    audio_url: Optional[str] = None
    audio_data: Optional[str] = None  # Base64 encoded audio
    error: Optional[str] = None

class DocumentProcessRequest(BaseModel):
    file_url: str
    record_id: str
    patient_id: str

class HealthAnalysisRequest(BaseModel):
    user_id: str

class PharmacyChatRequest(BaseModel):
    message: str
    patient_id: str
    language: str = "en"
    use_voice: bool = False

class ManualOrderRequest(BaseModel):
    patient_id: str          # auth.uid()
    items: list              # [{"medicine_id": str, "qty": int}]

class PharmacistAIRequest(BaseModel):
    message: str
    use_voice: bool = False

# ==========================================
# ROUTES
# ==========================================

# ---- Medicine / Order helper (shared Supabase client) ----
def _get_sb():
    from supabase import create_client
    return create_client(
        os.getenv("VITE_SUPABASE_URL"),
        os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
    )

@app.get("/my-medicines")
async def get_my_medicines(patient_id: str):
    """
    Returns the patient's active medicine cabinet:
    - All finalized orders with their order_items joined to medicines
    - Includes qty, dosage_text, frequency_per_day, days_supply
    Scoped strictly to the requesting patient via patient_id = auth.uid()
    resolved to patients.id.
    """
    try:
        sb = _get_sb()
        # Resolve auth uid → patients.id
        pt = sb.table("patients").select("id").eq("user_id", patient_id).single().execute()
        if not pt.data:
            raise HTTPException(status_code=404, detail="Patient not found")
        pid = pt.data["id"]

        # Fetch all orders for this patient (finalized + pending)
        orders_res = (
            sb.table("orders")
            .select("id,status,total_items,channel,created_at,finalized_at")
            .eq("patient_id", pid)
            .order("created_at", desc=True)
            .execute()
        )
        orders = orders_res.data or []

        enriched = []
        for order in orders:
            items_res = (
                sb.table("order_items")
                .select(
                    "id,qty,dosage_text,frequency_per_day,days_supply,"
                    "medicines(id,name,strength,unit_type,prescription_required,price_rec)"
                )
                .eq("order_id", order["id"])
                .execute()
            )
            order["items"] = items_res.data or []
            enriched.append(order)

        return {"success": True, "orders": enriched}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/available-medicines")
async def get_available_medicines(search: str = "", limit: int = 50):
    """Return medicines catalogue with stock > 0, optionally filtered by name."""
    try:
        sb = _get_sb()
        q = sb.table("medicines").select(
            "id,name,strength,unit_type,stock,prescription_required,price_rec,description"
        ).gt("stock", 0).limit(limit)
        if search:
            q = q.ilike("name", f"%{search}%")
        res = q.execute()
        return {"success": True, "medicines": res.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/manual-order")
async def manual_order(request: ManualOrderRequest):
    """
    Create and finalize a manual order for a patient.
    Checks stock availability and prescription requirement.
    Decrements stock via decrement_medicine_stock RPC.
    """
    try:
        sb = _get_sb()
        # Resolve auth uid → patients.id
        pt = sb.table("patients").select("id").eq("user_id", request.patient_id).single().execute()
        if not pt.data:
            raise HTTPException(status_code=404, detail="Patient not found")
        pid = pt.data["id"]

        errors = []
        valid_items = []

        for item in request.items:
            med_id = item.get("medicine_id")
            qty = max(1, int(item.get("qty", 1)))

            med = sb.table("medicines").select(
                "id,name,stock,prescription_required"
            ).eq("id", med_id).single().execute()

            if not med.data:
                errors.append(f"Medicine {med_id} not found")
                continue
            m = med.data

            if m["prescription_required"]:
                # Quick check — look for any prescription record mentioning this medicine
                recs = sb.table("records").select("extracted_text").eq("patient_id", pid).eq("record_type", "prescription").execute()
                has_rx = any(
                    m["name"].lower() in (r.get("extracted_text") or "").lower()
                    for r in (recs.data or [])
                )
                if not has_rx:
                    errors.append(f"{m['name']} requires a prescription. Please upload one first.")
                    continue

            if m["stock"] < qty:
                errors.append(f"Not enough stock for {m['name']} (available: {m['stock']})")
                continue

            valid_items.append({"med": m, "qty": qty})

        if not valid_items:
            return {"success": False, "error": "; ".join(errors) if errors else "No valid items"}

        # Create order with status 'pending' (valid per CHECK constraint)
        order_res = sb.table("orders").insert({
            "patient_id": pid,
            "status": "pending",
            "total_items": sum(i["qty"] for i in valid_items),
            "channel": "web",
        }).execute()
        order_id = order_res.data[0]["id"]

        # Insert order_items
        for i in valid_items:
            sb.table("order_items").insert({
                "order_id": order_id,
                "medicine_id": i["med"]["id"],
                "qty": i["qty"],
                "dosage_text": "As directed",
                "frequency_per_day": 1,
                "days_supply": 30,
            }).execute()

        # Finalise order and decrement stock
        for i in valid_items:
            try:
                sb.rpc("decrement_medicine_stock", {
                    "p_medicine_id": i["med"]["id"],
                    "p_qty": i["qty"],
                }).execute()
            except Exception:
                pass  # Stock decrement failure should not block the order

        from datetime import datetime, timezone
        sb.table("orders").update({
            "status": "fulfilled",
            "finalized_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", order_id).execute()

        return {
            "success": True,
            "order_id": order_id,
            "items_ordered": [{"name": i["med"]["name"], "qty": i["qty"]} for i in valid_items],
            "warnings": errors,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/check-rx")
async def check_rx(patient_id: str, medicine_name: str):
    """
    Pre-flight check: does this patient have an uploaded prescription record
    that mentions the given medicine name in its extracted_text?
    Returns {has_prescription: bool}.
    """
    try:
        sb = _get_sb()
        pt = sb.table("patients").select("id").eq("user_id", patient_id).single().execute()
        if not pt.data:
            return {"has_prescription": False}
        pid = pt.data["id"]
        recs = (
            sb.table("records")
            .select("extracted_text")
            .eq("patient_id", pid)
            .eq("record_type", "prescription")
            .execute()
        )
        has_rx = any(
            medicine_name.lower() in (r.get("extracted_text") or "").lower()
            for r in (recs.data or [])
        )
        return {"has_prescription": has_rx}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/verify-rx-upload")
async def verify_rx_upload(
    patient_id: str = Form(...),
    medicine_name: str = Form(...),
    file: UploadFile = File(...),
):
    """
    Upload a prescription image/PDF and verify it mentions the given medicine.
    Steps:
      1. Read uploaded file bytes
      2. Send to Gemini Vision to extract all text from the document
      3. Check whether medicine_name appears in the extracted text
      4. If valid, save as a prescription record in the records table
      5. Return {valid, message, extracted_text}
    """
    import base64

    try:
        contents = await file.read()
        if not contents:
            return {"valid": False, "message": "Uploaded file is empty.", "extracted_text": ""}

        # Determine MIME type
        mime = file.content_type or "image/jpeg"
        # Convert to base64 for Gemini inline data
        b64 = base64.b64encode(contents).decode("utf-8")

        # Ask Gemini to extract all text from the prescription document
        extraction_prompt = (
            "You are a medical OCR assistant. Extract ALL text from this prescription image "
            "exactly as written. Include medicine names, dosages, instructions, patient name, "
            "doctor name, and date. Output only the extracted text, nothing else."
        )
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content([
            extraction_prompt,
            {"mime_type": mime, "data": b64},
        ])
        extracted_text = response.text.strip() if response.text else ""

        # Check if the medicine name appears in the extracted text
        med_lower = medicine_name.lower()
        if med_lower not in extracted_text.lower():
            return {
                "valid": False,
                "message": (
                    f"❌ Prescription does not mention **{medicine_name}**. "
                    "Please upload a valid prescription that includes this medicine."
                ),
                "extracted_text": extracted_text,
            }

        # Valid prescription — save to records table for future reference
        try:
            sb = _get_sb()
            pt = sb.table("patients").select("id").eq("user_id", patient_id).single().execute()
            if pt.data:
                pid = pt.data["id"]
                sb.table("records").insert({
                    "patient_id": pid,
                    "uploaded_by": patient_id,   # auth uid
                    "record_type": "prescription",
                    "title": f"Prescription – {medicine_name}",
                    "extracted_text": extracted_text,
                    "file_name": file.filename or "prescription.jpg",
                    "file_size": len(contents),
                    "notes": f"Auto-uploaded during medicine purchase for {medicine_name}",
                }).execute()
        except Exception as save_err:
            print(f"⚠️ Could not save prescription record: {save_err}")
            # Don't fail the verification if saving fails

        return {
            "valid": True,
            "message": f"✅ Valid prescription found for **{medicine_name}**. You can proceed with the order.",
            "extracted_text": extracted_text,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Dose-consumption models ──────────────────────────────────────────────────

class ConsumeDoseRequest(BaseModel):
    patient_id: str      # auth.uid()
    order_item_id: str   # order_items.id


@app.post("/consume-dose")
async def consume_dose(request: ConsumeDoseRequest):
    """
    "Taken" button for as-needed medicines.
    Decrements order_items.qty by 1 for the given item.
    Only allowed if qty > 0 and the item belongs to the requesting patient.
    """
    try:
        sb = _get_sb()

        # Verify ownership: trace order_item → order → patients.user_id
        item_res = (
            sb.table("order_items")
            .select("id, qty, orders(patient_id, patients(user_id))")
            .eq("id", request.order_item_id)
            .maybe_single()
            .execute()
        )
        if not item_res.data:
            raise HTTPException(status_code=404, detail="Order item not found")

        item = item_res.data
        owner_uid = (
            item.get("orders", {}).get("patients", {}).get("user_id")
        )
        if owner_uid != request.patient_id:
            raise HTTPException(status_code=403, detail="Not your medicine")

        current_qty = item.get("qty", 0)
        if current_qty <= 0:
            return {"success": False, "error": "No remaining units to consume"}

        new_qty = current_qty - 1
        sb.table("order_items").update({"qty": new_qty}).eq("id", request.order_item_id).execute()

        return {"success": True, "remaining": new_qty}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/due-doses")
async def due_doses(patient_id: str):
    """
    Return order_items for this patient's fulfilled orders that have
    frequency_per_day set (scheduled medicines), so the frontend can
    show next-dose info. Also returns IST current hour for reference.
    """
    try:
        from datetime import datetime, timezone, timedelta
        IST = timezone(timedelta(hours=5, minutes=30))
        now_ist = datetime.now(IST)

        sb = _get_sb()
        pt = sb.table("patients").select("id").eq("user_id", patient_id).single().execute()
        if not pt.data:
            return {"success": True, "items": [], "now_ist_hour": now_ist.hour}
        pid = pt.data["id"]

        orders_res = (
            sb.table("orders")
            .select("id")
            .eq("patient_id", pid)
            .in_("status", ["fulfilled", "approved"])
            .execute()
        )
        order_ids = [o["id"] for o in (orders_res.data or [])]
        if not order_ids:
            return {"success": True, "items": [], "now_ist_hour": now_ist.hour}

        items_res = (
            sb.table("order_items")
            .select("id, qty, frequency_per_day, dosage_text, medicines(name)")
            .in_("order_id", order_ids)
            .not_.is_("frequency_per_day", "null")
            .gt("qty", 0)
            .execute()
        )
        return {"success": True, "items": items_res.data or [], "now_ist_hour": now_ist.hour}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Background auto-decrement scheduler ─────────────────────────────────────
# Dose windows in IST hours. When the backend clock ticks past one of these,
# we decrement qty by 1 for all scheduled (frequency_per_day >= window index)
# active order_items across all patients.
_DOSE_WINDOWS_IST = [8, 14, 20]   # 08:00, 14:00, 20:00 IST
_last_decremented_window: set = set()   # tracks "YYYY-MM-DD:HH" already processed

def _run_scheduled_decrement():
    """Background thread: checks every minute if a dose window has arrived."""
    import threading
    from datetime import datetime, timezone, timedelta

    IST = timezone(timedelta(hours=5, minutes=30))

    def _decrement_loop():
        global _last_decremented_window
        while True:
            try:
                now = datetime.now(IST)
                window_key = f"{now.date()}:{now.hour}"

                if now.hour in _DOSE_WINDOWS_IST and window_key not in _last_decremented_window:
                    _last_decremented_window.add(window_key)
                    _do_auto_decrement(now.hour)

                # Prune old keys (keep only today's)
                today = str(now.date())
                _last_decremented_window = {k for k in _last_decremented_window if k.startswith(today)}

            except Exception as exc:
                print(f"⚠️ Auto-decrement scheduler error: {exc}")
            time.sleep(60)   # check every minute

    t = threading.Thread(target=_decrement_loop, daemon=True, name="dose-scheduler")
    t.start()
    print("⏰ Dose scheduler started (windows: 08:00, 14:00, 20:00 IST)")


def _do_auto_decrement(ist_hour: int):
    """
    At dose window ist_hour, decrement qty by 1 for every active order_item
    whose medicine is scheduled (frequency_per_day >= number of windows per day
    that map to or before this hour).
    """
    try:
        from datetime import datetime, timezone, timedelta
        sb = _get_sb()

        # Window index: 08→1, 14→2, 20→3
        window_index = _DOSE_WINDOWS_IST.index(ist_hour) + 1

        # Fetch all fulfilled/approved order items with frequency_per_day set and qty > 0
        orders_res = sb.table("orders").select("id").in_("status", ["fulfilled", "approved"]).execute()
        if not orders_res.data:
            return

        order_ids = [o["id"] for o in orders_res.data]
        items_res = (
            sb.table("order_items")
            .select("id, qty, frequency_per_day, medicines(name)")
            .in_("order_id", order_ids)
            .gte("frequency_per_day", window_index)   # e.g. at 14:00, only items with freq>=2
            .gt("qty", 0)
            .execute()
        )
        items = items_res.data or []
        decremented = 0
        for item in items:
            new_qty = max(0, item["qty"] - 1)
            sb.table("order_items").update({"qty": new_qty}).eq("id", item["id"]).execute()
            decremented += 1

        print(f"⏰ Auto-decrement @ IST {ist_hour:02d}:00 — {decremented} items decremented")
    except Exception as exc:
        print(f"❌ Auto-decrement failed: {exc}")


# ── App lifespan (start scheduler on boot) ───────────────────────────────────
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app_instance):
    _run_scheduled_decrement()
    yield


# Patch the lifespan onto the existing app
app.router.lifespan_context = lifespan


@app.post("/pharmacy/chat")


async def pharmacy_chat(request: PharmacyChatRequest):
    """
    Expert Pharmacy Agent — powered by the multi-agent orchestrator.
    Delegates to PharmacyAgent (search, prescription check, order + stock decrement),
    RefillAgent, NotificationAgent, and HealthAgent based on user intent.
    Returns the same ChatResponse shape as before — no frontend changes needed.
    """
    try:
        from agents.orchestrator_agent import OrchestratorAgent as _OrchestratorAgent
        if not hasattr(pharmacy_chat, "_orchestrator"):
            pharmacy_chat._orchestrator = _OrchestratorAgent()

        print(f"💊 Expert Pharmacy Query (multi-agent): {request.message}")

        # The frontend sends patient_id = auth.uid() — pass as user_id so every
        # sub-agent resolves patients.id (FK in orders/refills) correctly.
        result = await pharmacy_chat._orchestrator.run(
            message=request.message,
            user_id=request.patient_id,
            language=request.language,
        )

        ai_text = result.get("response", "")

        # Voice synthesis — identical to the original implementation
        audio_data_b64 = None
        if request.use_voice and ai_text:
            try:
                audio_bytes = await voice_service.synthesize_empathic(ai_text, request.language)
                if audio_bytes:
                    import base64
                    audio_data_b64 = base64.b64encode(audio_bytes).decode("utf-8")
            except Exception as ve:
                print(f"⚠️ Pharmacy Voice synthesis failed: {ve}")

        return ChatResponse(success=True, response=ai_text, audio_data=audio_data_b64)

    except Exception as e:
        print(f"❌ Pharmacy Chat Error: {e}")
        import traceback
        traceback.print_exc()
        error_msg = str(e)
        fallbacks = {
            "hi": "मुझे अभी आपके फार्मेसी रिकॉर्ड्स में परेशानी हो रही है। कृपया थोड़ी देर बाद फिर से प्रयास करें।",
            "mr": "मला आता तुमच्या फार्मसी रेकॉर्डमध्ये अडचण येत आहे. कृपया थोड्या वेळाने पुन्हा प्रयत्न करा.",
            "en": "I'm having trouble with my pharmacy records. Please try again.",
        }
        quota_fallbacks = {
            "hi": "मुझे अभी बहुत सारे अनुरोध मिल रहे हैं। कृपया एक पल प्रतीक्षा करें और पुन: प्रयास करें।",
            "mr": "मला सध्या खूप विनंत्या येत आहेत. कृपया क्षणभर थांबा आणि पुन्हा प्रयत्न करा.",
            "en": "I'm currently receiving too many requests. Please wait a moment and try again.",
        }
        lang = getattr(request, "language", "en")
        if "429" in error_msg or "quota" in error_msg.lower() or "RESOURCE_EXHAUSTED" in error_msg:
            return ChatResponse(success=False, response=quota_fallbacks.get(lang, quota_fallbacks["en"]), error=error_msg)
        return ChatResponse(success=False, response=fallbacks.get(lang, fallbacks["en"]), error=error_msg)


@app.post("/health_trends")
async def get_health_trends(request: HealthAnalysisRequest):
    """
    Get historical health trends (BP, Sugar, etc.) from uploaded records.
    """
    try:
        # Fetch records with timestamps
        history = await rag_service.get_patient_records_with_dates(request.user_id)
        
        timeline = []
        
        for record in history:
            # Parse vitals from this specific document
            # Use same cleaning as ml_engine
            clean_text = record['text'].lower().replace(':', ' ').replace('-', ' ').replace('\n', ' ').replace('*', ' ').replace('#', ' ')
            vitals = parse_medical_text(clean_text) # Re-use the robust function
            
            # Only include if at least one key metric is found
            if any(v is not None for v in [vitals['systolic'], vitals['sugar'], vitals['heart_rate'], vitals['weight']]):
                timeline.append({
                    "date": record['date'],
                    "systolic": vitals['systolic'],
                    "diastolic": vitals['diastolic'],
                    "sugar": vitals['sugar'],
                    "heart_rate": vitals['heart_rate'],
                    "weight": vitals['weight']
                })
        
        return {
            "success": True,
            "timeline": timeline
        }
        
    except Exception as e:
        print(f"❌ Trends Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    return {
        "service": "Healthcare AI Assistant",
        "version": "2.0.0",
        "features": ["Chat", "Voice", "RAG", "Health Analysis"]
    }


# In-memory storage for chat history
# Format: { user_id: [ {"role": "user", "parts": ["msg"]}, {"role": "model", "parts": ["response"]} ] }

@app.post("/chat")
async def chat(request: ChatRequest):
    """
    Main chat endpoint with RAG support, context window, and optional voice output
    """
    try:
        print(f"📩 Chat Query: {request.message}")
        print(f"🎤 Use Voice: {request.use_voice}")
        print(f"🔐 Use Records: {request.use_records}")
        
        user_id = request.user_id or "anonymous"
        
        # Initialize history for user if not exists
        if user_id not in chat_sessions:
            chat_sessions[user_id] = []
        
        # Get recent history (limit to last 10 messages for context window management)
        recent_history = chat_sessions[user_id][-10:]
        
        # Format history for prompt
        history_text = ""
        for msg in recent_history:
            role = "User" if msg["role"] == "user" else "Assistant"
            content = msg["parts"][0]
            history_text += f"{role}: {content}\n"

        context_text = ""
        
        # Search medical records if enabled
        if request.user_id and request.use_records:
            context_text = await rag_service.search_records(
                user_id=request.user_id,
                query=request.message
            )
            if context_text:
                print(f"✅ Found relevant medical records")
        
        # Detect if message is a greeting or casual conversation
        greeting_keywords = [
            'hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening',
            'how are you', 'whats up', "what's up", 'greetings', 'namaste', 
            'thanks', 'thank you', 'bye', 'goodbye', 'see you', 'ok', 'okay',
            'cool', 'nice', 'great', 'awesome', 'perfect'
        ]
        is_greeting = any(request.message.lower().strip() in keyword or keyword in request.message.lower() 
                         for keyword in greeting_keywords)
        
        # Detect if user wants detailed explanation
        detail_keywords = ['explain', 'detail', 'elaborate', 'tell me more', 'in depth', 'long', 'why', 'how does']
        wants_detail = any(keyword in request.message.lower() for keyword in detail_keywords)
        print(f"👋 Is greeting: {is_greeting}")
        print(f"📝 Detail mode: {wants_detail}")
        
# Build simple, adaptive system prompt
        if is_greeting and not history_text: # Only use greeting prompt if it's the start
            # Simple conversational prompt for greetings
            system_prompt = f"""
You are a friendly Healthcare AI assistant. The user sent a greeting or casual message.

Respond warmly and naturally in a conversational way. Keep it SHORT (1-2 sentences max).
Be friendly and welcoming. Let them know you're here to help with health questions.

Examples:
- User: "Hi" -> "Hello! 👋 I'm your healthcare assistant. How can I help you today?" (But translate this to the chosen language)

LANGUAGE REQUIREMENT: 
- **Detect and Match**: Match the user's conversational language. If the user greets you in Hindi/Marathi (e.g., "Namaste", "Mera naam..."), respond in that language.
- **Script Policy**: 
  - If Hindi/Marathi -> Use Devanagari script.
  - If English -> Use English.
- **UI Guide**: The user's current UI language is '{request.language}'.
- **Strict Consistency**: Never mix scripts. 100% Devanagari for Hindi/Marathi.
"""
        else:
            # Structured medical response prompt
            system_prompt = f"""
You are a friendly, empathetic Healthcare AI. 

PREVIOUS CONVERSATION HISTORY:
{history_text}

CONTEXT FROM RECORDS: {context_text}

CORE INSTRUCTIONS:
1. **LANGUAGE**: Prioritize matching the user's conversational language.
   - If the user uses Hindi or Marathi (even in Roman script), you MUST respond in that language using Devanagari script.
   - UI language hint: '{request.language}'.
   - Even if the user uses a few English words, DO NOT answer in English if the core conversation is Hindi/Marathi. Translate technical medical terms into the target script.
   - CRITICAL: Never mix scripts. 100% Devanagari for Hindi/Marathi.
   
2. **TONE**: Balanced and Professional yet Caring. 
   - **Show Empathy appropriately**: If the user mentions pain, sickness, or worry, START with a brief validating phrase (e.g., "I'm sorry to hear you're not feeling well" or "That sounds painful"). 
   - **Do NOT overdo it**: Avoid being overly dramatic or flowery. Keep it grounded.
   - For general information questions (e.g., "benefits of turmeric"), skip the empathy and go straight to the answer.

3. **FORMAT**: 
   - Start with a direct, helpful answer (1-2 sentences).
   - Use **bullet points** for lists (symptoms, causes, tips) to make it readable.
   - End with a short, encouraging closing or a simple tip.
   - Do NOT force any specific section headers. Flow naturally.

4. **medical_scope**: Only answer health/wellness questions. For others, politely decline.

Language Guidelines:
- Keep sentences short and clear.
- Use simple words (e.g., "tummy" for "abdomen" is okay if context fits, but standard simple English/Hinglish is best).
"""

        
        # Using gemini-1.5-flash as standardized
        try:
            print("🤖 Health Assistant (Using gemini-2.5-flash)")
            response = gemini_model.generate_content(
                system_prompt + "\n\nPatient Message: " + request.message,
                generation_config=genai.GenerationConfig(
                    temperature=0.7,
                    max_output_tokens=2048,
                )
            )
        except Exception as e:
            print(f"❌ Gemini Error: {e}")
            raise e
        
        # Process response
        if hasattr(response, 'text') and response.text:
            ai_text = response.text
        elif hasattr(response, 'candidates') and len(response.candidates) > 0:
            ai_text = response.candidates[0].content.parts[0].text
        
        if ai_text:
            print(f"✅ Got response: {len(ai_text)} characters")
        
        # If no response after retries, use fallback
        if not ai_text:
            print("📝 Using fallback response")
            # Include the error for debugging
            debug_info = f" (Error: {last_error_msg})" if 'last_error_msg' in locals() else ""
            
            error_fallbacks = {
                "hi": f"क्षमा करें, मैं अभी उस अनुरोध को संसाधित नहीं कर सका।{debug_info} कृपया कुछ ही पलों में पुन: प्रयास करें। 💙",
                "mr": f"क्षमस्व, मी आत्ता त्या विनंतीवर प्रक्रिया करू शकलो नाही.{debug_info} कृपया थोड्या वेळात पुन्हा प्रयत्न करा. 💙",
                "en": f"I'm sorry, I couldn't process that request right now.{debug_info} Please try again in a moment. 💙"
            }
            ai_text = error_fallbacks.get(request.language, error_fallbacks["en"])
        else:
            # Store conversation in history if response was successful
            if user_id in chat_sessions:
                chat_sessions[user_id].append({"role": "user", "parts": [request.message]})
                chat_sessions[user_id].append({"role": "model", "parts": [ai_text]})
        
        # Generate voice if requested
        audio_data_b64 = None
        if request.use_voice:
            try:
                audio_bytes = await voice_service.synthesize_empathic(
                    text=ai_text,
                    language=request.language
                )
                if audio_bytes:
                    import base64
                    audio_data_b64 = base64.b64encode(audio_bytes).decode('utf-8')
            except Exception as e:
                print(f"⚠️ Voice synthesis failed: {e}")
                # Continue without voice
        
        return ChatResponse(
            success=True,
            response=ai_text,
            audio_data=audio_data_b64
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Chat Error: {e}")
        import traceback
        traceback.print_exc()
        return ChatResponse(
            success=False,
            response="I'm experiencing technical difficulties. Please try again.",
            error=str(e)
        )

@app.post("/synthesize_voice")
async def synthesize_voice(request: dict):
    """
    Dedicated endpoint for voice synthesis
    """
    try:
        text = request.get("text", "")
        language = request.get("language", "en")
        
        if not text:
            raise HTTPException(status_code=400, detail="Text is required")
        
        audio_data = await voice_service.synthesize_empathic(text, language)
        
        if not audio_data:
            raise HTTPException(status_code=500, detail="Voice synthesis failed")
        
        # Return audio as streaming response
        return StreamingResponse(
            io.BytesIO(audio_data),
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": "attachment; filename=response.mp3"
            }
        )
        
    except Exception as e:
        print(f"❌ Voice Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process_document")
async def process_document(request: DocumentProcessRequest):
    """
    Process uploaded medical documents and create embeddings
    """
    try:
        print(f"📥 Processing document: {request.file_url}")
        
        result = await rag_service.process_document(
            file_url=request.file_url,
            record_id=request.record_id,
            patient_id=request.patient_id
        )
        
        return {
            "success": True,
            "chunks": result["chunks"],
            "message": f"Processed {result['chunks']} chunks successfully"
        }
        
    except Exception as e:
        import traceback
        print("❌ CRITICAL: Document Processing Error Traceback:")
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e)
        }

@app.post("/analyze_health")
async def analyze_health(request: HealthAnalysisRequest):
    """
    Analyze patient health risk using ML
    """
    try:
        # Fetch medical records
        text_records = await rag_service.get_patient_records(request.user_id)
        
        if not text_records:
            # Still allow analysis if no records, but result will be "Insufficient Data"
            # But normally we might want to return early. 
            # The prompt logic handles empty records via analyze_risk returning nulls.
            pass
        
        # Run ML analysis
        analysis_result = analyze_risk(text_records)
        print(f"🔬 ML/Regex Result: {analysis_result}")
        
        # Generate Comprehensive Advice using Gemini
        vitals = analysis_result['vitals_detected']
        vitals_str = ", ".join([f"{k}: {v}" for k, v in vitals.items() if v is not None])
        if not vitals_str:
            vitals_str = "No specific vitals extracted from records."

        prompt = f"""
        You are a smart medical AI assistant.
        Patient Vitals (pre-extracted): {vitals_str}
        Risk Assessment: {analysis_result['risk_level']}
        Patient Records: {text_records}
        
        Task:
        1. Extract ANY missing vitals from the Patient Records text if they are invalid/missing in the "Patient Vitals" above.
           Look closely for: Blood Pressure, Sugar/Glucose, Heart Rate, Weight, Age, Blood Group.
           BE AGGRESSIVE. If you see "Age: 35", extract 35. If you see "BP 120/80", extract "120/80".
        2. Provide a concise, beautifully formatted health advice summary.
           - Not too short, not too long (approx 100-150 words).
           - **FORMATTING RULES (STRICT):**
             * **NO PARAGRAPHS**. Write everything as bullet points.
             * Use **Markdown Headings** (###) for sections.
             * Use **Bold** for key extracted facts.
             * Style: Clean, Professional, Direct.
        3. Provide 3 specific, actionable tips.
        4. Formulate a short follow-up question.
        
        Output purely in JSON format:
        {{
            "analysis_text": "Markdown formatted advice here...",
            "tips": ["Tip 1", "Tip 2", "Tip 3"],
            "follow_up_topic": "Question to ask user",
            "extracted_vitals": {{
                "bp": "Found BP or null",
                "sugar": "Found Sugar or null",
                "heart_rate": "Found HR or null",
                "weight": "Found Weight or null",
                "age": "Found Age or null",
                "blood_group": "Found Blood Group or null"
            }}
        }}
        """
                
        try:
            print("🤖 Sending prompt to Gemini...")
            gemini_response = gemini_model.generate_content(prompt)
            print(f"📝 Raw Gemini Response: {gemini_response.text[:500]}...") # Print first 500 chars
            
            # Simple cleanup to ensure valid JSON
            text_resp = gemini_response.text.replace("```json", "").replace("```", "").strip()
            import json
            ai_insights = json.loads(text_resp)
            print(f"✅ Parsed JSON: {ai_insights.get('extracted_vitals')}")
            
            # MERGE GEMINI VITALS IF REGEX FAILED
            gemini_vitals = ai_insights.get("extracted_vitals", {})
            
            # Helper to safely update simple fields if they are None/Empty
            def update_if_missing(key, val):
                if not analysis_result['vitals_detected'].get(key) and val:
                     # Try to convert to int if it's a number string
                    try:
                        if key in ['sugar', 'heart_rate', 'weight', 'age']:
                            # simple heuristic to grab first number
                            import re
                            nums = re.findall(r'\d+', str(val))
                            if nums:
                                analysis_result['vitals_detected'][key] = int(nums[0])
                        else:
                            analysis_result['vitals_detected'][key] = val
                    except:
                        pass # Keep original None if conversion fails

            update_if_missing('bp', gemini_vitals.get('bp'))
            update_if_missing('sugar', gemini_vitals.get('sugar'))
            update_if_missing('heart_rate', gemini_vitals.get('heart_rate'))
            update_if_missing('weight', gemini_vitals.get('weight'))
            update_if_missing('age', gemini_vitals.get('age'))
            update_if_missing('blood_group', gemini_vitals.get('blood_group'))

        except Exception as e:
            print(f"⚠️ Gemini Analysis Failed: {e}")
            ai_insights = {
                "analysis_text": "We analyzed your available records. Please consult a doctor for a detailed review.",
                "tips": ["Stay hydrated", "Monitor your vitals regularly", "Sleep 7-8 hours"],
                "follow_up_topic": "Would you like to know more?"
            }

        return {
            "success": True,
            "prediction": analysis_result,
            "detailed_analysis": ai_insights["analysis_text"],
            "tips": ai_insights["tips"],
            "follow_up_prompt": ai_insights["follow_up_topic"]
        }
        
    except Exception as e:
        print(f"❌ Health Analysis Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/pharmacy/refill-alerts/{patient_id}")
async def get_refill_alerts(patient_id: str):
    """Fetch proactive refill alerts for a patient."""
    alerts = await pharmacy_service.get_refill_candidates(patient_id)
    return {"success": True, "alerts": alerts}

# ==========================================
# MULTI-AGENT ORCHESTRATOR ENDPOINT
# ==========================================
from agents.orchestrator_agent import OrchestratorAgent

_orchestrator = OrchestratorAgent()

class AgentChatRequest(BaseModel):
    message: str
    user_id: str          # auth.uid() of the logged-in patient (enforces data isolation)
    language: str = "en"
    use_voice: bool = False

@app.post("/agent/chat")
async def agent_chat(request: AgentChatRequest):
    """
    Multi-agent orchestrated chat endpoint.
    The OrchestratorAgent decides which specialist sub-agents to call,
    enforcing that all data access is scoped to request.user_id.
    """
    try:
        print(f"🧠 Orchestrator query from user {request.user_id}: {request.message}")
        result = await _orchestrator.run(
            message=request.message,
            user_id=request.user_id,
            language=request.language,
        )

        # Optional voice synthesis on the final response
        audio_data_b64 = None
        if request.use_voice and result.get("response"):
            try:
                audio_bytes = await voice_service.synthesize_empathic(result["response"], request.language)
                if audio_bytes:
                    import base64
                    audio_data_b64 = base64.b64encode(audio_bytes).decode("utf-8")
            except Exception as ve:
                print(f"⚠️ Agent voice synthesis failed: {ve}")

        return {
            "success": result["success"],
            "response": result["response"],
            "agents_used": result.get("agents_used", []),
            "steps": result.get("steps", []),
            "audio_data": audio_data_b64,
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"❌ Agent Chat Error: {e}")
        return {
            "success": False,
            "response": "I'm having trouble coordinating my agents right now. Please try again.",
            "agents_used": [],
            "steps": [],
            "error": str(e),
        }

# ==========================================
# Pharmacist Agent UI (Superuser access API)
# ==========================================

@app.post("/pharmacist/ai-query", response_model=ChatResponse)
async def pharmacist_ai_query(req: PharmacistAIRequest):
    """
    Superuser endpoint that maps the LIVE pharmacy environment
    to the AI so it can answer administrative queries.
    """
    try:
        sb = _get_sb()
        
        # 1. Gather live global intent data
        inventory_res = sb.table("medicines").select("name, stock, reorder_threshold").execute()
        orders_res = sb.table("orders").select("status").execute()
        raw_res = sb.table("order_history_raw").select("total_price_eur").execute()

        inventory = inventory_res.data or []
        orders = orders_res.data or []
        raw_history = raw_res.data or []

        # 2. Extract quick metrics for the prompt
        low_stock = [m for m in inventory if m["stock"] <= (m.get("reorder_threshold") or 10)]
        pending_count = len([o for o in orders if o["status"] == "pending"])
        total_revenue = sum(float(r["total_price_eur"] or 0) for r in raw_history)

        inventory_str = "\n".join([f"- {m['name']}: {m['stock']} in stock (Min Threshold: {m.get('reorder_threshold') or 10})" for m in inventory])
        low_stock_str = "\n".join([f"- {m['name']}: {m['stock']}" for m in low_stock]) if low_stock else "None."

        prompt = f"""
        You are the Head Clinical Pharmacist AI Assistant. You are advising the human Pharmacist who owns this portal.
        You have direct "God-Mode" access to the entire pharmacy database. Be extremely concise, highly analytical, and professional. Use markdown formatting.
        
        --- LIVE PHARMACY DATABASE SUMMARY ---
        Total Pending Orders: {pending_count}
        Total Historical Revenue: €{total_revenue:.2f}
        Medicines Critically Low on Stock:
        {low_stock_str}
        
        Full Inventory Map:
        {inventory_str}
        ---------------------------------------
        
        The pharmacist says: "{req.message}"
        
        Provide your analysis or response. Do not hallucinate data outside this summary.
        """

        model = genai.GenerativeModel('gemini-2.5-flash')
        response = await asyncio.to_thread(model.generate_content, prompt)
        ai_text = response.text or "I apologize, I could not compute an answer."

        # Audio Generation (If requested)
        audio_data = None
        if req.use_voice:
            # Clean markdown for TTS
            clean_tts = ai_text.replace('*', '').replace('#', '').strip()
            audio_bytes = await voice_service.synthesize_empathic(clean_tts, "en") # Always english standard for pharmacist
            if audio_bytes:
                import base64
                audio_data = base64.b64encode(audio_bytes).decode('utf-8')

        return ChatResponse(
            success=True,
            response=ai_text,
            audio_data=audio_data
        )

    except Exception as e:
        print(f"Pharmacist AI Agent Error: {e}")
        return ChatResponse(success=False, response="", error=str(e))


# ==========================================
# Startup/Shutdown Events & Background Jobs
# ==========================================
import asyncio
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from supabase import create_client

async def email_polling_task():
    print("📧 Starting Email Polling Service for Pharmacist Alerts...")
    smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_password = os.getenv("SMTP_APP_PASSWORD", "")
    pharmacist_email = os.getenv("PHARMACIST_EMAIL", smtp_user)
    
    supa = create_client(
        os.getenv("VITE_SUPABASE_URL"),
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    )

    def _poll_and_send():
        res = supa.table("notification_logs").select("*").eq("status", "pending").eq("channel", "email").execute()
        if res.data:
            for notif in res.data:
                payload = notif.get("payload", {})
                med_name = payload.get("medicine_name", "Unknown")
                stock = payload.get("current_stock", 0)
                threshold = payload.get("threshold", 10)
                
                if smtp_password and smtp_user:
                    try:
                        msg = MIMEMultipart()
                        msg['From'] = smtp_user
                        msg['To'] = pharmacist_email
                        msg['Subject'] = f"🚨 URGENT: Low Stock Alert - {med_name}"
                        
                        body = f"Hello Pharmacist,\n\nOur system detected critically low inventory for {med_name}.\n\nCurrent Stock: {stock}\nReorder Threshold: {threshold}\n\nPlease restock immediately.\n\n- MyHealthChain AI Agent"
                        msg.attach(MIMEText(body, 'plain'))
                        
                        server = smtplib.SMTP(smtp_server, smtp_port, timeout=10)
                        server.starttls()
                        server.login(smtp_user, smtp_password)
                        server.send_message(msg)
                        server.quit()
                        print(f"✅ Sent email alert for {med_name} to {pharmacist_email}")
                    except Exception as e:
                        print(f"❌ Failed to send email for {notif['id']}: {e}")
                else:
                    print(f"⚠️ SMTP credentials missing. Simulated Email Sent for {med_name} to pharmacist.")

                supa.table("notification_logs").update({"status": "sent"}).eq("id", notif["id"]).execute()

    while True:
        try:
            await asyncio.to_thread(_poll_and_send)
        except Exception as e:
             pass
             
        await asyncio.sleep(15)

@app.on_event("startup")
async def startup_event():
    print("🚀 FastAPI Healthcare AI Server Started")
    print("📍 Server running on: http://localhost:8000")
    print("📖 API Docs available at: http://localhost:8000/docs")
    
    if not os.getenv("ELEVENLABS_API_KEY"):
        print("⚠️ WARNING: ELEVENLABS_API_KEY is missing from .env. Voice synthesis will fail.")
    else:
        print("✅ ElevenLabs API Key detected.")
        
    asyncio.create_task(email_polling_task())

@app.on_event("shutdown")
async def shutdown_event():
    print("👋 Server shutting down...")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )