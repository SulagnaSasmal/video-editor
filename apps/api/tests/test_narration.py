import json

from app import main


def _project_payload(clip_count: int = 3, narration_overrides: dict | None = None):
    clips = [
        {
            "file": f"clip{i}.mp4",
            "order": i,
            "trimStart": 0,
            "trimEnd": 5,
            "caption": "Clip 1 caption" if i == 1 else "",
        }
        for i in range(1, clip_count + 1)
    ]
    timeline = {"clips": clips}
    if narration_overrides is not None:
        timeline["narration"] = narration_overrides
    return {"name": "Multi clip project", "timeline": timeline}


def test_narrate_project_generates_script_referencing_multiple_clips(client, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.delenv("AZURE_TTS_KEY", raising=False)
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)

    def fake_call_anthropic(prompt, max_tokens=1600):
        return json.dumps(
            {
                "script": "Clip one shows the setup. Clip two shows the workflow. Clip three wraps up.",
                "cueSheet": [
                    {"clipId": "a", "text": "Clip one shows the setup.", "approxStartSeconds": 0},
                    {"clipId": "b", "text": "Clip two shows the workflow.", "approxStartSeconds": 5},
                    {"clipId": "c", "text": "Clip three wraps up.", "approxStartSeconds": 10},
                ],
            }
        )

    monkeypatch.setattr(main, "call_anthropic", fake_call_anthropic)

    create_response = client.post("/projects", json=_project_payload())
    assert create_response.status_code == 200
    project_id = create_response.json()["id"]

    narrate_response = client.post(f"/projects/{project_id}/narrate")
    assert narrate_response.status_code == 200
    body = narrate_response.json()

    assert "Clip one" in body["script"] and "Clip three" in body["script"]
    assert len(body["cueSheet"]) == 3
    assert body["warning"] and "credentials" in body["warning"]

    project_response = client.get(f"/projects/{project_id}")
    assert project_response.json()["timeline"]["narration"]["script"] == body["script"]


def test_narrate_project_without_anthropic_key_falls_back_to_clip_captions(client, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("AZURE_TTS_KEY", raising=False)
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)

    create_response = client.post("/projects", json=_project_payload())
    project_id = create_response.json()["id"]

    response = client.post(f"/projects/{project_id}/narrate")
    assert response.status_code == 200
    body = response.json()

    assert "Clip 1 caption" in body["script"]
    assert "ANTHROPIC_API_KEY" in body["warning"]
    assert "credentials" in body["warning"]
