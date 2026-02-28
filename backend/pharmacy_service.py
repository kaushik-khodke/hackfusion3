import os
import json
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from supabase import create_client, Client
import requests

class PharmacyService:
    def __init__(self):
        self.supabase_url = os.getenv("VITE_SUPABASE_URL")
        self.supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        self.supabase: Client = create_client(self.supabase_url, self.supabase_key)

    async def get_patient_profile(self, patient_id: str) -> Dict[str, Any]:
        """Returns patient profile, supports UUID or external_id."""
        try:
            # 1. Try UUID only if it looks like one
            is_uuid = len(patient_id) == 36 and patient_id.count('-') == 4
            if is_uuid:
                response = self.supabase.table("patients").select("*").eq("id", patient_id).maybe_single().execute()
                if response.data:
                    return response.data
            
            # 2. Try external_id (e.g. PAT002)
            response = self.supabase.table("patients").select("*").eq("external_id", patient_id).maybe_single().execute()
            if response.data:
                return response.data
            
            # 3. Last fallback: return dummy profile if only history exists
            raw_check = self.supabase.table("order_history_raw").select("patient_external_id").eq("patient_external_id", patient_id).limit(1).execute()
            if raw_check.data:
                return {"id": patient_id, "external_id": patient_id, "full_name": f"Patient {patient_id}"}
                
            return {}
        except Exception as e:
            print(f"Error fetching patient profile: {e}")
            return {}

    async def get_patient_health_summary(self, patient_id: str) -> Dict[str, Any]:
        """Returns a summary of diagnoses, allergies, and chronic meds."""
        try:
            # Fetch records and use AI to summarize if needed, 
            # for now returning records summary from RAG or direct table
            response = self.supabase.table("records").select("title, record_type, record_date").eq("patient_id", patient_id).execute()
            return {"previous_records": response.data}
        except Exception as e:
            print(f"Error fetching health summary: {e}")
            return {}

    async def get_medicines(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Search for medicines in the database."""
        try:
            response = self.supabase.table("medicines")\
                .select("id, product_id, name, strength, unit_type, pzn, price_rec, package_size, description, stock, prescription_required")\
                .ilike("name", f"%{query}%")\
                .order("name")\
                .limit(limit)\
                .execute()
            return response.data if response.data else []
        except Exception as e:
            print(f"Error fetching medicines: {e}")
            return []

    async def get_patient_orders(self, patient_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Returns integrated order history from standard and raw tables."""
        try:
            flattened = []
            
            # 1. Fetch from standard tables (only if patient_id looks like a UUID)
            is_uuid = len(patient_id) == 36 and patient_id.count('-') == 4
            if is_uuid:
                standard_res = self.supabase.table("orders")\
                    .select("id, status, channel, created_at, finalized_at, order_items(id, qty, dosage_text, frequency_per_day, days_supply, medicines(id, name, strength, unit_type, price_rec, package_size))")\
                    .eq("patient_id", patient_id)\
                    .order("created_at", desc=True)\
                    .limit(limit)\
                    .execute()
                
                if standard_res.data:
                    for order in standard_res.data:
                        for item in order.get("order_items", []):
                            med = item.get("medicines", {})
                            flattened.append({
                                "order_id": order["id"],
                                "status": order["status"],
                                "channel": order["channel"],
                                "created_at": order["created_at"],
                                "finalized_at": order["finalized_at"],
                                "order_item_id": item["id"],
                                "qty": item["qty"],
                                "dosage_text": item["dosage_text"],
                                "frequency_per_day": item["frequency_per_day"],
                                "days_supply": item["days_supply"],
                                "medicine_id": med.get("id"),
                                "medicine_name": med.get("name"),
                                "strength": med.get("strength"),
                                "unit_type": med.get("unit_type"),
                                "price_rec": med.get("price_rec"),
                                "package_size": med.get("package_size")
                            })

            # 2. Fetch from order_history_raw
            raw_res = self.supabase.table("order_history_raw")\
                .select("*")\
                .eq("patient_external_id", patient_id)\
                .order("purchase_date", desc=True)\
                .limit(limit)\
                .execute()
            
            if raw_res.data:
                for raw in raw_res.data:
                    flattened.append({
                        "order_id": f"raw_{raw['id']}",
                        "status": "history_import",
                        "channel": "history_import",
                        "created_at": raw["purchase_date"],
                        "finalized_at": raw["purchase_date"],
                        "order_item_id": f"raw_item_{raw['id']}",
                        "qty": raw["quantity"],
                        "dosage_text": raw["dosage_frequency"],
                        "frequency_per_day": 1, 
                        "days_supply": 30, # Default for legacy
                        "medicine_id": None,
                        "medicine_name": raw["product_name"],
                        "strength": None,
                        "unit_type": None,
                        "price_rec": raw["total_price_eur"],
                        "package_size": None
                    })
            
            # Sort by created_at desc
            flattened.sort(key=lambda x: x["created_at"], reverse=True)
            return flattened[:limit]
        except Exception as e:
            print(f"Error fetching aggregated order history: {e}")
            return []

    async def create_order_draft(self, patient_id: str, items: List[Dict[str, Any]], channel: str = "chat") -> Dict[str, Any]:
        """Creates a draft order and items."""
        try:
            # 1. Create Order entry
            order_data = {
                "patient_id": patient_id,
                "status": "draft",
                "total_items": len(items),
                "channel": channel
            }
            order_res = self.supabase.table("orders").insert(order_data).execute()
            if not order_res.data:
                return {"success": False, "error": "Failed to create order draft"}
            
            order_id = order_res.data[0]["id"]
            
            # 2. Create Order Items
            item_entries = []
            for item in items:
                item_entries.append({
                    "order_id": order_id,
                    "medicine_id": item["medicine_id"],
                    "qty": item["qty"],
                    "dosage_text": item.get("dosage_text"),
                    "frequency_per_day": item.get("frequency_per_day"),
                    "days_supply": item.get("days_supply")
                })
            
            items_res = self.supabase.table("order_items").insert(item_entries).execute()
            
            # Match the requested return shape
            return {
                "order_id": order_id,
                "status": "draft",
                "total_items": len(items),
                "items": [
                    {
                        "order_item_id": it["id"],
                        "medicine_id": it["medicine_id"],
                        "qty": it["qty"],
                        "dosage_text": it["dosage_text"],
                        "frequency_per_day": it["frequency_per_day"],
                        "days_supply": it["days_supply"]
                    } for it in items_res.data
                ]
            }
        except Exception as e:
            print(f"Error creating order draft: {e}")
            return {"success": False, "error": str(e)}

    async def finalize_order(self, order_id: str) -> Dict[str, Any]:
        """Finalizes the order with safety and stock checks."""
        try:
            # 1. Fetch order + items + medicines
            # Note: For-update is tricky in client-side Supabase, we rely on the logic here
            # for a true production app, this would be an RPC.
            order_res = self.supabase.table("orders")\
                .select("id, patient_id, order_items(id, medicine_id, qty, medicines(name, stock, prescription_required))")\
                .eq("id", order_id).maybe_single().execute()
            
            if not order_res.data:
                return {"order_id": order_id, "status": "failed", "problems": [{"code": "order_not_found"}]}
            
            order = order_res.data
            problems = []
            
            # 2. Safety Checks
            for item in order["order_items"]:
                med = item["medicines"]
                if med["stock"] < item["qty"]:
                    problems.append({
                        "code": "insufficient_stock",
                        "medicine_id": item["medicine_id"],
                        "name": med["name"],
                        "available_stock": med["stock"],
                        "requested_qty": item["qty"]
                    })
                
                # Prescription check (Simulated: if required, we fail unless backend has record)
                # In this schema, we don't have a prescriptions table yet, so we'll assume failure if required
                if med.get("prescription_required"):
                    problems.append({
                        "code": "prescription_missing",
                        "medicine_id": item["medicine_id"],
                        "name": med["name"]
                    })

            if problems:
                return {
                    "order_id": order_id,
                    "status": "failed",
                    "problems": problems
                }

            # 3. Success: Update status and decrement stock
            self.supabase.table("orders")\
                .update({"status": "finalized", "finalized_at": datetime.now().isoformat()})\
                .eq("id", order_id).execute()
            
            finalized_items = []
            for item in order["order_items"]:
                self.supabase.rpc("decrement_medicine_stock", {"med_id": item["medicine_id"], "amount": item["qty"]}).execute()
                finalized_items.append({
                    "medicine_id": item["medicine_id"],
                    "name": item["medicines"]["name"],
                    "qty": item["qty"]
                })
            
            return {
                "order_id": order_id,
                "status": "finalized",
                "problems": [],
                "items": finalized_items
            }
        except Exception as e:
            print(f"Error finalizing order: {e}")
            return {"order_id": order_id, "status": "failed", "problems": [{"code": "exception", "message": str(e)}]}

    async def trigger_warehouse_webhook(self, order_id: str) -> Dict[str, Any]:
        """Simulates sending a fulfillment request to the warehouse."""
        print(f"🔔 WEBHOOK: Notifying warehouse for Order {order_id}")
        return {"success": True, "message": "Warehouse notified"}

    async def send_notification(self, patient_id: str, channel: str, type: str, payload: Dict[str, Any]) -> bool:
        """Logs a notification and simulates sending."""
        try:
            self.supabase.table("notification_logs").insert({
                "patient_id": patient_id,
                "channel": channel,
                "type": type,
                "payload": payload,
                "status": "sent"
            }).execute()
            print(f"📱 SENT {channel} ({type}) to Patient {patient_id}")
            return True
        except Exception as e:
            print(f"Error sending notification: {e}")
            return False

    async def get_refill_candidates(self, patient_id: str, days_ahead: int = 7) -> List[Dict[str, Any]]:
        """Finds medicines running out soon based on BOTH standard and raw history."""
        try:
            candidates = []
            now = datetime.now()
            threshold = now + timedelta(days=days_ahead)
            seen_medicines = set()

            # 1. Check Standard Orders (only if UUID)
            is_uuid = len(patient_id) == 36 and patient_id.count('-') == 4
            if is_uuid:
                response = self.supabase.table("orders")\
                    .select("*, order_items(*, medicines(name, stock))")\
                    .eq("patient_id", patient_id)\
                    .eq("status", "finalized")\
                    .execute()
                
                if response.data:
                    for order in response.data:
                        finalized_at = datetime.fromisoformat(order["finalized_at"].replace('Z', '+00:00'))
                        for item in order["order_items"]:
                            med_name = item["medicines"]["name"]
                            if med_name in seen_medicines: continue
                            seen_medicines.add(med_name)
                            
                            days_supply = item.get("days_supply") or 30
                            runout_date = finalized_at + timedelta(days=float(days_supply))
                            
                            if now <= runout_date <= threshold:
                                candidates.append({
                                    "medicine_id": item["medicine_id"],
                                    "medicine_name": med_name,
                                    "runout_date": runout_date.date().isoformat(),
                                    "days_left": (runout_date - now).days
                                })

            # 2. Check Raw History
            raw_response = self.supabase.table("order_history_raw")\
                .select("*")\
                .eq("patient_external_id", patient_id)\
                .execute()
            
            if raw_response.data:
                for raw in raw_response.data:
                    med_name = raw["product_name"]
                    if med_name in seen_medicines: continue
                    seen_medicines.add(med_name)
                    
                    purchase_date = datetime.fromisoformat(raw["purchase_date"].replace('Z', '+00:00'))
                    # Default: 30 days supply for legacy
                    runout_date = purchase_date + timedelta(days=30)
                    
                    if now <= runout_date <= threshold:
                        candidates.append({
                            "medicine_id": None,
                            "medicine_name": med_name,
                            "runout_date": runout_date.date().isoformat(),
                            "days_left": (runout_date - now).days
                        })
            
            return candidates
        except Exception as e:
            print(f"Error fetching refill candidates: {e}")
            return []

    async def create_refill_alert(self, patient_id: str, medicine_id: str, predicted_runout_date: str) -> Dict[str, Any]:
        """Adds a refill alert to the database."""
        try:
            response = self.supabase.table("refill_alerts").insert({
                "patient_id": patient_id,
                "medicine_id": medicine_id,
                "predicted_runout_date": predicted_runout_date,
                "status": "pending"
            }).execute()
            return response.data[0] if response.data else {"error": "Insert failed"}
        except Exception as e:
            print(f"Error creating refill alert: {e}")
            return {"error": str(e)}

    async def get_refill_alerts(self, patient_id: str) -> List[Dict[str, Any]]:
        """Fetch pending refill alerts for a patient."""
        try:
            response = self.supabase.table("refill_alerts")\
                .select("*")\
                .eq("patient_id", patient_id)\
                .eq("status", "pending")\
                .order("predicted_runout_date")\
                .execute()
            return response.data if response.data else []
        except Exception as e:
            print(f"Error fetching refill alerts: {e}")
            return []

    async def log_notification(self, patient_id: str, channel: str, type: str, payload: Dict[str, Any], status: str = "queued") -> Dict[str, Any]:
        """Logs a notification record."""
        try:
            response = self.supabase.table("notification_logs").insert({
                "patient_id": patient_id,
                "channel": channel,
                "type": type,
                "payload": payload,
                "status": status
            }).execute()
            return response.data[0] if response.data else {"error": "Insert failed"}
        except Exception as e:
            print(f"Error logging notification: {e}")
            return {"error": str(e)}
