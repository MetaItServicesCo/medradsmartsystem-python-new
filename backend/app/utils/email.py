import smtplib
import logging
from email.message import EmailMessage
from typing import Iterable

from app.core.config import settings

logger = logging.getLogger(__name__)


def send_html_email(
    recipients: Iterable[str],
    subject: str,
    html_body: str,
    text_body: str,
) -> bool:
    """Send an email when SMTP is configured.

    This function is intentionally suitable for a FastAPI BackgroundTask:
    delivery failure never rolls back the already-committed quotation, and no
    database session is passed across the request boundary.
    """
    addresses = sorted({address.strip() for address in recipients if address and address.strip()})
    sender = settings.SMTP_FROM_EMAIL or settings.SMTP_USER
    if not addresses or not sender or not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        return False

    message = EmailMessage()
    message["From"] = sender
    message["To"] = ", ".join(addresses)
    message["Subject"] = subject
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as smtp:
            smtp.starttls()
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.send_message(message)
        return True
    except (OSError, smtplib.SMTPException):
        logger.exception("Quotation email delivery failed for %s", ", ".join(addresses))
        return False
