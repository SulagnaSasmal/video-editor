import json

from app import main


def _project_payload():
    clips = [
        {"file": "clip1.mp4", "order": 1, "trimStart": 0, "trimEnd": 10, "caption": "Intro"},
        {"file": "clip2.mp4", "order": 2, "trimStart": 0, "trimEnd": 6, "caption": "Middle"},
    ]
    return {"name": "Chat edit project", "timeline": {"clips": clips}}


def test_chat_edit_applies_ai_generated_ops(client, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

    create_response = client.post("/projects", json=_project_payload())
    project_id = create_response.json()["id"]
    clip_id = create_response.json()["timeline"]["clips"][1]["id"]

    def fake_call_anthropic(prompt, max_tokens=1600):
        assert clip_id in prompt
        return json.dumps({"ops": [{"op": "set_caption", "clipId": clip_id, "caption": "Trimmed by AI"}]})

    monkeypatch.setattr(main, "call_anthropic", fake_call_anthropic)

    response = client.post(f"/projects/{project_id}/chat", json={"message": "update the second clip's caption"})
    assert response.status_code == 200
    body = response.json()
    assert body["applied"] == ["Updated caption for clip " + clip_id]
    assert body["errors"] == []
    assert body["timeline"]["clips"][1]["caption"] == "Trimmed by AI"

    project_response = client.get(f"/projects/{project_id}")
    assert project_response.json()["timeline"]["clips"][1]["caption"] == "Trimmed by AI"


def test_chat_edit_without_anthropic_key_returns_warning_and_no_changes(client, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    create_response = client.post("/projects", json=_project_payload())
    project_id = create_response.json()["id"]
    original_timeline = create_response.json()["timeline"]

    response = client.post(f"/projects/{project_id}/chat", json={"message": "reorder the clips"})
    assert response.status_code == 200
    body = response.json()
    assert body["applied"] == []
    assert "ANTHROPIC_API_KEY" in body["warning"]
    assert body["timeline"] == original_timeline


def test_chat_edit_skips_invalid_ops_without_crashing(client, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

    create_response = client.post("/projects", json=_project_payload())
    project_id = create_response.json()["id"]

    def fake_call_anthropic(prompt, max_tokens=1600):
        return json.dumps({"ops": [{"op": "set_caption", "clipId": "not-a-real-id", "caption": "x"}]})

    monkeypatch.setattr(main, "call_anthropic", fake_call_anthropic)

    response = client.post(f"/projects/{project_id}/chat", json={"message": "do something impossible"})
    assert response.status_code == 200
    body = response.json()
    assert body["applied"] == []
    assert len(body["errors"]) == 1
