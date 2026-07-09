import html
import json
import os
from pathlib import Path
from shutil import copyfileobj
import subprocess
from uuid import UUID, uuid4

import httpx
from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session

from . import db, repository
from .chat_ops import apply_chat_ops
from .models import (
    ChatEditRequest,
    ChatEditResult,
    JobKind,
    JobStatus,
    NarrationCue,
    Project,
    ProjectCreate,
    ProjectNarrationResult,
    ProjectUpdate,
    RecordingGuide,
    RecordingGuideRequest,
    RenderJob,
    UploadedVideo,
)
from .render import build_render_commands, command_preview, run_render_commands

ROOT_DIR = Path(__file__).resolve().parents[3]
UPLOAD_DIR = ROOT_DIR / "storage" / "uploads"
EXPORT_DIR = ROOT_DIR / "storage" / "exports"
load_dotenv(ROOT_DIR / ".env")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
EXPORT_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Video Editor API", version="0.1.0")
app.mount("/media/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount("/media/exports", StaticFiles(directory=EXPORT_DIR), name="exports")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def probe_video_duration(path: Path) -> float | None:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return None

    try:
        duration = float(result.stdout.strip())
    except ValueError:
        return None
    return duration if duration > 0 else None


def build_ai_script(original_name: str) -> str:
    title = Path(original_name or "screen recording").stem.replace("-", " ").replace("_", " ")
    return (
        f"This walkthrough demonstrates {title}. "
        "First, follow the action on screen. Next, notice each key decision point and the result it produces. "
        "Finally, review the completed flow so the process can be repeated confidently."
    )


def build_fallback_guide(original_name: str, script: str) -> dict:
    title = Path(original_name or "screen recording").stem.replace("-", " ").replace("_", " ")
    sentences = [
        sentence.strip()
        for sentence in script.replace("!", ".").replace("?", ".").split(".")
        if sentence.strip()
    ]
    primary_steps = sentences[:4] or [
        "Open the workflow screen.",
        "Follow the main action in sequence.",
        "Review the completed result.",
    ]

    return {
        "title": f"{title} guide",
        "summary": "A concise walkthrough generated from the captured screen recording.",
        "steps": [
            {
                "title": f"Step {index + 1}",
                "description": step,
                "timestamp": max(index * 8, 0),
            }
            for index, step in enumerate(primary_steps)
        ],
        "faqs": [
            {
                "question": "What does this recording demonstrate?",
                "answer": primary_steps[0],
            },
            {
                "question": "What should the viewer do next?",
                "answer": primary_steps[-1],
            },
        ],
        "assessment": [
            {
                "question": "Can the viewer identify the main workflow action?",
                "answer": "Yes, by following the narrated steps and the on-screen sequence.",
            }
        ],
    }


def parse_ai_json(text: str) -> dict:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise
        return json.loads(text[start : end + 1])


def call_anthropic(prompt: str, max_tokens: int = 1600) -> str:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")

    response = httpx.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": os.environ.get("ANTHROPIC_MODEL") or "claude-sonnet-5",
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        },
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    return "".join(
        part.get("text", "")
        for part in payload.get("content", [])
        if part.get("type") == "text"
    ).strip()


