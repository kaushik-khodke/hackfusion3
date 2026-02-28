# 🏥 MyHealthChain

**Secure, AI-Powered Health Records Platform**

Your health data, encrypted and owned by you. Grant consent-based access to doctors, chat with AI health assistant in multiple languages, and ensure data integrity with IPFS.

---

## 🚀 Features

- ✅ **Smart Health Card** - QR-based patient identity with PIN-protected encryption
- ✅ **IPFS Storage** - Decentralized, encrypted medical records
- ✅ **Consent Management** - Grant/revoke doctor access with expiry
- ✅ **AI Health Assistant** - Multilingual chatbot powered by Gemini
- ✅ **Voice Mode** - Speak your health questions (STT/TTS via ElevenLabs)
- ✅ **Multilingual UI** - English, Hindi (हिंदी), Marathi (मराठी)
- ✅ **Audit Logs** - Immutable access tracking
- ✅ **Premium UI** - Glassmorphism, animations, dark mode

---

## 🛠️ Tech Stack

**Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Framer Motion  
**Backend:** Supabase (PostgreSQL + Auth + Edge Functions)  
**Storage:** IPFS (Pinata)  
**AI:** Google Gemini API, ElevenLabs (Voice)  
**Security:** AES-256-GCM, PBKDF2, SHA-256, RLS

---

## 🏃 Quick Start

### Prerequisites
- Node.js 18+
- Supabase account
- Pinata account
- Gemini API key
- ElevenLabs API key

### Installation

```bash
# Clone repository
git clone https://github.com/kaushik-khodke/AI-Apprentice.git
cd myhealthchain

# Install frontend dependencies
cd frontend
npm install

# Setup environment
cp .env.example .env
# Edit .env with your keys

# Run development server
npm run dev
