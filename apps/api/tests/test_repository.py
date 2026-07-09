from uuid import uuid4

import pytest
from sqlmodel import Session, SQLModel, create_engine

from app import repository
from app.models import (
    Clip,
    JobKind,
    JobStatus,
    Project,
    RenderJob,
    Timeline,
    TransitionSettings,
    TransitionType,
    ZoomKeyframe,
)


@pytest.fixture()
def session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def _sample_timeline() -> Timeline:
    return Timeline(
        clips=[
            Clip(
                file="clip1.mp4",
                order=1,
                trimStart=0,
                trimEnd=10,
                zoom=[ZoomKeyframe(start=0, end=4, scale=1.2, x=0.5, y=0.5)],
                caption="Intro",
                transitionOut=TransitionSettings(type=TransitionType.crossfade, duration=1.0),
            ),
            Clip(file="clip2.mp4", order=2, trimStart=0, trimEnd=6),
        ]
    )


def test_create_and_get_project_round_trips_timeline(session):
    project = Project(name="Demo", timeline=_sample_timeline())

    repository.create_project(session, project)
    fetched = repository.get_project(session, project.id)

    assert fetched is not None
    assert fetched.name == "Demo"
    assert len(fetched.timeline.clips) == 2
    assert fetched.timeline.clips[0].zoom[0].scale == 1.2
    assert fetched.timeline.clips[0].transitionOut.type == TransitionType.crossfade
    assert fetched.timeline.clips[0].transitionOut.duration == 1.0


def test_update_project_replaces_timeline_and_bumps_updated_at(session):
    project = Project(name="Demo", timeline=_sample_timeline())
    repository.create_project(session, project)

    new_timeline = Timeline(clips=[Clip(file="clip3.mp4", order=1, trimStart=0, trimEnd=5)])
    updated = repository.update_project(session, project.id, name="Renamed", timeline=new_timeline)

    assert updated is not None
    assert updated.name == "Renamed"
    assert len(updated.timeline.clips) == 1
    assert updated.timeline.clips[0].file == "clip3.mp4"


def test_update_project_missing_returns_none(session):
    assert repository.update_project(session, uuid4(), name="x") is None


def test_list_projects_returns_all(session):
    repository.create_project(session, Project(name="A", timeline=_sample_timeline()))
    repository.create_project(session, Project(name="B", timeline=_sample_timeline()))

    projects = repository.list_projects(session)

    assert {p.name for p in projects} == {"A", "B"}


def test_save_and_get_job_round_trips(session):
    project = Project(name="Demo", timeline=_sample_timeline())
    repository.create_project(session, project)

    job = RenderJob(
        projectId=project.id,
        kind=JobKind.narrate,
        status=JobStatus.queued,
        commandPreview=["ffmpeg -y -i in.mp4 out.mp4"],
    )
    repository.save_job(session, job)

    job.status = JobStatus.completed
    job.downloadUrl = "/media/exports/out.mp4"
    saved = repository.save_job(session, job)
    fetched = repository.get_job(session, job.id)

    assert saved.status == JobStatus.completed
    assert fetched is not None
    assert fetched.downloadUrl == "/media/exports/out.mp4"
    assert fetched.commandPreview == ["ffmpeg -y -i in.mp4 out.mp4"]


def test_get_job_missing_returns_none(session):
    assert repository.get_job(session, uuid4()) is None