def build_ai_content(original_name: str, selected_skills: list[str]) -> tuple[str, dict, list[str], str | None]:
    fallback_script = build_ai_script(original_name)
    fallback_guide = build_fallback_guide(original_name, fallback_script)
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return fallback_script, fallback_guide, [
            "Analyze the captured workflow",
            "Create a concise narration script",
            "Generate step-by-step documentation",
            "Prepare the video for AI voiceover and export",
        ], None

    prompt = (
        "You are building Trupeer-style product documentation from a screen recording. "
        "Return only JSON with keys: script, guide, aiPlan. "
        "guide must include title, summary, steps, faqs, and assessment. "
        "Each step should have title, description, and timestamp seconds. "
        f"Recording file name: {original_name}. "
        f"Requested outputs: {', '.join(selected_skills or ['video', 'guide'])}."
    )
    try:
        text = call_anthropic(prompt)
        parsed = parse_ai_json(text)
        script = str(parsed.get("script") or fallback_script).strip()
        guide = parsed.get("guide") if isinstance(parsed.get("guide"), dict) else fallback_guide
        ai_plan = parsed.get("aiPlan") if isinstance(parsed.get("aiPlan"), list) else []
        return script, guide, [str(item) for item in ai_plan[:8]] or [
            "Analyze the captured workflow",
            "Create a concise narration script",
            "Generate step-by-step documentation",
            "Prepare the video for AI voiceover and export",
        ], None
    except Exception as exc:
        return fallback_script, fallback_guide, [
            "Analyze the captured workflow",
            "Create fallback narration script",
            "Generate fallback documentation guide",
            "Prepare the video for export",
        ], f"AI planning used fallback content: {exc}"


def _build_cue_sheet_from_script(project: Project, script: str) -> list[dict]:
    cursor = 0.0
    cue_sheet = []
    for clip in project.timeline.clips:
        duration = max((clip.trimEnd or clip.trimStart + 8) - clip.trimStart, 0)
        cue_sheet.append(
            {
                "clipId": clip.id,
                "text": clip.caption.strip() or script,
                "approxStartSeconds": round(cursor, 2),
            }
        )
        cursor += duration
    return cue_sheet


def build_project_narration(project: Project) -> tuple[str, list[dict], str | None]:
    clips_summary = "\n".join(
        f"{index + 1}. duration={max((clip.trimEnd or clip.trimStart + 8) - clip.trimStart, 0):.1f}s"
        + (f" caption={clip.caption.strip()!r}" if clip.caption.strip() else "")
        for index, clip in enumerate(project.timeline.clips)
    )
    fallback_script = " ".join(
        clip.caption.strip() for clip in project.timeline.clips if clip.caption.strip()
    ) or build_ai_script(project.name)
    fallback_cue_sheet = _build_cue_sheet_from_script(project, fallback_script)

    if not os.environ.get("ANTHROPIC_API_KEY"):
        return (
            fallback_script,
            fallback_cue_sheet,
            "No ANTHROPIC_API_KEY configured; using a script assembled from clip captions",
        )

    prompt = (
        "You are writing one continuous voiceover narration script that will play over a "
        "multi-clip stitched video, in the order given. Return only JSON with one key: script "
        "(a single string covering the whole video, not per-clip). "
        f"Project name: {project.name}. Clips in order:\n{clips_summary}"
    )
    try:
        text = call_anthropic(prompt)
        parsed = parse_ai_json(text)
        script = str(parsed.get("script") or fallback_script).strip()
        # cueSheet timing depends on real clip durations, which the model can't compute
        # reliably, so it's always derived server-side from the final script/captions.
        cue_sheet = _build_cue_sheet_from_script(project, script)
        return script, cue_sheet, None
    except Exception as exc:
        return fallback_script, fallback_cue_sheet, f"AI narration used fallback content: {exc}"


CHAT_OP_SCHEMA = (
    '  {"op": "trim_clip", "clipId": "...", "trimStart": <number>, "trimEnd": <number>}\n'
    '  {"op": "reorder_clips", "order": ["clipId1", "clipId2", ...]}\n'
    '  {"op": "remove_clip", "clipId": "..."}\n'
    '  {"op": "set_caption", "clipId": "...", "caption": "..."}\n'
    '  {"op": "set_transition", "clipId": "...", "transitionType": "cut"|"crossfade"|"fade_to_black",'
    ' "transitionDuration": <number>}\n'
    '  {"op": "set_narration_script", "script": "..."}'
)


