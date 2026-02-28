import google.generativeai as genai
import os
from dotenv import load_dotenv

# Load env from parent dir
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

try:
    print("Available models with generateContent support:")
    for m in genai.list_models():
        if 'generateContent' in m.supported_generation_methods:
            print(f"- {m.name}")
except Exception as e:
    print(f"Error: {e}")
