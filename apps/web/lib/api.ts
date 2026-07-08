import type { EnhancedRecording, ProjectPayload, RenderJob, UploadedVideo } from "./types";

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

  return response.json() as Promise<ProjectPayload & { id: string }>;
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

export async function enhanceRecording(recording: {
  file: string;
  originalName: string;
  selectedSkills?: string[];
  voice?: string;
}) {
  const response = await fetch(`${API_BASE_URL}/ai/enhance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(recording),
  });

  if (!response.ok) {
    throw await apiError(response);
  }

  return response.json() as Promise<EnhancedRecording>;
}

export function uploadedMediaUrl(file: string) {
  return `${API_BASE_URL}/media/uploads/${encodeURIComponent(file)}`;
}

export function exportedMediaUrl(path: string) {
  return path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
}
