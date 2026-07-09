from uuid import uuid4

from app.models import Clip, Timeline, TransitionSettings, TransitionType
from app.render import build_render_commands, command_preview, timeline_duration


def test_build_render_commands_includes_trim_caption_and_concat(tmp_path):
    timeline = Timeline(
        clips=[
            Clip(
                file="clip1.mp4",
                order=1,
                trimStart=2,
                trimEnd=18,
                caption="Intro section",
            )
        ]
    )

    commands = build_render_commands(
        uuid4(),
        timeline,
        tmp_path / "uploads",
        tmp_path / "exports",
    )
    preview = command_preview(commands)

    assert len(commands) == 3
    assert "-ss 2.000" in preview[0]
    assert "-t 16.000" in preview[0]
    assert "drawtext" in preview[0]
    assert "-f concat" in preview[1]
    assert "-movflags +faststart" in preview[2]


def test_build_render_commands_mixes_voiceover(tmp_path):
    timeline = Timeline(
        clips=[
            Clip(
                file="clip1.mp4",
                order=1,
                trimStart=0,
                trimEnd=8,
                caption="Professional narration",
            )
        ]
    )
    voiceover = tmp_path / "exports" / "voiceover.mp3"

    commands = build_render_commands(
        uuid4(),
        timeline,
        tmp_path / "uploads",
        tmp_path / "exports",
        voiceover_path=voiceover,
    )
    preview = command_preview(commands)

    assert len(commands) == 3
    assert str(voiceover) in preview[2]
    assert "loudnorm" in preview[2]
    assert "alimiter" in preview[2]
    assert "-b:a 192k" in preview[2]
    assert timeline_duration(timeline) == 8


def _two_clip_timeline(transition: TransitionSettings) -> Timeline:
    return Timeline(
        clips=[
            Clip(file="clip1.mp4", order=1, trimStart=0, trimEnd=10, transitionOut=transition),
            Clip(file="clip2.mp4", order=2, trimStart=0, trimEnd=6),
        ]
    )


def test_all_cut_multi_clip_uses_fast_concat_path(tmp_path):
    timeline = _two_clip_timeline(TransitionSettings(type=TransitionType.cut))

    commands = build_render_commands(uuid4(), timeline, tmp_path / "uploads", tmp_path / "exports")
    preview = command_preview(commands)

    assert len(commands) == 4
    assert "-f concat" in preview[2]
    assert timeline_duration(timeline) == 16


def test_crossfade_boundary_uses_xfade_instead_of_concat(tmp_path):
    timeline = _two_clip_timeline(TransitionSettings(type=TransitionType.crossfade, duration=1.0))

    commands = build_render_commands(uuid4(), timeline, tmp_path / "uploads", tmp_path / "exports")
    preview = command_preview(commands)

    assert not any("-f concat" in line for line in preview)
    assert any("xfade=transition=fade:duration=1.000:offset=9.000" in line for line in preview)
    assert any("acrossfade=d=1.000" in line for line in preview)
    assert timeline_duration(timeline) == 15


def test_fade_to_black_boundary_uses_fadeblack_transition(tmp_path):
    timeline = _two_clip_timeline(TransitionSettings(type=TransitionType.fade_to_black, duration=0.5))

    commands = build_render_commands(uuid4(), timeline, tmp_path / "uploads", tmp_path / "exports")
    preview = command_preview(commands)

    assert any("xfade=transition=fadeblack:duration=0.500" in line for line in preview)


def test_mixed_cut_and_crossfade_three_clip_timeline_chains_pairwise_merges(tmp_path):
    timeline = Timeline(
        clips=[
            Clip(
                file="clip1.mp4",
                order=1,
                trimStart=0,
                trimEnd=10,
                transitionOut=TransitionSettings(type=TransitionType.cut),
            ),
            Clip(
                file="clip2.mp4",
                order=2,
                trimStart=0,
                trimEnd=6,
                transitionOut=TransitionSettings(type=TransitionType.crossfade, duration=1.0),
            ),
            Clip(file="clip3.mp4", order=3, trimStart=0, trimEnd=4),
        ]
    )

    commands = build_render_commands(uuid4(), timeline, tmp_path / "uploads", tmp_path / "exports")
    preview = command_preview(commands)

    # 3 normalize commands + 2 pairwise-merge commands (cut, then crossfade) + final mux command
    assert len(commands) == 6
    assert "concat=n=2:v=1:a=0" in preview[3]
    assert "xfade=transition=fade" in preview[4]
