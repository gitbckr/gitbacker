from __future__ import annotations

import logging
import os
import re
import subprocess
import tempfile
from contextlib import contextmanager
from typing import TYPE_CHECKING
from urllib.parse import quote, urlparse

# Matches credentials embedded in URLs: https://user:token@host/...
_CREDENTIAL_RE = re.compile(r"(https?://)([^@/]+@)", re.IGNORECASE)

if TYPE_CHECKING:
    from collections.abc import Iterator

    from shared.models import GitCredential

from shared.crypto import decrypt_field
from shared.enums import CredentialType

_APP_SECRET = os.environ.get("JWT_SECRET", "")

logger = logging.getLogger(__name__)

_ALLOWED_SCHEMES = ("https://", "http://", "git://", "ssh://", "git@")

# Base env: prevents git/ssh from hanging on interactive prompts.
_BASE_ENV = {
    **os.environ,
    "GIT_TERMINAL_PROMPT": "0",
    "GIT_ASKPASS": "",          # disable askpass credential helpers
    "SSH_ASKPASS": "",          # disable SSH passphrase GUI prompts
    "DISPLAY": "",              # ensure no X11 prompts
}


# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------

def _validate_url(url: str) -> None:
    """Reject URLs that could cause command injection or SSRF."""
    if url.startswith("-"):
        raise ValueError(f"Invalid URL (starts with dash): {url}")
    if url.startswith("ext::"):
        raise ValueError(f"ext:: transport is not allowed: {url}")
    if not any(url.startswith(s) for s in _ALLOWED_SCHEMES):
        raise ValueError(f"URL scheme not allowed: {url}")


def extract_host(url: str) -> str | None:
    """Extract hostname from a git URL (HTTPS, SSH, or SCP-style)."""
    # SCP-style: git@github.com:user/repo.git
    m = re.match(r"^[\w.-]+@([\w.-]+):", url)
    if m:
        return m.group(1).lower()
    # Standard URL schemes
    parsed = urlparse(url)
    if parsed.hostname:
        return parsed.hostname.lower()
    return None


def scrub_credentials(text: str) -> str:
    """Remove embedded credentials from URLs in git output."""
    return _CREDENTIAL_RE.sub(r"\1", text)


# ---------------------------------------------------------------------------
# Credential injection
# ---------------------------------------------------------------------------

@contextmanager
def _credential_env(
    credential: GitCredential | None, url: str
) -> Iterator[tuple[dict[str, str], str]]:
    """Context manager yielding ``(env, effective_url)`` with credential injected.

    * PAT: rewrites the HTTPS URL to embed the token.
    * SSH_KEY: writes the key to a temp file, sets ``GIT_SSH_COMMAND``.
    * None: passes through the base env and original URL.
    """
    env = {**_BASE_ENV}

    if not credential:
        yield env, url
        return

    if not _APP_SECRET:
        raise RuntimeError(
            "JWT_SECRET environment variable is required to decrypt credentials"
        )
    secret = decrypt_field(credential.credential_data, _APP_SECRET)

    if credential.credential_type == CredentialType.PAT:
        parsed = urlparse(url)
        token = quote(secret, safe="")
        username = credential.username or "x-access-token"
        netloc = f"{username}:{token}@{parsed.hostname}"
        if parsed.port:
            netloc += f":{parsed.port}"
        yield env, parsed._replace(netloc=netloc).geturl()
        return

    # SSH_KEY — write to a temp file with strict permissions.
    # libcrypto requires LF line endings and a trailing newline; textareas in
    # the browser commonly strip the trailing newline on paste and Windows
    # clients may send CRLF. Normalize both so the key parser accepts it.
    fd, keypath = tempfile.mkstemp(suffix=".key")
    try:
        normalized = secret.replace("\r\n", "\n").replace("\r", "\n")
        if not normalized.endswith("\n"):
            normalized += "\n"
        os.write(fd, normalized.encode())
        os.close(fd)
        os.chmod(keypath, 0o600)
        env["GIT_SSH_COMMAND"] = (
            f"ssh -i {keypath} "
            "-o StrictHostKeyChecking=accept-new "
            "-o IdentitiesOnly=yes "
            "-o BatchMode=yes"
        )
        yield env, url
    finally:
        try:
            os.unlink(keypath)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# Git operations
# ---------------------------------------------------------------------------

def verify_access(
    url: str, credential: GitCredential | None = None
) -> tuple[bool, str | None]:
    """Check if a git URL is accessible via ls-remote. Returns (success, error_message)."""
    try:
        _validate_url(url)
    except ValueError as e:
        return False, str(e)
    logger.debug("Verifying access to %s", url)
    try:
        with _credential_env(credential, url) as (env, effective_url):
            result = subprocess.run(
                ["git", "ls-remote", "--exit-code", "--", effective_url],
                capture_output=True,
                text=True,
                timeout=30,
                stdin=subprocess.DEVNULL,
                env=env,
            )
        if result.returncode == 0:
            return True, None
        return False, result.stderr.strip() or "Could not access repository"
    except subprocess.TimeoutExpired:
        return False, "Timeout verifying repository access"
    except Exception as e:
        return False, str(e)


