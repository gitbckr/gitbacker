import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from .enums import (
    ArchiveFormat,
    CredentialType,
    EncryptionBackend,
    IdentityProvider,
    JobStatus,
    NotificationChannelType,
    RepoPermission,
    RepoStatus,
    StorageType,
    TriggerType,
    UserRole,
)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole), nullable=False, default=UserRole.OPERATOR
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    identities: Mapped[list["UserIdentity"]] = relationship(back_populates="user", passive_deletes=True)
    repositories: Mapped[list["Repository"]] = relationship(back_populates="created_by_user")
    permissions: Mapped[list["RepoPermissionEntry"]] = relationship(back_populates="user", passive_deletes=True)


class UserIdentity(Base):
    __tablename__ = "user_identities"
    __table_args__ = (UniqueConstraint("user_id", "provider"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    provider: Mapped[IdentityProvider] = mapped_column(
        Enum(IdentityProvider), nullable=False, default=IdentityProvider.LOCAL
    )
    provider_key: Mapped[str] = mapped_column(String(255), nullable=False)
    secret_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="identities")


class Destination(Base):
    __tablename__ = "destinations"
    __table_args__ = (
        Index("ix_destinations_single_default", "is_default", unique=True, postgresql_where=text("is_default = true")),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    alias: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_type: Mapped[StorageType] = mapped_column(
        Enum(StorageType), nullable=False, default=StorageType.LOCAL
    )
    path: Mapped[str] = mapped_column(String(1024), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    repositories: Mapped[list["Repository"]] = relationship(back_populates="destination")


class Repository(Base):
    __tablename__ = "repositories"
    __table_args__ = (
        UniqueConstraint("url", "destination_id", name="uq_repo_url_destination"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[RepoStatus] = mapped_column(
        Enum(RepoStatus), nullable=False, default=RepoStatus.VERIFYING
    )
    status_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    destination_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("destinations.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    encrypt: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    encryption_key_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("encryption_keys.id", ondelete="SET NULL"), nullable=True
    )
    cron_expression: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    destination: Mapped["Destination"] = relationship(back_populates="repositories")
    encryption_key: Mapped["EncryptionKey | None"] = relationship()
    created_by_user: Mapped["User"] = relationship(back_populates="repositories")
    backup_jobs: Mapped[list["BackupJob"]] = relationship(back_populates="repository", passive_deletes=True)
    snapshots: Mapped[list["BackupSnapshot"]] = relationship(
        back_populates="repository",
        order_by="BackupSnapshot.created_at.desc()",
        passive_deletes=True,
    )
    restore_jobs: Mapped[list["RestoreJob"]] = relationship(back_populates="repository", passive_deletes=True)
    permissions: Mapped[list["RepoPermissionEntry"]] = relationship(back_populates="repository", passive_deletes=True)


class BackupJob(Base):
    __tablename__ = "backup_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    repository_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("repositories.id", ondelete="CASCADE"), index=True, nullable=False
    )
    status: Mapped[JobStatus] = mapped_column(
        Enum(JobStatus), nullable=False, default=JobStatus.PENDING
    )
    trigger_type: Mapped[TriggerType] = mapped_column(
        Enum(TriggerType), nullable=False
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_log: Mapped[str | None] = mapped_column(Text, nullable=True)
    backup_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    repository: Mapped["Repository"] = relationship(back_populates="backup_jobs")
    snapshot: Mapped["BackupSnapshot | None"] = relationship(
        back_populates="backup_job", uselist=False, passive_deletes=True
    )


class BackupSnapshot(Base):
    __tablename__ = "backup_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    repository_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("repositories.id", ondelete="CASCADE"), index=True, nullable=False
    )
    backup_job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("backup_jobs.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    destination_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("destinations.id", ondelete="RESTRICT"), nullable=False
    )
    artifact_filename: Mapped[str] = mapped_column(String(512), nullable=False)
    archive_format: Mapped[ArchiveFormat] = mapped_column(
        Enum(ArchiveFormat), nullable=False
    )
    encryption_key_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("encryption_keys.id", ondelete="SET NULL"), nullable=True
    )
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    refs_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    repository: Mapped["Repository"] = relationship(back_populates="snapshots")
    backup_job: Mapped["BackupJob"] = relationship(back_populates="snapshot")
    destination: Mapped["Destination"] = relationship()
    encryption_key: Mapped["EncryptionKey | None"] = relationship()


class RestoreJob(Base):
    __tablename__ = "restore_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    repository_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("repositories.id", ondelete="CASCADE"), index=True, nullable=False
    )
    snapshot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("backup_snapshots.id", ondelete="CASCADE"), nullable=False
    )
    triggered_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    restore_target_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    status: Mapped[JobStatus] = mapped_column(
        Enum(JobStatus), nullable=False, default=JobStatus.PENDING
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_log: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    repository: Mapped["Repository"] = relationship(back_populates="restore_jobs")
    snapshot: Mapped["BackupSnapshot"] = relationship()
    triggered_by_user: Mapped["User"] = relationship()


class RestorePreview(Base):
    __tablename__ = "restore_previews"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    snapshot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("backup_snapshots.id", ondelete="CASCADE"), nullable=False
    )
    restore_target_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    triggered_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[JobStatus] = mapped_column(
        Enum(JobStatus), nullable=False, default=JobStatus.PENDING
    )
    result_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    detail_status: Mapped[JobStatus | None] = mapped_column(
        Enum(JobStatus), nullable=True
    )
    detail_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    detail_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    snapshot: Mapped["BackupSnapshot"] = relationship()
    triggered_by_user: Mapped["User"] = relationship()


class GitCredential(Base):
    __tablename__ = "git_credentials"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    credential_type: Mapped[CredentialType] = mapped_column(
        Enum(CredentialType), nullable=False
    )
    host: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    username: Mapped[str] = mapped_column(
        String(255), nullable=False, default="x-access-token"
    )
    credential_data: Mapped[str] = mapped_column(Text, nullable=False)
    public_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    created_by_user: Mapped["User"] = relationship()


class NotificationChannel(Base):
    __tablename__ = "notification_channels"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    channel_type: Mapped[NotificationChannelType] = mapped_column(
        Enum(NotificationChannelType), nullable=False
    )
    config_data: Mapped[dict] = mapped_column(JSON, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    on_backup_failure: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    on_restore_failure: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    on_repo_verification_failure: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    on_disk_space_low: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    created_by_user: Mapped["User"] = relationship()


class EncryptionKey(Base):
    __tablename__ = "encryption_keys"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    backend: Mapped[EncryptionBackend] = mapped_column(
        Enum(EncryptionBackend), nullable=False
    )
    key_data: Mapped[str] = mapped_column(String(1024), nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    created_by_user: Mapped["User"] = relationship()


class GlobalSettings(Base):
    __tablename__ = "global_settings"
    __table_args__ = (CheckConstraint("id = 1", name="single_row"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    default_cron_expression: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    default_encryption_key_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("encryption_keys.id", ondelete="SET NULL"), nullable=True
    )
    default_encrypt: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    default_encryption_key: Mapped["EncryptionKey | None"] = relationship()


class RepoPermissionEntry(Base):
    __tablename__ = "repo_permissions"

    repo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("repositories.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    permission: Mapped[RepoPermission] = mapped_column(
        Enum(RepoPermission), nullable=False
    )

    repository: Mapped["Repository"] = relationship(back_populates="permissions")
    user: Mapped["User"] = relationship(back_populates="permissions")
