"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Bot,
  Boxes,
  CalendarDays,
  Clapperboard,
  Captions,
  Download,
  Eye,
  FileText,
  HelpCircle,
  Home as HomeIcon,
  Info,
  LayoutTemplate,
  Loader2,
  Mic,
  MoreHorizontal,
  Plus,
  Radio,
  Scissors,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  Video,
  Volume2,
  Wand2,
} from "lucide-react";
import { ClipList } from "@/components/clip-list";
import { VideoDropzone } from "@/components/video-dropzone";
import { createProject, createRenderJob, enhanceRecording, uploadVideos } from "@/lib/api";
import type {
  EnhancedRecording,
  ProjectPayload,
  RenderJob,
  Timeline,
  UploadedVideo,
} from "@/lib/types";

type View = "home" | "ask-ai" | "library" | "skills" | "recording";
type SkillTab = "video" | "doc";
type RecordingState = "idle" | "starting" | "recording" | "processing" | "ready" | "error";
type EditMode = "trim" | "captions" | "cleanup" | "voiceover" | "export";

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

const editModes = [
  {
    key: "trim",
    title: "Trim",
    body: "Cut dead air and reorder clips.",
    icon: Scissors,
  },
  {
    key: "captions",
    title: "Captions",
    body: "Edit captions and on-screen text.",
    icon: Captions,
  },
  {
    key: "cleanup",
    title: "AI Cleanup",
    body: "Prepare script, cleanup plan, and polish.",
    icon: Wand2,
  },
  {
    key: "voiceover",
    title: "Voiceover",
    body: "Use Azure or ElevenLabs narration.",
    icon: Volume2,
  },
  {
    key: "export",
    title: "Export",
    body: "Generate the final MP4 package.",
    icon: Download,
  },
] as const;

