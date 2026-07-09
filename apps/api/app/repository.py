from datetime import datetime, timezone
from uuid import UUID

from sqlmodel import Session, select

from .db_models import ProjectRecord, RenderJobRecord
from .models import Project, RenderJob, Timeline


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _record_to_project(record: ProjectRecord) -> Project:
    return Project(id=record.id, name=record.name, timeline=Timeline(**record.timeline))


def _record_to_job(record: RenderJobRecord) -> RenderJob:
    return RenderJob(
        id=record.id,
        projectId=record.project_id,
        kind=record.kind,
        status=record.status,
        outputFile=record.output_file,
        downloadUrl=record.download_url,
        voiceoverFile=record.voiceover_file,
        commandPreview=list(record.command_preview),
        error=record.error,
    )


def create_project(session: Session, project: Project) -> Project:
    record = ProjectRecord(
        id=project.id,
        name=project.name,
        timeline=project.timeline.model_dump(mode="json"),
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return _record_to_project(record)


def get_project(session: Session, project_id: UUID) -> Project | None:
    record = session.get(ProjectRecord, project_id)
    return _record_to_project(record) if record else None


def list_projects(session: Session) -> list[Project]:
    records = session.exec(select(ProjectRecord).order_by(ProjectRecord.updated_at.desc())).all()
    return [_record_to_project(record) for record in records]


def update_project(
    session: Session,
    project_id: UUID,
    *,
    name: str | None = None,
    timeline: Timeline | None = None,
) -> Project | None:
    record = session.get(ProjectRecord, project_id)
    if record is None:
        return None

    if name is not None:
        record.name = name
    if timeline is not None:
        record.timeline = timeline.model_dump(mode="json")
    record.updated_at = _utcnow()

    session.add(record)
    session.commit()
    session.refresh(record)
    return _record_to_project(record)


def save_job(session: Session, job: RenderJob) -> RenderJob:
    record = session.get(RenderJobRecord, job.id)
    if record is None:
        record = RenderJobRecord(id=job.id, project_id=job.projectId, kind=job.kind)

    record.status = job.status
    record.output_file = job.outputFile
    record.download_url = job.downloadUrl
    record.voiceover_file = job.voiceoverFile
    record.command_preview = list(job.commandPreview)
    record.error = job.error
    record.updated_at = _utcnow()

    session.add(record)
    session.commit()
    session.refresh(record)
    return _record_to_job(record)


def get_job(session: Session, job_id: UUID) -> RenderJob | None:
    record = session.get(RenderJobRecord, job_id)
    return _record_to_job(record) if record else None
