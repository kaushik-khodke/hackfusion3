import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('../frontend/.env')

url = os.environ.get("VITE_SUPABASE_URL")
key = os.environ.get("VITE_SUPABASE_ANON_KEY")
if not url or not key:
    print("Missing URL or KEY")
    exit(1)

supabase = create_client(url, key)

try:
    res = supabase.table('patients').insert({
        'id': '11111111-1111-1111-1111-111111111111', # Provide ID to match user_id
        'user_id': '11111111-1111-1111-1111-111111111111',
        'uhid': 'TEST1234',
        'profile_completed': True
    }).execute()
    print("Success:", res)
except Exception as e:
    import traceback
    traceback.print_exc()
