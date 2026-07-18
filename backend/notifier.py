import os
import logging
import requests

logger = logging.getLogger("notifier")

def trigger_webhook(action_type: str, payload: list):
    """
    Triggers a webhook by sending a POST request to MAKE_WEBHOOK_URL.
    Filters the payload based on each staff member's 'whatsapp_enabled' flag.
    Only data for users who opted in is sent.
    """
    webhook_url = os.environ.get("MAKE_WEBHOOK_URL") or "https://hook.eu1.make.com/x8i2qkjj7sodp5m7unhm2va9lq71adeu"

    # 1. Filter the payload based on staff preferences
    filtered_payload = []

    if action_type == "resource_changes":
        for staff in payload:
            if staff.get("whatsapp_enabled"):
                filtered_payload.append(staff)

    elif action_type == "copy_week":
        for alloc in payload:
            main_p = alloc.get("main_practitioner") or {}
            assistant = alloc.get("assistant") or {}
            if main_p.get("whatsapp_enabled") or assistant.get("whatsapp_enabled"):
                filtered_payload.append(alloc)
    else:
        filtered_payload = payload

    full_body = {
        "action_type": action_type,
        "data": filtered_payload
    }

    if webhook_url:
        try:
            response = requests.post(webhook_url, json=full_body, timeout=10)
            logger.info(f"Webhook triggered successfully: {response.status_code}")
        except Exception as e:
            logger.error(f"Failed to trigger webhook: {e}")
    else:
        logger.info(f"[NO MAKE_WEBHOOK_URL] Logged payload: {full_body}")

    return full_body

def send_batch_whatsapp_messages(compiled_payloads: list):
    """
    Simulates sending batch WhatsApp messages via Meta Cloud API or Make.com.
    Expects compiled_payloads to be a list of dictionaries with staff_id, name, phone, and message.
    Returns delivery status for each staff member.
    """
    webhook_url = os.environ.get("MAKE_WEBHOOK_URL") or "https://hook.eu1.make.com/x8i2qkjj7sodp5m7unhm2va9lq71adeu"
    
    statuses = []
    
    if webhook_url:
        try:
            # Send batch payload to Make.com to handle delivery
            response = requests.post(webhook_url, json={"action_type": "batch_publish", "data": compiled_payloads}, timeout=10)
            success = response.status_code in (200, 204)
        except Exception as e:
            logger.error(f"Failed to trigger batch webhook: {e}")
            success = False
    else:
        success = True # Mock success
    
    for payload in compiled_payloads:
        statuses.append({
            "staff_id": payload["staff_id"],
            "name": payload["name"],
            "phone": payload["phone"] or "N/A",
            "status": "Sent Successfully" if success else "Failed"
        })
        
    return statuses
