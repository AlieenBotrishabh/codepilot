const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Session token ───────────────────────────────────────────────────────────
// Stored in localStorage rather than an httpOnly cookie because the frontend
// (Vercel) and API (Render) are separate origins: a cookie would need
// SameSite=None with cross-site credentials, which is both more fragile and
// broader in scope than a bearer token sent explicitly per request.
const TOKEN_KEY = "cprag-session";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

/** Throw a useful message, preferring the API's `detail` field. */
async function fail(res: Response, fallback: string): Promise<never> {
  let detail = fallback;
  try {
    const body = await res.json();
    detail = body.detail || fallback;
  } catch {
    /* non-JSON error body — keep the fallback */
  }
  // A stale or rotated session should log the user out rather than leaving the
  // UI in a half-authenticated state that keeps failing.
  if (res.status === 401) clearToken();
  throw new Error(detail);
}

export interface RepoInfo {
  repo_id: string;
  name: string;
  description?: string;
  file_count: number;
  chunk_count: number;
  languages: string[];
  status: "indexing" | "ready" | "error";
  created_at: string;
  indexed_at?: string;
}

export interface Message {
  message_id: string;
  thread_id: string;
  repo_id: string;
  role: "user" | "assistant";
  content: string;
  mode?: string;
  citations: Array<{
    file_path: string;
    snippet: string;
    score: number;
  }>;
  patch?: string;
  plan?: string;
  created_at: string;
}

export interface Thread {
  thread_id: string;
  repo_id: string;
  title?: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface JobStatus {
  job_id: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  message?: string;
  error?: string;
}

export interface AuthUser {
  user_id: string;
  login: string;
  name?: string;
  email?: string;
  avatar_url?: string;
}

export interface AuthState {
  authenticated: boolean;
  user: AuthUser | null;
  auth_required: boolean;
  github_oauth_configured: boolean;
}

export const api = {
  // ── Authentication ─────────────────────────────────────────────────────────
  /** Full-page navigation target that starts the GitHub OAuth handshake. */
  githubLoginUrl(): string {
    return `${API_BASE}/auth/github/login`;
  },

  async getAuthState(): Promise<AuthState> {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
    if (!res.ok) {
      // Never let an auth probe break page render — treat failure as signed out.
      return {
        authenticated: false,
        user: null,
        auth_required: false,
        github_oauth_configured: false,
      };
    }
    return res.json();
  },

  async logout(): Promise<void> {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: authHeaders(),
      });
    } finally {
      // Sessions are stateless JWTs, so discarding the client copy IS the
      // logout. Done in `finally` so a network error still signs the user out.
      clearToken();
    }
  },

  // ── Repositories ───────────────────────────────────────────────────────────
  async uploadRepo(file?: File, githubUrl?: string): Promise<{ repo_id: string; name: string; job_id: string }> {
    const formData = new FormData();
    if (file) {
      formData.append("file", file);
    }
    if (githubUrl) {
      formData.append("github_url", githubUrl);
    }

    const res = await fetch(`${API_BASE}/repos/upload`, {
      method: "POST",
      headers: authHeaders(),
      body: formData,
    });

    if (!res.ok) await fail(res, "Failed to upload repository.");
    return res.json();
  },

  async localIngest(path: string): Promise<{ repo_id: string; name: string; job_id: string }> {
    const res = await fetch(`${API_BASE}/repos/local`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ path }),
    });

    if (!res.ok) await fail(res, "Failed to ingest local path.");
    return res.json();
  },

  async listRepos(): Promise<RepoInfo[]> {
    const res = await fetch(`${API_BASE}/repos`, { headers: authHeaders() });
    if (!res.ok) await fail(res, "Failed to load repositories.");
    const data = await res.json();
    return data.repos;
  },

  async deleteRepo(repoId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/repos/${repoId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!res.ok) await fail(res, "Failed to delete repository.");
  },

  // ── Chat ───────────────────────────────────────────────────────────────────
  async sendMessage(params: {
    query: string;
    repo_id: string;
    thread_id?: string;
    mode?: string;
  }): Promise<{
    thread_id: string;
    answer: string;
    citations: any[];
    plan?: string;
    patch?: string;
    mode: string;
  }> {
    const res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(params),
    });

    if (!res.ok) await fail(res, "Error communicating with AI agent.");
    return res.json();
  },

  async listThreads(repoId: string): Promise<Thread[]> {
    const res = await fetch(`${API_BASE}/threads/${repoId}`, { headers: authHeaders() });
    if (!res.ok) await fail(res, "Failed to load threads.");
    const data = await res.json();
    return data.threads;
  },

  async listMessages(threadId: string): Promise<Message[]> {
    const res = await fetch(`${API_BASE}/threads/${threadId}/messages`, { headers: authHeaders() });
    if (!res.ok) await fail(res, "Failed to load conversation messages.");
    const data = await res.json();
    return data.messages;
  },

  async deleteThread(threadId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/threads/${threadId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!res.ok) await fail(res, "Failed to delete thread.");
  },

  // ── Codebase Files & Patch Application ─────────────────────────────────────
  async listRepoFiles(repoId: string): Promise<string[]> {
    const res = await fetch(`${API_BASE}/repos/${repoId}/files`, { headers: authHeaders() });
    if (!res.ok) await fail(res, "Failed to retrieve file list.");
    const data = await res.json();
    return data.files;
  },

  async getRepoFileContent(repoId: string, path: string): Promise<string> {
    const res = await fetch(
      `${API_BASE}/repos/${repoId}/files/content?path=${encodeURIComponent(path)}`,
      { headers: authHeaders() }
    );
    if (!res.ok) await fail(res, `Failed to load file: ${path}`);
    const data = await res.json();
    return data.content;
  },

  async applyPatch(repoId: string, patch: string): Promise<{ message: string, job_id: string, affected_files: string[] }> {
    const res = await fetch(`${API_BASE}/patch/apply`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ repo_id: repoId, patch }),
    });
    if (!res.ok) await fail(res, "Failed to apply code patch.");
    return res.json();
  },

  getDownloadUrl(repoId: string): string {
    return `${API_BASE}/repos/${repoId}/download`;
  },

  // ── Background Jobs ────────────────────────────────────────────────────────
  async getJobStatus(jobId: string): Promise<JobStatus> {
    const res = await fetch(`${API_BASE}/jobs/${jobId}`, { headers: authHeaders() });
    if (!res.ok) await fail(res, "Failed to check job progress.");
    return res.json();
  },
};
