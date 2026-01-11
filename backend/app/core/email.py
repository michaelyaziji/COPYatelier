"""Email service for sending documents via Resend."""

import os
import logging
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger(__name__)

# Resend configuration
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL", "Atelier <noreply@atelier.app>")


async def send_document_email(
    to_email: str,
    document_content: str,
    session_title: Optional[str] = None,
) -> bool:
    """
    Send a document via email using Resend.

    Args:
        to_email: Recipient email address
        document_content: The document content to send
        session_title: Optional session title for the email subject

    Returns:
        True if email was sent successfully, False otherwise
    """
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured - email disabled")
        raise ValueError("Email service is not configured. Please set RESEND_API_KEY.")

    try:
        import resend
        resend.api_key = RESEND_API_KEY

        subject = f"Your Atelier Document: {session_title}" if session_title else "Your Atelier Document"

        # Format the document nicely for email
        html_content = f"""
        <html>
        <head>
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; padding: 30px; border-radius: 12px; margin-bottom: 30px; }}
                .header h1 {{ margin: 0; font-size: 24px; }}
                .header p {{ margin: 10px 0 0 0; opacity: 0.9; }}
                .document {{ background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 30px; white-space: pre-wrap; font-family: inherit; }}
                .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Your Document is Ready</h1>
                <p>{session_title or 'Generated with Atelier AI Writing Studio'}</p>
            </div>
            <div class="document">{document_content}</div>
            <div class="footer">
                <p>This document was generated using <strong>Atelier</strong> - your AI writing studio.</p>
                <p>Visit <a href="https://atelier.app">atelier.app</a> to create more.</p>
            </div>
        </body>
        </html>
        """

        # Plain text version
        text_content = f"""Your Document is Ready
{'=' * 40}

{session_title or 'Generated with Atelier AI Writing Studio'}

{'-' * 40}

{document_content}

{'-' * 40}

This document was generated using Atelier - your AI writing studio.
Visit https://atelier.app to create more.
"""

        params = {
            "from": RESEND_FROM_EMAIL,
            "to": [to_email],
            "subject": subject,
            "html": html_content,
            "text": text_content,
        }

        r = resend.Emails.send(params)
        logger.info(f"Email sent successfully to {to_email}, id: {r.get('id')}")
        return True

    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        raise ValueError(f"Failed to send email: {str(e)}")