def generate_chat_ops(project: Project, message: str) -> tuple[list[dict], str | None]:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return [], "ANTHROPIC_API_KEY is not configured, so prompt-based editing is unavailable."

    clips_summary = "\n".join(
        f"clipId={clip.id} order={clip.order} file={clip.file} trimStart={clip.trimStart} "
        f"trimEnd={clip.trimEnd} caption={clip.caption!r} "
        f"transitionOut={clip.transitionOut.type.value}({clip.transitionOut.duration}s)"
        for clip in project.timeline.clips
    )
    prompt = (
        "You are a video timeline editing assistant. Translate the user's plain-English edit request "
        'into JSON: {"ops": [...]}\n'
        "Each item in ops must be exactly one of these shapes (no other fields, no other op names):\n"
        f"{CHAT_OP_SCHEMA}\n"
        "Only reference clipId values that exist below. If the request is unclear, impossible, or "
        'refers to a clip that does not exist, return {"ops": []}.\n'
        f"Current clips, in order:\n{clips_summary}\n"
        f"Current narration script: {project.timeline.narration.script!r}\n"
        f"User request: {message}"
    )
    try:
        text = call_anthropic(prompt, max_tokens=1000)
        parsed = parse_ai_json(text)
        ops = parsed.get("ops") if isinstance(parsed.get("ops"), list) else []
        return ops, None
    except Exception as exc:
        return [], f"AI edit request failed: {exc}"


def choose_tts_provider(requested: str | None) -> str:
    provider = (requested or os.environ.get("TTS_PROVIDER") or "").strip().lower()
    if provider in {"none", "off", "disabled"}:
        return "none"
    if provider in {"elevenlabs", "11labs", "eleven"}:
        return "elevenlabs"
    if provider == "azure":
        return "azure"
    if os.environ.get("AZURE_TTS_KEY") and os.environ.get("AZURE_TTS_REGION"):
        return "azure"
    if os.environ.get("ELEVENLABS_API_KEY"):
        return "elevenlabs"
    return "none"


def azure_voice_name(voice: str | None) -> str:
    label = (voice or "").lower()
    if "davis" in label or "male" in label:
        return "en-US-DavisNeural"
    if "aria" in label:
        return "en-US-AriaNeural"
    return "en-US-JennyNeural"


def synthesize_azure(script: str, output_path: Path, voice: str | None = None) -> None:
    key = os.environ.get("AZURE_TTS_KEY")
    region = os.environ.get("AZURE_TTS_REGION")
    if not key or not region:
        raise RuntimeError("Azure TTS credentials are not configured")

    endpoint = f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"
    ssml = (
        "<speak version='1.0' xml:lang='en-US'>"
        f"<voice xml:lang='en-US' name='{azure_voice_name(voice)}'>"
        f"{html.escape(script)}"
        "</voice></speak>"
    )
    response = httpx.post(
        endpoint,
        headers={
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
            "User-Agent": "video-editor",
        },
        content=ssml.encode("utf-8"),
        timeout=30,
    )
    response.raise_for_status()
    output_path.write_bytes(response.content)


def synthesize_elevenlabs(script: str, output_path: Path, voice: str | None = None) -> None:
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        raise RuntimeError("ElevenLabs credentials are not configured")

    voice_id = os.environ.get("ELEVENLABS_VOICE_ID") or "JBFqnCBsd6RMkjVDRZzb"
    model_id = os.environ.get("ELEVENLABS_MODEL") or "eleven_multilingual_v2"
    response = httpx.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
        headers={
            "xi-api-key": key,
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
        },
        json={
            "text": script,
            "model_id": model_id,
            "voice_settings": {"stability": 0.55, "similarity_boost": 0.75},
        },
        timeout=45,
    )
    response.raise_for_status()
    output_path.write_bytes(response.content)


def project_script(project: Project) -> str:
    explicit_script = project.timeline.narration.script.strip()
    if explicit_script:
        return explicit_script

    caption_script = " ".join(
        clip.caption.strip()
        for clip in project.timeline.clips
        if clip.caption.strip()
    )
    if caption_script:
        return caption_script

    return build_ai_script(project.name)


