from .models import ChatOp, ChatOpType, Timeline, TransitionSettings, TransitionType


def apply_chat_ops(timeline: Timeline, raw_ops: list[dict]) -> tuple[Timeline, list[str], list[str]]:
    next_clips = list(timeline.clips)
    next_narration = timeline.narration
    applied: list[str] = []
    errors: list[str] = []

    def find_index(clip_id: str | None) -> int | None:
        return next((i for i, clip in enumerate(next_clips) if clip.id == clip_id), None)

    for raw in raw_ops:
        try:
            op = ChatOp(**raw)
        except Exception as exc:
            errors.append(f"Skipped invalid op {raw}: {exc}")
            continue

        if op.op == ChatOpType.trim_clip:
            index = find_index(op.clipId)
            if index is None or op.trimStart is None or op.trimEnd is None:
                errors.append(f"trim_clip: clip {op.clipId} not found or missing trim bounds")
                continue
            if op.trimEnd <= op.trimStart or op.trimStart < 0:
                errors.append(f"trim_clip: invalid trim range for clip {op.clipId}")
                continue
            next_clips[index] = next_clips[index].model_copy(
                update={"trimStart": op.trimStart, "trimEnd": op.trimEnd}
            )
            applied.append(f"Trimmed clip {op.clipId} to {op.trimStart:.1f}s-{op.trimEnd:.1f}s")

        elif op.op == ChatOpType.reorder_clips:
            existing_ids = {clip.id for clip in next_clips}
            if not op.order or set(op.order) != existing_ids or len(op.order) != len(next_clips):
                errors.append("reorder_clips: order must include every existing clip id exactly once")
                continue
            by_id = {clip.id: clip for clip in next_clips}
            next_clips = [
                by_id[clip_id].model_copy(update={"order": position + 1})
                for position, clip_id in enumerate(op.order)
            ]
            applied.append("Reordered clips")

        elif op.op == ChatOpType.remove_clip:
            index = find_index(op.clipId)
            if index is None:
                errors.append(f"remove_clip: clip {op.clipId} not found")
                continue
            if len(next_clips) <= 1:
                errors.append("remove_clip: cannot remove the only remaining clip")
                continue
            next_clips = [clip for i, clip in enumerate(next_clips) if i != index]
            next_clips = [
                clip.model_copy(update={"order": position + 1})
                for position, clip in enumerate(next_clips)
            ]
            applied.append(f"Removed clip {op.clipId}")

        elif op.op == ChatOpType.set_caption:
            index = find_index(op.clipId)
            if index is None or op.caption is None:
                errors.append(f"set_caption: clip {op.clipId} not found or missing caption")
                continue
            next_clips[index] = next_clips[index].model_copy(update={"caption": op.caption})
            applied.append(f"Updated caption for clip {op.clipId}")

        elif op.op == ChatOpType.set_transition:
            index = find_index(op.clipId)
            if index is None or op.transitionType is None:
                errors.append(f"set_transition: clip {op.clipId} not found or missing transition type")
                continue
            duration = op.transitionDuration
            if duration is None:
                duration = 0 if op.transitionType == TransitionType.cut else 1
            next_clips[index] = next_clips[index].model_copy(
                update={"transitionOut": TransitionSettings(type=op.transitionType, duration=duration)}
            )
            applied.append(f"Set transition on clip {op.clipId} to {op.transitionType.value}")

        elif op.op == ChatOpType.set_narration_script:
            if op.script is None:
                errors.append("set_narration_script: missing script")
                continue
            next_narration = next_narration.model_copy(update={"script": op.script})
            applied.append("Updated narration script")

    next_clips = sorted(next_clips, key=lambda clip: clip.order)
    new_timeline = timeline.model_copy(update={"clips": next_clips, "narration": next_narration})
    return new_timeline, applied, errors
