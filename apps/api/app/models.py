from enum import StrEnum
from pathlib import Path
from typing import Annotated
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator


class OutputFormat(StrEnum):
    mp4 = "mp4"


class JobStatus(StrEnum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"


class ZoomKeyframe(BaseModel):
    start: Annotated[float, Field(ge=0)]
    end: Annotated[float, Field(gt=0)]
    scale: Annotated[float, Field(ge=1, le=3)]
    x: Annotated[float, Field(ge=0, le=1)] = 0.5
    y: Annotated[float, Field(ge=0, le=1)] = 0.5

    @field_validator("end")
    @classmethod
    def end_after_start(cls, value: float, info):
        start = info.data.get("start")
        if start is not None and value <= start:
            raise ValueError("zoom end must be after start")
        return value


class TransitionType(StrEnum):
    cut = "cut"
    crossfade = "crossfade"
    fade_to_black = "fade_to_black"


class TransitionSettings(BaseModel):
    type: TransitionType = TransitionType.cut
    duration: Annotated[float, Field(ge=0, le=3)] = 0


class Clip(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    file: str
    order: int = Field(ge=0)
    trimStart: Annotated[float, Field(ge=0)] = 0
    trimEnd: Annotated[float | None, Field(gt=0)] = None
    zoom: list[ZoomKeyframe] = Field(default_factory=list)
    caption: str = ""
    transitionOut: TransitionSettings = Field(default_factory=TransitionSettings)

    @field_validator("file")
    @classmethod
    def file_must_be_relative(cls, value: str):
        path = Path(value)
        if path.is_absolute() or ".." in path.parts:
            raise ValueError("clip file must be a relative upload path")
        return value

    @field_validator("trimEnd")
    @classmethod
    def trim_end_after_start(cls, value: float | None, info):
        start = info.data.get("trimStart", 0)
        if value is not None and value <= start:
            raise ValueError("trimEnd must be after trimStart")
        return value


class OutputSettings(BaseModel):
    resolution: str = Field(default="1920x1080", pattern=r"^\d+x\d+$")
    fps: Annotated[int, Field(ge=24, le=60)] = 30
    format: OutputFormat = OutputFormat.mp4


class NarrationSettings(BaseModel):
    enabled: bool = True
    provider: str | None = None
    script: str = ""
    voice: str = "Camila"
    useOriginalAudio: bool = False
    backgroundMusic: bool = False
    musicVolume: Annotated[int, Field(ge=0, le=10)] = 3


class Timeline(BaseModel):
    clips: list[Clip]
    output: OutputSettings = Field(default_factory=OutputSettings)
    narration: NarrationSettings = Field(default_factory=NarrationSettings)

    @field_validator("clips")
    @classmethod
    def must_have_clips(cls, value: list[Clip]):
        if not value:
            raise ValueError("timeline must include at least one clip")
        return sorted(value, key=lambda clip: clip.order)


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    timeline: Timeline


class Project(ProjectCreate):
    id: UUID = Field(default_factory=uuid4)


class ProjectUpdate(BaseModel):
    name: str | None = None
    timeline: Timeline | None = None


class JobKind(StrEnum):
    export = "export"
    narrate = "narrate"


class RenderJob(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    projectId: UUID
    kind: JobKind = JobKind.export
    status: JobStatus = JobStatus.queued
    outputFile: str | None = None
    downloadUrl: str | None = None
    voiceoverFile: str | None = None
    commandPreview: list[str] = Field(default_factory=list)
    error: str | None = None


class UploadedVideo(BaseModel):
    file: str
    originalName: str
    contentType: str
    size: int
    duration: float | None = None


class RecordingGuideRequest(BaseModel):
    file: str
    originalName: str = ""
    selectedSkills: list[str] = Field(default_factory=lambda: ["video", "guide"])

    @field_validator("file")
    @classmethod
    def file_must_be_relative(cls, value: str):
        path = Path(value)
        if path.is_absolute() or ".." in path.parts:
            raise ValueError("recording file must be a relative upload path")
        return value


class RecordingGuide(BaseModel):
    file: str
    script: str
    guide: dict | None = None
    aiPlan: list[str] = Field(default_factory=list)
    warning: str | None = None


class NarrationCue(BaseModel):
    clipId: str
    text: str
    approxStartSeconds: float = 0


class ProjectNarrationResult(BaseModel):
    script: str
    cueSheet: list[NarrationCue] = Field(default_factory=list)
    voiceoverPreviewUrl: str | None = None
    provider: str | None = None
    warning: str | None = None


class ChatOpType(StrEnum):
    trim_clip = "trim_clip"
    reorder_clips = "reorder_clips"
    remove_clip = "remove_clip"
    set_caption = "set_caption"
    set_transition = "set_transition"
    set_narration_script = "set_narration_script"


class ChatOp(BaseModel):
    op: ChatOpType
    clipId: str | None = None
    trimStart: float | None = None
    trimEnd: float | None = None
    caption: str | None = None
    transitionType: TransitionType | None = None
    transitionDuration: float | None = None
    order: list[str] | None = None
    script: str | None = None


class ChatEditRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class ChatEditResult(BaseModel):
    applied: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    warning: str | None = None
    timeline: Timeline
