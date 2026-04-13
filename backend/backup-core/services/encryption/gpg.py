import logging
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)


class GpgEncryptionProvider:
    """Encrypts files using GPG symmetric encryption (AES-256, passphrase-based)."""

    def __init__(self, passphrase: str) -> None:
        self._passphrase = passphrase

    def encrypt_file(self, input_path: Path, output_path: Path) -> None:
        """Encrypt using gpg --symmetric --cipher-algo AES256."""
        logger.debug("Encrypting %s -> %s", input_path, output_path)
        result = subprocess.run(
            [
                "gpg",
                "--symmetric",
                "--cipher-algo",
                "AES256",
                "--batch",
                "--yes",
                "--passphrase-fd",
                "0",
                "--output",
                str(output_path),
                str(input_path),
            ],
            input=self._passphrase,
            capture_output=True,
            text=True,
            timeout=600,
        )
        if result.returncode != 0:
            raise RuntimeError(f"GPG encryption failed: {result.stderr.strip()}")

    def decrypt_file(self, input_path: Path, output_path: Path) -> None:
        """Decrypt using gpg --decrypt with passphrase."""
        logger.debug("Decrypting %s -> %s", input_path, output_path)
        result = subprocess.run(
            [
                "gpg",
                "--decrypt",
                "--batch",
                "--yes",
                "--passphrase-fd",
                "0",
                "--output",
                str(output_path),
                str(input_path),
            ],
            input=self._passphrase,
            capture_output=True,
            text=True,
            timeout=600,
        )
        if result.returncode != 0:
            raise RuntimeError(f"GPG decryption failed: {result.stderr.strip()}")

    def validate_config(self) -> None:
        """Check that gpg binary is available."""
        try:
            subprocess.run(
                ["gpg", "--version"], capture_output=True, timeout=10, check=True
            )
        except FileNotFoundError:
            raise RuntimeError("GPG binary not found. Install gnupg.")
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"GPG binary check failed: {e}")
