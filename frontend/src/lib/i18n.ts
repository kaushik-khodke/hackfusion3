import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const resources = {
  en: {
    translation: {
      common: {
        login: "Login",
        logout: "Logout",
        signup: "Sign Up",
        cancel: "Cancel",
        submit: "Submit",
        back: "Back",
        next: "Next"
      },
      nav: {
        dashboard: "Dashboard"
      },
      landing: {
        hero_title: "Your Health Records, Secured by Blockchain",
        hero_subtitle: "Store, manage, and share medical records securely with Smart Health Cards, AI assistance, and decentralized storage.",
        cta_patient: "Get Started as Patient",
        cta_doctor: "I'm a Doctor",
        feature_1_title: "Smart Health Cards",
        feature_1_desc: "Instant access with QR codes. No passwords, just scan and go.",
        feature_2_title: "Blockchain Security",
        feature_2_desc: "Your data encrypted and stored on IPFS with blockchain verification.",
        feature_3_title: "AI Health Assistant",
        feature_3_desc: "Get instant answers about your health with voice and text support.",
        how_it_works: "How It Works",
        step_1: "Create your account and get a unique Smart Health Card",
        step_2: "Upload your medical records securely to IPFS",
        step_3: "Grant temporary access to doctors via QR scan",
        step_4: "Chat with AI assistant for health insights",
        sdg_title: "Aligned with UN Sustainable Development Goals",
        sdg_3: "Good Health & Well-being",
        sdg_9: "Industry, Innovation & Infrastructure",
        sdg_10: "Reduced Inequalities"
      },
      auth: {
        login: "Login",
        signup: "Sign Up",
        email: "Email",
        password: "Password",
        full_name: "Full Name",
        phone: "Phone Number",
        hospital: "Hospital/Clinic",
        license: "Medical License",
        role_patient: "Patient",
        role_doctor: "Doctor",
        have_account: "Already have an account?",
        no_account: "Don't have an account?",
        password_strength: "Password strength",
        weak: "Weak",
        medium: "Medium",
        strong: "Strong"
      },
      patient: {
        dashboard_title: "Patient Dashboard",
        dashboard_subtitle: "Access your medical records and manage doctor permissions",
        smart_card: "Smart Health Card",
        health_id: "Health ID",
        upload_record: "Upload Record",
        my_records: "My Records",
        consent_management: "Consent Management",
        ai_assistant: "Expert Pharmacy",
        total_records: "Total Records",
        pending_consents: "Pending Consents",
        quick_actions: "Quick Actions",
        recent_activity: "Recent Activity",
        no_activity: "No recent activity to show",
        recent_records: "Recent Records",
        no_records: "No medical records yet",
        chat_title: "Expert Clinical Pharmacist",
        chat_subtitle: "Clinical-grade medication advice & refills",
        listening: "I am listening...",
        speak_now: "Speak your symptoms clearly",
        type_placeholder: "Type or tap the mic to speak...",
        ai_disclaimer: "AI advice. Not a diagnosis."
      },
      doctor: {
        dashboard_title: "Doctor Dashboard",
        scan_qr: "Scan Patient QR",
        request_access: "Request Access",
        request_details: "Request Details",
        access_denied: "Access Denied",
        access_expired: "Access Expired",
        back_dashboard: "Back to Dashboard",
        manual_entry: "Manual Entry",
        enter_uhid: "Enter 10-digit UHID",
        patient_records: "Patient Records",
        your_access: "Your Access Level",
        read_write: "Read & Write",
        read_only: "Read Only"
      },
      consent: {
        title: "Consent Requests",
        subtitle: "Approve or deny doctor access to your medical records.",
        pending: "Pending",
        approved: "Approved",
        denied: "Denied",
        expired: "Expired",
        approve: "Approve",
        deny: "Deny",
        confirm_pin: "Confirm with Smart PIN",
        enter_pin: "Enter your 6-digit Smart PIN to confirm.",
        reason: "Reason",
        access_level: "Access Level",
        duration: "Duration"
      }
    }
  },
  hi: {
    translation: {
      common: {
        login: "लॉगिन",
        logout: "लॉगआउट",
        signup: "साइन अप"
      },
      landing: {
        hero_title: "आपके स्वास्थ्य रिकॉर्ड, ब्लॉकचेन द्वारा सुरक्षित",
        hero_subtitle: "स्मार्ट हेल्थ कार्ड के साथ चिकित्सा रिकॉर्ड को सुरक्षित रूप से स्टोर करें।",
        cta_patient: "रोगी के रूप में शुरू करें",
        cta_doctor: "मैं डॉक्टर हूं"
      }
    }
  },
  mr: {
    translation: {
      common: {
        login: "लॉगिन",
        logout: "लॉगआउट",
        signup: "साइन अप"
      },
      landing: {
        hero_title: "तुमचे आरोग्य रेकॉर्ड, ब्लॉकचेन द्वारे सुरक्षित",
        hero_subtitle: "स्मार्ट हेल्थ कार्डसह वैद्यकीय रेकॉर्ड सुरक्षितपणे स्टोअर करा.",
        cta_patient: "रुग्ण म्हणून सुरू करा",
        cta_doctor: "मी डॉक्टर आहे"
      }
    }
  }
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: localStorage.getItem('language') || 'en',
    fallbackLng: 'en',
    debug: true, // Enable debug to see what's happening
    interpolation: {
      escapeValue: false
    }
  })

export default i18n
