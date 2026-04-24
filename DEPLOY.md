# Transcription Accuracy Upgrade — Deployment Guide

Ship the "smart language routing + live streaming + Unicode counts" upgrade to
all five surfaces (Oracle, Vercel, local dev, Electron, desktop capture).

---

## Files modified

Backend:

- [backend/services/session_processing.py](backend/services/session_processing.py) — Unicode word counts, transcript cleanup, smart Deepgram skip, Whisper primer wiring, diagnostic field `skipped_deepgram_non_english`
- [backend/services/groq_client.py](backend/services/groq_client.py) — `WHISPER_LANGUAGE_PRIMERS`, `prompt` param on `transcribe_audio` / `transcribe_audio_chunked`, new `whisper_primer_for()` helper
- [backend/transcription/audio_utils.py](backend/transcription/audio_utils.py) — ffmpeg `-af highpass+loudnorm+afftdn` filter chain in `convert_to_wav_16k`, auto-retry without filter on older ffmpeg builds, timeout raised 300s → 600s
- [backend/diarization/aligner.py](backend/diarization/aligner.py) — Unicode `count_words` instead of `text.split()`
- [backend/summarization/service.py](backend/summarization/service.py) — retry clause now names the specific wrong language the previous attempt used
- [backend/main.py](backend/main.py) — register new `live_transcription_router`
- [backend/routers/__init__.py](backend/routers/__init__.py) — export `live_transcription_router`
- [backend/language/__init__.py](backend/language/__init__.py) — export `count_words`

Frontend:

- [src/lib/backend-url.ts](src/lib/backend-url.ts) — new `resolveWebSocketUrl(path)`
- [src/pages/dashboard/InstantMeetingPage.tsx](src/pages/dashboard/InstantMeetingPage.tsx) — replaced `MediaRecorder` batch upload with WebSocket PCM streaming, added `LiveTranscriptPanel`, pre-creates session before recording

Config:

- [requirements.txt](requirements.txt) — added `regex>=2024.5.15`

## Files created

- [backend/language/word_count.py](backend/language/word_count.py) — `count_words()` Unicode-aware helper
- [backend/routers/live_transcription.py](backend/routers/live_transcription.py) — `/ws/live-transcription/{session_id}` WebSocket route with Deepgram streaming + Groq Whisper spool-file fallback

## New pip packages

- `regex>=2024.5.15`

No new heavy deps (`websockets` is already bundled with `uvicorn[standard]`, which is already in requirements.txt).

## New environment variables

| Key | Scope | Required? | Default fallback | Description |
|---|---|---|---|---|
| `VITE_PROD_BACKEND_WS_URL` | Vercel frontend (Production) | **Yes for prod WS streaming** | Falls back to deriving from `VITE_BACKEND_URL`, but that will fail on HTTPS mixed-content | Cloudflare Tunnel hostname for the backend, e.g. `wss://api.your-domain.example`. Must be wss (TLS). |

No backend env vars added — Deepgram / Groq / Supabase creds are the ones already in `.env` on Oracle.

---

## Deploying to Oracle Cloud

Run this single command locally to deploy backend changes:

```bash
wrapup-update
```

That alias handles `git pull && pip install -r requirements.txt && sudo systemctl restart wrapup.service` on Oracle.

Verify the service is healthy:

```bash
ssh ubuntu@92.4.79.17 "sudo systemctl status wrapup.service"
```

Verify the new WebSocket endpoint is live on Oracle (plain HTTP handshake over port 8000):

```bash
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  -H "Sec-WebSocket-Version: 13" \
  http://92.4.79.17:8000/ws/live-transcription/test-session
```

