"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Bot,
  Boxes,
  CalendarDays,
  ChevronLeft,
  Circle,
  Clapperboard,
  Captions,
  Download,
  Eye,
  FileText,
  HelpCircle,
  Home as HomeIcon,
  ImageIcon,
  Info,
  LayoutTemplate,
  Languages,
  List,
  Loader2,
  Mic,
  MoreHorizontal,
  Music,
  Plus,
  Radio,
  RefreshCcw,
  Scissors,
  Search,
  Send,
  Settings,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Type,
  UserRound,
  Video,
  Volume2,
  Wand2,
} from "lucide-react";
import { VideoDropzone } from "@/components/video-dropzone";
import {
  createProject,
  createRenderJob,
  enhanceRecording,
  uploadVideos,
  uploadedMediaUrl,
} from "@/lib/api";
import type {
  EnhancedRecording,
  ProjectPayload,
  RenderJob,
  Timeline,
  UploadedVideo,
} from "@/lib/types";

type View = "home" | "ask-ai" | "library" | "skills" | "recording" | "editor";
type SkillTab = "video" | "doc";
type RecordingState = "idle" | "starting" | "recording" | "processing" | "ready" | "error";
type EditorTab = "script" | "voice" | "music" | "visuals" | "zooms" | "avatar" | "elements";
type VisualPanel = "background" | "scenes";
type EditorElementType = "rectangle" | "circle" | "blur" | "text" | "image";

type EditorElement = {
  id: string;
  type: EditorElementType;
  label: string;
};

const initialTimeline: Timeline = {
  clips: [
    {
      id: "clip-1",
      file: "clip1.mp4",
      order: 1,
      trimStart: 2,
      trimEnd: 18,
      zoom: [
        {
          start: 4,
          end: 8,
          scale: 1.3,
          x: 0.5,
          y: 0.4,
        },
      ],
      caption: "This is the intro section",
    },
  ],
  output: {
    resolution: "1920x1080",
    fps: 30,
    format: "mp4",
  },
};

const navItems = [
  { key: "home", label: "Home", icon: HomeIcon, disabled: false },
  { key: "ask-ai", label: "Ask AI", icon: Sparkles, disabled: false },
  { key: "library", label: "Library", icon: Boxes, disabled: false },
  { key: "skills", label: "Skills", icon: ShieldCheck, disabled: false },
  { key: "shared-pages", label: "Shared Pages", icon: BookOpen, disabled: true },
  { key: "brand-kit", label: "Brand Kit", icon: LayoutTemplate, disabled: true },
  { key: "knowledge-base", label: "Knowledge Base", icon: Bot, disabled: true },
] as const;

const featureCards = [
  {
    title: "Create a Video",
    body: "Create professional product videos with AI assistance",
    icon: Video,
    tone: "violet",
    action: "video",
  },
  {
    title: "Create a Document",
    body: "Build how-to guides and step-by-step docs automatically",
    icon: FileText,
    tone: "pink",
    action: "document",
  },
] as const;

const quickGuide = [
  {
    title: "Step 1",
    body: "Upload a screen recording or product walkthrough.",
    icon: Clapperboard,
    tone: "violet",
    action: "upload",
  },
  {
    title: "Step 2",
    body: "Trim, reorder, caption, and prepare the timeline.",
    icon: Radio,
    tone: "pink",
    action: "timeline",
  },
  {
    title: "Step 3",
    body: "Generate narration, docs, and branded guides.",
    icon: Wand2,
    tone: "gold",
    action: "ask-ai",
  },
  {
    title: "Step 4",
    body: "Export video and documentation packages.",
    icon: Download,
    tone: "blue",
    action: "export",
  },
] as const;

const editorTabs = [
  {
    key: "script",
    label: "Script",
    icon: FileText,
  },
  {
    key: "voice",
    label: "AI Voice",
    icon: Volume2,
  },
  {
    key: "music",
    label: "Music",
    icon: Music,
  },
  {
    key: "visuals",
    label: "Visuals",
    icon: Captions,
  },
  {
    key: "zooms",
    label: "Zooms",
    icon: Scissors,
  },
  {
    key: "avatar",
    label: "AI Avatar",
    icon: UserRound,
  },
  {
    key: "elements",
    label: "Elements",
    icon: Boxes,
  },
] as const;

const voiceOptions = [
  "Camila - Female, English (US), Conversational",
  "Jenny - Female, English (US), Product demo",
  "Aria - Female, English (US), Warm guide",
  "Davis - Male, English (US), Confident",
] as const;

const musicTracks = [
  "Feels",
  "Clean Focus",
  "Light Product",
  "Soft Momentum",
] as const;

const backgroundPresets = [
  "linear-gradient(135deg, #b7ecf5, #f2fbff)",
  "linear-gradient(135deg, #ffc4dd, #ffeef6)",
  "linear-gradient(135deg, #dce7f7, #ffc6d2)",
  "linear-gradient(135deg, #c3eff8, #7bb7e6)",
  "linear-gradient(135deg, #cbc7ff, #ebe9ff)",
  "linear-gradient(135deg, #ffac9d, #b9f1ca 48%, #c3c3ff)",
  "linear-gradient(135deg, #8bc3e8, #b9a7ed)",
  "linear-gradient(135deg, #8fb9ff, #ffb58e 52%, #ffe4b8)",
] as const;