def synthesize_project_voiceover(project: Project) -> tuple[Path | None, str, str | None]:
    narration = project.timeline.narration
    if not narration.enabled:
        return None, "none", None

    script = project_script(project)
    provider = choose_tts_provider(narration.provider)
    if provider == "none":
        return None, provider, "No TTS provider credentials are configured"

    output_name = f"{project.id}-voiceover.mp3"
    output_path = EXPORT_DIR / output_name
    try:
        if provider == "azure":
            synthesize_azure(script, output_path, narration.voice)
        else:
            synthesize_elevenlabs(script, output_path, narration.voice)
    except Exception as exc:
        return None, provider, f"TTS generation failed: {exc}"

    return output_path, provider, None


def run_export_job(job_id: UUID, project_id: UUID) -> None:
    with Session(db.engine) as session:
        project = repository.get_project(session, project_id)
        job = repository.get_job(session, job_id)
        if project is None or job is None:
            return

        job.status = JobStatus.running
        repository.save_job(session, job)

        voiceover_path, provider, warning = synthesize_project_voiceover(project)
        commands = build_render_commands(
            project.id,
            project.timeline,
            UPLOAD_DIR,
            EXPORT_DIR,
            voiceover_path=voiceover_path,
        )
        output_file = EXPORT_DIR / f"{project.id}.{project.timeline.output.format}"
        job.outputFile = str(output_file)
        job.downloadUrl = f"/media/exports/{output_file.name}"
        job.voiceoverFile = voiceover_path.name if voiceover_path else None
        job.commandPreview = command_preview(commands)

        if warning:
            job.status = JobStatus.failed
            job.error = warning
            repository.save_job(session, job)
            return

        try:
            run_render_commands(commands)
        except Exception as exc:
            job.status = JobStatus.failed
            job.error = str(exc)
            repository.save_job(session, job)
            return

        job.status = JobStatus.completed
        repository.save_job(session, job)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/uploads", response_model=list[UploadedVideo])
def upload_videos(files: list[UploadFile] = File(...)):
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    uploaded: list[UploadedVideo] = []

    for file in files:
        if not file.filename:
            raise HTTPException(status_code=400, detail="missing filename")

        suffix = Path(file.filename).suffix.lower()
        if suffix not in {".mp4", ".mov", ".m4v", ".webm"}:
            raise HTTPException(status_code=400, detail=f"{file.filename} is not a supported video")

        stem = "".join(
            char if char.isalnum() or char in {"-", "_"} else "-"
            for char in Path(file.filename).stem
        ).strip("-") or "clip"
        stored_name = f"{stem[:80]}-{uuid4().hex[:8]}{suffix}"
        target = UPLOAD_DIR / stored_name

        with target.open("wb") as output:
            copyfileobj(file.file, output)

        uploaded.append(
            UploadedVideo(
                file=stored_name,
                originalName=file.filename,
                contentType=file.content_type or "video/mp4",
                size=target.stat().st_size,
                duration=probe_video_duration(target),
            )
        )

    return uploaded


@app.post("/ai/guide", response_model=RecordingGuide)
def generate_guide(payload: RecordingGuideRequest):
    source = UPLOAD_DIR / payload.file
    if not source.exists():
        raise HTTPException(status_code=404, detail="recording not found")

    script, guide, ai_plan, ai_warning = build_ai_content(
        payload.originalName or payload.file,
        payload.selectedSkills,
    )
    return RecordingGuide(file=payload.file, script=script, guide=guide, aiPlan=ai_plan, warning=ai_warning)


@app.post("/projects", response_model=Project)
def create_project_endpoint(payload: ProjectCreate, session: Session = Depends(db.get_session)):
    project = Project(**payload.model_dump())
    return repository.create_project(session, project)


@app.get("/projects", response_model=list[Project])
def list_projects_endpoint(session: Session = Depends(db.get_session)):
    return repository.list_projects(session)


