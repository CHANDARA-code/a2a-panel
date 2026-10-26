export type TaskStatus = "running" | "completed" | "failed" | "cancelled" | "stale";

export interface Task {
  id: string;
  role: string;
  workspace: string;
  startedAt: string;
  finishedAt: string | null;
  updatedAt: string;
  durationMs: number | null;
  status: TaskStatus;
  exitCode: string | null;
  sizeBytes: number;
  cancellable: boolean;
  cancelRequested: boolean;
  error: string | null;
  preset?: string | null;
  preferences?: string[];
  promptPreview?: string;
  prompt?: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  tags: string[];
}

export interface RolesResponse {
  roles: Role[];
  modes: string[];
  efforts: string[];
}

export interface Health {
  status: string;
  uptimeSeconds: number;
  running: number;
  pid: number;
}

export interface DispatchInput {
  role: string;
  workspace: string;
  prompt: string;
  mode: string;
  effort: string;
  preset?: string | null;
}

export interface PresetFileSummary {
  name: string;
  roles: string[] | null;
}

export interface PresetSummary {
  id: string;
  title: string;
  description: string;
  isDefault: boolean;
  files: PresetFileSummary[];
}

export interface PresetFile {
  name: string;
  content: string;
}

export interface Preset extends Omit<PresetSummary, "files"> {
  files: (PresetFile & { roles: string[] | null })[];
}

export interface PresetsResponse {
  presets: PresetSummary[];
  templates: Omit<PresetSummary, "isDefault">[];
  defaultPreset: string | null;
}

export interface CreatePresetInput {
  id: string;
  title?: string;
  template?: string;
  from?: string;
}

export interface PromptPreview {
  prompt: string;
  preset: string | null;
  files: { name: string; source: "preset" | "workspace" }[];
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function readToken(): string {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="a2a-token"]')?.content ?? "";
  if (meta && meta !== "__A2A_TOKEN__") return meta;
  return import.meta.env.VITE_A2A_TOKEN ?? "";
}

async function request<T>(path: string, init: RequestInit = {}, parse: "json" | "text" = "json"): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.method && init.method !== "GET") {
    headers.set("X-A2A-Token", readToken());
    if (init.body) headers.set("Content-Type", "application/json");
  }
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, cache: "no-store" });
  } catch {
    throw new ApiError("Server unreachable", 0);
  }
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (body?.error) message = String(body.error);
    } catch {}
    throw new ApiError(message, response.status);
  }
  return (parse === "text" ? response.text() : response.json()) as Promise<T>;
}

export const api = {
  health: () => request<Health>("/api/health"),
  roles: () => request<RolesResponse>("/api/roles"),
  workspaces: () => request<{ workspaces: string[] }>("/api/workspaces").then((r) => r.workspaces),
  tasks: () => request<{ tasks: Task[] }>("/api/tasks").then((r) => r.tasks),
  task: (id: string) => request<{ task: Task }>(`/api/tasks/${id}`).then((r) => r.task),
  log: (id: string) => request<string>(`/api/tasks/${id}/log`, {}, "text"),
  dispatch: (input: DispatchInput) =>
    request<{ taskId: string }>("/api/tasks", { method: "POST", body: JSON.stringify(input) }),
  cancel: (id: string) => request<{ id: string; status: string }>(`/api/tasks/${id}/cancel`, { method: "POST" }),
  presets: () => request<PresetsResponse>("/api/presets"),
  preset: (id: string) => request<{ preset: Preset }>(`/api/presets/${id}`).then((r) => r.preset),
  createPreset: (input: CreatePresetInput) =>
    request<{ preset: Preset }>("/api/presets", { method: "POST", body: JSON.stringify(input) }).then((r) => r.preset),
  savePreset: (id: string, input: { title: string; description: string; files: PresetFile[] }) =>
    request<{ preset: Preset }>(`/api/presets/${id}`, { method: "PUT", body: JSON.stringify(input) }).then((r) => r.preset),
  deletePreset: (id: string) => request<{ deleted: string }>(`/api/presets/${id}`, { method: "DELETE" }),
  setDefaultPreset: (id: string, isDefault: boolean) =>
    request<{ defaultPreset: string | null }>(`/api/presets/${id}/default`, { method: isDefault ? "POST" : "DELETE" }),
  previewPrompt: (input: { role: string; workspace: string; prompt: string; preset: string | null }) =>
    request<PromptPreview>("/api/prompt-preview", { method: "POST", body: JSON.stringify(input) }),
};
