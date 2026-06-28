# PinFlow Implementation Plan

**Goal:** Web app yang mengubah URL produk Etsy menjadi Pinterest pin terjadwal secara otomatis menggunakan AI (via 9Router) dan PostFast API.

**Architecture:** React (Vite) frontend + FastAPI Python backend, dipisah dalam satu monorepo. Backend handle scraping, AI call, PostFast integration. Frontend handle UI review/edit/schedule.

**Tech Stack:**
- Frontend: React + Vite + TailwindCSS + shadcn/ui
- Backend: FastAPI + Python 3.11 + httpx + BeautifulSoup4
- DB: SQLite via SQLModel (ringan, cukup untuk v1)
- Deploy: Docker Compose + nginx di VPS

---

## File Structure

```
pinflow/
├── backend/
│   ├── main.py                    # FastAPI app entry
│   ├── config.py                  # Settings/env
│   ├── database.py                # SQLite + SQLModel setup
│   ├── models.py                  # DB models: Product, PinDraft, ScheduleEntry, Settings
│   ├── routers/
│   │   ├── products.py            # POST /products/parse
│   │   ├── pins.py                # GET/POST/PUT /pins
│   │   ├── ai.py                  # POST /ai/generate (image+text)
│   │   ├── postfast.py            # GET /postfast/accounts, boards, POST /postfast/publish
│   │   └── settings.py            # GET/PUT /settings
│   ├── services/
│   │   ├── parser_etsy.py         # Etsy product scraper
│   │   ├── ai_text.py             # LLM caption/description/tags via 9Router
│   │   ├── ai_image.py            # Image generation via 9Router
│   │   └── postfast_client.py     # PostFast API client
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── pages/
│   │   │   ├── Home.jsx           # Input URL + generate
│   │   │   ├── Review.jsx         # Review/edit/regenerate panel
│   │   │   ├── Calendar.jsx       # Content calendar
│   │   │   └── Settings.jsx       # 9Router + PostFast settings
│   │   ├── components/
│   │   │   ├── PinPreviewCard.jsx # Pinterest-style pin preview
│   │   │   ├── RegeneratePanel.jsx
│   │   │   └── ScheduleModal.jsx
│   │   └── lib/
│   │       └── api.js             # axios wrapper ke backend
│   ├── package.json
│   ├── vite.config.js
│   └── Dockerfile
├── docker-compose.yml
├── nginx.conf
└── .env.example
```

---

## Tasks

### Task 1: Backend Foundation
**Files:**
- Create: `backend/main.py`
- Create: `backend/config.py`
- Create: `backend/database.py`
- Create: `backend/models.py`
- Create: `backend/requirements.txt`

- [ ] Buat `requirements.txt`
- [ ] Buat `models.py` dengan SQLModel models
- [ ] Buat `database.py` dengan SQLite setup
- [ ] Buat `config.py` dengan env vars
- [ ] Buat `main.py` dengan FastAPI app + CORS
- [ ] Test: `uvicorn main:app --reload` → `/docs` terbuka

### Task 2: Settings API
**Files:**
- Create: `backend/routers/settings.py`

- [ ] GET /settings → return current settings (api keys masked)
- [ ] PUT /settings → save settings ke DB
- [ ] Test connection endpoint untuk 9Router
- [ ] Sync accounts endpoint untuk PostFast
- [ ] Test via /docs

### Task 3: Etsy Parser
**Files:**
- Create: `backend/services/parser_etsy.py`
- Create: `backend/routers/products.py`

- [ ] Parse Etsy URL: extract title, description, images, price, shop name
- [ ] Fallback ke Open Graph jika structured parse gagal
- [ ] POST /products/parse → return product data
- [ ] Test dengan URL Etsy nyata

### Task 4: AI Text Generation
**Files:**
- Create: `backend/services/ai_text.py`
- Create: `backend/routers/ai.py`

- [ ] Call 9Router `/chat/completions` untuk generate caption (≤100 char), description (≤800 char), tags (5-10 keyword)
- [ ] POST /ai/generate/text → return {title, description, tags}
- [ ] Validasi panjang sesuai limit Pinterest/PostFast

### Task 5: AI Image Generation
**Files:**
- Create: `backend/services/ai_image.py`

