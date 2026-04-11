import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator

from .enums import (
    EncryptionBackend,
    JobStatus,
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
    email: EmailStr
    name: str
    password: str
    role: UserRole = UserRole.OPERATOR


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
    cron_expression: str | None = None

    @field_validator("urls")
    @classmethod
    def validate_urls(cls, v: list[str]) -> list[str]:
        if len(v) > 100:
            raise ValueError("Too many URLs (max 100)")
        for url in v:
            url = url.strip()
            if not url:
                continue
            if not url.startswith(("https://", "http://", "git://", "ssh://")):
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
    key_data: str
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