const avatarOptions = [
  "linear-gradient(135deg, #e7b5a3, #6b5dd3)",
  "linear-gradient(135deg, #d9d3c8, #8b6f56)",
  "linear-gradient(135deg, #f3ddd3, #6950bd)",
  "linear-gradient(135deg, #f4c7a0, #eef3ff)",
  "linear-gradient(135deg, #e4b79e, #fbf2e9)",
  "linear-gradient(135deg, #ffe0da, #ffffff)",
] as const;

export default function Home() {
  const [activeView, setActiveView] = useState<View>("home");
  const [skillTab, setSkillTab] = useState<SkillTab>("video");
  const [projectName, setProjectName] = useState("First MVP render");
  const [timeline, setTimeline] = useState<Timeline>(initialTimeline);
  const [job, setJob] = useState<RenderJob | null>(null);
  const [error, setError] = useState("");
  const [isRendering, setIsRendering] = useState(false);
  const [showRecordingModal, setShowRecordingModal] = useState(false);
  const [showCreateVideoModal, setShowCreateVideoModal] = useState(false);
  const [editorTab, setEditorTab] = useState<EditorTab>("script");
  const [visualPanel, setVisualPanel] = useState<VisualPanel>("background");
  const [useOriginalVoice, setUseOriginalVoice] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<(typeof voiceOptions)[number]>(voiceOptions[0]);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [selectedMusic, setSelectedMusic] = useState<(typeof musicTracks)[number]>(musicTracks[0]);
  const [musicVolume, setMusicVolume] = useState(8);
  const [backgroundEnabled, setBackgroundEnabled] = useState(false);
  const [selectedBackground, setSelectedBackground] = useState(0);
  const [shadowStyle, setShadowStyle] = useState("Medium");
  const [cornerRadius, setCornerRadius] = useState(16);
  const [framePadding, setFramePadding] = useState(12);
  const [zoomEnabled, setZoomEnabled] = useState(true);
  const [avatarEnabled, setAvatarEnabled] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState(0);
  const [avatarColor, setAvatarColor] = useState("#dce775");
  const [editorElements, setEditorElements] = useState<EditorElement[]>([
    { id: "element-blur-1", type: "blur", label: "Blur" },
  ]);
  const [shareStatus, setShareStatus] = useState("");
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState("");
  const [enhancement, setEnhancement] = useState<EnhancedRecording | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);

  const payload = useMemo<ProjectPayload>(
    () => ({
      name: projectName,
      timeline,
    }),
    [projectName, timeline],
  );

  const realClips = useMemo(
    () => timeline.clips.filter((clip) => clip.file && clip.file !== "clip1.mp4"),
    [timeline.clips],
  );

  const previewFile = realClips[0]?.file ?? "";
  const previewUrl = previewFile ? uploadedMediaUrl(previewFile) : "";
  const totalDuration = useMemo(
    () =>
      timeline.clips.reduce(
        (total, clip) => total + Math.max(clip.trimEnd - clip.trimStart, 0),
        0,
      ),
    [timeline.clips],
  );

  const generatedScriptLines = useMemo(
    () => enhancement?.script.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((line) => line.trim()) ?? [],
    [enhancement],
  );

  const editorScenes = useMemo(() => {
    let cursor = 0;
    return timeline.clips.map((clip, index) => {
      const startsAt = cursor;
      cursor += Math.max(clip.trimEnd - clip.trimStart, 0);

      return {
        clip,
        startsAt,
        text:
          clip.caption.trim() ||
          generatedScriptLines[index] ||
          (index === 0 ? "Enter your script text..." : "Describe what happens in this scene."),
      };
    });
  }, [generatedScriptLines, timeline.clips]);

  const previewShellStyle = {
    background: backgroundEnabled ? backgroundPresets[selectedBackground] : "transparent",
    borderRadius: `${cornerRadius}px`,
    padding: backgroundEnabled ? `${framePadding}px` : "0",
    boxShadow:
      shadowStyle === "None"
        ? "none"
        : shadowStyle === "Soft"
          ? "0 10px 26px rgba(15, 23, 42, 0.08)"
          : "0 18px 45px rgba(15, 23, 42, 0.14)",
  };

  const previewMediaStyle = {
    borderRadius: `${Math.max(cornerRadius - 4, 4)}px`,
    transform: zoomEnabled && timeline.clips.some((clip) => clip.zoom.length > 0) ? "scale(1.03)" : "scale(1)",
  };

  useEffect(() => {
    if (recordingState !== "recording") {
      return;
    }

    const timer = window.setInterval(() => {
      setRecordingSeconds((seconds) => seconds + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [recordingState]);

  useEffect(() => {
    return () => {
      stopStreamTracks();
    };
  }, []);

  function stopStreamTracks() {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
  }

  function getRecorderMimeType() {
    const types = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
  }

  function formatRecordingTime(seconds: number) {
    const minutes = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const remainingSeconds = (seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${remainingSeconds}`;
  }

  function formatTimelineTime(seconds: number) {
    const safeSeconds = Math.max(Math.floor(seconds), 0);
    const minutes = Math.floor(safeSeconds / 60)
      .toString()
      .padStart(2, "0");
    const remainingSeconds = (safeSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${remainingSeconds}`;
  }

  async function beginBrowserRecording() {
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === "undefined") {
      setRecordingState("error");
      setRecordingError("This browser does not support screen recording. Use current Chrome or Edge on localhost.");
      setActiveView("recording");
      return;
    }

    setShowRecordingModal(false);
    setShowCreateVideoModal(false);
    setActiveView("recording");
    setRecordingState("starting");
    setRecordingError("");
    setEnhancement(null);
    setRecordingSeconds(0);

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
      });

      let micStream: MediaStream | null = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch {
        micStream = null;
      }

      const combinedStream = new MediaStream([
        ...screenStream.getVideoTracks(),
        ...screenStream.getAudioTracks(),
        ...(micStream?.getAudioTracks() ?? []),
      ]);
      recordingStreamRef.current = combinedStream;
      recordingChunksRef.current = [];

      const mimeType = getRecorderMimeType();
      const recorder = new MediaRecorder(
        combinedStream,
        mimeType ? { mimeType } : undefined,
      );

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        void finishRecording(mimeType || "video/webm");
      };

      screenStream.getVideoTracks()[0]?.addEventListener("ended", () => {
        stopBrowserRecording();
      });

      recorderRef.current = recorder;
      recorder.start(1000);
      setRecordingState("recording");
    } catch (caught) {
      stopStreamTracks();
      setRecordingState("error");
      setRecordingError(
        caught instanceof Error
          ? caught.message
          : "Screen recording permission was not granted.",
      );
    }
  }

  function stopBrowserRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      return;
    }
    stopStreamTracks();
  }

  async function finishRecording(mimeType: string) {
    setRecordingState("processing");
    stopStreamTracks();

    try {
      const blob = new Blob(recordingChunksRef.current, { type: mimeType });
      const recordingFile = new File(
        [blob],
        `screen-recording-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`,
        { type: "video/webm" },
      );

      const uploaded = await uploadVideos([recordingFile]);
      addUploadedVideos(uploaded);

      if (uploaded[0]) {
        const enhanced = await enhanceRecording({
          file: uploaded[0].file,
          originalName: uploaded[0].originalName,
        });
        setEnhancement(enhanced);
      }

      setRecordingState("ready");
    } catch (caught) {
      setRecordingState("error");
      setRecordingError(caught instanceof Error ? caught.message : "Recording upload failed.");
    } finally {
      recorderRef.current = null;
      recordingChunksRef.current = [];
    }
  }

  async function previewRender() {
    setIsRendering(true);
    setError("");
    setJob(null);

    try {
      const project = await createProject(payload);
      const nextJob = await createRenderJob(project.id);
      setJob(nextJob);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Render failed");
    } finally {
      setIsRendering(false);
    }
  }

  function addUploadedVideos(videos: UploadedVideo[]) {
    setTimeline((current) => {
      const nextClips = videos.map((video, index) => ({
        id: crypto.randomUUID(),
        file: video.file,
        order: current.clips.length + index + 1,
        trimStart: 0,
        trimEnd: 10,
        zoom: [],
        caption: "",
      }));

      return {
        ...current,
        clips:
          current.clips.length === 1 && current.clips[0].file === "clip1.mp4"
            ? nextClips
            : [...current.clips, ...nextClips],
      };
    });
    setEditorTab("script");
    setActiveView("editor");
  }

  function applyScriptToCaptions() {
    if (!enhancement?.script) {
      setVoiceStatus("Record or upload a video first, then refresh voiceover.");
      return;
    }

    setTimeline((current) => ({
      ...current,
      clips: current.clips.map((clip, index) => ({
        ...clip,
        caption: index === 0 ? enhancement.script : clip.caption,
      })),
    }));
    setEditorTab("script");
    setVoiceStatus(`Voiceover prepared with ${selectedVoice.split(" - ")[0]}.`);
  }

  function addScene() {
    setTimeline((current) => {
      const nextOrder = current.clips.length + 1;
      const previousEnd = current.clips.at(-1)?.trimEnd ?? 0;

      return {
        ...current,
        clips: [
          ...current.clips,
          {
            id: crypto.randomUUID(),
            file: previewFile || "clip1.mp4",
            order: nextOrder,
            trimStart: previousEnd,
            trimEnd: previousEnd + 7,
            zoom: [],
            caption: "Enter script text...",
          },
        ],
      };
    });
    setEditorTab("script");
  }

  function addZoomEffect() {
    setTimeline((current) => ({
      ...current,
      clips: current.clips.map((clip, index) =>
        index === 0
          ? {
              ...clip,
              zoom: [
                ...clip.zoom,
                {
                  start: Math.max(clip.trimStart, 0),
                  end: Math.max(clip.trimStart + 4, clip.trimEnd),
                  scale: 1.18,
                  x: 0.5,
                  y: 0.5,
                },
              ],
            }
          : clip,
      ),
    }));
    setZoomEnabled(true);
  }

  function addEditorElement(type: EditorElementType) {
    const labels: Record<EditorElementType, string> = {
      rectangle: "Rectangle",
      circle: "Circle",
      blur: "Blur",
      text: "Text",
      image: "Image",
    };

    setEditorElements((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        type,
        label: labels[type],
      },
    ]);
  }

  async function shareProject() {
    const shareUrl = window.location.href;
    try {
      await navigator.clipboard?.writeText(shareUrl);
      setShareStatus("Share link copied");
    } catch {
      setShareStatus("Share link ready");
    }
    window.setTimeout(() => setShareStatus(""), 2200);
  }

  function handleFeatureAction(action: "video" | "document") {
    if (action === "video") {
      setShowCreateVideoModal(true);
      return;
    }

    setActiveView("skills");
    setSkillTab("doc");
  }

  function handleGuideAction(action: (typeof quickGuide)[number]["action"]) {
    if (action === "upload" || action === "timeline") {
      setActiveView("editor");
      return;
    }

    if (action === "ask-ai") {
      setActiveView("ask-ai");
      return;
    }

    void previewRender();
  }

  function startRecording() {
    setShowRecordingModal(true);
  }

  function confirmRecording() {
    void beginBrowserRecording();
  }

  function renderHome() {
    return (
      <>
        <section className="welcome-section">
          <h1>Hi there, welcome to Flow Studio</h1>
          <p>How would you like to start?</p>

          <div className="start-actions">
            <button className="start-tile" type="button" onClick={startRecording}>
              <Plus size={22} />
              <span>Start Recording</span>
            </button>
            <VideoDropzone onUploaded={addUploadedVideos} />
          </div>
        </section>

        <section className="feature-section">
          <h2>Popular features</h2>
          <div className="feature-grid two-up">
            {featureCards.map((feature) => (
              <button
                className="feature-card feature-button"
                key={feature.title}
                type="button"
                onClick={() => handleFeatureAction(feature.action)}
              >
                <div>
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                </div>
                <span className={`feature-icon ${feature.tone}`}>
                  <feature.icon size={26} />
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="feature-section">
          <h2>Quick guide</h2>
          <div className="guide-grid">
            {quickGuide.map((guide) => (
              <button
                className="guide-card guide-button"
                key={guide.title}
                type="button"
                onClick={() => handleGuideAction(guide.action)}
              >
                <span className={`guide-icon ${guide.tone}`}>
                  <guide.icon size={24} />
                </span>
                <div>
                  <h3>{guide.title}</h3>
                  <p>{guide.body}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

      </>
    );
  }

  function renderAskAi() {
    return (
      <section className="ask-ai-view">
        <div className="ask-ai-center">
          <h1>
            <span>Hey sulagna.sasmal@ust.com,</span> what's on your mind?
          </h1>
          <p>Ask anything about your videos, docs, and guides. Get answers with the source.</p>
          <div className="ask-box">
            <textarea placeholder="Ask anything..." />
            <div className="ask-actions">
              <button type="button" aria-label="Voice input" title="Voice input">
                <Mic size={16} />
              </button>
              <button type="button" aria-label="Send" title="Send">
                <Send size={16} />
              </button>
            </div>
          </div>
          <div className="prompt-row">
            <button type="button">
              <Sparkles size={15} />
              Summarize my recording
            </button>
            <button type="button">
              <FileText size={15} />
              List my documents
            </button>
            <button type="button">
              <Eye size={15} />
              Video with most views
            </button>
          </div>
        </div>
      </section>
    );
  }

  function renderLibrary() {
    return (
      <section className="library-view">
        <div className="search-bar">
          <Search size={17} />
          <input placeholder="Search content" />
        </div>
        <h1>Your Content</h1>
        <button className="content-card" type="button" onClick={() => setActiveView("editor")}>
          <div className="content-thumb">
            <span>FINX-GLASS</span>
          </div>
          <div className="content-meta">
            <span>
              <CalendarDays size={14} />
              Wed, July 8
            </span>
            <MoreHorizontal size={18} />
          </div>
          <h2>Accessing the FINX-GLASS Operationa...</h2>
          <span className="language-pill">English</span>
        </button>
      </section>
    );
  }

  function renderSkills() {
    const isVideo = skillTab === "video";

    return (
      <section className="skills-view">
        <h1>Skills</h1>
        <div className="tabs">
          <button
            className={isVideo ? "is-active" : ""}
            type="button"
            onClick={() => setSkillTab("video")}
          >
            Video Skills
          </button>
          <button
            className={!isVideo ? "is-active" : ""}
            type="button"
            onClick={() => setSkillTab("doc")}
          >
            Doc Skills
          </button>
        </div>
        <div className="empty-state">
          <div className="empty-art">
            {isVideo ? <Video size={64} /> : <FileText size={64} />}
          </div>
          <h2>{isVideo ? "No Video Skills Yet" : "No Doc Skills Yet"}</h2>
          <p>
            {isVideo
              ? "Create your first video skill with custom voice, avatar, background, and video settings."
              : "Create reusable documentation flows for product walkthroughs and step-by-step guides."}
          </p>
          <button className="create-button" type="button">
            <Plus size={17} />
            {isVideo ? "New skill" : "New doc skill"}
          </button>
        </div>
      </section>
    );
  }

  function renderRecording() {
    return (
      <section className="recording-view">
        <div className="recording-card">
          <span className="recording-dot" />
          <h1>Recording setup is ready</h1>
          <p>Capture your workflow, talk through the steps, and Flow Studio will use it to prepare the video and documentation timeline.</p>
          <div className="recording-status">
            {recordingState === "starting" ? <span>Opening browser capture picker...</span> : null}
            {recordingState === "recording" ? (
              <>
                <strong>{formatRecordingTime(recordingSeconds)}</strong>
                <span>Recording screen and available audio</span>
              </>
            ) : null}
            {recordingState === "processing" ? <span>Uploading recording and preparing AI cleanup...</span> : null}
            {recordingState === "ready" ? <span>Recording added to the timeline.</span> : null}
            {recordingState === "error" ? <span className="status-error">{recordingError}</span> : null}
          </div>
          {enhancement ? (
            <div className="enhancement-card">
              <h2>AI cleanup prepared</h2>
              <ul>
                {enhancement.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
              <p>{enhancement.script}</p>
              {enhancement.voiceoverFile ? (
                <small>Voiceover generated with {enhancement.ttsProvider}: {enhancement.voiceoverFile}</small>
              ) : null}
              {enhancement.warning ? <small>{enhancement.warning}</small> : null}
            </div>
          ) : null}
          <div className="recording-actions">
            {recordingState === "recording" ? (
              <button className="primary-button danger-button" type="button" onClick={stopBrowserRecording}>
                <Square size={16} />
                Stop recording
              </button>
            ) : null}
            {recordingState !== "recording" ? (
          <button className="primary-button" type="button" onClick={() => setActiveView("editor")}>
                Open timeline
              </button>
            ) : null}
            <button className="secondary-button" type="button" onClick={() => setActiveView("home")}>
              Back home
            </button>
          </div>
        </div>
      </section>
    );
  }

  function renderEditor() {
    return (
      <section className="editor-page">
        <header className="editor-topbar">
          <button className="editor-back" type="button" aria-label="Back home" onClick={() => setActiveView("home")}>
            <ChevronLeft size={19} />
          </button>
          <input
            aria-label="Project title"
            className="editor-title-input"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
          />
          <div className="editor-top-actions">
            <div className="view-toggle" aria-label="Editor view mode">
              <button type="button" aria-label="Script view" title="Script view" onClick={() => setEditorTab("script")}>
                <List size={16} />
              </button>
              <button type="button" aria-label="Zoom view" title="Zoom view" onClick={() => setEditorTab("zooms")}>
                <Scissors size={15} />
              </button>
            </div>
            <button className="ghost-icon" type="button" aria-label="Help" title="Help" onClick={() => setActiveView("ask-ai")}>
              <HelpCircle size={18} />
            </button>
            <button className="ghost-icon" type="button" aria-label="Settings" title="Settings" onClick={() => setEditorTab("visuals")}>
              <SlidersHorizontal size={18} />
            </button>
            <button className="ghost-icon" type="button" aria-label="Language" title="Language" onClick={() => setEditorTab("voice")}>
              <Languages size={18} />
            </button>
            <button className="ghost-icon" type="button" aria-label="More actions" title="More actions" onClick={() => setEditorTab("elements")}>
              <MoreHorizontal size={18} />
            </button>
            <button className="secondary-button export-button" type="button" disabled={isRendering} onClick={previewRender}>
              {isRendering ? <Loader2 className="spin" size={17} /> : <Download size={17} />}
              Export
            </button>
            <button className="primary-button share-button" type="button" onClick={shareProject}>
              <Share2 size={17} />
              {shareStatus || "Share"}
            </button>
          </div>
        </header>

        <div className="editor-shell">
          <aside className="editor-side-panel">
            <nav className="editor-tabs" aria-label="Editing tools">
              {editorTabs.map((tab) => (
                <button
                  className={`editor-tab ${editorTab === tab.key ? "is-active" : ""}`}
                  key={tab.key}
                  type="button"
                  onClick={() => setEditorTab(tab.key)}
                >
                  <tab.icon size={16} />
                  {tab.label}
                </button>
              ))}
            </nav>

            <div className="editor-tab-panel">
              {editorTab === "script" ? (
                <>
                  <div className="script-toolbar">
                    <button className="secondary-button compact-button" type="button" onClick={applyScriptToCaptions}>
                      <Plus size={16} />
                      Add
                    </button>
                    <button className="icon-button" type="button" aria-label="AI cleanup" title="AI cleanup">
                      <Sparkles size={16} />
                    </button>
                    <button className="icon-button" type="button" aria-label="Magic edit" title="Magic edit">
                      <Wand2 size={16} />
                    </button>
                    <button className="icon-button" type="button" aria-label="Search script" title="Search script">
                      <Search size={16} />
                    </button>
                  </div>
                  <div className="scene-list">
                    {editorScenes.map((scene) => (
                      <article className="scene-row" key={scene.clip.id}>
                        <span className="scene-time">{formatTimelineTime(scene.startsAt)}</span>
                        <textarea
                          aria-label={`Script for ${scene.clip.file}`}
                          value={scene.text}
                          onChange={(event) =>
                            setTimeline({
                              ...timeline,
                              clips: timeline.clips.map((clip) =>
                                clip.id === scene.clip.id
                                  ? { ...clip, caption: event.target.value }
                                  : clip,
                              ),
                            })
                          }
                        />
                      </article>
                    ))}
                  </div>
                  {enhancement ? (
                    <button className="refresh-voiceover" type="button" onClick={applyScriptToCaptions}>
                      <RefreshCcw size={16} />
                      Refresh voiceover
                    </button>
                  ) : null}
                </>
              ) : null}

              {editorTab === "voice" ? (
                <div className="tool-panel">
                  <label className="toggle-row">
                    <span>Use Original Voice</span>
                    <input
                      checked={useOriginalVoice}
                      type="checkbox"
                      onChange={(event) => setUseOriginalVoice(event.target.checked)}
                    />
                  </label>
                  <label className="field-stack">
                    <span>Select voiceover</span>
                    <select
                      value={selectedVoice}
                      onChange={(event) => setSelectedVoice(event.target.value as (typeof voiceOptions)[number])}
                    >
                      {voiceOptions.map((voice) => (
                        <option key={voice} value={voice}>
                          {voice}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="link-button" type="button" onClick={() => setVoiceStatus("Custom voice library will connect to saved Azure/ElevenLabs voices.")}>
                    Manage Custom Voices
                  </button>
                  <button className="primary-button tool-primary" type="button" onClick={applyScriptToCaptions}>
                    <RefreshCcw size={16} />
                    Refresh voiceover
                  </button>
                  {voiceStatus || enhancement?.voiceoverFile || enhancement?.warning ? (
                    <p className="tool-status">{voiceStatus || enhancement?.voiceoverFile || enhancement?.warning}</p>
                  ) : null}
                </div>
              ) : null}

              {editorTab === "music" ? (
                <div className="tool-panel">
                  <label className="toggle-row">
                    <span>Add background music</span>
                    <input
                      checked={musicEnabled}
                      type="checkbox"
                      onChange={(event) => setMusicEnabled(event.target.checked)}
                    />
                  </label>
                  <label className="field-stack">
                    <span>Select background music</span>
                    <select
                      disabled={!musicEnabled}
                      value={selectedMusic}
                      onChange={(event) => setSelectedMusic(event.target.value as (typeof musicTracks)[number])}
                    >
                      {musicTracks.map((track) => (
                        <option key={track} value={track}>
                          {track}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="range-field">
                    <span>Modify music volume</span>
                    <input
                      disabled={!musicEnabled}
                      max="10"
                      min="0"
                      type="range"
                      value={musicVolume}
                      onChange={(event) => setMusicVolume(Number(event.target.value))}
                    />
                    <strong>{musicVolume}</strong>
                  </label>
                  <p className="tool-status">
                    {musicEnabled ? `${selectedMusic} will mix under the narration at volume ${musicVolume}.` : "Background music is off."}
                  </p>
                </div>
              ) : null}

              {editorTab === "visuals" ? (
                <div className="tool-panel">
                  <div className="subtabs">
                    <button className={visualPanel === "background" ? "is-active" : ""} type="button" onClick={() => setVisualPanel("background")}>
                      Background
                    </button>
                    <button className={visualPanel === "scenes" ? "is-active" : ""} type="button" onClick={() => setVisualPanel("scenes")}>
                      Scenes
                    </button>
                  </div>
                  {visualPanel === "background" ? (
                    <>
                      <label className="toggle-row">
                        <span>Add background</span>
                        <input
                          checked={backgroundEnabled}
                          type="checkbox"
                          onChange={(event) => setBackgroundEnabled(event.target.checked)}
                        />
                      </label>
                      <div className="panel-heading-row">
                        <span>Default background</span>
                        <button className="link-button" type="button" onClick={() => setSelectedBackground((selectedBackground + 1) % backgroundPresets.length)}>
                          View all
                        </button>
                      </div>
                      <div className="background-grid">
                        {backgroundPresets.map((preset, index) => (
                          <button
                            aria-label={`Background ${index + 1}`}
                            className={selectedBackground === index ? "is-selected" : ""}
                            key={preset}
                            style={{ background: preset }}
                            type="button"
                            onClick={() => {
                              setBackgroundEnabled(true);
                              setSelectedBackground(index);
                            }}
                          />
                        ))}
                      </div>
                      <button className="upload-background" type="button" onClick={() => setBackgroundEnabled(true)}>
                        <Download size={18} />
                      </button>
                      <label className="field-stack">
                        <span>Shadows</span>
                        <select value={shadowStyle} onChange={(event) => setShadowStyle(event.target.value)}>
                          <option>None</option>
                          <option>Soft</option>
                          <option>Medium</option>
                        </select>
                      </label>
                      <label className="range-field">
                        <span>Rounded corners</span>
                        <input max="32" min="0" type="range" value={cornerRadius} onChange={(event) => setCornerRadius(Number(event.target.value))} />
                        <strong>{cornerRadius}</strong>
                      </label>
                      <label className="range-field">
                        <span>Padding</span>
                        <input max="32" min="0" type="range" value={framePadding} onChange={(event) => setFramePadding(Number(event.target.value))} />
                        <strong>{framePadding}</strong>
                      </label>
                    </>
                  ) : (
                    <div className="scene-settings">
                      {editorScenes.map((scene, index) => (
                        <button className="scene-setting-row" key={scene.clip.id} type="button" onClick={() => setEditorTab("script")}>
                          <span>{index === 0 ? "Intro Scene" : `Scene ${index + 1}`}</span>
                          <small>{Math.max(scene.clip.trimEnd - scene.clip.trimStart, 0)}s</small>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {editorTab === "zooms" ? (
                <div className="tool-panel">
                  <label className="toggle-row">
                    <span>Add zoom effects</span>
                    <input
                      checked={zoomEnabled}
                      type="checkbox"
                      onChange={(event) => setZoomEnabled(event.target.checked)}
                    />
                  </label>
                  <div className="info-box">
                    <Info size={16} />
                    <div>
                      <strong>Try zoom in timeline</strong>
                      <p>Hover over the timeline to add the zoom or click one here to edit it.</p>
                    </div>
                  </div>
                  <button className="primary-button tool-primary" type="button" onClick={addZoomEffect}>
                    <Plus size={16} />
                    Add zoom
                  </button>
                  <div className="effect-list">
                    {timeline.clips.flatMap((clip) => clip.zoom.map((zoom, index) => (
                      <button className="effect-row" key={`${clip.id}-${index}`} type="button">
                        <span>Zoom {index + 1}</span>
                        <small>{formatTimelineTime(zoom.start)} - {formatTimelineTime(zoom.end)} · {zoom.scale.toFixed(2)}x</small>
                      </button>
                    )))}
                  </div>
                </div>
              ) : null}

              {editorTab === "avatar" ? (
                <div className="tool-panel">
                  <label className="toggle-row">
                    <span>
                      Enable AI avatar
                      <small className="duration-pill">~1m</small>
                    </span>
                    <input
                      checked={avatarEnabled}
                      type="checkbox"
                      onChange={(event) => setAvatarEnabled(event.target.checked)}
                    />
                  </label>
                  <div className="panel-heading-row">
                    <span>Select an AI avatar</span>
                    <button className="link-button" type="button" onClick={() => setSelectedAvatar((selectedAvatar + 1) % avatarOptions.length)}>
                      View all
                    </button>
                  </div>
                  <div className="avatar-grid">
                    {avatarOptions.map((avatar, index) => (
                      <button
                        aria-label={`AI avatar ${index + 1}`}
                        className={selectedAvatar === index ? "is-selected" : ""}
                        key={avatar}
                        style={{ background: avatar }}
                        type="button"
                        onClick={() => {
                          setAvatarEnabled(true);
                          setSelectedAvatar(index);
                        }}
                      />
                    ))}
                  </div>
                  <label className="color-row">
                    <span>Set a background color</span>
                    <input type="color" value={avatarColor} onChange={(event) => setAvatarColor(event.target.value)} />
                    <input value={avatarColor} onChange={(event) => setAvatarColor(event.target.value)} />
                  </label>
                  <button className="wide-action" type="button" onClick={() => setAvatarEnabled(true)}>
                    Modify avatar layouts
                    <ChevronLeft size={16} />
                  </button>
                  <button className="link-button" type="button" onClick={() => setAvatarEnabled(true)}>
                    Manage Custom Avatars
                  </button>
                </div>
              ) : null}

              {editorTab === "elements" ? (
                <div className="tool-panel">
                  <span className="tool-label">Add Elements</span>
                  <div className="element-actions">
                    <button type="button" onClick={() => addEditorElement("rectangle")}>
                      <Square size={17} />
                      Rectangle
                    </button>
                    <button type="button" onClick={() => addEditorElement("circle")}>
                      <Circle size={17} />
                      Circle
                    </button>
                    <button type="button" onClick={() => addEditorElement("blur")}>
                      <Sparkles size={17} />
                      Blur
                    </button>
                    <button type="button" onClick={() => addEditorElement("text")}>
                      <Type size={17} />
                      Text
                    </button>
                    <button type="button" onClick={() => addEditorElement("image")}>
                      <ImageIcon size={17} />
                      Image
                    </button>
                  </div>
                  <span className="tool-label">Added Elements</span>
                  <div className="effect-list">
                    {editorElements.map((element) => (
                      <button className="effect-row" key={element.id} type="button" onClick={() => setEditorElements((current) => current.filter((item) => item.id !== element.id))}>
                        <span>{element.label}</span>
                        <small>0:00 - 0:05 · click to remove</small>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </aside>

          <section className="editor-preview-panel">
            <div className="preview-stage">
              <div className="preview-shell" style={previewShellStyle}>
                {previewUrl ? (
                  <video className="preview-video" src={previewUrl} controls style={previewMediaStyle} />
                ) : (
                  <div className="preview-placeholder" style={previewMediaStyle}>
                    <Video size={42} />
                    <h2>No recording loaded</h2>
                    <p>Start recording or upload a video to preview the edited walkthrough.</p>
                  </div>
                )}
                <span className="made-with">Made with Flow Studio</span>
                {musicEnabled ? <span className="music-badge"><Music size={14} /> {selectedMusic} · {musicVolume}</span> : null}
                {zoomEnabled && timeline.clips.some((clip) => clip.zoom.length > 0) ? <span className="zoom-badge"><Search size={14} /> Zoom active</span> : null}
                {avatarEnabled ? (
                  <span className="avatar-preview" style={{ background: avatarColor }}>
                    <span style={{ background: avatarOptions[selectedAvatar] }} />
                  </span>
                ) : null}
                {editorElements.map((element, index) => (
                  <span
                    className={`preview-element preview-element-${element.type}`}
                    key={element.id}
                    style={{ transform: `translate(${index * 10}px, ${index * 8}px)` }}
                  >
                    {element.type === "text" ? "Note" : null}
                    {element.type === "image" ? <ImageIcon size={18} /> : null}
                  </span>
                ))}
              </div>
            </div>

            <div className="player-bar">
              <button className="play-button" type="button" aria-label="Play preview" title="Play preview">
                <Video size={18} />
              </button>
              <span className="player-time">0:00 / {formatTimelineTime(totalDuration || 10)}</span>
              <Volume2 size={18} />
              <div className="timeline-scrub" aria-hidden="true">
                <span style={{ width: "55%" }} />
              </div>
              <button className="ghost-icon" type="button" aria-label="Fullscreen preview" title="Fullscreen preview">
                <Eye size={17} />
              </button>
            </div>

            <div className="scene-strip">
              {editorScenes.map((scene) => (
                <button className="scene-chip" type="button" key={scene.clip.id} onClick={() => setEditorTab("script")}>
                  {formatTimelineTime(scene.startsAt)}
                </button>
              ))}
              <button className="add-scene-button" type="button" onClick={addScene}>
                <Plus size={15} />
                Add Scenes
              </button>
            </div>

            {error ? <p className="error">{error}</p> : null}

            {job ? (
              <section className="export-ready">
                <strong>Export preview ready</strong>
                <span>
                  {job.commandPreview.length} FFmpeg steps prepared · {selectedVoice.split(" - ")[0]} · {musicEnabled ? selectedMusic : "No music"}
                </span>
              </section>
            ) : null}
          </section>
        </div>
      </section>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="logo">
          <span className="logo-mark">
            <Clapperboard size={18} />
          </span>
          <span>Flow Studio</span>
        </div>

        <nav className="nav-list" aria-label="Primary navigation">
          {navItems.map((item) => {
            const isDisabled = item.disabled;
            const isActive = !isDisabled && activeView === item.key;
            return (
              <button
                className={`nav-item ${isActive ? "is-active" : ""}`}
                disabled={isDisabled}
                key={item.label}
                title={isDisabled ? "Coming soon" : item.label}
                type="button"
                onClick={() => {
                  if (!isDisabled) {
                    setActiveView(item.key as View);
                  }
                }}
              >
                <item.icon size={16} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <section className={`main-area ${activeView === "editor" ? "is-editor" : ""}`}>
        {activeView !== "editor" ? (
          <header className="utility-bar">
            <button className="ghost-icon" type="button" aria-label="Help" title="Help">
              <HelpCircle size={18} />
            </button>
            <button className="ghost-icon" type="button" aria-label="Settings" title="Settings">
              <Settings size={18} />
            </button>
            <button className="create-button" type="button" onClick={() => setActiveView("home")}>
              <Plus size={17} />
              Create new
            </button>
          </header>
        ) : null}

        {activeView === "home" ? renderHome() : null}
        {activeView === "ask-ai" ? renderAskAi() : null}
        {activeView === "library" ? renderLibrary() : null}
        {activeView === "skills" ? renderSkills() : null}
        {activeView === "recording" ? renderRecording() : null}
        {activeView === "editor" ? renderEditor() : null}

        {activeView !== "editor" ? (
          <button className="floating-send" type="button" aria-label="Ask AI" onClick={() => setActiveView("ask-ai")}>
            <Send size={19} />
          </button>
        ) : null}
      </section>

      {showRecordingModal ? (
        <div className="modal-backdrop" role="presentation">
          <section className="recording-modal" role="dialog" aria-modal="true" aria-labelledby="recording-title">
            <span className="modal-info-icon">
              <Info size={32} />
            </span>
            <h2 id="recording-title">Speak While Recording</h2>
            <p>Explain what you're doing as if you're talking to a friend. Your audio will help generate the AI script.</p>
            <p>No need to be perfect - AI will handle the rest.</p>
            <button className="create-button" type="button" onClick={confirmRecording}>
              Got it, let's start!
            </button>
          </section>
        </div>
      ) : null}

      {showCreateVideoModal ? (
        <div className="modal-backdrop" role="presentation">
          <section className="create-video-modal" role="dialog" aria-modal="true" aria-labelledby="create-video-title">
            <div className="modal-heading">
              <h2 id="create-video-title">Create a Video</h2>
              <p>Create professional product videos with AI assistance</p>
            </div>
            <div className="create-video-options">
              <button
                className="create-video-option"
                type="button"
                onClick={() => {
                  setShowCreateVideoModal(false);
                  startRecording();
                }}
              >
                <span className="option-illustration">
                  <Video size={44} />
                </span>
                <strong>Record your screen</strong>
                <small>Capture any process and get a professional video instantly.</small>
              </button>
              <div className="create-video-option upload-option">
                <span className="option-illustration">
                  <Boxes size={44} />
                </span>
                <strong>Upload an existing recording</strong>
                <small>Drop an existing meeting or screen recording and get a cleaned up video.</small>
                <VideoDropzone onUploaded={(videos) => {
                  addUploadedVideos(videos);
                  setShowCreateVideoModal(false);
                }} />
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
