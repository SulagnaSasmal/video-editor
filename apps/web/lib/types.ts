export type ZoomKeyframe = {
  start: number;
  end: number;
  scale: number;
  x: number;
  y: number;
};

export type TransitionType = "cut" | "crossfade" | "fade_to_black";

export type TransitionSettings = {
  type: TransitionType;
  duration: number;
};

export type Clip = {
  id: string;
  file: string;
  order: number;
  trimStart: number;
  trimEnd: number;
  zoom: ZoomKeyframe[];
  caption: string;
  transitionOut: TransitionSettings;
};

export type Timeline = {
  clips: Clip[];
  output: {
    resolution: string;
    fps: number;
    format: "mp4";
  };
  narration?: {
    enabled: boolean;
    provider?: string | null;
    script: string;
    voice: string;
    useOriginalAudio: boolean;
    backgroundMusic: boolean;
    musicVolume: number;
  };
};

export type ProjectPayload = {
  name: string;
  timeline: Timeline;
};

export type Project = ProjectPayload & { id: string };

export type ProjectUpdate = {
  name?: string;
  timeline?: Timeline;
};

export type RenderJob = {
  id: string;
  projectId: string;
  kind: "export" | "narrate";
  status: "queued" | "running" | "completed" | "failed";
  outputFile: string | null;
  downloadUrl: string | null;
  voiceoverFile: string | null;
  commandPreview: string[];
  error: string | null;
};

export type NarrationCue = {
  clipId: string;
  text: string;
  approxStartSeconds: number;
};

export type ProjectNarrationResult = {
  script: string;
  cueSheet: NarrationCue[];
  voiceoverPreviewUrl: string | null;
  provider: string | null;
  warning: string | null;
};

export type UploadedVideo = {
  file: string;
  originalName: string;
  contentType: string;
  size: number;
  duration?: number | null;
};

export type GeneratedGuideStep = {
  title: string;
  description: string;
  timestamp?: number;
};

export type GeneratedGuide = {
  title: string;
  summary: string;
  steps: GeneratedGuideStep[];
  faqs?: Array<{ question: string; answer: string }>;
  assessment?: Array<{ question: string; answer: string }>;
};

export type RecordingGuide = {
  file: string;
  script: string;
  guide: GeneratedGuide | null;
  aiPlan: string[];
  warning: string | null;
};