def clone_mirror(
    url: str, dest_path: str, credential: GitCredential | None = None
) -> tuple[bool, str]:
    """Clone a repo with --mirror. Returns (success, combined_output)."""
    _validate_url(url)
    logger.debug("Cloning %s to %s", url, dest_path)
    try:
        with _credential_env(credential, url) as (env, effective_url):
            result = subprocess.run(
                ["git", "clone", "--mirror", "--", effective_url, dest_path],
                capture_output=True,
                text=True,
                timeout=300,
                stdin=subprocess.DEVNULL,
                env=env,
            )
        output = result.stdout
        if result.stderr:
            output += result.stderr
        return result.returncode == 0, output
    except subprocess.TimeoutExpired:
        return False, "Timeout: clone took longer than 300 seconds"


def force_mirror_push(
    bare_repo_path: str,
    remote_url: str,
    credential: GitCredential | None = None,
) -> tuple[bool, str]:
    """Force-mirror push a local bare repo to a remote.

    Equivalent to ``git push --force --mirror <remote>``. Overwrites all refs at
    the remote with the local refs; refs on the remote that are not local are
    deleted. Returns (success, combined_output).
    """
    _validate_url(remote_url)
    logger.debug("Force-mirror pushing %s to %s", bare_repo_path, remote_url)
    try:
        with _credential_env(credential, remote_url) as (env, effective_url):
            result = subprocess.run(
                [
                    "git",
                    "--git-dir",
                    bare_repo_path,
                    "push",
                    "--force",
                    "--mirror",
                    "--",
                    effective_url,
                ],
                capture_output=True,
                text=True,
                timeout=600,
                stdin=subprocess.DEVNULL,
                env=env,
            )
        output = (result.stdout or "") + (result.stderr or "")
        return result.returncode == 0, output
    except subprocess.TimeoutExpired:
        return False, "Timeout: push took longer than 600 seconds"


def list_local_refs(bare_repo_path: str) -> dict[str, str]:
    """Read all refs from a local bare repo. Returns ``{ref_name: sha}``."""
    result = subprocess.run(
        ["git", "--git-dir", bare_repo_path, "show-ref"],
        capture_output=True,
        text=True,
        timeout=30,
        stdin=subprocess.DEVNULL,
    )
    refs: dict[str, str] = {}
    for line in result.stdout.strip().splitlines():
        if not line.strip():
            continue
        sha, ref = line.split(None, 1)
        refs[ref] = sha
    return refs


def list_remote_refs(
    url: str, credential: GitCredential | None = None
) -> dict[str, str]:
    """Read all refs from a remote via ``git ls-remote``. Returns ``{ref_name: sha}``."""
    _validate_url(url)
    with _credential_env(credential, url) as (env, effective_url):
        result = subprocess.run(
            ["git", "ls-remote", "--", effective_url],
            capture_output=True,
            text=True,
            timeout=60,
            stdin=subprocess.DEVNULL,
            env=env,
        )
    if result.returncode != 0:
        error = result.stderr.strip() or "ls-remote failed"
        raise RuntimeError(f"Failed to read remote refs: {error}")
    refs: dict[str, str] = {}
    for line in result.stdout.strip().splitlines():
        if not line.strip():
            continue
        sha, ref = line.split(None, 1)
        refs[ref] = sha
    return refs


def fetch_remote(
    bare_repo_path: str,
    url: str,
    credential: GitCredential | None = None,
) -> tuple[bool, str]:
    """Fetch all refs from a remote into a local bare repo. Returns (success, output)."""
    _validate_url(url)
    logger.debug("Fetching %s into %s", url, bare_repo_path)
    try:
        with _credential_env(credential, url) as (env, effective_url):
            result = subprocess.run(
                [
                    "git", "--git-dir", bare_repo_path,
                    "fetch", "--no-tags",
                    "--", effective_url,
                    "+refs/heads/*:refs/fetched/heads/*",
                    "+refs/tags/*:refs/fetched/tags/*",
                ],
                capture_output=True,
                text=True,
                timeout=300,
                stdin=subprocess.DEVNULL,
                env=env,
            )
        output = (result.stdout or "") + (result.stderr or "")
        return result.returncode == 0, output
    except subprocess.TimeoutExpired:
        return False, "Timeout: fetch took longer than 300 seconds"


def diff_numstat(
    bare_repo_path: str, from_sha: str, to_sha: str
) -> list[tuple[int, int, str]]:
    """Run ``git diff --numstat`` between two commits.

    Returns a list of ``(insertions, deletions, filepath)``.
    Binary files are reported as ``(0, 0, path)``.
    """
    result = subprocess.run(
        ["git", "--git-dir", bare_repo_path, "diff", "--numstat", from_sha, to_sha],
        capture_output=True,
        text=True,
        timeout=60,
        stdin=subprocess.DEVNULL,
    )
    stats: list[tuple[int, int, str]] = []
    for line in result.stdout.strip().splitlines():
        if not line.strip():
            continue
        parts = line.split("\t", 2)
        if len(parts) != 3:
            continue
        ins_str, del_str, path = parts
        ins = int(ins_str) if ins_str != "-" else 0
        dels = int(del_str) if del_str != "-" else 0
        stats.append((ins, dels, path))
    return stats
