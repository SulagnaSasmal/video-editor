from pathlib import Path
from shlex import quote
import subprocess
from uuid import UUID

from .models import Clip, Timeline, TransitionSettings, TransitionType

_XFADE_TRANSITION = {
    TransitionType.crossfade: "fade",
    TransitionType.fade_to_black: "fadeblack",
}


def _clip_duration_arg(clip: Clip) -> list[str]:
    if clip.trimEnd is None:
        return []
    duration = clip.trimEnd - clip.trimStart
    return ["-t", f"{duration:.3f}"]


def _caption_filter(caption: str) -> str | None:
    if not caption.strip():
        return None
    escaped = caption.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
    font_file = Path("C:/Windows/Fonts/arial.ttf")
    font_option = "fontfile='C\\:/Windows/Fonts/arial.ttf':" if font_file.exists() else ""
    return (
        "drawtext="
        f"{font_option}"
        "fontcolor=white:"
        "fontsize=42:"
        "box=1:"
        "boxcolor=black@0.55:"
        "boxborderw=24:"
        "x=(w-text_w)/2:"
        "y=h-text_h-96:"
        f"text='{escaped}'"
    )


def _zoom_filter(clip: Clip) -> str | None:
    if not clip.zoom:
        return None
    zoom = clip.zoom[0]
    # MVP keeps zoom intentionally simple: one crop window per clip, then scale back.
    crop_w = f"iw/{zoom.scale}"
    crop_h = f"ih/{zoom.scale}"
    crop_x = f"(iw-{crop_w})*{zoom.x}"
    crop_y = f"(ih-{crop_h})*{zoom.y}"
    return (
        f"crop=w='{crop_w}':h='{crop_h}':x='{crop_x}':y='{crop_y}',"
        "scale=iw:ih"
    )


def _video_filter(clip: Clip, resolution: str, fps: int) -> str:
    filter_resolution = resolution.replace("x", ":")
    filters = [f"scale={filter_resolution}:force_original_aspect_ratio=decrease"]
    filters.append(f"pad={filter_resolution}:(ow-iw)/2:(oh-ih)/2")
    filters.append(f"fps={fps}")
    zoom_filter = _zoom_filter(clip)
    caption_filter = _caption_filter(clip.caption)
    if zoom_filter:
        filters.append(zoom_filter)
    if caption_filter:
        filters.append(caption_filter)
    return ",".join(filters)


def _clip_duration(clip: Clip) -> float:
    return max((clip.trimEnd or clip.trimStart + 8) - clip.trimStart, 0)


def _append_xfade_chain(
    project_id: UUID,
    clips: list[Clip],
    normalized_files: list[Path],
    boundaries: list[TransitionSettings],
    export_dir: Path,
    commands: list[list[str]],
) -> Path:
    accumulator = normalized_files[0]
    accumulator_duration = _clip_duration(clips[0])

    for index, boundary in enumerate(boundaries):
        next_file = normalized_files[index + 1]
        stage_file = export_dir / f"{project_id}-xfade-{index:03d}.mp4"

        if boundary.type == TransitionType.cut:
            commands.append(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    str(accumulator),
                    "-i",
                    str(next_file),
                    "-filter_complex",
                    "[0:v][1:v]concat=n=2:v=1:a=0[v];[0:a][1:a]concat=n=2:v=0:a=1[a]",
                    "-map",
                    "[v]",
                    "-map",
                    "[a]",
                    "-c:v",
                    "libx264",
                    "-preset",
                    "veryfast",
                    "-crf",
                    "21",
                    "-c:a",
                    "aac",
                    "-movflags",
                    "+faststart",
                    str(stage_file),
                ]
            )
            accumulator_duration += _clip_duration(clips[index + 1])
        else:
            duration = boundary.duration
            offset = max(accumulator_duration - duration, 0)
            transition = _XFADE_TRANSITION[boundary.type]
            commands.append(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    str(accumulator),
                    "-i",
                    str(next_file),
                    "-filter_complex",
                    (
                        f"[0:v][1:v]xfade=transition={transition}:duration={duration:.3f}:offset={offset:.3f}[v];"
                        f"[0:a][1:a]acrossfade=d={duration:.3f}[a]"
                    ),
                    "-map",
                    "[v]",
                    "-map",
                    "[a]",
                    "-c:v",
                    "libx264",
                    "-preset",
                    "veryfast",
                    "-crf",
                    "21",
                    "-c:a",
                    "aac",
                    "-movflags",
                    "+faststart",
                    str(stage_file),
                ]
            )
            accumulator_duration = offset + _clip_duration(clips[index + 1])

        accumulator = stage_file

    return accumulator


