import type {
  Project,
  ProjectNarrationResult,
  ProjectPayload,
  ProjectUpdate,
  RecordingGuide,
  RenderJob,
  UploadedVideo,
} from "./types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8003";

async function apiError(response: Response) {
  const body = await response.text();
  if (response.status === 404) {
    return new Error(
      `API route not found at ${response.url}. Restart the web app with NEXT_PUBLIC_API_BASE_URL=http://localhost:8003. Response: ${body}`,
    );
  }
  return new Error(body);
}

export async function createProject(payload: ProjectPayload) {
  const response = await fetch(`${API_BASE_URL}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await apiError(response);
  }

  return response.json() as Promise<Project>;
}

export async function getProject(projectId: string) {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}`);

  if (!response.ok) {
    throw await apiError(response);
  }

  return response.json() as Promise<Project>;
}

export async function updateProject(projectId: string, payload: ProjectUpdate) {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await apiError(response);
  }

  return response.json() as Promise<Project>;
}

export async function narrateProject(projectId: string) {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/narrate`, {
    method: "POST",
  });

  if (!response.ok) {
    throw await apiError(response);
  }

  return response.json() as Promise<ProjectNarrationResult>;
}

export async function getRenderJob(jobId: string) {
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`);

  if (!response.ok) {
    throw await apiError(response);
  }

  return response.json() as Promise<RenderJob>;
}

export async function pollRenderJob(jobId: string, intervalMs = 1500) {
  for (;;) {
    const job = await getRenderJob(jobId);
    if (job.status === "completed" || job.status === "failed") {
      return job;
    }
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }
}

export async function createRenderJob(projectId: string) {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/render`, {
    method: "POST",
  });

  if (!response.ok) {
    throw await apiError(response);
  }

  return response.json() as Promise<RenderJob>;
}

export async function exportProject(projectId: string) {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/export`, {
    method: "POST",
  });

  if (!response.ok) {
    throw await apiError(response);
  }

  return response.json() as Promise<RenderJob>;
}

export async function uploadVideos(files: File[]) {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));

  const response = await fetch(`${API_BASE_URL}/uploads`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw await apiError(response);
  }

  return response.json() as Promise<UploadedVideo[]>;
}

export async function generateRecordingGuide(recording: {
  file: string;
  originalName: string;
  selectedSkills?: string[];
}) {
  const response = await fetch(`${API_BASE_URL}/ai/guide`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(recording),
  });

  if (!response.ok) {
    throw await apiError(response);
  }

  return response.json() as Promise<RecordingGuide>;
}

export function uploadedMediaUrl(file: string) {
  return `${API_BASE_URL}/media/uploads/${encodeURIComponent(file)}`;
}

export function exportedMediaUrl(path: string) {
  return path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
}
