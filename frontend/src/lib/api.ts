const API_BASE = "/api";

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
};

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts.token) {
    headers["Authorization"] = `Bearer ${opts.token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, detail.detail ?? "Request failed");
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// --- Auth ---

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

export function login(email: string, password: string): Promise<TokenResponse> {
  return request("/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

export function refreshToken(refresh_token: string): Promise<TokenResponse> {
  return request("/auth/refresh", {
    method: "POST",
    body: { refresh_token },
  });
}

// --- Users ---

export type User = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "operator";
  is_active: boolean;
  created_at: string;
};

export function getMe(token: string): Promise<User> {
  return request("/users/me", { token });
}

export function listUsers(token: string): Promise<User[]> {
  return request("/users", { token });
}

export function createUser(
  token: string,
  data: { email: string; name: string; password: string; role: string },
): Promise<User> {
  return request("/users", { method: "POST", body: data, token });
}

// --- Destinations ---

export type Destination = {
  id: string;
  alias: string;
  storage_type: string;
  path: string;
  is_default: boolean;
  created_by: string;
  created_at: string;
  repo_count: number;
  used_bytes: number;
  available_bytes: number | null;
};

export function listDestinations(token: string): Promise<Destination[]> {
  return request("/destinations", { token });
}

export function createDestination(
  token: string,
  data: { alias: string; path: string; storage_type?: string; is_default?: boolean },
): Promise<Destination> {
  return request("/destinations", { method: "POST", body: data, token });
}

export function updateDestination(
  token: string,
  id: string,
  data: { alias?: string; path?: string; is_default?: boolean },
): Promise<Destination> {
  return request(`/destinations/${id}`, { method: "PATCH", body: data, token });
}

export function deleteDestination(token: string, id: string): Promise<void> {
  return request(`/destinations/${id}`, { method: "DELETE", token });
}

// --- Repositories ---

export type Repository = {
  id: string;
  url: string;
  name: string;
  status: string;
  status_reason: string | null;
  destination_id: string;
  encrypt: boolean;
  cron_expression: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  last_backup_at: string | null;
  next_backup_at: string | null;
};

export function listRepositories(token: string): Promise<Repository[]> {
  return request("/repositories", { token });
}

export function createRepositories(
  token: string,
  data: {
    urls: string[];
    destination_id?: string;
    encrypt?: boolean;
    cron_expression?: string;
  },
): Promise<Repository[]> {
  return request("/repositories", { method: "POST", body: data, token });
}

export function updateRepository(
  token: string,
  id: string,
  data: {
    destination_id?: string;
    encrypt?: boolean;
    cron_expression?: string | null;
  },
): Promise<Repository> {
  return request(`/repositories/${id}`, { method: "PATCH", body: data, token });
}

export function deleteRepository(token: string, id: string): Promise<void> {
  return request(`/repositories/${id}`, { method: "DELETE", token });
}

export function triggerBackup(token: string, repoId: string): Promise<BackupJob> {
  return request(`/repositories/${repoId}/backup`, { method: "POST", token });
}

// --- Snapshots & Restore ---

export type BackupSnapshot = {
  id: string;
  repository_id: string;
  backup_job_id: string;
  destination_id: string;
  artifact_filename: string;
  archive_format: "tar.gz" | "tar.gz.gpg";
  encryption_key_id: string | null;
  label: string | null;
  created_at: string;
};

export type RestoreJob = {
  id: string;
  repository_id: string;
  snapshot_id: string;
  triggered_by: string;
  restore_target_url: string;
  status: "pending" | "running" | "succeeded" | "failed";
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  output_log: string | null;
  created_at: string;
};

export function listSnapshots(
  token: string,
  repoId: string,
): Promise<BackupSnapshot[]> {
  return request(`/repositories/${repoId}/snapshots`, { token });
}

export function triggerRestore(
  token: string,
  repoId: string,
  data: { snapshot_id: string; restore_target_url: string },
): Promise<RestoreJob> {
  return request(`/repositories/${repoId}/restore`, {
    method: "POST",
    body: data,
    token,
  });
}

export function getRestoreJob(
  token: string,
  repoId: string,
  jobId: string,
): Promise<RestoreJob> {
  return request(`/repositories/${repoId}/restore-jobs/${jobId}`, { token });
}

// --- Backup Jobs ---

export type BackupJob = {
  id: string;
  repository_id: string;
  status: string;
  trigger_type: string;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  output_log: string | null;
  backup_size_bytes: number | null;
  created_at: string;
};

export function listBackupJobs(token: string, repoId: string): Promise<BackupJob[]> {
  return request(`/repositories/${repoId}/jobs`, { token });
}

// --- Notification Channels ---

export type NotificationChannel = {
  id: string;
  name: string;
  channel_type: "slack";
  config_data: Record<string, string>;
  enabled: boolean;
  on_backup_failure: boolean;
  on_restore_failure: boolean;
  on_repo_verification_failure: boolean;
  on_disk_space_low: boolean;
  created_by: string;
  created_at: string;
};

export function listNotificationChannels(
  token: string,
): Promise<NotificationChannel[]> {
  return request("/notification-channels", { token });
}

export function createNotificationChannel(
  token: string,
  data: {
    name: string;
    channel_type: "slack";
    config_data: Record<string, string>;
    enabled?: boolean;
    on_backup_failure?: boolean;
    on_restore_failure?: boolean;
    on_repo_verification_failure?: boolean;
    on_disk_space_low?: boolean;
  },
): Promise<NotificationChannel> {
  return request("/notification-channels", { method: "POST", body: data, token });
}

export function updateNotificationChannel(
  token: string,
  id: string,
  data: Partial<{
    name: string;
    config_data: Record<string, string>;
    enabled: boolean;
    on_backup_failure: boolean;
    on_restore_failure: boolean;
    on_repo_verification_failure: boolean;
    on_disk_space_low: boolean;
  }>,
): Promise<NotificationChannel> {
  return request(`/notification-channels/${id}`, {
    method: "PATCH",
    body: data,
    token,
  });
}

export function deleteNotificationChannel(
  token: string,
  id: string,
): Promise<void> {
  return request(`/notification-channels/${id}`, { method: "DELETE", token });
}

export function testNotificationChannel(
  token: string,
  id: string,
): Promise<{ status: string }> {
  return request(`/notification-channels/${id}/test`, {
    method: "POST",
    token,
  });
}

// --- Git Credentials ---

export type GitCredential = {
  id: string;
  name: string;
  credential_type: "pat" | "ssh_key";
  host: string;
  username: string;
  created_by: string;
  created_at: string;
};

export function listGitCredentials(token: string): Promise<GitCredential[]> {
  return request("/git-credentials", { token });
}

export function createGitCredential(
  token: string,
  data: {
    name: string;
    credential_type: "pat" | "ssh_key";
    host: string;
    credential_data: string;
    username?: string;
  },
): Promise<GitCredential> {
  return request("/git-credentials", { method: "POST", body: data, token });
}

export function deleteGitCredential(token: string, id: string): Promise<void> {
  return request(`/git-credentials/${id}`, { method: "DELETE", token });
}

// --- Encryption Keys ---

export type EncryptionKey = {
  id: string;
  name: string;
  backend: string;
  key_data: string;
  created_by: string;
  created_at: string;
};

export function listEncryptionKeys(token: string): Promise<EncryptionKey[]> {
  return request("/encryption-keys", { token });
}

export function createEncryptionKey(
  token: string,
  data: { name: string; backend: string; key_data: string },
): Promise<EncryptionKey> {
  return request("/encryption-keys", { method: "POST", body: data, token });
}

export function deleteEncryptionKey(token: string, id: string): Promise<void> {
  return request(`/encryption-keys/${id}`, { method: "DELETE", token });
}

// --- Settings ---

export type Settings = {
  default_cron_expression: string | null;
  default_encryption_key_id: string | null;
  default_encrypt: boolean;
};

export function getSettings(token: string): Promise<Settings> {
  return request("/settings", { token });
}

export function updateSettings(
  token: string,
  data: {
    default_cron_expression?: string | null;
    default_encryption_key_id?: string | null;
    default_encrypt?: boolean;
  },
): Promise<Settings> {
  return request("/settings", { method: "PATCH", body: data, token });
}

// --- Dashboard ---

export type DailyActivity = {
  date: string;
  succeeded: number;
  failed: number;
  total: number;
};

export function getBackupActivity(
  token: string,
  days: number = 365,
): Promise<DailyActivity[]> {
  return request(`/dashboard/activity?days=${days}`, { token });
}