@app.get("/projects/{project_id}", response_model=Project)
def get_project_endpoint(project_id: UUID, session: Session = Depends(db.get_session)):
    project = repository.get_project(session, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="project not found")
    return project


@app.patch("/projects/{project_id}", response_model=Project)
def update_project_endpoint(
    project_id: UUID,
    payload: ProjectUpdate,
    session: Session = Depends(db.get_session),
):
    project = repository.update_project(session, project_id, name=payload.name, timeline=payload.timeline)
    if project is None:
        raise HTTPException(status_code=404, detail="project not found")
    return project


@app.post("/projects/{project_id}/render", response_model=RenderJob)
def create_render_job(project_id: UUID, session: Session = Depends(db.get_session)):
    project = repository.get_project(session, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="project not found")

    commands = build_render_commands(project.id, project.timeline, UPLOAD_DIR, EXPORT_DIR)
    job = RenderJob(
        projectId=project.id,
        outputFile=str(EXPORT_DIR / f"{project.id}.{project.timeline.output.format}"),
        commandPreview=command_preview(commands),
    )
    return repository.save_job(session, job)


@app.post("/projects/{project_id}/narrate", response_model=ProjectNarrationResult)
def narrate_project(project_id: UUID, session: Session = Depends(db.get_session)):
    project = repository.get_project(session, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="project not found")

    script, cue_sheet_raw, ai_warning = build_project_narration(project)
    cue_sheet = [NarrationCue(**cue) for cue in cue_sheet_raw]

    narration_with_script = project.timeline.narration.model_copy(update={"script": script})
    timeline_with_script = project.timeline.model_copy(update={"narration": narration_with_script})
    project = repository.update_project(session, project.id, timeline=timeline_with_script)

    voiceover_path, provider, tts_warning = synthesize_project_voiceover(project)
    voiceover_url: str | None = None
    if voiceover_path:
        voiceover_url = f"/media/exports/{voiceover_path.name}"
        narration_with_provider = project.timeline.narration.model_copy(update={"provider": provider})
        timeline_with_provider = project.timeline.model_copy(update={"narration": narration_with_provider})
        repository.update_project(session, project.id, timeline=timeline_with_provider)

    warning = " ".join(filter(None, [ai_warning, tts_warning])) or None
    return ProjectNarrationResult(
        script=script,
        cueSheet=cue_sheet,
        voiceoverPreviewUrl=voiceover_url,
        provider=provider,
        warning=warning,
    )


@app.post("/projects/{project_id}/chat", response_model=ChatEditResult)
def chat_edit_project(
    project_id: UUID,
    payload: ChatEditRequest,
    session: Session = Depends(db.get_session),
):
    project = repository.get_project(session, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="project not found")

    raw_ops, ai_warning = generate_chat_ops(project, payload.message)
    if not raw_ops:
        return ChatEditResult(applied=[], errors=[], warning=ai_warning, timeline=project.timeline)

    new_timeline, applied, errors = apply_chat_ops(project.timeline, raw_ops)
    if applied:
        updated = repository.update_project(session, project.id, timeline=new_timeline)
        result_timeline = updated.timeline
    else:
        result_timeline = project.timeline

    return ChatEditResult(applied=applied, errors=errors, warning=ai_warning, timeline=result_timeline)


@app.post("/projects/{project_id}/export", response_model=RenderJob)
def export_project(
    project_id: UUID,
    background_tasks: BackgroundTasks,
    session: Session = Depends(db.get_session),
):
    project = repository.get_project(session, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="project not found")

    job = RenderJob(projectId=project.id, kind=JobKind.export, status=JobStatus.queued)
    job = repository.save_job(session, job)
    background_tasks.add_task(run_export_job, job.id, project.id)
    return job


@app.get("/jobs/{job_id}", response_model=RenderJob)
def get_render_job(job_id: UUID, session: Session = Depends(db.get_session)):
    job = repository.get_job(session, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return job
