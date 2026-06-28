# PinFlow

Pinterest content automation for marketplace product URLs.

PinFlow turns a product URL or manual product entry into Pinterest-ready assets: AI image, title, description, tags, review/edit flow, scheduling, and publishing through PostFast.

## Stack

- Backend: FastAPI, SQLModel, SQLite
- Frontend: React, Vite, Tailwind CSS
- AI: 9Router-compatible text and image models
- Publishing: PostFast API
- Deployment: Docker Compose + nginx reverse proxy

## Core Features

- Parse Etsy product URLs and save product history
- Manual product fallback when parsing fails
- Generate Pinterest title, description, tags, and image via 9Router
- Generate 3 strategic variants: benefit, gift, lifestyle
- Review and edit pin drafts before scheduling
- Pinterest SEO score and board recommendation
- Sync PostFast accounts and boards
- Upload media and schedule posts via PostFast
- Content calendar with scheduled/published/failed status

## Local Run

```bash
cp .env.example .env
docker compose up -d --build
```

Frontend is exposed by compose on `127.0.0.1:3028`; backend on `127.0.0.1:8028`.

## Notes

Secrets are not committed. Configure 9Router and PostFast keys from the Settings page or backend data store.
