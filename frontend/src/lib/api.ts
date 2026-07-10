const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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

export const api = {
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
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to upload repository.");
    }
    return res.json();
  },

  async localIngest(path: string): Promise<{ repo_id: string; name: string; job_id: string }> {
    const res = await fetch(`${API_BASE}/repos/local`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to ingest local path.");
    }
    return res.json();
  },

  async listRepos(): Promise<RepoInfo[]> {
    const res = await fetch(`${API_BASE}/repos`);
    if (!res.ok) throw new Error("Failed to load repositories.");
    const data = await res.json();
    return data.repos;
  },

  async deleteRepo(repoId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/repos/${repoId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete repository.");
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Error communicating with AI agent.");
    }
    return res.json();
  },

  async listThreads(repoId: string): Promise<Thread[]> {
    const res = await fetch(`${API_BASE}/threads/${repoId}`);
    if (!res.ok) throw new Error("Failed to load threads.");
    const data = await res.json();
    return data.threads;
  },

  async listMessages(threadId: string): Promise<Message[]> {
    const res = await fetch(`${API_BASE}/threads/${threadId}/messages`);
    if (!res.ok) throw new Error("Failed to load conversation messages.");
    const data = await res.json();
    return data.messages;
  },

  async deleteThread(threadId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/threads/${threadId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete thread.");
  },

  // ── Codebase Files & Patch Application ─────────────────────────────────────
  async listRepoFiles(repoId: string): Promise<string[]> {
    const res = await fetch(`${API_BASE}/repos/${repoId}/files`);
    if (!res.ok) throw new Error("Failed to retrieve file list.");
    const data = await res.json();
    return data.files;
  },

  async getRepoFileContent(repoId: string, path: string): Promise<string> {
    const res = await fetch(`${API_BASE}/repos/${repoId}/files/content?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error(`Failed to load file: ${path}`);
    const data = await res.json();
    return data.content;
  },

  async applyPatch(repoId: string, patch: string): Promise<{ message: string, job_id: string, affected_files: string[] }> {
    const res = await fetch(`${API_BASE}/patch/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_id: repoId, patch }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to apply code patch.");
    }
    return res.json();
  },

  getDownloadUrl(repoId: string): string {
    return `${API_BASE}/repos/${repoId}/download`;
  },

  // ── Background Jobs ────────────────────────────────────────────────────────
  async getJobStatus(jobId: string): Promise<JobStatus> {
    const res = await fetch(`${API_BASE}/jobs/${jobId}`);
    if (!res.ok) throw new Error("Failed to check job progress.");
    return res.json();
  },
};
