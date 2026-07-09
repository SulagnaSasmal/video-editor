from app.chat_ops import apply_chat_ops
from app.models import Clip, Timeline, TransitionSettings, TransitionType


def _timeline() -> Timeline:
    return Timeline(
        clips=[
            Clip(id="a", file="clip1.mp4", order=1, trimStart=0, trimEnd=10, caption="Intro"),
            Clip(id="b", file="clip2.mp4", order=2, trimStart=0, trimEnd=6, caption="Middle"),
            Clip(id="c", file="clip3.mp4", order=3, trimStart=0, trimEnd=4, caption="Outro"),
        ]
    )


def test_trim_clip_updates_bounds():
    timeline, applied, errors = apply_chat_ops(
        _timeline(), [{"op": "trim_clip", "clipId": "b", "trimStart": 1, "trimEnd": 5}]
    )
    assert errors == []
    assert "Trimmed clip b" in applied[0]
    clip_b = next(c for c in timeline.clips if c.id == "b")
    assert clip_b.trimStart == 1
    assert clip_b.trimEnd == 5


def test_trim_clip_invalid_range_is_rejected():
    timeline, applied, errors = apply_chat_ops(
        _timeline(), [{"op": "trim_clip", "clipId": "b", "trimStart": 5, "trimEnd": 2}]
    )
    assert applied == []
    assert len(errors) == 1
    clip_b = next(c for c in timeline.clips if c.id == "b")
    assert clip_b.trimStart == 0 and clip_b.trimEnd == 6


def test_reorder_clips_reassigns_order():
    timeline, applied, errors = apply_chat_ops(
        _timeline(), [{"op": "reorder_clips", "order": ["c", "a", "b"]}]
    )
    assert errors == []
    assert [c.id for c in timeline.clips] == ["c", "a", "b"]
    assert [c.order for c in timeline.clips] == [1, 2, 3]


def test_reorder_clips_rejects_missing_or_extra_ids():
    timeline, applied, errors = apply_chat_ops(
        _timeline(), [{"op": "reorder_clips", "order": ["a", "b"]}]
    )
    assert applied == []
    assert len(errors) == 1
    assert [c.id for c in timeline.clips] == ["a", "b", "c"]


def test_remove_clip_renumbers_remaining():
    timeline, applied, errors = apply_chat_ops(_timeline(), [{"op": "remove_clip", "clipId": "b"}])
    assert errors == []
    assert [c.id for c in timeline.clips] == ["a", "c"]
    assert [c.order for c in timeline.clips] == [1, 2]


def test_remove_clip_refuses_to_empty_timeline():
    single = Timeline(clips=[Clip(id="only", file="clip1.mp4", order=1, trimStart=0, trimEnd=5)])
    timeline, applied, errors = apply_chat_ops(single, [{"op": "remove_clip", "clipId": "only"}])
    assert applied == []
    assert len(errors) == 1
    assert len(timeline.clips) == 1


def test_set_caption_updates_target_clip_only():
    timeline, applied, errors = apply_chat_ops(
        _timeline(), [{"op": "set_caption", "clipId": "c", "caption": "New outro text"}]
    )
    assert errors == []
    clip_c = next(c for c in timeline.clips if c.id == "c")
    clip_a = next(c for c in timeline.clips if c.id == "a")
    assert clip_c.caption == "New outro text"
    assert clip_a.caption == "Intro"


def test_set_transition_sets_type_and_default_duration():
    timeline, applied, errors = apply_chat_ops(
        _timeline(), [{"op": "set_transition", "clipId": "a", "transitionType": "crossfade"}]
    )
    assert errors == []
    clip_a = next(c for c in timeline.clips if c.id == "a")
    assert clip_a.transitionOut == TransitionSettings(type=TransitionType.crossfade, duration=1)


def test_set_narration_script_updates_narration():
    timeline, applied, errors = apply_chat_ops(
        _timeline(), [{"op": "set_narration_script", "script": "A brand new script."}]
    )
    assert errors == []
    assert timeline.narration.script == "A brand new script."


def test_unknown_clip_id_produces_error_not_crash():
    timeline, applied, errors = apply_chat_ops(
        _timeline(), [{"op": "set_caption", "clipId": "does-not-exist", "caption": "x"}]
    )
    assert applied == []
    assert len(errors) == 1


def test_malformed_op_is_skipped_with_error():
    timeline, applied, errors = apply_chat_ops(_timeline(), [{"op": "not_a_real_op"}])
    assert applied == []
    assert len(errors) == 1


def test_multiple_ops_apply_in_sequence():
    timeline, applied, errors = apply_chat_ops(
        _timeline(),
        [
            {"op": "set_caption", "clipId": "a", "caption": "Updated intro"},
            {"op": "remove_clip", "clipId": "c"},
        ],
    )
    assert errors == []
    assert len(applied) == 2
    assert [c.id for c in timeline.clips] == ["a", "b"]
    assert timeline.clips[0].caption == "Updated intro"
