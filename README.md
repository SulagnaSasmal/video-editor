# Video Editor

An AI video editor scaffold, evolving toward a Clipchamp-style multi-clip editor with Trupeer-style AI narration:

- A Next.js editor surface with drag-reorderable multi-clip stitching, screen recording, and upload.
- A FastAPI backend with durable Postgres-backed projects/jobs, an FFmpeg pipeline (trim, caption, zoom, crossfade/fade-to-black transitions, concat), and Anthropic-scripted narration + Azure/ElevenLabs TTS.
- Background-task-based async export (`POST /projects/{id}/export` returns immediately; poll `GET /jobs/{id}`).
- Local storage folders for uploaded source clips and exported MP4s.
- Docker Compose services for PostgreSQL (used) and Redis (reserved for a future job-queue upgrade).

## Current slice

Projects, timelines, and render jobs persist in Postgres. Multi-clip projects can be stitched with per-boundary transitions (cut/crossfade/fade-to-black) and narrated as a whole via `POST /projects/{id}/narrate`, which generates one coherent script across all clips (not just the first) and synthesizes a voiceover. Exports render asynchronously via FastAPI `BackgroundTasks`.

## Run the API

```powershell
cd video-editor
docker compose up -d postgres
cd apps\api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

## Run the web app

```powershell
cd video-editor\apps\web
npm install
npm run dev
```

Open `http://localhost:3000`.

## Run checks

```powershell
cd video-editor\apps\api
pytest
```

```powershell
cd video-editor\apps\web
npm run build
```

## Next build steps

1. Prompt-based editing: a chat endpoint that maps natural-language commands onto timeline mutations.
2. AI avatar generation (HeyGen/Synthesia/D-ID-style talking presenter), inserted as a normal clip.
3. AI-generated filler scenes / B-roll (stock library or generative), inserted as a normal clip.
4. One-click auto-demo-video generation, orchestrating narration + B-roll + avatars + export.
5. Move rendering off FastAPI `BackgroundTasks` onto a real queue (Celery/Redis, already provisioned) once concurrent multi-user load requires it.