- [ ] Call 9Router image generation endpoint
- [ ] Generate pin image 1000x1500px (rasio 2:3)
- [ ] Return URL atau base64 image
- [ ] Compress output ≤10MB
- [ ] POST /ai/generate/image → return image_url

### Task 6: PostFast Client
**Files:**
- Create: `backend/services/postfast_client.py`
- Create: `backend/routers/postfast.py`

- [ ] GET /social-media/my-social-accounts
- [ ] GET /social-media/{id}/pinterest-boards
- [ ] POST /file/get-signed-upload-urls + PUT to S3
- [ ] POST /social-posts (schedule/publish)
- [ ] GET /social-posts (calendar sync)
- [ ] DELETE /social-posts/{id}
- [ ] Rate limit throttling (60 req/min)

### Task 7: Pin Draft CRUD
**Files:**
- Create: `backend/routers/pins.py`

- [ ] POST /pins → create draft dari product + AI output
- [ ] GET /pins → list semua drafts
- [ ] GET /pins/{id} → detail draft
- [ ] PUT /pins/{id} → update (edit manual / approve)
- [ ] DELETE /pins/{id}
- [ ] POST /pins/{id}/schedule → trigger PostFast publish

### Task 8: Frontend Scaffold
**Files:**
- Create: `frontend/` (Vite + React + Tailwind)

- [ ] `npm create vite@latest frontend -- --template react`
- [ ] Install: tailwindcss, shadcn/ui, axios, react-router-dom, react-query
- [ ] Setup routing: Home / Review / Calendar / Settings
- [ ] Setup axios base URL ke backend

### Task 9: Settings Page UI
**Files:**
- Create: `frontend/src/pages/Settings.jsx`

- [ ] Form 9Router: endpoint URL, API key, model teks, model gambar, test button
- [ ] Form PostFast: API key, sync accounts button, list akun, sync boards
- [ ] Masked input untuk API key
- [ ] Toast feedback sukses/error

### Task 10: Home Page + Parse UI
**Files:**
- Create: `frontend/src/pages/Home.jsx`

- [ ] Input URL produk Etsy
- [ ] Detect marketplace dari domain
- [ ] Loading state saat parsing
- [ ] Tampilkan product data setelah parse: judul, gambar, deskripsi
- [ ] Fallback form jika parse gagal
- [ ] Tombol "Generate Pin" → trigger AI

### Task 11: Review Panel UI
**Files:**
- Create: `frontend/src/pages/Review.jsx`
- Create: `frontend/src/components/PinPreviewCard.jsx`
- Create: `frontend/src/components/RegeneratePanel.jsx`

- [ ] Pinterest-style pin preview card (gambar vertikal 2:3)
- [ ] Edit inline: title, description, tags
- [ ] Regenerate per komponen (image / caption / description / tags)
- [ ] Tambah instruksi custom saat regenerate
- [ ] Approve button → status jadi Ready to Schedule

### Task 12: Schedule Modal + Publish
**Files:**
- Create: `frontend/src/components/ScheduleModal.jsx`

- [ ] Dropdown pilih akun Pinterest
- [ ] Dropdown pilih board
- [ ] Date/time picker (harus future)
- [ ] Opsi "Publish sekarang"
- [ ] Trigger POST /pins/{id}/schedule
- [ ] Show result status

### Task 13: Content Calendar
**Files:**
- Create: `frontend/src/pages/Calendar.jsx`

- [ ] List semua pin: status badge (Draft/Scheduled/Published/Failed)
- [ ] Filter by status
- [ ] Tombol cancel/delete per pin
- [ ] Auto-refresh status setiap 30 detik

### Task 14: Docker + Nginx + Deploy
**Files:**
- Create: `backend/Dockerfile`
- Create: `frontend/Dockerfile`
- Create: `docker-compose.yml`
- Create: `nginx.conf`

- [ ] Backend Dockerfile (Python 3.11 slim)
- [ ] Frontend Dockerfile (node build + nginx serve)
- [ ] docker-compose.yml: backend + frontend + nginx
- [ ] nginx.conf: proxy /api → backend, / → frontend
- [ ] Deploy ke VPS di subdomain pinflow.indraseptianto.my.id
- [ ] Certbot HTTPS
