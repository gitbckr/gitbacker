from __future__ import annotations

import logging
import os
import re
import subprocess
import tempfile
from contextlib import contextmanager
from typing import TYPE_CHECKING
from urllib.parse import quote, urlparse

if TYPE_CHECKING:
    from collections.abc import Iterator

    from shared.models import GitCredential

from shared.enums import CredentialType

logger = logging.getLogger(__name__)

_ALLOWED_SCHEMES = ("https://", "http://", "git://", "ssh://", "git@")

# Base env: prevents git from hanging on interactive credential prompts.
_BASE_ENV = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}


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

    if credential.credential_type == CredentialType.PAT:
        parsed = urlparse(url)
        token = quote(credential.credential_data, safe="")
        username = credential.username or "x-access-token"
        netloc = f"{username}:{token}@{parsed.hostname}"
        if parsed.port:
            netloc += f":{parsed.port}"
        yield env, parsed._replace(netloc=netloc).geturl()
        return

    # SSH_KEY — write to a temp file with strict permissions
    fd, keypath = tempfile.mkstemp(suffix=".key")
    try:
        os.write(fd, credential.credential_data.encode())
        os.close(fd)
        os.chmod(keypath, 0o600)
        env["GIT_SSH_COMMAND"] = (
            f"ssh -i {keypath} "
            "-o StrictHostKeyChecking=accept-new "
            "-o IdentitiesOnly=yes"
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
    logger.info("Verifying access to %s", url)
    try:
        with _credential_env(credential, url) as (env, effective_url):
            result = subprocess.run(
                ["git", "ls-remote", "--exit-code", "--", effective_url],
                capture_output=True,
                text=True,
                timeout=30,
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
    logger.info("Cloning %s to %s", url, dest_path)
    try:
        with _credential_env(credential, url) as (env, effective_url):
            result = subprocess.run(
                ["git", "clone", "--mirror", "--", effective_url, dest_path],
                capture_output=True,
                text=True,
                timeout=300,
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
    logger.info("Force-mirror pushing %s to %s", bare_repo_path, remote_url)
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
                env=env,
            )
        output = (result.stdout or "") + (result.stderr or "")
        return result.returncode == 0, output
    except subprocess.TimeoutExpired:
        return False, "Timeout: push took longer than 600 seconds"
