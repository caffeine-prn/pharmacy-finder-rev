import logging
import sys
from utils.redaction import redact_secrets


class SecretRedactingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = redact_secrets(record.getMessage())
        record.args = ()
        return True


def setup_logger(name: str = "sync") -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        logger.addFilter(SecretRedactingFilter())
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter(
            "%(asctime)s [%(levelname)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        ))
        logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    return logger
