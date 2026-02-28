import pandas as pd
from supabase import create_client

# 1. Initialize Supabase
URL = "YOUR_SUPABASE_URL"
KEY = "YOUR_SERVICE_ROLE_KEY"
supabase = create_client(URL, KEY)
PASSWORD = "HealthChainDemo2026!"

def migrate_35_patients():
    # Load your CSV
    df = pd.read_csv("Consumer Order History 1.xlsx - Sheet1.csv")
    unique_ids = df['patient_external_id'].unique()[:35]

    for ext_id in unique_ids:
        # Filter data for this specific patient
        patient_rows = df[df['patient_external_id'] == ext_id]
        email = f"patient_{ext_id}@demo.com"
        
        try:
            # STEP A: Create Auth User
            auth_res = supabase.auth.admin.create_user({
                "email": email, "password": PASSWORD, "email_confirm": True
            })
            user_uuid = auth_res.user.id

            # STEP B: Insert into 'profiles'
            supabase.table("profiles").insert({
                "id": user_uuid, 
                "role": "patient", 
                "full_name": f"Demo User {ext_id}"
            }).execute()

            # STEP C: Insert into 'patients' (This generates the patient_id we need)
            p_res = supabase.table("patients").insert({
                "user_id": user_uuid,
                "external_id": str(ext_id),
                "full_name": f"Demo User {ext_id}",
                "uhid": f"UHID-{ext_id}"
            }).execute()
            
            # This is the "Anchor ID" for all medical data
            internal_patient_id = p_res.data[0]['id']

            # STEP D: Insert into 'records' (The missing data fix)
            # We convert their CSV rows into a text block for the Gemini Agent
            history_text = patient_rows.to_string(index=False)
            
            supabase.table("records").insert({
                "patient_id": internal_patient_id, # Correct link to patients table
                "uploaded_by": user_uuid,          # Correct link to auth.users
                "record_type": "Pharmacy History",
                "title": f"Migrated History for {ext_id}",
                "extracted_text": history_text,
                "record_date": "2026-02-28"
            }).execute()

            # STEP E: Insert into 'order_history_raw' for the ML Engine
            raw_orders = []
            for _, row in patient_rows.iterrows():
                raw_orders.append({
                    "patient_external_id": str(ext_id),
                    "product_name": row['product_name'],
                    "quantity": int(row['quantity']),
                    "purchase_date": row['purchase_date'],
                    "total_price_eur": float(row['total_price_eur'])
                })
            supabase.table("order_history_raw").insert(raw_orders).execute()

            print(f"✅ Success: {email} | Records Linked to ID: {internal_patient_id}")

        except Exception as e:
            print(f"❌ Failed {email}: {str(e)}")

if __name__ == "__main__":
    migrate_35_patients()