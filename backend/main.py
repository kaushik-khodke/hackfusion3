from fastapi import FastAPI, HTTPException
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

# ==========================================
# ROUTES
# ==========================================
from pharmacy_orchestrator import PharmacyOrchestrator
pharmacy_orchestrator = PharmacyOrchestrator()
pharmacy_service = pharmacy_orchestrator.service # For context fetching

@app.post("/pharmacy/chat")
async def pharmacy_chat(request: PharmacyChatRequest):
    """
    Expert Pharmacy Agent endpoint. 
    Uses clinical pharmacist persona and pharmacy-specific tools.
    """
    try:
        print(f"💊 Pharmacy Query: {request.message}")
        
        # 1. Fetch Context
        profile = await pharmacy_service.get_patient_profile(request.patient_id)
        health_summary = await pharmacy_service.get_patient_health_summary(request.patient_id)
        order_history = await pharmacy_service.get_patient_orders(request.patient_id)
        refill_candidates = await pharmacy_service.get_refill_candidates(request.patient_id)
        
        # 2. Build Expert Pharmacist Prompt
        system_prompt = f"""
You are the **Expert Pharmacy Agent** for MyHealthChain. 
You are a **senior clinical pharmacist AI**.

PATIENT PROFILE: {json.dumps(profile)}
HEALTH SUMMARY: {json.dumps(health_summary)}
ORDER HISTORY: {json.dumps(order_history)}
PROACTIVE REFILL ALERTS: {json.dumps(refill_candidates)}

YOUR CORE RESPONSIBILITIES:
1. **Clinical Safety**: Collect age, allergies, chronic conditions, and current meds if not in profile.
2. **Grounding**: ONLY recommend medicines found in the database. Use tools (search_medicines) to check stock and prescription status.
3. **Safety Policies**: 
   - If `prescription_required` is true, explain you need a valid prescription.
   - Escalate emergencies (chest pain, stroke, etc.) to ER immediately.
4. **Commerce**: Offer order drafting ONLY after clinical suitability is confirmed.
5. **Proactive**: If there are refill alerts, mention them if relevant or at the end of the conversation.

TONE: Professional, caring, and authoritative in pharmacy matters.

LANGUAGE REQUIREMENT: 
- **Conversational Matching**: Prioritize matching the user's conversational language. If the user speaks/types in Hindi or Marathi (even in Roman script/Hinglish/Marathlish, e.g., "Mera naam..."), you MUST respond in that language.
- **Script Policy**: 
  - If language is Hindi ('hi') or detected as Hindi -> Use Devanagari script ONLY.
  - If language is Marathi ('mr') or detected as Marathi -> Use Devanagari script ONLY.
  - If language is English ('en') and no other language is detected -> Use English.
- **UI Fallback**: The UI language code is '{request.language}'. Use this as a guide if the user's language is ambiguous.
- **No Script Mixing**: Do NOT answer in English if the user is using Hindi/Marathi. Translate technical terms only if common, but keep the core response in the matching script.

You have access to tools. If you need to search for a medicine, create an order, or check refills, call the appropriate function.
"""

        # 3. Initialize Agent with local tools
        tools = [
            {
                "function_declarations": [
                    {
                        "name": "get_medicines",
                        "description": "Search medicines table by name.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "query": {"type": "string", "description": "Medicine name to search for."},
                                "limit": {"type": "integer"}
                            },
                            "required": ["query"]
                        }
                    },
                    {
                        "name": "get_patient_orders",
                        "description": "Fetch a patient’s order history.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "patient_id": {"type": "string", "description": "Patient UUID."},
                                "limit": {"type": "integer"}
                            },
                            "required": ["patient_id"]
                        }
                    },
                    {
                        "name": "create_order_draft",
                        "description": "Create a draft order and items for a patient.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "patient_id": {"type": "string"},
                                "channel": {"type": "string"},
                                "items": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "medicine_id": {"type": "string"},
                                            "qty": {"type": "integer"},
                                            "dosage_text": {"type": "string"},
                                            "frequency_per_day": {"type": "integer"},
                                            "days_supply": {"type": "integer"}
                                        }
                                    }
                                }
                            },
                            "required": ["patient_id", "items"]
                        }
                    },
                    {
                        "name": "finalize_order",
                        "description": "Perform final safety + stock check and commit the order.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "order_id": {"type": "string"}
                            },
                            "required": ["order_id"]
                        }
                    },
                    
                    {
                        "name": "create_refill_alert",
                        "description": "Store a predicted run-out for proactive outreach.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "patient_id": {"type": "string"},
                                "medicine_id": {"type": "string"},
                                "predicted_runout_date": {"type": "string", "description": "YYYY-MM-DD"}
                            },
                            "required": ["patient_id", "medicine_id", "predicted_runout_date"]
                        }
                    },
                    {
                        "name": "get_refill_alerts",
                        "description": "Fetch pending refill alerts for a patient.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "patient_id": {"type": "string"}
                            },
                            "required": ["patient_id"]
                        }
                    },
                    {
                        "name": "log_notification",
                        "description": "Insert a notification record.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "patient_id": {"type": "string"},
                                "channel": {"type": "string"},
                                "type": {"type": "string"},
                                "payload": {"type": "object"},
                                "status": {"type": "string"}
                            },
                            "required": ["patient_id", "channel", "type", "payload"]
                        }
                    }
                ]
            }
        ]

        # Using gemini-1.5-flash as standardized
        agent_model = genai.GenerativeModel('gemini-2.5-flash', tools=tools)
        chat = agent_model.start_chat()
        
        # Initial message
        try:
            print("🤖 Pharmacy Agent (Using gemini-2.5-flash)")
            response = chat.send_message(f"{system_prompt}\n\nUSER MESSAGE: {request.message}")
        except Exception as e:
            print(f"❌ Gemini Error: {e}")
            raise e
        
        if not response:
             raise Exception("Failed to get initial response from Gemini")

        # Robust Tool Loop
        max_iterations = 5
        iteration = 0
        
        while iteration < max_iterations:
            # Check if there's a function call
            if not response.candidates[0].content.parts[0].function_call:
                break
                
            fc = response.candidates[0].content.parts[0].function_call
            tool_name = fc.name
            args = fc.args
            
            print(f"🛠️ Calling Tool: {tool_name} with {args}")
            
            tool_result = None
            try:
                # Direct dispatch to orchestrator which handles parameter parsing
                if tool_name == "get_medicines":
                    tool_result = await pharmacy_orchestrator.get_medicines(args)
                elif tool_name == "get_patient_orders":
                    tool_result = await pharmacy_orchestrator.get_patient_orders(args)
                elif tool_name == "create_order_draft":
                    tool_result = await pharmacy_orchestrator.create_order_draft(args)
                elif tool_name == "finalize_order":
                    tool_result = await pharmacy_orchestrator.finalize_order(args)
                elif tool_name == "create_refill_alert":
                    tool_result = await pharmacy_orchestrator.create_refill_alert(args)
                elif tool_name == "get_refill_alerts":
                    tool_result = await pharmacy_orchestrator.get_refill_alerts(args)
                elif tool_name == "log_notification":
                    tool_result = await pharmacy_orchestrator.log_notification(args)
                else:
                    tool_result = {"error": f"Tool {tool_name} not found."}
            except Exception as tool_err:
                print(f"❌ Tool Error ({tool_name}): {tool_err}")
                tool_result = {"error": str(tool_err)}

            # Send tool response
            try:
                response = chat.send_message(
                    genai.protos.Content(
                        parts=[genai.protos.Part(
                            function_response=genai.protos.FunctionResponse(
                                name=tool_name,
                                response={'result': tool_result}
                            )
                        )]
                    )
                )
            except Exception as e:
                print(f"❌ Tool Loop Error: {e}")
                raise e
            
            iteration += 1

        ai_text = response.text

        # Generate voice if requested
        audio_data_b64 = None
        if request.use_voice:
            try:
                audio_bytes = await voice_service.synthesize_empathic(ai_text, request.language)
                if audio_bytes:
                    import base64
                    audio_data_b64 = base64.b64encode(audio_bytes).decode('utf-8')
            except Exception as e:
                print(f"⚠️ Pharmacy Voice synthesis failed: {e}")

        return ChatResponse(success=True, response=ai_text, audio_data=audio_data_b64)
    except Exception as e:
        print(f"❌ Pharmacy Chat Error: {e}")
        import traceback
        traceback.print_exc()
        
        # Check if it's a rate limit error to give a better message
        error_msg = str(e)
        
        # Language-aware error fallbacks
        fallbacks = {
            "hi": "मुझे अभी आपके फार्मेसी रिकॉर्ड्स में परेशानी हो रही है। कृपया थोड़ी देर बाद फिर से प्रयास करें।",
            "mr": "मला आता तुमच्या फार्मसी रेकॉर्डमध्ये अडचण येत आहे. कृपया थोड्या वेळाने पुन्हा प्रयत्न करा.",
            "en": "I'm having trouble with my pharmacy records. Please try again."
        }
        quota_fallbacks = {
            "hi": "मुझे अभी बहुत सारे अनुरोध मिल रहे हैं। कृपया एक पल प्रतीक्षा करें और पुन: प्रयास करें।",
            "mr": "मला सध्या खूप विनंत्या येत आहेत. कृपया क्षणभर थांबा आणि पुन्हा प्रयत्न करा.",
            "en": "I'm currently receiving too many requests. Please wait a moment and try again."
        }
        
        selected_fb = fallbacks.get(request.language, fallbacks["en"])
        selected_quota = quota_fallbacks.get(request.language, quota_fallbacks["en"])

        if "429" in error_msg or "quota" in error_msg.lower() or "RESOURCE_EXHAUSTED" in error_msg:
             return ChatResponse(success=False, response=selected_quota, error=str(e))
             
        return ChatResponse(success=False, response=selected_fb, error=str(e))

# ==========================================
# ROUTES
# ==========================================

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

    while True:
        try:
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
                            
                            server = smtplib.SMTP(smtp_server, smtp_port)
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