"""Remove credentials before logs leave the process or become public artifacts."""
import re
from typing import Final

_SECRET_QUERY: Final = re.compile(
    r"(?i)((?:servicekey|api_key|apikey|access_token|token)=)[^&\s\"'<>\\]+"
)


def redact_secrets(text: str) -> str:
    return _SECRET_QUERY.sub(r"\1[REDACTED]", text)
