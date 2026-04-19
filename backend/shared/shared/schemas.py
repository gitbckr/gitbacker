import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator

from .enums import (
    ArchiveFormat,
    CredentialType,
    EncryptionBackend,
    JobStatus,
    NotificationChannelType,
    RepoPermission,
    RepoStatus,
    StorageType,
    TriggerType,
    UserRole,
)


# --- Auth ---


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


# --- Users ---


class UserCreate(BaseModel):
    email: str
    name: str
    password: str
    role: UserRole = UserRole.OPERATOR

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email address")
        return v


class UserRead(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    role: UserRole
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    name: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None


class UserSelfUpdate(BaseModel):
    """Fields a user may change on their own account. Excludes role / is_active."""

    name: str | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


# --- Destinations ---


class DestinationCreate(BaseModel):
    alias: str
    storage_type: StorageType = StorageType.LOCAL
    path: str
    is_default: bool = False


class DestinationRead(BaseModel):
    id: uuid.UUID
    alias: str
    storage_type: StorageType
    path: str
    is_default: bool
    created_by: uuid.UUID
    created_at: datetime
    repo_count: int = 0
    used_bytes: int = 0
    available_bytes: int | None = None  # None = unknown (e.g. S3 without quota)

    model_config = {"from_attributes": True}


class DestinationUpdate(BaseModel):
    alias: str | None = None
    path: str | None = None
    is_default: bool | None = None


# --- Repositories ---


class RepoCreate(BaseModel):
    urls: list[str]
    destination_id: uuid.UUID | None = None
    encrypt: bool | None = None
    encryption_key_id: uuid.UUID | None = None
    cron_expression: str | None = None

    @field_validator("urls")
    @classmethod
    def validate_urls(cls, v: list[str]) -> list[str]:
        if len(v) > 500:
            raise ValueError("Too many URLs (max 500)")
        for url in v:
            url = url.strip()
            if not url:
                continue
            if not url.startswith(("https://", "http://", "git://", "ssh://", "git@")):
                raise ValueError(f"Invalid URL scheme: {url}")
        return v


class RepoRead(BaseModel):
    id: uuid.UUID
    url: str
    name: str
    status: RepoStatus
    status_reason: str | None
    destination_id: uuid.UUID
    encrypt: bool
    encryption_key_id: uuid.UUID | None
    cron_expression: str | None
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    last_backup_at: datetime | None = None
    next_backup_at: datetime | None = None

    model_config = {"from_attributes": True}


class RepoUpdate(BaseModel):
    destination_id: uuid.UUID | None = None
    encrypt: bool | None = None
    encryption_key_id: uuid.UUID | None = None
    cron_expression: str | None = None


# --- Backup Jobs ---


class BackupJobRead(BaseModel):
    id: uuid.UUID
    repository_id: uuid.UUID
    status: JobStatus
    trigger_type: TriggerType
    started_at: datetime | None
    finished_at: datetime | None
    duration_seconds: int | None
    output_log: str | None
    backup_size_bytes: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Backup Snapshots ---


class BackupSnapshotRead(BaseModel):
    id: uuid.UUID
    repository_id: uuid.UUID
    backup_job_id: uuid.UUID
    destination_id: uuid.UUID
    artifact_filename: str
    archive_format: ArchiveFormat
    encryption_key_id: uuid.UUID | None
    label: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Restore Jobs ---


class RestoreJobCreate(BaseModel):
    snapshot_id: uuid.UUID
    restore_target_url: str

    @field_validator("restore_target_url")
    @classmethod
    def validate_target_url(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("restore_target_url is required")
        if not v.startswith(("https://", "http://", "git://", "ssh://", "git@")):
            raise ValueError(f"Invalid URL scheme: {v}")
        return v


class RestoreJobRead(BaseModel):
    id: uuid.UUID
    repository_id: uuid.UUID
    snapshot_id: uuid.UUID
    triggered_by: uuid.UUID
    restore_target_url: str
    status: JobStatus
    started_at: datetime | None
    finished_at: datetime | None
    duration_seconds: int | None
    output_log: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Restore Previews ---


class RestorePreviewCreate(BaseModel):
    snapshot_id: uuid.UUID
    restore_target_url: str

    @field_validator("restore_target_url")
    @classmethod
    def validate_target_url(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("restore_target_url is required")
        if not v.startswith(("https://", "http://", "git://", "ssh://", "git@")):
            raise ValueError(f"Invalid URL scheme: {v}")
        return v


class RefDiff(BaseModel):
    ref_name: str
    ref_type: str
    action: str
    snapshot_sha: str | None = None
    remote_sha: str | None = None


class RestorePreviewResult(BaseModel):
    branches_created: int = 0
    branches_overwritten: int = 0
    branches_deleted: int = 0
    tags_created: int = 0
    tags_overwritten: int = 0
    tags_deleted: int = 0
    refs: list[RefDiff] = []


class FileDiffStat(BaseModel):
    path: str
    insertions: int
    deletions: int


class DetailedRefDiff(BaseModel):
    ref_name: str
    files: list[FileDiffStat] = []
    total_files: int = 0
    total_insertions: int = 0
    total_deletions: int = 0


class DetailedPreviewResult(BaseModel):
    refs: list[DetailedRefDiff] = []
    total_files: int = 0
    total_insertions: int = 0
    total_deletions: int = 0


class RestorePreviewRead(BaseModel):
    id: uuid.UUID
    snapshot_id: uuid.UUID
    restore_target_url: str
    triggered_by: uuid.UUID
    status: JobStatus
    result_data: RestorePreviewResult | None = None
    error_message: str | None = None
    detail_status: JobStatus | None = None
    detail_data: DetailedPreviewResult | None = None
    detail_error: str | None = None
    created_at: datetime
    finished_at: datetime | None

    model_config = {"from_attributes": True}


# --- Git Credentials ---


class GitCredentialCreate(BaseModel):
    name: str
    credential_type: CredentialType
    host: str
    credential_data: str
    username: str = "x-access-token"

    @field_validator("host")
    @classmethod
    def normalize_host(cls, v: str) -> str:
        v = v.strip().lower()
        if not v:
            raise ValueError("host is required")
        return v

    @field_validator("credential_data")
    @classmethod
    def validate_credential_data(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("credential_data is required")
        return v


class GitCredentialRead(BaseModel):
    id: uuid.UUID
    name: str
    credential_type: CredentialType
    host: str
    username: str
    public_key: str | None = None
    created_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Notification Channels ---


class NotificationChannelCreate(BaseModel):
    name: str
    channel_type: NotificationChannelType
    config_data: dict
    enabled: bool = True
    on_backup_failure: bool = True
    on_restore_failure: bool = True
    on_repo_verification_failure: bool = True
    on_disk_space_low: bool = True

    @field_validator("config_data")
    @classmethod
    def validate_config(cls, v: dict) -> dict:
        if not v:
            raise ValueError("config_data is required")
        return v


class NotificationChannelRead(BaseModel):
    id: uuid.UUID
    name: str
    channel_type: NotificationChannelType
    config_data: dict
    enabled: bool
    on_backup_failure: bool
    on_restore_failure: bool
    on_repo_verification_failure: bool
    on_disk_space_low: bool
    created_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationChannelUpdate(BaseModel):
    name: str | None = None
    config_data: dict | None = None
    enabled: bool | None = None
    on_backup_failure: bool | None = None
    on_restore_failure: bool | None = None
    on_repo_verification_failure: bool | None = None
    on_disk_space_low: bool | None = None


# --- Permissions ---


class RepoPermissionSet(BaseModel):
    user_id: uuid.UUID
    permission: RepoPermission


# --- Encryption Keys ---


class EncryptionKeyCreate(BaseModel):
    name: str
    backend: EncryptionBackend
    key_data: str


class EncryptionKeyRead(BaseModel):
    id: uuid.UUID
    name: str
    backend: EncryptionBackend
    created_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Settings ---


class GlobalSettingsRead(BaseModel):
    default_cron_expression: str | None = None
    default_encryption_key_id: uuid.UUID | None = None
    default_encrypt: bool = False

    model_config = {"from_attributes": True}


class GlobalSettingsUpdate(BaseModel):
    default_cron_expression: str | None = None
    default_encryption_key_id: uuid.UUID | None = None
    default_encrypt: bool | None = None


# --- Dashboard ---


class DailyActivitySummary(BaseModel):
    date: str  # "2026-03-10"
    succeeded: int
    failed: int
    total: int
