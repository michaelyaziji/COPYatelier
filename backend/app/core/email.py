"""Email service for sending documents via Resend."""

import os
import io
import base64
import logging
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger(__name__)

# Resend configuration
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL", "Atelier <noreply@atelier.app>")


def generate_word_document(content: str) -> bytes:
    """
    Generate a Word document from text content.

    Args:
        content: The document content

    Returns:
        Word document as bytes
    """
    from docx import Document
    from docx.shared import Pt

    doc = Document()

    # Parse content into paragraphs
    lines = content.split('\n')

    for line in lines:
        trimmed = line.strip()

        if not trimmed:
            doc.add_paragraph()
            continue

        # Handle markdown-style headers
        if trimmed.startswith('# '):
            p = doc.add_heading(trimmed[2:], level=1)
        elif trimmed.startswith('## '):
            p = doc.add_heading(trimmed[3:], level=2)
        elif trimmed.startswith('### '):
            p = doc.add_heading(trimmed[4:], level=3)
        elif trimmed.startswith('- ') or trimmed.startswith('* '):
            # Bullet point
            p = doc.add_paragraph(trimmed[2:], style='List Bullet')
        elif len(trimmed) > 2 and trimmed[0].isdigit() and trimmed[1] == '.':
            # Numbered list
            p = doc.add_paragraph(trimmed[3:].strip(), style='List Number')
        else:
            # Regular paragraph
            p = doc.add_paragraph(trimmed)

    # Save to bytes
    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()


async def send_document_email(
    to_email: str,
    document_content: str,
    session_title: Optional[str] = None,
) -> bool:
    """
    Send a document via email using Resend with Word attachment.

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

        # Generate Word document
        word_bytes = generate_word_document(document_content)
        word_base64 = base64.b64encode(word_bytes).decode('utf-8')

        # Create filename from title
        filename = "document"
        if session_title:
            # Clean the title for use as filename
            filename = ''.join(c if c.isalnum() or c in ' -_' else '' for c in session_title)
            filename = filename.strip().replace(' ', '_')[:50] or "document"

        # Format the document nicely for email (preview in body)
        preview_content = document_content[:1000] + ('...' if len(document_content) > 1000 else '')

        html_content = f"""
        <html>
        <head>
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; padding: 30px; border-radius: 12px; margin-bottom: 30px; }}
                .header h1 {{ margin: 0; font-size: 24px; }}
                .header p {{ margin: 10px 0 0 0; opacity: 0.9; }}
                .attachment-note {{ background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 16px; margin-bottom: 20px; color: #065f46; }}
                .attachment-note strong {{ color: #047857; }}
                .preview {{ background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 30px; white-space: pre-wrap; font-family: inherit; }}
                .preview-label {{ font-size: 12px; color: #6b7280; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }}
                .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Your Document is Ready</h1>
                <p>{session_title or 'Generated with Atelier AI Writing Studio'}</p>
            </div>
            <div class="attachment-note">
                <strong>Word Document Attached</strong> - Open the attached .docx file for the full formatted document.
            </div>
            <div class="preview-label">Preview</div>
            <div class="preview">{preview_content}</div>
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

Word Document Attached - Open the attached .docx file for the full formatted document.

{'-' * 40}
PREVIEW:
{'-' * 40}

{preview_content}

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
            "attachments": [
                {
                    "filename": f"{filename}.docx",
                    "content": word_base64,
                }
            ],
        }

        r = resend.Emails.send(params)
        logger.info(f"Email sent successfully to {to_email} with attachment, id: {r.get('id')}")
        return True

    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        raise ValueError(f"Failed to send email: {str(e)}")
