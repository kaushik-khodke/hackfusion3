import google.generativeai as genai
import os
from dotenv import load_dotenv

# Load env from parent dir
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

print("--- Listing All Models ---")
try:
    models = genai.list_models()
    for m in models:
        print(f"Name: {m.name}")
        print(f"Display Name: {m.display_name}")
        print(f"Supported Methods: {m.supported_generation_methods}")
        print("-" * 20)
except Exception as e:
    print(f"Error listing models: {e}")
