export type ZoomKeyframe = {
  start: number;
  end: number;
  scale: number;
  x: number;
  y: number;
};

export type Clip = {
  id: string;
  file: string;
  order: number;
  trimStart: number;
  trimEnd: number;
  zoom: ZoomKeyframe[];
  caption: string;
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

export type RenderJob = {
  id: string;
  projectId: string;
  status: "queued" | "running" | "completed" | "failed";
  outputFile: string | null;
  downloadUrl: string | null;
  voiceoverFile: string | null;
  commandPreview: string[];
  error: string | null;
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

export type EnhancedRecording = {
  file: string;
  script: string;
  ttsProvider: string;
  voiceoverFile: string | null;
  finalVideoUrl: string | null;
  renderJobId: string | null;
  guide: GeneratedGuide | null;
  aiPlan: string[];
  steps: string[];
  warning: string | null;
};
