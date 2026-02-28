import re
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

# --- 1. MOCK TRAINING DATA ( The "Knowledge Base" ) ---
# In a real app, you would fetch thousands of records. 
# For the hackathon, we train on this logic so the model learns patterns.
# [Systolic BP, Diastolic BP, Sugar Level, Heart Rate, Age]
X_train = [
    [120, 80, 90, 72, 25],   # Healthy
    [110, 70, 85, 68, 30],   # Healthy
    [150, 95, 200, 85, 50],  # Critical (High BP + High Sugar)
    [160, 100, 180, 90, 60], # Critical (Very High BP)
    [130, 85, 140, 75, 45],  # Warning (Slightly High)
    [140, 90, 250, 80, 55],  # Critical (Diabetes Risk)
    [90, 60, 80, 65, 22]     # Low BP (Warning)
]

# 0 = Healthy, 1 = Warning, 2 = Critical
y_train = [0, 0, 2, 2, 1, 2, 1]

# Initialize and Train immediately (Lightweight for Hackathon)
rf_model = RandomForestClassifier(n_estimators=100, random_state=42)
rf_model.fit(X_train, y_train)

def parse_medical_text(text_data):
    """
    Extracts numerical vitals from unstructured text using Regex.
    Example Input: "Patient BP is 150/90 and sugar is 200mg/dl"
    """

    data = {
        'systolic': None,
        'diastolic': None,
        'sugar': None,
        'heart_rate': None,
        'age': None,
        'height': None,
        'weight': None,
        'blood_group': None
    }
    
    # Pre-process text to simpler format
    # Remove markdown chars (*, #), replaces :, -, newline with space
    clean_text = text_data.lower().replace(':', ' ').replace('-', ' ').replace('\n', ' ').replace('*', ' ').replace('#', ' ')
    
    # DEBUG: Print text snippet to see what we are parsing
    print(f"🔍 Parsing Text Snippet: {clean_text[:200]}...")

    # Extract BP (e.g., "150/90", "140 / 90", "bp 120/80")
    # Look for 2-3 digits / 2-3 digits. Ignore non-digits in between.
    bp_match = re.search(r'(?:bp|pressure)?[^\d]*(\d{2,3})\s*/\s*(\d{2,3})', clean_text)
    if bp_match:
        data['systolic'] = int(bp_match.group(1))
        data['diastolic'] = int(bp_match.group(2))

    # Extract Sugar (e.g., "sugar 200", "glucose 180", "rbs 140", "fbs 100")
    sugar_match = re.search(r'(?:sugar|glucose|rbs|fbs|ppbs|levels?)[^\d]*(\d{2,3})', clean_text)
    if sugar_match:
        data['sugar'] = int(sugar_match.group(1))

    # Extract Heart Rate (e.g., "HR 80", "pulse 100", "bpm 90")
    hr_match = re.search(r'(?:hr|pulse|rate|bpm)[^\d]*(\d{2,3})', clean_text)
    if hr_match:
        data['heart_rate'] = int(hr_match.group(1))

    # Extract Age (e.g., "25 years", "age 30", "30 yrs", "Age: 35")
    # Matches "age" followed by ANY non-digits, then the number.
    age_match = re.search(r'(?:age|old)[^\d]*(\d{1,2})', clean_text)
    if age_match:
        data['age'] = int(age_match.group(1))

    # Extract Height (e.g., "175 cm")
    height_match = re.search(r'(\d{2,3})\s*(?:cm|centimeters)', clean_text)
    if height_match:
        data['height'] = int(height_match.group(1))

    # Extract Weight (e.g., "70 kg")
    weight_match = re.search(r'(\d{2,3})\s*(?:kg|kilograms)', clean_text)
    if weight_match:
        data['weight'] = int(weight_match.group(1))
        
    # Extract Blood Group (A+, B-, AB+, O+, etc)
    # Using case insensitive original text for this one to preserve case if needed (though we lowercased above)
    bg_match = re.search(r'\b(a|b|ab|o)\s?[\+\-]', text_data, re.IGNORECASE)
    if bg_match:
        data['blood_group'] = bg_match.group(0).upper().replace(' ', '')
    else:
        # Try full words like "O Positive"
        bg_word_match = re.search(r'\b(a|b|ab|o)\s+(positive|negative)', clean_text)
        if bg_word_match:
            grp = bg_word_match.group(1).upper()
            sign = "+" if "positive" in bg_word_match.group(2) else "-"
            data['blood_group'] = f"{grp}{sign}"

    print(f"✅ Extracted Vitals: {data}")
    return data

def analyze_risk(text_records):
    """
    Main function called by API. 
    1. Parses text -> numbers.
    2. Predicts using Random Forest (if enough data).
    """
    # Combine all records into one string for analysis
    full_text = " ".join(text_records) if text_records else ""
    
    # 1. Parse
    features = parse_medical_text(full_text)
    
    # 2. Predict Risk
    risk_status = "Insufficient Data"
    
    # Check what we have
    has_bp = features['systolic'] is not None and features['diastolic'] is not None
    has_sugar = features['sugar'] is not None
    has_age = features['age'] is not None
    
    # STRATEGY 1: ML Model (Requires All Data)
    if has_bp and has_sugar and has_age:
        # Prepare input for model [Systolic, Diastolic, Sugar, HR, Age]
        hr_val = features['heart_rate'] if features['heart_rate'] is not None else 72
        input_data = [
            features['systolic'],
            features['diastolic'],
            features['sugar'],
            hr_val,
            features['age']
        ]
        prediction_index = rf_model.predict([input_data])[0]
        status_map = {0: "Healthy", 1: "Warning", 2: "Critical"}
        risk_status = status_map[prediction_index]

    # STRATEGY 2: Rule-Based Fallback (If partial data)
    elif has_bp or has_sugar:
        # Default to Healthy, then escalate based on findings
        current_risk = 0 # 0=Healthy, 1=Warning, 2=Critical
        
        # Check BP
        if has_bp:
            sys = features['systolic']
            dia = features['diastolic']
            if sys >= 180 or dia >= 120:
                current_risk = max(current_risk, 2)
            elif sys >= 140 or dia >= 90:
                current_risk = max(current_risk, 1)
        
        # Check Sugar
        if has_sugar:
            sug = features['sugar']
            if sug >= 200:
                current_risk = max(current_risk, 2)
            elif sug >= 140:
                current_risk = max(current_risk, 1)
                
        status_map = {0: "Healthy", 1: "Warning", 2: "Critical"}
        risk_status = status_map[current_risk]
        
    else:
        risk_status = "Insufficient Data"
    
    return {
        "risk_level": risk_status,
        "vitals_detected": {
            "bp": f"{features['systolic']}/{features['diastolic']}" if features['systolic'] and features['diastolic'] else None,
            "sugar": features['sugar'],
            "heart_rate": features['heart_rate'],
            "height": features['height'],
            "weight": features['weight'],
            "weight": features['weight'],
            "age": features['age'],
            "blood_group": features['blood_group']
        }
    }