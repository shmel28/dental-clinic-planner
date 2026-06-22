import os
import logging
import requests

logger = logging.getLogger("notifier")

def trigger_webhook(action_type: str, payload: list):
    """
    Triggers a webhook by sending a POST request to MAKE_WEBHOOK_URL.
    Filters the payload based on each staff member's 'whatsapp_enabled' and 'gcal_enabled' flags.
    Only data for users who opted in is sent.
    """
    webhook_url = os.environ.get("MAKE_WEBHOOK_URL") or "https://hook.eu1.make.com/x8i2qkjj7sodp5m7unhm2va9lq71adeu"

    # 1. Filter the payload based on staff preferences
    filtered_payload = []

    if action_type == "resource_changes":
        # Payload is a list of staff members
        for staff in payload:
            if staff.get("whatsapp_enabled") or staff.get("gcal_enabled"):
                filtered_payload.append(staff)

    elif action_type == "copy_week":
        # Payload is a list of allocations
        for alloc in payload:
            main_p = alloc.get("main_practitioner") or {}
            assistant = alloc.get("assistant") or {}
            
            # Check if main practitioner or assistant is opted in
            main_p_opted_in = main_p.get("whatsapp_enabled") or main_p.get("gcal_enabled")
            assistant_opted_in = assistant.get("whatsapp_enabled") or assistant.get("gcal_enabled")
            
            if main_p_opted_in or assistant_opted_in:
                # Include this allocation
                filtered_payload.append(alloc)
    else:
        # Default fallback
        filtered_payload = payload

    # 2. Trigger webhook or log
    full_body = {
        "action_type": action_type,
        "data": filtered_payload
    }

    if webhook_url:
        try:
            response = requests.post(webhook_url, json=full_body, timeout=10)
            logger.info(f"Webhook triggered successfully: {response.status_code}")
            print(f"Webhook triggered successfully: {response.status_code}")
        except Exception as e:
            logger.error(f"Failed to trigger webhook: {e}")
            print(f"Failed to trigger webhook: {e}")
    else:
        logger.info(f"[NO MAKE_WEBHOOK_URL] Logged payload: {full_body}")
        print(f"[NO MAKE_WEBHOOK_URL] Logged payload: {full_body}")

    return full_body
