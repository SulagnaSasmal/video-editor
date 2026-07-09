from app import main


def _project_payload(clip_count: int = 1, narration_overrides: dict | None = None):
    clips = [
        {"file": f"clip{i}.mp4", "order": i, "trimStart": 0, "trimEnd": 5}
        for i in range(1, clip_count + 1)
    ]
    timeline = {"clips": clips}
    if narration_overrides is not None:
        timeline["narration"] = narration_overrides
    return {"name": "Export project", "timeline": timeline}


def test_export_project_runs_via_background_task_and_completes(client, monkeypatch):
    monkeypatch.delenv("AZURE_TTS_KEY", raising=False)
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)

    calls = []
    monkeypatch.setattr(main, "run_render_commands", lambda commands: calls.append(commands))

    payload = _project_payload(narration_overrides={"enabled": False})
    create_response = client.post("/projects", json=payload)
    project_id = create_response.json()["id"]

    export_response = client.post(f"/projects/{project_id}/export")
    assert export_response.status_code == 200
    job = export_response.json()
    # Response is serialized before the background task runs, so it still reflects "queued".
    assert job["status"] == "queued"
    assert job["kind"] == "export"

    job_response = client.get(f"/jobs/{job['id']}")
    completed_job = job_response.json()
    assert completed_job["status"] == "completed"
    assert completed_job["downloadUrl"] is not None
    assert len(calls) == 1


def test_export_project_marks_job_failed_when_narration_enabled_without_tts(client, monkeypatch):
    monkeypatch.delenv("AZURE_TTS_KEY", raising=False)
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)

    calls = []
    monkeypatch.setattr(main, "run_render_commands", lambda commands: calls.append(commands))

    create_response = client.post("/projects", json=_project_payload())
    project_id = create_response.json()["id"]

    export_response = client.post(f"/projects/{project_id}/export")
    job_id = export_response.json()["id"]

    job_response = client.get(f"/jobs/{job_id}")
    failed_job = job_response.json()
    assert failed_job["status"] == "failed"
    assert "TTS" in failed_job["error"] or "credentials" in failed_job["error"]
    assert calls == []