Expected response: `HTTP/1.1 101 Switching Protocols` (the auth check will then close with 4401, which is correct — we're only verifying the route exists and upgrades).

Check Oracle logs:

```bash
ssh ubuntu@92.4.79.17 "sudo journalctl -u wrapup.service -n 80 --no-pager"
```

---

## Production WebSocket routing — Cloudflare Tunnel

Browsers on `https://wrap-up-ai-2.vercel.app` cannot open `ws://` (mixed content) and cannot reach Oracle's `http://92.4.79.17:8000` directly. The production WebSocket path must be `wss://`. We use a Cloudflare Tunnel to give Oracle a TLS hostname without managing certs on the VM.

### One-time setup on Oracle

```bash
ssh ubuntu@92.4.79.17
# 1) install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  -o /usr/local/bin/cloudflared
sudo chmod +x /usr/local/bin/cloudflared

# 2) log in (opens a browser URL — complete auth once)
cloudflared tunnel login

# 3) create the tunnel
cloudflared tunnel create wrapup-backend

# 4) route a hostname to it (use a domain you own on Cloudflare)
cloudflared tunnel route dns wrapup-backend api.your-domain.example

# 5) config at ~/.cloudflared/config.yml
cat > ~/.cloudflared/config.yml <<'EOF'
tunnel: wrapup-backend
credentials-file: /home/ubuntu/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: api.your-domain.example
    service: http://localhost:8000
  - service: http_status:404
EOF

# 6) install as a systemd service
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

### Set Vercel env var

In the Vercel dashboard for the `wrap-up-ai-2` project, add:

```
VITE_PROD_BACKEND_WS_URL = wss://api.your-domain.example
```

Redeploy (push to main or click redeploy).

### Smoke-test the tunnel

```bash
websocat "wss://api.your-domain.example/ws/live-transcription/smoke-test?lang=en&token=dummy"
```

Expect a 4401 close — the route exists, auth rejected the dummy token.

---

## Deploying frontend to Vercel

Vercel auto-deploys on push:

```bash
git add -A
git commit -m "feat: transcription accuracy upgrade — smart routing + live streaming + Unicode counts"
git push origin main
```

Monitor at <https://vercel.com/dashboard>. Production URL:
<https://wrap-up-ai-2.vercel.app>.

Verify after deploy:

1. Load <https://wrap-up-ai-2.vercel.app/dashboard>
2. Open DevTools → Network
3. Click "New Meeting" → pick Bengali → "Start Recording"
4. You should see a WebSocket connection to `wss://api.your-domain.example/ws/live-transcription/<uuid>?lang=bn&token=…`
5. Speak → interim transcript should appear in gray italic, finalized chunks in normal text
6. Click Stop → redirected to meeting detail, summary should generate in Bengali

---

## Local dev — no deployment needed

Changes take effect immediately on:

- **localhost:5173** (frontend hot reload via Vite)
- **localhost:8003** (restart `uvicorn backend.main:app --reload --port 8003` if you don't have `--reload`)
- **localhost:52151** (Electron renderer hot reload — the Python backend is spawned fresh on each launch)

Install the new pip dep locally:

```bash
pip install -r requirements.txt
```

Smoke-test the WebSocket from the local backend:

```bash
websocat "ws://localhost:8003/ws/live-transcription/smoke-test?lang=en&token=dummy"
```

Expect a 4401 close.

---

## Electron / desktop app

No changes required in `electron/`. The Electron spawn still launches the
updated uvicorn on port 8002, and the frontend now derives the WebSocket URL
via `resolveWebSocketUrl()` which returns `ws://127.0.0.1:8002/ws/...`
under `isDesktopApp()`. Recording flow in the Electron app continues to use
the native desktop capture (mic + system audio) and the batch upload path —
that benefits from every backend Phase A accuracy change automatically.

The browser-only streaming path is active inside the Electron renderer too
(via the web-recording branch), so if the desktop capture IPC is
unavailable for any reason, the app falls back to the same live-streaming
code the web build uses, against the local uvicorn.

---

## Post-deploy smoke checklist

- [ ] Oracle `systemctl status wrapup.service` → active (running)
- [ ] Oracle `curl -i http://92.4.79.17:8000/healthz` → `{"status":"ok"}`
- [ ] Oracle WS handshake returns `101 Switching Protocols`
- [ ] `wss://api.your-domain.example` smoke test returns 4401 with dummy token
- [ ] Vercel deploy green, `VITE_PROD_BACKEND_WS_URL` set
- [ ] Upload a Bengali audio clip — summary + transcript in Bengali, word count > 0
- [ ] Record a 30-second English meeting on <https://wrap-up-ai-2.vercel.app> — live transcript appears within ~1 second of speaking
- [ ] Record a 30-second Bengali meeting on desktop Electron app — live transcript appears; on stop, summary is in Bengali
