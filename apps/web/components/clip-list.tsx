"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import type { Clip, TransitionType } from "@/lib/types";

type ClipListProps = {
  clips: Clip[];
  onChange: (clips: Clip[]) => void;
};

const transitionLabels: Record<TransitionType, string> = {
  cut: "Cut",
  crossfade: "Crossfade (1s)",
  fade_to_black: "Fade to black (1s)",
};

function renumber(clips: Clip[]) {
  return clips.map((clip, index) => ({ ...clip, order: index + 1 }));
}

function SortableClip({
  clip,
  isLast,
  onUpdate,
  onRemove,
}: {
  clip: Clip;
  isLast: boolean;
  onUpdate: (clip: Clip) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: clip.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <article className="clip-row" ref={setNodeRef} style={style}>
      <button
        className="icon-button handle"
        type="button"
        aria-label="Reorder clip"
        title="Reorder clip"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={18} />
      </button>

      <label>
        <span>File</span>
        <input
          value={clip.file}
          onChange={(event) => onUpdate({ ...clip, file: event.target.value })}
        />
      </label>

      <label>
        <span>Start</span>
        <input
          min="0"
          step="0.1"
          type="number"
          value={clip.trimStart}
          onChange={(event) =>
            onUpdate({ ...clip, trimStart: Number(event.target.value) })
          }
        />
      </label>

      <label>
        <span>End</span>
        <input
          min="0.1"
          step="0.1"
          type="number"
          value={clip.trimEnd}
          onChange={(event) =>
            onUpdate({ ...clip, trimEnd: Number(event.target.value) })
          }
        />
      </label>

      <label className="caption-field">
        <span>Caption</span>
        <input
          value={clip.caption}
          onChange={(event) =>
            onUpdate({ ...clip, caption: event.target.value })
          }
        />
      </label>

      {!isLast ? (
        <label className="transition-field">
          <span>Transition to next</span>
          <select
            value={clip.transitionOut.type}
            onChange={(event) =>
              onUpdate({
                ...clip,
                transitionOut: {
                  type: event.target.value as Clip["transitionOut"]["type"],
                  duration: event.target.value === "cut" ? 0 : clip.transitionOut.duration || 1,
                },
              })
            }
          >
            {Object.entries(transitionLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <button
        className="icon-button danger"
        type="button"
        aria-label="Remove clip"
        title="Remove clip"
        onClick={onRemove}
      >
        <Trash2 size={18} />
      </button>
    </article>
  );
}

export function ClipList({ clips, onChange }: ClipListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function updateClip(nextClip: Clip) {
    onChange(clips.map((clip) => (clip.id === nextClip.id ? nextClip : clip)));
  }

  function removeClip(id: string) {
    if (clips.length === 1) {
      return;
    }
    onChange(renumber(clips.filter((clip) => clip.id !== id)));
  }

  function addClip() {
    const nextOrder = clips.length + 1;
    onChange([
      ...clips,
      {
        id: crypto.randomUUID(),
        file: `clip${nextOrder}.mp4`,
        order: nextOrder,
        trimStart: 0,
        trimEnd: 10,
        zoom: [],
        caption: "",
        transitionOut: { type: "cut", duration: 0 },
      },
    ]);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = clips.findIndex((clip) => clip.id === active.id);
    const newIndex = clips.findIndex((clip) => clip.id === over.id);
    onChange(renumber(arrayMove(clips, oldIndex, newIndex)));
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Timeline</h2>
          <p>
            {clips.length} clip{clips.length === 1 ? "" : "s"} · drag the handle to reorder, or
            add more clips below to stitch them into one video
          </p>
        </div>
        <button className="primary-button" type="button" onClick={addClip}>
          <Plus size={18} />
          Add clip
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={clips.map((clip) => clip.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="clip-list">
            {clips.map((clip, index) => (
              <SortableClip
                key={clip.id}
                clip={clip}
                isLast={index === clips.length - 1}
                onUpdate={updateClip}
                onRemove={() => removeClip(clip.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
}
