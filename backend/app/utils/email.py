import smtplib
import logging
from email.message import EmailMessage
from typing import Iterable, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


def send_html_email(
    recipients: Iterable[str],
    subject: str,
    html_body: str,
    text_body: str,
    message_id: Optional[str] = None,
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
    if message_id:
        message["Message-ID"] = message_id
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")

    try:
        smtp_client = smtplib.SMTP_SSL if settings.SMTP_PORT == 465 else smtplib.SMTP
        with smtp_client(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as smtp:
            if settings.SMTP_PORT != 465:
                smtp.starttls()
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.send_message(message)
        return True
    except (OSError, smtplib.SMTPException):
        logger.exception("Email delivery failed for %s", ", ".join(addresses))
        return False
