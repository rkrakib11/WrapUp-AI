<p align="center">
  <img src="src/assets/logo-wrapup.png" alt="WrapUp AI Logo" width="120"/>
</p>

<h1 align="center">WrapUp AI</h1>

<p align="center">
  <strong>AI-Powered Meeting Intelligence Platform</strong><br/>
  Transcribe · Summarize · Analyze · Act
</p>

<p align="center">
  <a href="https://wrap-up-ai-2.vercel.app">🌐 Live Web App</a> &nbsp;|&nbsp;
  <a href="#getting-started">🚀 Get Started</a> &nbsp;|&nbsp;
  <a href="#features">✨ Features</a> &nbsp;|&nbsp;
  <a href="#technology-stack">🛠 Tech Stack</a> &nbsp;|&nbsp;
  <a href="#platforms">📱 Platforms</a>
</p>

---

## What is WrapUp AI?

**WrapUp AI** is a full-stack, cross-platform SaaS application that uses artificial intelligence to automatically transcribe, summarize, and analyze meetings. Whether you are in a boardroom, working remotely, or on the go, WrapUp AI captures every word spoken and turns it into structured, actionable insights — instantly.

Users upload audio or video recordings, or record live meetings directly from the app. The system then produces:
- Accurate, speaker-labeled transcripts
- AI-generated summaries and Minutes of Meeting (MoM)
- Action items with owners and deadlines
- Meeting analytics (sentiment, engagement, speaker contributions)
- A conversational Q&A interface to ask anything about a past meeting

WrapUp AI is designed to be **user-friendly**, **lightweight**, **ad-free**, and **affordable** — built for individuals, small teams, and large enterprises alike.

