import html
import json
import os
from pathlib import Path
from shutil import copyfileobj
import subprocess
from uuid import UUID, uuid4

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .models import EnhancedRecording, EnhanceRequest, Project, ProjectCreate, RenderJob, UploadedVideo
from .render import build_render_commands, command_preview, run_render_commands

ROOT_DIR = Path(__file__).resolve().parents[3]
UPLOAD_DIR = ROOT_DIR / "storage" / "uploads"
EXPORT_DIR = ROOT_DIR / "storage" / "exports"
load_dotenv(ROOT_DIR / ".env")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
EXPORT_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Video Editor MVP API", version="0.1.0")
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

projects: dict[UUID, Project] = {}
jobs: dict[UUID, RenderJob] = {}


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


def build_ai_content(original_name: str, selected_skills: list[str]) -> tuple[str, dict, list[str], str | None]:
    fallback_script = build_ai_script(original_name)
    fallback_guide = build_fallback_guide(original_name, fallback_script)
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
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
        response = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": os.environ.get("ANTHROPIC_MODEL") or "claude-3-5-sonnet-20241022",
                "max_tokens": 1600,
                "temperature": 0.3,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=30,
        )
        response.raise_for_status()
        payload = response.json()
        text = "".join(
            part.get("text", "")
            for part in payload.get("content", [])
            if part.get("type") == "text"
        ).strip()
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
            "User-Agent": "video-editor-mvp",
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


@app.post("/ai/enhance", response_model=EnhancedRecording)
def enhance_recording(payload: EnhanceRequest):
    source = UPLOAD_DIR / payload.file
    if not source.exists():
        raise HTTPException(status_code=404, detail="recording not found")

    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    script, guide, ai_plan, ai_warning = build_ai_content(
        payload.originalName or payload.file,
        payload.selectedSkills,
    )
    provider = choose_tts_provider(payload.ttsProvider)
    steps = [
        "Screen recording uploaded",
        "AI workflow analysis completed",
        "User guide flow generated",
        "AI narration script generated",
    ]
    warnings = [ai_warning] if ai_warning else []
    voiceover_file: str | None = None
    voiceover_path: Path | None = None

    if provider != "none":
        output_name = f"{Path(payload.file).stem}-voiceover.mp3"
        output_path = EXPORT_DIR / output_name
        try:
            if provider == "azure":
                synthesize_azure(script, output_path, payload.voice)
            else:
                synthesize_elevenlabs(script, output_path, payload.voice)
            voiceover_file = output_name
            voiceover_path = output_path
            steps.append(f"{provider} TTS voiceover generated")
        except Exception as exc:
            warnings.append(f"TTS generation skipped: {exc}")
            steps.append("TTS voiceover needs attention")
    else:
        warnings.append("No TTS provider credentials are configured")
        steps.append("TTS voiceover needs credentials")

    duration = probe_video_duration(source) or 10
    caption = script.split(".")[0][:180]
    project = Project(
        name=Path(payload.originalName or payload.file).stem or "AI generated walkthrough",
        timeline={
            "clips": [
                {
                    "file": payload.file,
                    "order": 1,
                    "trimStart": 0,
                    "trimEnd": duration,
                    "zoom": [{"start": 0, "end": min(duration, 6), "scale": 1.04, "x": 0.5, "y": 0.5}],
                    "caption": caption,
                }
            ],
            "output": {"resolution": "1920x1080", "fps": 30, "format": "mp4"},
            "narration": {
                "enabled": True,
                "provider": provider,
                "script": script,
                "voice": payload.voice or "Jenny - Female, English (US), Product demo",
                "useOriginalAudio": False,
                "backgroundMusic": False,
                "musicVolume": 0,
            },
        },
    )
    commands = build_render_commands(project.id, project.timeline, UPLOAD_DIR, EXPORT_DIR, voiceover_path=voiceover_path)
    output_file = EXPORT_DIR / f"{project.id}.{project.timeline.output.format}"
    job = RenderJob(
        projectId=project.id,
        status="running",
        outputFile=str(output_file),
        downloadUrl=f"/media/exports/{output_file.name}",
        voiceoverFile=voiceover_file,
        commandPreview=command_preview(commands),
    )
    projects[project.id] = project
    jobs[job.id] = job
    final_video_url: str | None = None
    try:
        run_render_commands(commands)
        job.status = "completed"
        final_video_url = job.downloadUrl
        steps.append("AI generated video rendered")
    except Exception as exc:
        job.status = "failed"
        job.error = str(exc)
        warnings.append(f"AI video render failed: {exc}")

    return EnhancedRecording(
        file=payload.file,
        script=script,
        ttsProvider=provider,
        voiceoverFile=voiceover_file,
        finalVideoUrl=final_video_url,
        renderJobId=job.id,
        guide=guide,
        aiPlan=ai_plan,
        steps=steps,
        warning=" ".join(warnings) if warnings else None,
    )


@app.post("/projects", response_model=Project)
def create_project(payload: ProjectCreate):
    project = Project(**payload.model_dump())
    projects[project.id] = project
    return project


@app.get("/projects/{project_id}", response_model=Project)
def get_project(project_id: UUID):
    project = projects.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="project not found")
    return project


@app.post("/projects/{project_id}/render", response_model=RenderJob)
def create_render_job(project_id: UUID):
    project = projects.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="project not found")

    commands = build_render_commands(project.id, project.timeline, UPLOAD_DIR, EXPORT_DIR)
    job = RenderJob(
        projectId=project.id,
        outputFile=str(EXPORT_DIR / f"{project.id}.{project.timeline.output.format}"),
        commandPreview=command_preview(commands),
    )
    jobs[job.id] = job
    return job


@app.post("/projects/{project_id}/export", response_model=RenderJob)
def export_project(project_id: UUID):
    project = projects.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="project not found")

    voiceover_path, provider, warning = synthesize_project_voiceover(project)
    commands = build_render_commands(
        project.id,
        project.timeline,
        UPLOAD_DIR,
        EXPORT_DIR,
        voiceover_path=voiceover_path,
    )
    output_file = EXPORT_DIR / f"{project.id}.{project.timeline.output.format}"
    job = RenderJob(
        projectId=project.id,
        status="running",
        outputFile=str(output_file),
        downloadUrl=f"/media/exports/{output_file.name}",
        voiceoverFile=voiceover_path.name if voiceover_path else None,
        commandPreview=command_preview(commands),
        error=warning,
    )
    jobs[job.id] = job

    if warning:
        job.status = "failed"
        return job

    try:
        run_render_commands(commands)
    except Exception as exc:
        job.status = "failed"
        job.error = str(exc)
        return job

    job.status = "completed"
    return job


@app.get("/jobs/{job_id}", response_model=RenderJob)
def get_render_job(job_id: UUID):
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return job
