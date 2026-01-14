"""
Monitoring and alerting system for Atelier.

Tracks:
- Model health (provider errors, deprecated models)
- Error rates (failed sessions)
- Usage anomalies (high credit consumption)
- Stuck sessions

Sends email alerts when thresholds are crossed.
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from collections import defaultdict
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)

# Alert recipient
ALERT_EMAIL = "michaelyaziji@gmail.com"

# Thresholds
MODEL_ERROR_THRESHOLD = 3  # Alert after 3 consecutive model errors
SESSION_FAILURE_THRESHOLD = 5  # Alert if 5+ sessions fail in 30 min
SESSION_FAILURE_WINDOW_MINUTES = 30
USAGE_CREDITS_PER_HOUR_THRESHOLD = 100  # Alert if user uses 100+ credits/hour
STUCK_SESSION_MINUTES = 30  # Alert for sessions running > 30 min


class AlertType(str, Enum):
    MODEL_HEALTH = "model_health"
    ERROR_RATE = "error_rate"
    USAGE_ANOMALY = "usage_anomaly"
    STUCK_SESSION = "stuck_session"


@dataclass
class AlertState:
    """Tracks alert state to prevent duplicate alerts."""
    last_sent: Optional[datetime] = None
    cooldown_minutes: int = 60  # Don't re-alert for same issue within cooldown

    def can_send(self) -> bool:
        if self.last_sent is None:
            return True
        elapsed = datetime.now(timezone.utc) - self.last_sent
        return elapsed > timedelta(minutes=self.cooldown_minutes)

    def mark_sent(self):
        self.last_sent = datetime.now(timezone.utc)


@dataclass
class MonitoringState:
    """Global monitoring state."""
    # Model health tracking
    model_errors: dict = field(default_factory=lambda: defaultdict(list))

    # Session failure tracking
    session_failures: list = field(default_factory=list)

    # Usage tracking (user_id -> list of (timestamp, credits))
    user_usage: dict = field(default_factory=lambda: defaultdict(list))

    # Alert states to prevent spam
    alert_states: dict = field(default_factory=lambda: defaultdict(AlertState))

    # Running sessions (session_id -> start_time)
    running_sessions: dict = field(default_factory=dict)


# Global state
_state = MonitoringState()


async def send_alert_email(
    alert_type: AlertType,
    subject: str,
    body: str,
) -> bool:
    """Send an alert email if not in cooldown."""
    state_key = f"{alert_type.value}"
    alert_state = _state.alert_states[state_key]

    if not alert_state.can_send():
        logger.debug(f"Alert {alert_type.value} in cooldown, skipping")
        return False

    try:
        from .email import send_email

        full_subject = f"[Atelier Alert] {subject}"

        html_body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
            <div style="background: #fee2e2; border: 1px solid #ef4444; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                <h2 style="color: #dc2626; margin-top: 0;">Alert: {alert_type.value.replace('_', ' ').title()}</h2>
                <p style="color: #7f1d1d;">{body.replace(chr(10), '<br>')}</p>
            </div>
            <p style="color: #666; font-size: 12px;">
                This is an automated alert from Atelier monitoring system.<br>
                Time: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}
            </p>
        </body>
        </html>
        """

        await send_email(
            to_email=ALERT_EMAIL,
            subject=full_subject,
            html_body=html_body,
        )

        alert_state.mark_sent()
        logger.warning(f"Alert sent: {alert_type.value} - {subject}")
        return True

    except Exception as e:
        logger.error(f"Failed to send alert email: {e}")
        return False


# ============ Model Health Monitoring ============

async def record_model_error(
    provider: str,
    model: str,
    error_message: str,
    error_code: Optional[int] = None,
):
    """Record a model error and alert if threshold crossed."""
    now = datetime.now(timezone.utc)
    key = f"{provider}:{model}"

    # Clean old errors (keep last hour)
    cutoff = now - timedelta(hours=1)
    _state.model_errors[key] = [
        (ts, err) for ts, err in _state.model_errors[key]
        if ts > cutoff
    ]

    # Add new error
    _state.model_errors[key].append((now, error_message))

    # Check if we should alert
    recent_errors = len(_state.model_errors[key])

    # Special case: 404 errors mean model doesn't exist
    is_model_not_found = error_code == 404 or "not_found" in error_message.lower()

    if is_model_not_found:
        await send_alert_email(
            AlertType.MODEL_HEALTH,
            f"Model Not Found: {model}",
            f"Provider: {provider}\n"
            f"Model: {model}\n"
            f"Error: {error_message}\n\n"
            f"This model may have been deprecated or renamed. "
            f"Please check the provider's documentation and update the model configuration."
        )
    elif recent_errors >= MODEL_ERROR_THRESHOLD:
        await send_alert_email(
            AlertType.MODEL_HEALTH,
            f"Model Health Degraded: {model}",
            f"Provider: {provider}\n"
            f"Model: {model}\n"
            f"Errors in last hour: {recent_errors}\n"
            f"Latest error: {error_message}\n\n"
            f"The model may be experiencing issues or rate limiting."
        )


