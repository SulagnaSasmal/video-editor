import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, create_engine

from app import db, main


@pytest.fixture()
def client(tmp_path, monkeypatch):
    test_engine = create_engine(
        f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False}
    )
    SQLModel.metadata.create_all(test_engine)
    monkeypatch.setattr(db, "engine", test_engine)
    monkeypatch.setattr(main, "UPLOAD_DIR", tmp_path / "uploads")
    monkeypatch.setattr(main, "EXPORT_DIR", tmp_path / "exports")
    (tmp_path / "uploads").mkdir(parents=True, exist_ok=True)
    (tmp_path / "exports").mkdir(parents=True, exist_ok=True)

    with TestClient(main.app) as test_client:
        yield test_client
