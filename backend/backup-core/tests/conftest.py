import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from shared.enums import (
    EncryptionBackend,
    IdentityProvider,
    JobStatus,
    RepoStatus,
    StorageType,
    TriggerType,
    UserRole,
)
from shared.models import (
    BackupJob,
    Base,
    Destination,
    EncryptionKey,
    GlobalSettings,
    Repository,
    User,
    UserIdentity,
)


@pytest.fixture
def engine():
    eng = create_engine("sqlite://", poolclass=StaticPool)
    Base.metadata.create_all(eng)
    with eng.connect() as conn:
        conn.execute(text("DROP INDEX IF EXISTS ix_destinations_single_default"))
        conn.commit()
    yield eng
    eng.dispose()


@pytest.fixture
def db_session(engine):
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    session = Session()
    yield session
    session.close()


@pytest.fixture
def admin_user(db_session):
    user = User(email="admin@test.com", name="Admin", role=UserRole.ADMIN)
    db_session.add(user)
    db_session.flush()
    return user


@pytest.fixture
def destination(db_session, admin_user, tmp_path):
    dest = Destination(
        alias="Local Backup",
        storage_type=StorageType.LOCAL,
        path=str(tmp_path / "backups"),
        is_default=True,
        created_by=admin_user.id,
    )
    db_session.add(dest)
    db_session.flush()
    return dest


@pytest.fixture
def repository(db_session, admin_user, destination):
    repo = Repository(
        url="https://github.com/user/test-repo",
        name="test-repo",
        status=RepoStatus.VERIFYING,
        destination_id=destination.id,
        created_by=admin_user.id,
    )
    db_session.add(repo)
    db_session.flush()
    return repo


@pytest.fixture
def backup_job(db_session, repository):
    job = BackupJob(
        repository_id=repository.id,
        status=JobStatus.PENDING,
        trigger_type=TriggerType.MANUAL,
    )
    db_session.add(job)
    db_session.flush()
    return job


@pytest.fixture
def encryption_key(db_session, admin_user):
    key = EncryptionKey(
        name="Test GPG key",
        backend=EncryptionBackend.GPG,
        key_data="ABCDEF1234567890",
        created_by=admin_user.id,
    )
    db_session.add(key)
    db_session.flush()
    return key


@pytest.fixture
def global_settings_with_encryption(db_session, encryption_key):
    settings = GlobalSettings(
        id=1,
        default_encryption_key_id=encryption_key.id,
        default_encrypt=True,
    )
    db_session.add(settings)
    db_session.flush()
    return settings