**Live Web App:** [https://wrap-up-ai-2.vercel.app](https://wrap-up-ai-2.vercel.app)

---

## Platforms

WrapUp AI is available on **four platforms** — all sharing the same backend, database, and AI engine.

### 🌐 Web Application
- Runs in any modern browser (Chrome, Firefox, Safari, Edge)
- Full-featured dashboard with meetings, analytics, scheduling, and settings
- Deployed on Vercel with global CDN for fast load times anywhere in the world
- Responsive design — works on desktop browsers and mobile browsers

### 🖥 Desktop Application (macOS & Windows)
- Native desktop app built with **Electron**
- Available for **macOS** (Apple Silicon + Intel) and **Windows** (x64)
- **Screen & audio recording** — record meetings directly from your desktop without any third-party software
- **Offline resilience** — runs a local Python backend subprocess; uploads resume automatically if internet drops
- Persistent upload queue — even if the app crashes mid-upload, it recovers and resumes on next launch
- Custom `wrapup://` protocol for seamless OAuth (Google login) on desktop
- Installs like a standard native app (DMG for macOS, EXE/MSI for Windows)

### 📱 Mobile Application (iOS & Android)
- Built with **Flutter** for a single codebase targeting both iOS and Android
- Available on **App Store** (iOS) and **Google Play Store** (Android)
- Lightweight, fast, and battery-efficient
- Upload meeting recordings from your phone gallery or record audio directly in the app
- View transcripts, summaries, action items, and analytics on the go
- Push notifications for completed transcriptions and upcoming meetings
- Dark and light mode support
- **Ad-free** — no advertisements, ever
- Seamless sync with web and desktop — all data lives in one account

### 📊 All Platforms Share
- Single Supabase account — sign in once, access everything everywhere
- Real-time sync — start on desktop, continue on mobile
- Identical AI features across all platforms
- Same subscription — one plan covers web, desktop, and mobile

---

## Features

### Core AI Features
- **AI Transcription** — Converts audio/video to accurate text using Deepgram nova-3 with word-level timestamps and smart punctuation
- **Multi-Language Support** — Detects and transcribes 60+ languages including Bengali, Hindi, Arabic, Chinese, Japanese, Spanish, French, and more
- **Intelligent Fallback** — Groq Whisper (whisper-large-v3) runs automatically when Deepgram has low confidence or detects non-English, ensuring maximum accuracy
- **Speaker Diarization** — Identifies and labels each speaker (Speaker 1, Speaker 2, etc.) using pyannote.audio — know exactly who said what
- **AI Summary Generation** — Produces executive summary, key points, decisions made, follow-up items, and full Minutes of Meeting (MoM) using Groq LLM
- **Action Items Extraction** — Automatically identifies tasks, assigns owners, and parses deadlines from natural conversation
- **AI Q&A over Meetings** — Ask any question about a past meeting in natural language; the system retrieves relevant transcript sections and answers intelligently (RAG)
- **Meeting Analytics** — Sentiment analysis, per-speaker word counts, engagement score (0–100), language confidence metrics

### Meeting Management
- **Upload Audio / Video** — Supports MP3, MP4, WAV, M4A, OGG, MKV, WebM and more
- **Video Processing** — Automatically extracts audio from video files using ffmpeg (reduces a 5 GB video to ~5 MB of audio before processing)
- **Live Recording** — Record meetings directly from the desktop or mobile app
- **Instant Meeting** — Start a live session and get real-time transcription
- **Scheduled Meetings** — Create and manage upcoming meetings with AI-suggested time slots
- **Calendar View** — Monthly/weekly calendar of all your meetings
- **Meeting Sharing** — Generate a secure public link to share transcripts and summaries with anyone — no account needed to view
- **PDF Export** — Download meeting summaries and transcripts as PDF documents
- **Search & History** — Full-text search across all past transcripts

### Productivity & Collaboration
- **Action Items Dashboard** — Centralized task list extracted from all meetings, with completion tracking
- **Weekly Digest** — Summarized view of all meetings from the current week
- **Engagement Analytics** — Understand team participation, talk-time balance, and meeting health
- **Integrations** — Connect with Slack, Notion, Google Calendar, Zoom, Microsoft Teams, and more
- **Meeting Notes** — Add manual notes alongside AI-generated content

### User Experience
- **User Friendly** — Clean, intuitive interface designed for non-technical users
- **Lightweight** — Fast page loads, minimal resource usage, optimized for all devices
- **Ad-Free** — No advertisements on any platform, ever
- **Low Cost** — Affordable subscription plans starting from free; significantly cheaper than competitors
- **Dark / Light Mode** — Full theme support on all platforms
- **Onboarding Tour** — Guided first-time user experience
- **Responsive Design** — Works perfectly on any screen size

### Security & Privacy
- **JWT Authentication** — Secure Supabase Auth with email/password and Google OAuth
- **Row-Level Security (RLS)** — Each user can only access their own data at the database level
- **Signed URLs** — All stored files are accessed via time-limited signed URLs
- **No Data Sharing** — Meeting content is never used for training third-party AI models
- **Webhook Signature Validation** — Stripe webhooks verified cryptographically

### Business & Billing
- **Subscription Tiers** — Free, Plus, and Business plans
- **Stripe Integration** — Secure payment processing, subscription management, and billing portal
- **Feature Gating** — Premium features locked by tier; upgrade within the app at any time
- **Automatic Reconciliation** — Backend checks for expired subscriptions hourly

---

## Technology Stack

### Frontend (Web)
| Technology | Version | Purpose |
|---|---|---|
| React | 18 | UI component framework |
| TypeScript | 5 | Type-safe JavaScript |
| Vite + SWC | 5 | Fast bundler and hot reload |
| Tailwind CSS | 3 | Utility-first styling |
| shadcn/ui (Radix UI) | Latest | Accessible component library |
| Framer Motion | 11 | Animations and transitions |
| Three.js + React Three Fiber | 0.170 | 3D hero section |
| React Router | v6 | Client-side routing |
| TanStack React Query | v5 | Server state and caching |
| Recharts | 2 | Analytics charts |
| jsPDF | 4 | PDF generation |
| Sonner | 1 | Toast notifications |
| next-themes | 0.3 | Dark/light mode |

### Mobile App
| Technology | Purpose |
|---|---|
| Flutter | Cross-platform mobile framework (iOS + Android) |
| Dart | Programming language for Flutter |
| Supabase Flutter SDK | Auth, database, and storage on mobile |
| Flutter Sound | Audio recording on mobile |
| Provider / Riverpod | State management |
| Flutter Local Notifications | Push notifications for transcription complete |

### Backend (Python)
| Technology | Purpose |
|---|---|
| Python 3.11+ | Backend language |
| FastAPI | High-performance REST API framework |
| Deepgram API (nova-3) | Primary speech-to-text transcription |
| Groq Whisper (whisper-large-v3) | Cloud fallback transcription for non-English audio |
| faster-whisper | Local offline last-resort transcription |
| pyannote.audio 3.1 | Speaker diarization (who said what, when) |
| Groq LLM (llama-3.3-70b-versatile) | Meeting summarization, MoM, action items |
| Groq LLM (llama-3.1-8b-instant) | Q&A chat and website chatbot |
| FAISS | Vector similarity search for RAG |
| intfloat/multilingual-e5-base | Multilingual text embeddings (768-dim) |
| ffmpeg | Audio extraction from video files |
| structlog | Structured JSON logging |
| Pydantic v2 | Data validation and settings management |
| httpx | Async HTTP client |

### Database & Infrastructure
| Technology | Purpose |
|---|---|
| Supabase (PostgreSQL) | Primary relational database |
| Supabase Auth (JWT) | Authentication with email/password and Google OAuth |
| Supabase Storage | S3-compatible file storage for audio/video |
| Supabase Edge Functions (Deno/TypeScript) | Serverless functions for Stripe and AI scheduling |
| Supabase RLS | Row-level security — users only see their own data |

### Desktop App
| Technology | Purpose |
|---|---|
| Electron 41 | Native desktop app wrapper |
| esbuild | Bundles TypeScript Electron main process |
| IPC (Main ↔ Renderer) | Communication between Electron and React |
| Custom Protocol (wrapup://) | OAuth callback on desktop |

### Payments & Billing
| Technology | Purpose |
|---|---|
| Stripe | Subscription billing and payment processing |
| Stripe Webhooks | Real-time subscription event handling |
| Stripe Customer Portal | Self-service billing management |

### DevOps & Deployment
| Technology | Purpose |
|---|---|
| Vercel | Frontend CI/CD deployment with global CDN |
| Heroku / Railway | Backend API deployment |
| GitHub | Version control and collaboration |
| Procfile | Backend process definition for cloud deployment |

---

## Project Structure

```
WrapUp-AI/
│
├── backend/                        # Python FastAPI backend
│   ├── analytics/
│   │   └── engine.py               # Sentiment, engagement, speaker contribution metrics
│   ├── core/
│   │   ├── config.py               # All environment variable settings (Supabase, Groq, etc.)
│   │   ├── logging.py              # Structured logging configuration
│   │   └── security.py             # JWT validation and user context extraction
│   ├── db/
│   │   └── supabase.py             # Async Supabase HTTP client (CRUD for all tables)
│   ├── diarization/
│   │   ├── pyannote_client.py      # pyannote.audio speaker diarization
│   │   └── aligner.py              # Aligns pyannote turns with Deepgram word timestamps
│   ├── language/
│   │   └── policy.py               # Multi-method language detection (Deepgram + text + LLM)
│   ├── models/
│   │   └── domain.py               # Python dataclasses (TranscriptionResult, ProcessingJob, etc.)
│   ├── rag/
│   │   ├── chunker.py              # Text chunking (900 tokens, 150 overlap)
│   │   ├── embeddings.py           # Multilingual E5 embeddings
│   │   ├── faiss_store.py          # FAISS vector index (per session, stored on disk)
│   │   └── service.py              # RAG orchestrator: index transcript, answer questions
│   ├── routers/
│   │   ├── sessions.py             # /sessions/{id}/process, /status, /ask
│   │   ├── meetings.py             # /meetings/suggest-times
│   │   ├── chat.py                 # /chat/live (website chatbot)
│   │   ├── stripe.py               # /stripe/webhook, /checkout, /subscription
│   │   └── share.py                # /share/{token} (public meeting sharing)
│   ├── schemas/                    # Pydantic request/response schemas
│   ├── services/
│   │   ├── container.py            # Dependency injection — wires all services together
│   │   ├── session_processing.py   # MAIN PIPELINE: transcribe → diarize → summarize → index
│   │   ├── groq_client.py          # Groq API client with multi-key rotation
│   │   ├── meeting_service.py      # Meeting scheduling with AI time suggestions
│   │   └── chat_service.py         # Website chatbot service
│   ├── stripe/
│   │   └── service.py              # Stripe webhook handling, subscription sync
│   ├── summarization/
│   │   └── service.py              # LLM summarization with structured JSON output
│   ├── transcription/
│   │   ├── deepgram_client.py      # Deepgram API client with language recovery
│   │   ├── whisper_client.py       # Local faster-whisper client (offline fallback)
│   │   ├── audio_utils.py          # ffmpeg: extract audio, chunk, convert formats
│   │   └── audio_preprocessor.py  # Audio normalization and noise reduction
│   ├── workers/
│   │   ├── queue.py                # Async job queue (queued → processing → done/failed)
│   │   └── session_worker.py       # Worker: picks jobs, runs pipeline, reports progress
│   └── main.py                     # FastAPI app entry point, CORS, routers, lifecycle
│
├── src/                            # React TypeScript frontend
│   ├── components/
│   │   ├── ui/                     # 50+ shadcn/ui components (Button, Card, Dialog, etc.)
│   │   ├── landing/                # Marketing page sections (Hero, Features, Pricing, etc.)
│   │   ├── dashboard/              # Dashboard-specific components (OnboardingTour, PremiumGate)
│   │   ├── layout/
│   │   │   └── DashboardLayout.tsx # Sidebar + header + content wrapper
│   │   ├── LiveChatbot.tsx         # Floating chatbot widget (Echo)
│   │   └── ThemeProvider.tsx       # Dark/light mode management
│   ├── hooks/
│   │   ├── useAuth.ts              # Real-time auth state from Supabase
│   │   ├── useMeetings.ts          # Fetch and filter all user meetings
│   │   ├── useMeetingDetail.ts     # Fetch single meeting with full data
│   │   ├── useActionItems.ts       # Action items CRUD
│   │   ├── useSubscription.ts      # Subscription tier checks and feature gating
│   │   └── useProfile.ts           # User profile data
│   ├── integrations/supabase/
│   │   ├── client.ts               # Supabase JS client initialization
│   │   └── types.ts                # TypeScript types for all database tables
│   ├── lib/
│   │   ├── auth.ts                 # signUp, signIn, signInWithGoogle, signOut
│   │   ├── session-processing.ts   # Call backend to start transcription
│   │   ├── upload-queue.ts         # Desktop upload queue management
│   │   ├── desktop-capture.ts      # Screen/audio recording API (Electron)
│   │   ├── subscription.ts         # Feature access checks per tier
│   │   └── stripe.ts               # Stripe checkout helpers
│   ├── pages/
│   │   ├── Index.tsx               # Landing/home page
│   │   ├── Login.tsx / SignUp.tsx  # Authentication pages
│   │   ├── SharedMeetingPage.tsx   # Public shared meeting (no login)
│   │   └── dashboard/
│   │       ├── DashboardHome.tsx        # Overview: meetings, action items, engagement
│   │       ├── UploadPage.tsx           # Drag-and-drop audio/video upload
│   │       ├── MeetingDetailPage.tsx    # Full meeting: transcript, summary, Q&A, sharing
│   │       ├── MeetingsPage.tsx         # All meetings list with filters
│   │       ├── AnalyticsPage.tsx        # Charts and meeting analytics
│   │       ├── ActionItemsPage.tsx      # Task management from meetings
│   │       ├── ScheduleMeetingPage.tsx  # Create/schedule with AI time suggestions
│   │       ├── InstantMeetingPage.tsx   # Start live recording session
│   │       ├── TranscriptHistoryPage.tsx# Search across all transcripts
│   │       ├── EngagementPage.tsx       # Team participation analytics
│   │       └── SettingsPage.tsx         # Account and preferences
│   └── App.tsx                     # Root component with all routes
│
├── electron/                       # Electron desktop app
│   ├── main.ts                     # Main process: window, recording, IPC, OAuth
│   ├── preload.ts                  # IPC bridge: exposes APIs to renderer safely
│   └── backend-manager.ts          # Manages Python backend subprocess
│
├── supabase/
│   ├── migrations/                 # PostgreSQL schema migrations (date-ordered)
│   └── functions/
│       ├── check-subscription/     # Verify Stripe subscription tier
│       ├── create-checkout-session/# Initialize Stripe checkout
│       ├── customer-portal/        # Stripe billing portal URL
│       ├── live-chat/              # Website chatbot backend (Groq)
│       ├── suggest-times/          # AI meeting time suggestions
│       └── check-email-exists/     # Email availability check on signup
│
├── package.json                    # Frontend dependencies and npm scripts
├── requirements.txt                # Python backend dependencies
├── vite.config.ts                  # Vite bundler config (port 5173, @ alias)
├── tailwind.config.ts              # Tailwind CSS theme customization
├── tsconfig.json                   # TypeScript config for React app
├── tsconfig.electron.json          # TypeScript config for Electron (CommonJS)
├── vercel.json                     # Vercel deployment and rewrite rules
└── Procfile                        # Backend deployment for Heroku/Railway
```

---

## How It Works

### Meeting Transcription Pipeline

```
User uploads audio/video file
           ↓
  Supabase Storage (file saved securely)
           ↓
  Frontend → POST /sessions/{id}/process
           ↓
  Job added to async queue → SessionWorker picks it up
           ↓
  [If video file] → ffmpeg extracts audio to OGG
  (5 GB video → ~5 MB audio, same quality)
           ↓
  Deepgram nova-3 API
  → Transcript + word-level timestamps + speaker labels
  → Auto language detection
           ↓
  [If non-English OR word confidence < 0.80]
  → Groq Whisper (whisper-large-v3) runs as comparison
  → Best result selected (word count × confidence scoring)
           ↓
  Language Detection Consensus
  → Deepgram detected language
  → Text-based detection (langdetect, textblob)
  → Groq LLM as tiebreaker if mismatch
           ↓
  [If pyannote.audio available]
  → Speaker diarization → Aligned with word timestamps
  → Each word tagged: "Speaker 1", "Speaker 2", etc.
           ↓
  Groq LLM (llama-3.3-70b-versatile)
  → Executive summary
  → Key points + decisions + follow-ups
  → Action items with owner + deadline
  → Full Minutes of Meeting (MoM) document
           ↓
  Multilingual E5 Embeddings → FAISS Vector Index
  (Enables Q&A search over the transcript)
           ↓
  Analytics Engine
  → Sentiment score, speaker contributions, engagement
           ↓
  All data saved to Supabase
           ↓
  Frontend polls status → Results displayed to user
```

### AI Q&A (Retrieval-Augmented Generation)

```
User types a question about a meeting
           ↓
  Question embedded with multilingual E5 model
           ↓
  FAISS index searched → Top 4 most relevant chunks retrieved
           ↓
  Chunks + question sent to Groq LLM
           ↓
  Answer returned in the meeting's original language
```

### Multi-Language Handling

WrapUp AI uses a three-layer language detection system to handle difficult cases (e.g., Bengali audio mistakenly detected as Hindi):

1. **Deepgram's detected language** — from the transcription API response
2. **Text-based consensus** — multiple NLP libraries vote on the language of the actual transcript text
3. **LLM tiebreaker** — Groq LLM makes the final call when the two methods disagree

For non-English audio, the full `whisper-large-v3` model (not the turbo variant) is always used to ensure higher accuracy on lower-resource languages.

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/healthz` | None | Health check |
| `POST` | `/sessions/{id}/process` | JWT | Start transcription and analysis job |
| `GET` | `/sessions/{id}/status` | JWT | Poll processing progress (0–100%) |
| `POST` | `/sessions/{id}/ask` | JWT | Ask a question about the meeting (RAG) |
| `POST` | `/meetings/suggest-times` | JWT | Get AI-suggested meeting time slots |
| `POST` | `/meetings/{id}/share-link` | JWT | Generate a public share token |
| `GET` | `/share/{token}` | None | Fetch a shared meeting (public, no auth) |
| `POST` | `/stripe/webhook` | Stripe Sig | Handle Stripe payment events |
| `POST` | `/stripe/create-checkout-session` | JWT | Start Stripe checkout flow |
| `GET` | `/stripe/check-subscription` | JWT | Check user's current subscription tier |
| `POST` | `/stripe/customer-portal` | JWT | Get Stripe billing portal URL |
| `POST` | `/chat/live` | None | Website chatbot (Echo) |

---

## Subscription Plans

| Feature | Free | Plus | Business |
|---|---|---|---|
| Meetings per month | Limited | Unlimited | Unlimited |
| AI Transcription | Yes | Yes | Yes |
| Multi-language | Yes | Yes | Yes |
| AI Summary & MoM | Yes | Yes | Yes |
| Speaker Diarization | Yes | Yes | Yes |
| Action Items | Yes | Yes | Yes |
| AI Q&A over meetings | Limited | Yes | Yes |
| Meeting Analytics | Basic | Full | Full |
| Meeting Sharing | No | Yes | Yes |
| PDF Export | No | Yes | Yes |
| Team Features | No | No | Yes |
| SSO / Enterprise Auth | No | No | Yes |
| Priority Support | No | No | Yes |
| Price | Free | Low cost | Custom |

---

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Python 3.11+
- ffmpeg installed (`brew install ffmpeg` on macOS)
- Supabase project (free tier works)
- Deepgram API key (free tier available)
- Groq API key (free tier available)
- Stripe account (for payment features)

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/wrapup-ai.git
cd wrapup-ai
```

### 2. Frontend Setup

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Edit .env and fill in:
# VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_STRIPE_PUBLISHABLE_KEY

# Start development server
npm run dev
# Runs at http://localhost:5173
```

### 3. Backend Setup

```bash
# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate        # macOS/Linux
.venv\Scripts\activate           # Windows

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
# Create a .env file in the root with all backend keys (see Environment Variables section)

# Start backend server
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8003 --reload
# Runs at http://localhost:8003
```

### 4. Desktop App (Electron)

```bash
# Build the Electron main process
node_modules/.bin/esbuild electron/main.ts electron/preload.ts \
  --bundle --platform=node --format=cjs \
  --outdir=dist-electron --out-extension:.js=.cjs --external:electron

# Launch (macOS — clears ELECTRON_RUN_AS_NODE env var issue)
env -u ELECTRON_RUN_AS_NODE VITE_DEV_SERVER_URL=http://127.0.0.1:5173 \
  node node_modules/electron/cli.js .

# Launch (Windows)
set VITE_DEV_SERVER_URL=http://127.0.0.1:5173
node node_modules/electron/cli.js .
```

### 5. Mobile App (Flutter)

```bash
# Install Flutter: https://flutter.dev/docs/get-started/install

# Navigate to mobile app directory
cd mobile   # (Flutter project folder)

# Install dependencies
flutter pub get

# Run on iOS simulator
flutter run -d ios

# Run on Android emulator
flutter run -d android
```

---

## Environment Variables

### Frontend (`.env`)
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_BACKEND_URL=http://127.0.0.1:8003
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

### Backend (`.env`)
```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_JWT_SECRET=your_jwt_secret

# Transcription
DEEPGRAM_API_KEY=your_deepgram_key
GROQ_API_KEY=gsk_your_groq_key

# Payments
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PLUS=price_...
STRIPE_PRICE_BUSINESS=price_...

# Optional: Extra API keys for rotation on rate-limits
DEEPGRAM_API_KEYS_EXTRA=key2,key3
GROQ_API_KEYS_EXTRA=gsk_key2,gsk_key3

# Optional: Speaker diarization
PYANNOTE_AUTH_TOKEN=hf_your_token
```

---

## Why WrapUp AI?

| | WrapUp AI | Competitors |
|---|---|---|
| **Ad-Free** | Yes, always | Most have ads on free tier |
| **Multi-Platform** | Web + Desktop + Mobile | Usually web-only or one platform |
| **Multi-Language** | 60+ languages | Often English-only |
| **Open Setup** | Self-hostable backend | Fully proprietary |
| **Low Cost** | Affordable for individuals | Expensive enterprise pricing |
| **Offline Capable** | Desktop app with local backend | Cloud-only |
| **No Vendor Lock-in** | Standard APIs (Deepgram, Groq) | Single proprietary AI |
| **Privacy First** | Your data, your meetings | Data shared with third parties |

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Commit your changes: `git commit -m "Add: your feature description"`
4. Push to the branch: `git push origin feature/your-feature-name`
5. Open a Pull Request

---

## License

This project is proprietary and confidential. All rights reserved © 2026 WrapUp AI.

Unauthorized copying, distribution, or modification of this software is strictly prohibited.

---

<p align="center">
  Built with ❤️ using React · FastAPI · Flutter · Electron · Deepgram · Groq · Supabase · Stripe
</p>
