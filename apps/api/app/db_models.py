from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import JSON, Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

JSONVariant = JSONB(none_as_null=True).with_variant(JSON(), "sqlite")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ProjectRecord(SQLModel, table=True):
    __tablename__ = "project"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    name: str
    timeline: dict = Field(sa_column=Column(JSONVariant, nullable=False))
    created_at: datetime = Field(default_factory=_utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=_utcnow, nullable=False)


class RenderJobRecord(SQLModel, table=True):
    __tablename__ = "render_job"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    project_id: UUID = Field(foreign_key="project.id", index=True)
    kind: str = Field(default="export")
    status: str = Field(default="queued")
    output_file: str | None = None
    download_url: str | None = None
    voiceover_file: str | None = None
    command_preview: list = Field(default_factory=list, sa_column=Column(JSONVariant, nullable=False))
    error: str | None = None
    created_at: datetime = Field(default_factory=_utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=_utcnow, nullable=False)
