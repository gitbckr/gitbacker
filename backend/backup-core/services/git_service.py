import logging
import re
import subprocess

logger = logging.getLogger(__name__)

_ALLOWED_SCHEMES = ("https://", "http://", "git://", "ssh://", "git@")


def _validate_url(url: str) -> None:
    """Reject URLs that could cause command injection or SSRF."""
    if url.startswith("-"):
        raise ValueError(f"Invalid URL (starts with dash): {url}")
    if url.startswith("ext::"):
        raise ValueError(f"ext:: transport is not allowed: {url}")
    if not any(url.startswith(s) for s in _ALLOWED_SCHEMES):
        raise ValueError(f"URL scheme not allowed: {url}")


def verify_access(url: str) -> tuple[bool, str | None]:
    """Check if a git URL is accessible via ls-remote. Returns (success, error_message)."""
    try:
        _validate_url(url)
    except ValueError as e:
        return False, str(e)
    logger.info("Verifying access to %s", url)
    try:
        result = subprocess.run(
            ["git", "ls-remote", "--exit-code", "--", url],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0:
            return True, None
        return False, result.stderr.strip() or "Could not access repository"
    except subprocess.TimeoutExpired:
        return False, "Timeout verifying repository access"
    except Exception as e:
        return False, str(e)


def clone_mirror(url: str, dest_path: str) -> tuple[bool, str]:
    """Clone a repo with --mirror. Returns (success, combined_output)."""
    _validate_url(url)
    logger.info("Cloning %s to %s", url, dest_path)
    try:
        result = subprocess.run(
            ["git", "clone", "--mirror", "--", url, dest_path],
            capture_output=True,
            text=True,
            timeout=300,
        )
        output = result.stdout
        if result.stderr:
            output += result.stderr
        return result.returncode == 0, output
    except subprocess.TimeoutExpired:
        return False, "Timeout: clone took longer than 300 seconds"
