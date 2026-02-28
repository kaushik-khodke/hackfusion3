import asyncio
import os
import json
from dotenv import load_dotenv
from pharmacy_orchestrator import PharmacyOrchestrator

# Load env from root
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

async def main():
    orchestrator = PharmacyOrchestrator()
    
    # Test IDs (found from DB)
    # Test with PAT002 to verify legacy history integration
    PATIENT_ID = "PAT002" 
    MEDICINE_ID = "9f18fae3-a31b-49fe-bd8e-2ef13a9dcdf5"

    print("--- 1. Testing get_medicines ---")
    meds = await orchestrator.get_medicines({"query": "a", "limit": 2})
    print(f"Found {len(meds)} medicines.")
    if meds: print(f"First medicine: {meds[0]['name']}")

    print("\n--- 2. Testing get_patient_orders ---")
    orders = await orchestrator.get_patient_orders({"patient_id": PATIENT_ID, "limit": 10})
    print(f"Found {len(orders)} order items in history.")
    for item in orders[:5]:
        print(f" - [{item['created_at']}] {item['medicine_name']} (Qty: {item['qty']}) Status: {item['status']}")

    print("\n--- 3. Testing create_order_draft ---")
    draft_params = {
        "patient_id": PATIENT_ID,
        "channel": "chat",
        "items": [
            {
                "medicine_id": MEDICINE_ID,
                "qty": 1,
                "dosage_text": "1 daily",
                "frequency_per_day": 1,
                "days_supply": 30
            }
        ]
    }
    draft = await orchestrator.create_order_draft(draft_params)
    print("Draft Result:", json.dumps(draft, indent=2))
    
    if "order_id" in draft:
        order_id = draft["order_id"]
        print("\n--- 4. Testing finalize_order ---")
        # Finalize (Note: This might fail if prescription is required, which we simulated to fail)
        final = await orchestrator.finalize_order({"order_id": order_id})
        print("Finalize Result:", json.dumps(final, indent=2))

    print("\n--- 5. Testing refill_alerts ---")
    await orchestrator.create_refill_alert({
        "patient_id": PATIENT_ID,
        "medicine_id": MEDICINE_ID,
        "predicted_runout_date": "2026-03-01"
    })
    alerts = await orchestrator.get_refill_alerts({"patient_id": PATIENT_ID})
    print(f"Pending alerts for patient: {len(alerts)}")

    print("\n--- 6. Testing log_notification ---")
    log_res = await orchestrator.log_notification({
        "patient_id": PATIENT_ID,
        "channel": "whatsapp",
        "type": "order_confirmation",
        "payload": {"message": "Test notification"},
        "status": "queued"
    })
    print("Log Notification Result:", json.dumps(log_res, indent=2))

if __name__ == "__main__":
    asyncio.run(main())