def build_render_commands(
    project_id: UUID,
    timeline: Timeline,
    upload_dir: Path,
    export_dir: Path,
    voiceover_path: Path | None = None,
) -> list[list[str]]:
    export_dir.mkdir(parents=True, exist_ok=True)
    output = timeline.output
    normalized_files: list[Path] = []
    commands: list[list[str]] = []

    for index, clip in enumerate(timeline.clips):
        source = upload_dir / clip.file
        normalized = export_dir / f"{project_id}-{index:03d}.mp4"
        normalized_files.append(normalized)

        command = [
            "ffmpeg",
            "-y",
            "-ss",
            f"{clip.trimStart:.3f}",
            *_clip_duration_arg(clip),
            "-i",
            str(source),
            "-vf",
            _video_filter(clip, output.resolution, output.fps),
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "21",
            "-c:a",
            "aac",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-movflags",
            "+faststart",
            str(normalized),
        ]
        commands.append(command)

    boundaries = [clip.transitionOut for clip in timeline.clips[:-1]]
    has_transitions = any(boundary.type != TransitionType.cut for boundary in boundaries)

    if not has_transitions:
        concat_file = export_dir / f"{project_id}-concat.txt"
        concat_file.write_text(
            "\n".join(f"file '{path.as_posix()}'" for path in normalized_files),
            encoding="utf-8",
        )
        stitched_file = export_dir / f"{project_id}-stitched.mp4"
        commands.append(
            [
                "ffmpeg",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(concat_file),
                "-c",
                "copy",
                "-movflags",
                "+faststart",
                str(stitched_file),
            ]
        )
    else:
        stitched_file = _append_xfade_chain(
            project_id, timeline.clips, normalized_files, boundaries, export_dir, commands
        )

    final_file = export_dir / f"{project_id}.{output.format}"
    if voiceover_path:
        if timeline.narration.useOriginalAudio:
            audio_filter = (
                "[0:a]volume=0.16,loudnorm=I=-24:TP=-2:LRA=11[orig];"
                "[1:a]loudnorm=I=-16:TP=-1.5:LRA=10,afade=t=in:st=0:d=0.25[voice];"
                "[orig][voice]amix=inputs=2:duration=longest:dropout_transition=2,"
                "loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.95,apad[aout]"
            )
        else:
            audio_filter = (
                "[1:a]loudnorm=I=-16:TP=-1.5:LRA=10,"
                "afade=t=in:st=0:d=0.25,"
                "alimiter=limit=0.95,apad[aout]"
            )

        commands.append(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(stitched_file),
                "-i",
                str(voiceover_path),
                "-filter_complex",
                audio_filter,
                "-map",
                "0:v:0",
                "-map",
                "[aout]",
                "-c:v",
                "copy",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-ar",
                "48000",
                "-ac",
                "2",
                "-shortest",
                "-movflags",
                "+faststart",
                str(final_file),
            ]
        )
    else:
        commands.append(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(stitched_file),
                "-c:v",
                "copy",
                "-c:a",
                "aac",
                "-b:a",
                "160k",
                "-ar",
                "48000",
                "-ac",
                "2",
                "-movflags",
                "+faststart",
                str(final_file),
            ]
        )

    return commands


def run_render_commands(commands: list[list[str]]) -> None:
    for command in commands:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            stderr = result.stderr.strip() or result.stdout.strip()
            raise RuntimeError(stderr[-1200:] if stderr else "FFmpeg render failed")


def build_fallback_voiceover_command(
    voiceover_path: Path,
    duration: float,
) -> list[str]:
    return [
        "ffmpeg",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=channel_layout=stereo:sample_rate=48000",
        "-t",
        f"{max(duration, 1):.3f}",
        "-c:a",
        "mp3",
        str(voiceover_path),
    ]


def timeline_duration(timeline: Timeline) -> float:
    total = sum(_clip_duration(clip) for clip in timeline.clips)
    overlap = sum(
        clip.transitionOut.duration
        for clip in timeline.clips[:-1]
        if clip.transitionOut.type != TransitionType.cut
    )
    return max(total - overlap, 0)


def command_preview(commands: list[list[str]]) -> list[str]:
    return [" ".join(quote(part) for part in command) for command in commands]
