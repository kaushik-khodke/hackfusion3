import os
import requests
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("ELEVENLABS_API_KEY")
url = "https://api.elevenlabs.io/v1/convai/agents"
headers = {"xi-api-key": api_key}

try:
    response = requests.get(url, headers=headers)
    with open("agents_output.txt", "w") as f:
        f.write(f"Status: {response.status_code}\n")
        if response.status_code == 200:
            agents = response.json().get("agents", [])
            f.write("Found Agents:\n")
            for a in agents:
                f.write(f"- ID: {a['agent_id']}, Name: {a['name']}\n")
        else:
            f.write(f"Error: {response.text}\n")
except Exception as e:
    with open("agents_output.txt", "w") as f:
        f.write(f"Failed: {e}\n")
