import enum


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    OPERATOR = "operator"


class IdentityProvider(str, enum.Enum):
    LOCAL = "local"


class RepoStatus(str, enum.Enum):
    VERIFYING = "verifying"
    SCHEDULED = "scheduled"
    RUNNING = "running"
    BACKED_UP = "backed_up"
    FAILED = "failed"
    ACCESS_ERROR = "access_error"
    UNREACHABLE = "unreachable"


class JobStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class TriggerType(str, enum.Enum):
    SCHEDULED = "scheduled"
    MANUAL = "manual"


class StorageType(str, enum.Enum):
    LOCAL = "local"


class RepoPermission(enum.IntEnum):
    VIEW = 1
    MANAGE = 2


class EncryptionBackend(str, enum.Enum):
    GPG = "gpg"