async def record_model_success(provider: str, model: str):
    """Record a successful model call (clears error state)."""
    key = f"{provider}:{model}"
    # Keep only very recent errors on success
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=5)
    _state.model_errors[key] = [
        (ts, err) for ts, err in _state.model_errors[key]
        if ts > cutoff
    ]


# ============ Error Rate Monitoring ============

async def record_session_failure(
    session_id: str,
    user_id: str,
    error_message: str,
):
    """Record a session failure and alert if threshold crossed."""
    now = datetime.now(timezone.utc)

    # Clean old failures
    cutoff = now - timedelta(minutes=SESSION_FAILURE_WINDOW_MINUTES)
    _state.session_failures = [
        (ts, sid, uid, err) for ts, sid, uid, err in _state.session_failures
        if ts > cutoff
    ]

    # Add new failure
    _state.session_failures.append((now, session_id, user_id, error_message))

    # Check threshold
    recent_count = len(_state.session_failures)

    if recent_count >= SESSION_FAILURE_THRESHOLD:
        # Get unique errors for summary
        unique_errors = set(err for _, _, _, err in _state.session_failures[-10:])

        await send_alert_email(
            AlertType.ERROR_RATE,
            f"High Session Failure Rate: {recent_count} failures",
            f"Failed sessions in last {SESSION_FAILURE_WINDOW_MINUTES} minutes: {recent_count}\n\n"
            f"Recent errors:\n" + "\n".join(f"- {err[:100]}" for err in list(unique_errors)[:5]) +
            f"\n\nThis may indicate a systemic issue with the AI providers or application."
        )


async def record_session_success(session_id: str):
    """Record a successful session completion."""
    # Remove from running sessions
    _state.running_sessions.pop(session_id, None)


# ============ Usage Anomaly Monitoring ============

async def record_credit_usage(
    user_id: str,
    user_email: str,
    credits_used: float,
    session_id: Optional[str] = None,
):
    """Record credit usage and alert on anomalies."""
    now = datetime.now(timezone.utc)

    # Clean old usage data (keep last 2 hours)
    cutoff = now - timedelta(hours=2)
    _state.user_usage[user_id] = [
        (ts, credits) for ts, credits in _state.user_usage[user_id]
        if ts > cutoff
    ]

    # Add new usage
    _state.user_usage[user_id].append((now, credits_used))

    # Calculate usage in last hour
    hour_cutoff = now - timedelta(hours=1)
    hourly_usage = sum(
        credits for ts, credits in _state.user_usage[user_id]
        if ts > hour_cutoff
    )

    if hourly_usage >= USAGE_CREDITS_PER_HOUR_THRESHOLD:
        await send_alert_email(
            AlertType.USAGE_ANOMALY,
            f"High Usage Alert: {hourly_usage:.1f} credits/hour",
            f"User: {user_email}\n"
            f"User ID: {user_id}\n"
            f"Credits used in last hour: {hourly_usage:.1f}\n"
            f"Threshold: {USAGE_CREDITS_PER_HOUR_THRESHOLD}\n\n"
            f"This could indicate:\n"
            f"- Heavy legitimate usage\n"
            f"- A runaway process\n"
            f"- Potential abuse\n\n"
            f"Please review this user's activity."
        )


# ============ Stuck Session Monitoring ============

def mark_session_started(session_id: str, user_id: str):
    """Mark a session as started for stuck detection."""
    _state.running_sessions[session_id] = {
        "start_time": datetime.now(timezone.utc),
        "user_id": user_id,
    }


def mark_session_ended(session_id: str):
    """Mark a session as ended."""
    _state.running_sessions.pop(session_id, None)


async def check_stuck_sessions():
    """Check for stuck sessions and alert. Call this periodically."""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=STUCK_SESSION_MINUTES)

    stuck = []
    for session_id, info in _state.running_sessions.items():
        if info["start_time"] < cutoff:
            duration = (now - info["start_time"]).total_seconds() / 60
            stuck.append((session_id, info["user_id"], duration))

    if stuck:
        details = "\n".join(
            f"- Session {sid}: running for {dur:.0f} minutes (user: {uid})"
            for sid, uid, dur in stuck
        )

        await send_alert_email(
            AlertType.STUCK_SESSION,
            f"Stuck Sessions Detected: {len(stuck)} sessions",
            f"The following sessions have been running longer than {STUCK_SESSION_MINUTES} minutes:\n\n"
            f"{details}\n\n"
            f"These sessions may be stuck due to a crashed process. "
            f"Users can now use the 'Reset Session' button to recover."
        )


# ============ Background Monitor Task ============

async def run_periodic_checks():
    """Run periodic monitoring checks. Call this from app startup."""
    while True:
        try:
            await check_stuck_sessions()
        except Exception as e:
            logger.error(f"Error in periodic monitoring: {e}")

        await asyncio.sleep(300)  # Check every 5 minutes


def start_monitoring_task():
    """Start the background monitoring task."""
    asyncio.create_task(run_periodic_checks())
    logger.info("Monitoring background task started")