export default function Home() {
  const [activeView, setActiveView] = useState<View>("home");
  const [skillTab, setSkillTab] = useState<SkillTab>("video");
  const [projectName, setProjectName] = useState("First MVP render");
  const [timeline, setTimeline] = useState<Timeline>(initialTimeline);
  const [job, setJob] = useState<RenderJob | null>(null);
  const [error, setError] = useState("");
  const [isRendering, setIsRendering] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [showRecordingModal, setShowRecordingModal] = useState(false);
  const [showCreateVideoModal, setShowCreateVideoModal] = useState(false);
  const [editMode, setEditMode] = useState<EditMode>("trim");
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
      setShowEditor(true);
    } catch (caught) {
      setRecordingState("error");
      setRecordingError(caught instanceof Error ? caught.message : "Recording upload failed.");
    } finally {
      recorderRef.current = null;
      recordingChunksRef.current = [];
    }
  }

  async function previewRender() {
    setShowEditor(true);
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
    setShowEditor(true);
    setEditMode("trim");
  }

  function applyScriptToCaptions() {
    if (!enhancement?.script) {
      return;
    }

    setTimeline((current) => ({
      ...current,
      clips: current.clips.map((clip, index) => ({
        ...clip,
        caption: index === 0 ? enhancement.script : clip.caption,
      })),
    }));
    setEditMode("captions");
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
      setShowEditor(true);
      setActiveView("home");
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

        {showEditor ? renderEditor() : null}
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
        <button className="content-card" type="button" onClick={() => setShowEditor(true)}>
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
        {showEditor ? renderEditor() : null}
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
          <button className="primary-button" type="button" onClick={() => setShowEditor(true)}>
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
      <section className="editor-workspace">
        <div className="editor-header">
          <div>
            <h2>Timeline workspace</h2>
            <p>Uploaded clips appear here for trimming, captions, and export preview.</p>
          </div>
          <button
            className="primary-button"
            type="button"
            disabled={isRendering}
            onClick={previewRender}
          >
            {isRendering ? (
              <Loader2 className="spin" size={18} />
            ) : (
              <Download size={18} />
            )}
            Export preview
          </button>
        </div>

        <section className="settings-bar">
          <label>
            <span>Project</span>
            <input
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
            />
          </label>
          <label>
            <span>Resolution</span>
            <select
              value={timeline.output.resolution}
              onChange={(event) =>
                setTimeline({
                  ...timeline,
                  output: {
                    ...timeline.output,
                    resolution: event.target.value,
                  },
                })
              }
            >
              <option value="1920x1080">1920x1080</option>
              <option value="1080x1920">1080x1920</option>
              <option value="1280x720">1280x720</option>
            </select>
          </label>
          <label>
            <span>FPS</span>
            <input
              min="24"
              max="60"
              type="number"
              value={timeline.output.fps}
              onChange={(event) =>
                setTimeline({
                  ...timeline,
                  output: {
                    ...timeline.output,
                    fps: Number(event.target.value),
                  },
                })
              }
            />
          </label>
        </section>

        <section className="edit-options" aria-label="Editing options">
          {editModes.map((mode) => (
            <button
              className={`edit-option ${editMode === mode.key ? "is-active" : ""}`}
              key={mode.key}
              type="button"
              onClick={() => setEditMode(mode.key)}
            >
              <span>
                <mode.icon size={18} />
              </span>
              <strong>{mode.title}</strong>
              <small>{mode.body}</small>
            </button>
          ))}
        </section>

        <section className="edit-detail panel">
          {editMode === "trim" ? (
            <div>
              <h2>Trim and arrange</h2>
              <p>Use the timeline rows below to set clip start/end times, reorder clips, and remove unwanted sections.</p>
            </div>
          ) : null}
          {editMode === "captions" ? (
            <div>
              <h2>Captions</h2>
              <p>Edit caption text directly in the timeline. Captions will be burned into the exported video in the next render step.</p>
            </div>
          ) : null}
          {editMode === "cleanup" ? (
            <div>
              <h2>AI cleanup</h2>
              <p>Flow Studio prepares a cleaned-up script and render plan from your recording.</p>
              {enhancement ? (
                <div className="script-box">
                  <strong>Generated script</strong>
                  <p>{enhancement.script}</p>
                  <button className="secondary-button" type="button" onClick={applyScriptToCaptions}>
                    Apply to captions
                  </button>
                </div>
              ) : (
                <p className="muted-note">Record or upload a video to generate an AI cleanup plan.</p>
              )}
            </div>
          ) : null}
          {editMode === "voiceover" ? (
            <div>
              <h2>Voiceover</h2>
              <p>Azure or ElevenLabs TTS runs on the backend using your local keys. Generated voiceovers appear in the AI cleanup summary.</p>
              {enhancement?.voiceoverFile ? (
                <p className="muted-note">Voiceover ready: {enhancement.voiceoverFile}</p>
              ) : (
                <p className="muted-note">{enhancement?.warning ?? "No voiceover generated yet."}</p>
              )}
            </div>
          ) : null}
          {editMode === "export" ? (
            <div className="export-edit-row">
              <div>
                <h2>Export</h2>
                <p>Preview the backend render plan now. Full MP4 render execution is the next pipeline step.</p>
              </div>
              <button className="primary-button" type="button" disabled={isRendering} onClick={previewRender}>
                {isRendering ? <Loader2 className="spin" size={18} /> : <Download size={18} />}
                Export preview
              </button>
            </div>
          ) : null}
        </section>

        <ClipList
          clips={timeline.clips}
          onChange={(clips) => setTimeline({ ...timeline, clips })}
        />

        {error ? <p className="error">{error}</p> : null}

        {job ? (
          <section className="panel export-summary">
            <div className="panel-heading">
              <div>
                <h2>Export preview ready</h2>
                <p>{job.commandPreview.length} FFmpeg steps prepared</p>
              </div>
            </div>
            <p className="summary-copy">
              The backend accepted the timeline and prepared the render plan. The next implementation step is executing this job and returning a downloadable MP4.
            </p>
          </section>
        ) : null}
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

      <section className="main-area">
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

        {activeView === "home" ? renderHome() : null}
        {activeView === "ask-ai" ? renderAskAi() : null}
        {activeView === "library" ? renderLibrary() : null}
        {activeView === "skills" ? renderSkills() : null}
        {activeView === "recording" ? renderRecording() : null}

        <button className="floating-send" type="button" aria-label="Ask AI" onClick={() => setActiveView("ask-ai")}>
          <Send size={19} />
        </button>
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
