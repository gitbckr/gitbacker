"""baseline schema

Revision ID: d47ddfccc2d0
Revises:
Create Date: 2026-04-16 21:27:34.594079

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSON

# revision identifiers, used by Alembic.
revision: str = "d47ddfccc2d0"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Enum types used across tables
userrole = sa.Enum("ADMIN", "OPERATOR", name="userrole")
storagetype = sa.Enum("LOCAL", name="storagetype")
encryptionbackend = sa.Enum("GPG", name="encryptionbackend")
credentialtype = sa.Enum("PAT", "SSH_KEY", name="credentialtype")
notificationchanneltype = sa.Enum("SLACK", name="notificationchanneltype")
identityprovider = sa.Enum("LOCAL", name="identityprovider")
repostatus = sa.Enum(
    "VERIFYING", "SCHEDULED", "RUNNING", "BACKED_UP", "FAILED",
    "ACCESS_ERROR", "UNREACHABLE", name="repostatus",
)
jobstatus = sa.Enum("PENDING", "RUNNING", "SUCCEEDED", "FAILED", name="jobstatus")
triggertype = sa.Enum("SCHEDULED", "MANUAL", name="triggertype")
archiveformat = sa.Enum("TAR_GZ", "TAR_GZ_GPG", name="archiveformat")
repopermission = sa.Enum("VIEW", "MANAGE", name="repopermission")


def upgrade() -> None:
    # Enums are created automatically by op.create_table when it encounters
    # Enum columns. No explicit .create() needed — doing both causes
    # DuplicateObjectError on Postgres.

    # --- users ---
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("role", userrole, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # --- user_identities ---
    op.create_table(
        "user_identities",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("provider", identityprovider, nullable=False, server_default="LOCAL"),
        sa.Column("provider_key", sa.String(255), nullable=False),
        sa.Column("secret_hash", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "provider"),
    )

    # --- destinations ---
    op.create_table(
        "destinations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("alias", sa.String(255), nullable=False),
        sa.Column("storage_type", storagetype, nullable=False),
        sa.Column("path", sa.String(1024), nullable=False),
        sa.Column("is_default", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_destinations_single_default", "destinations", ["is_default"],
        unique=True, postgresql_where=sa.text("is_default = true"),
    )

    # --- encryption_keys ---
    op.create_table(
        "encryption_keys",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("backend", encryptionbackend, nullable=False),
        sa.Column("key_data", sa.String(1024), nullable=False),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # --- git_credentials ---
    op.create_table(
        "git_credentials",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("credential_type", credentialtype, nullable=False),
        sa.Column("host", sa.String(255), nullable=False, unique=True),
        sa.Column("username", sa.String(255), nullable=False, server_default="x-access-token"),
        sa.Column("credential_data", sa.Text, nullable=False),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # --- notification_channels ---
    op.create_table(
        "notification_channels",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("channel_type", notificationchanneltype, nullable=False),
        sa.Column("config_data", JSON, nullable=False),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("on_backup_failure", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("on_restore_failure", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("on_repo_verification_failure", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("on_disk_space_low", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # --- global_settings ---
    op.create_table(
        "global_settings",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("default_cron_expression", sa.String(100), nullable=True),
        sa.Column("default_encryption_key_id", UUID(as_uuid=True), sa.ForeignKey("encryption_keys.id", ondelete="SET NULL"), nullable=True),
        sa.Column("default_encrypt", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("id = 1", name="single_row"),
    )

    # --- repositories ---
    op.create_table(
        "repositories",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("url", sa.String(2048), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("status", repostatus, nullable=False),
        sa.Column("status_reason", sa.Text, nullable=True),
        sa.Column("destination_id", UUID(as_uuid=True), sa.ForeignKey("destinations.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("encrypt", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("encryption_key_id", UUID(as_uuid=True), sa.ForeignKey("encryption_keys.id", ondelete="SET NULL"), nullable=True),
        sa.Column("cron_expression", sa.String(100), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("url", "destination_id", name="uq_repo_url_destination"),
    )

    # --- backup_jobs ---
    op.create_table(
        "backup_jobs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("repository_id", UUID(as_uuid=True), sa.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("status", jobstatus, nullable=False),
        sa.Column("trigger_type", triggertype, nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_seconds", sa.Integer, nullable=True),
        sa.Column("output_log", sa.Text, nullable=True),
        sa.Column("backup_size_bytes", sa.BigInteger, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # --- repo_permissions ---
    op.create_table(
        "repo_permissions",
        sa.Column("repo_id", UUID(as_uuid=True), sa.ForeignKey("repositories.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("permission", repopermission, nullable=False),
    )

    # --- backup_snapshots ---
    op.create_table(
        "backup_snapshots",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("repository_id", UUID(as_uuid=True), sa.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("backup_job_id", UUID(as_uuid=True), sa.ForeignKey("backup_jobs.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("destination_id", UUID(as_uuid=True), sa.ForeignKey("destinations.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("artifact_filename", sa.String(512), nullable=False),
        sa.Column("archive_format", archiveformat, nullable=False),
        sa.Column("encryption_key_id", UUID(as_uuid=True), sa.ForeignKey("encryption_keys.id", ondelete="SET NULL"), nullable=True),
        sa.Column("label", sa.String(255), nullable=True),
        sa.Column("refs_hash", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # --- restore_jobs ---
    op.create_table(
        "restore_jobs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("repository_id", UUID(as_uuid=True), sa.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("snapshot_id", UUID(as_uuid=True), sa.ForeignKey("backup_snapshots.id", ondelete="CASCADE"), nullable=False),
        sa.Column("triggered_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("restore_target_url", sa.String(2048), nullable=False),
        sa.Column("status", jobstatus, nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_seconds", sa.Integer, nullable=True),
        sa.Column("output_log", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # --- restore_previews ---
    op.create_table(
        "restore_previews",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("snapshot_id", UUID(as_uuid=True), sa.ForeignKey("backup_snapshots.id", ondelete="CASCADE"), nullable=False),
        sa.Column("restore_target_url", sa.String(2048), nullable=False),
        sa.Column("triggered_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("status", jobstatus, nullable=False),
        sa.Column("result_data", JSON, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("detail_status", jobstatus, nullable=True),
        sa.Column("detail_data", JSON, nullable=True),
        sa.Column("detail_error", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("restore_previews")
    op.drop_table("restore_jobs")
    op.drop_table("backup_snapshots")
    op.drop_table("repo_permissions")
    op.drop_table("backup_jobs")
    op.drop_table("repositories")
    op.drop_table("global_settings")
    op.drop_table("notification_channels")
    op.drop_table("git_credentials")
    op.drop_table("encryption_keys")
    op.drop_table("destinations")
    op.drop_table("user_identities")
    op.drop_table("users")

    for e in [
        repopermission, archiveformat, triggertype, jobstatus,
        repostatus, identityprovider, notificationchanneltype,
        credentialtype, encryptionbackend, storagetype, userrole,
    ]:
        e.drop(op.get_bind(), checkfirst=True)
