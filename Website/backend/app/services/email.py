"""Outgoing e-mail (order confirmations, status updates, password reset,
contact-form alerts).

Uses plain SMTP configured through SMTP_* settings. When SMTP_HOST is empty
nothing is sent, the message is logged instead so development still works
and order creation never depends on mail delivery.
"""
import html
import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger("mj_website.email")


def send_email(to: str | None, subject: str, text: str, html_body: str | None = None) -> bool:
    if not to:
        return False
    if not settings.SMTP_HOST:
        logger.info("E-mail (SMTP not configured) to=%s subject=%s", to, subject)
        return False
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM or settings.SMTP_USER or settings.COMPANY_EMAIL
    msg["To"] = to
    msg.set_content(text)
    if html_body:
        msg.add_alternative(html_body, subtype="html")
    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
            if settings.SMTP_TLS:
                smtp.starttls(context=ssl.create_default_context())
            if settings.SMTP_USER:
                smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.send_message(msg)
        return True
    except Exception:  # never let mail problems break a request
        logger.exception("Could not send e-mail to %s", to)
        return False


def _money(v) -> str:
    return f"GH₵{float(v):,.2f}"


def _order_lines(order) -> str:
    return "\n".join(
        f"  {float(i.quantity):g} × {i.product_name}, {i.variant_name}"
        f"{f' ({i.option_label})' if i.option_label else ''}  {_money(i.line_total)}"
        for i in order.items
    )


def send_order_confirmation_email(order) -> None:
    recipient = order.guest_email or (order.user.email if order.user else None)
    name = order.guest_name or (order.user.full_name if order.user else "customer")
    text = (
        f"Hello {name},\n\nThank you for your order {order.order_number} with {settings.COMPANY_NAME}.\n\n"
        f"{_order_lines(order)}\n\n"
        f"Subtotal: {_money(order.subtotal)}\n"
        + (f"Discount: -{_money(order.discount_amount)}\n" if order.discount_amount else "")
        + f"Shipping: {_money(order.shipping_fee)}\nTotal: {_money(order.total)}\n\n"
        f"Payment: {order.payment_method.replace('_', ' ').title()} ({order.payment_status.title()})\n"
        f"Fulfilment: {'Branch pickup' if order.fulfilment_type == 'PICKUP' else 'Delivery'}\n\n"
        f"We will contact you shortly to confirm. Track your order any time at "
        f"{settings.FRONTEND_URL}/track\n\n{settings.COMPANY_NAME}"
    )
    send_email(recipient, f"Order {order.order_number} received", text)


def send_status_email(order) -> None:
    recipient = order.guest_email or (order.user.email if order.user else None)
    labels = {
        "CONFIRMED": "has been confirmed",
        "PROCESSING": "is being prepared",
        "SHIPPED": "is on its way" if order.fulfilment_type == "DELIVERY" else "is ready for pickup",
        "DELIVERED": "has been completed",
        "CANCELLED": "has been cancelled",
    }
    phrase = labels.get(order.status)
    if not phrase:
        return
    text = (
        f"Hello,\n\nYour order {order.order_number} {phrase}.\n"
        + (f"Reason: {order.cancel_reason}\n" if order.status == "CANCELLED" and order.cancel_reason else "")
        + f"\nTrack it at {settings.FRONTEND_URL}/track\n\n{settings.COMPANY_NAME}"
    )
    send_email(recipient, f"Order {order.order_number} {phrase}", text)


def send_password_reset_email(to: str, token: str) -> None:
    link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    text = (
        f"We received a request to reset your {settings.COMPANY_NAME} password.\n\n"
        f"Use this link within one hour:\n{link}\n\n"
        "If you did not ask for this, you can ignore this message."
    )
    sent = send_email(to, "Reset your password", text)
    if not sent and settings.ENVIRONMENT == "development":
        # Development convenience only, never log reset links in production.
        logger.info("DEV password reset link for %s: %s", to, link)


def send_contact_alert(msg) -> None:
    body = (
        f"New website message\n\nFrom: {msg.name} <{msg.email}>\nPhone: {msg.phone or '-'}\n"
        f"Subject: {msg.subject or '-'}\n\n{msg.message}"
    )
    send_email(settings.COMPANY_EMAIL, f"Website enquiry from {html.escape(msg.name)}", body)
