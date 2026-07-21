import os
import requests
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from typing import List, Optional
import jwt
import json
from datetime import datetime, timedelta

from .database import engine, Base, get_db, seed_data
from . import models, schemas

# Run startup database migrations for staff preferences
def run_migrations():
    from sqlalchemy import text
    with engine.connect() as conn:
        # Staff table migrations
        result = conn.execute(text("PRAGMA table_info(staff)"))
        staff_columns = [row[1] for row in result.fetchall()]
        
        # Allocations table migrations
        result_alloc = conn.execute(text("PRAGMA table_info(allocations)"))
        alloc_columns = [row[1] for row in result_alloc.fetchall()]

        trans = conn.begin()
        try:
            if "whatsapp_enabled" not in staff_columns:
                conn.execute(text("ALTER TABLE staff ADD COLUMN whatsapp_enabled BOOLEAN DEFAULT 0 NOT NULL"))
            if "phone_number" not in staff_columns:
                conn.execute(text("ALTER TABLE staff ADD COLUMN phone_number TEXT"))
            if "email" not in staff_columns:
                conn.execute(text("ALTER TABLE staff ADD COLUMN email TEXT"))
                
            # Revert receptionist_recalls to receptionist
            conn.execute(text("UPDATE staff SET role = 'receptionist' WHERE role = 'receptionist_recalls'"))

            # Add recalls_staff_id to allocations
            if "recalls_staff_id" not in alloc_columns:
                conn.execute(text("ALTER TABLE allocations ADD COLUMN recalls_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL"))

            trans.commit()
        except Exception as e:
            trans.rollback()
            print("Migration failed:", e)

run_migrations()

# Initialize database tables
Base.metadata.create_all(bind=engine)

# Seed initial rooms, staff and allocations
db_session = next(get_db())
try:
    seed_data(db_session)
finally:
    db_session.close()

SECRET_KEY = os.environ.get("SECRET_KEY", "super-secret-key")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "12345678")

WHATSAPP_TOKEN = os.environ.get("WHATSAPP_TOKEN")
PHONE_NUMBER_ID = os.environ.get("PHONE_NUMBER_ID")
WEBHOOK_VERIFY_TOKEN = os.environ.get("WEBHOOK_VERIFY_TOKEN", "verify-token")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/login")

def get_current_admin(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        if payload.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Not authorized")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    return payload

app = FastAPI(title="Dental Clinic Resource Allocation API V2")

# Enable CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "https://dental-clinic-planner.vercel.app",
        "https://dental-clinic-planner-33djkmkjy-shmel28s-projects.vercel.app"
    ],
    allow_origin_regex=r"https://dental-clinic-planner.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def check_conflicts(
    db: Session,
    room_id: int,
    date: str,
    start_time: str,
    end_time: str,
    staff_ids: List[int],
    exclude_allocation_id: Optional[int] = None,
    recalls_staff_id: Optional[int] = None
):
    # Verify logical time order
    if start_time >= end_time:
        raise HTTPException(
            status_code=400,
            detail="End time must be strictly after the start time."
        )

    # 0. Retrieve room to verify constraints based on room type
    room = db.query(models.Room).filter(models.Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found.")

    if room.name != "Reception" and room.name != "קבלה":
        room_alloc_query = db.query(models.Allocation).filter(
            models.Allocation.room_id == room_id,
            models.Allocation.date == date,
            models.Allocation.start_time < end_time,
            models.Allocation.end_time > start_time
        )
        if exclude_allocation_id is not None:
            room_alloc_query = room_alloc_query.filter(models.Allocation.id != exclude_allocation_id)
        room_alloc = room_alloc_query.first()
        if room_alloc:
            raise HTTPException(
                status_code=400,
                detail=f"Room '{room.name}' is already allocated during {room_alloc.start_time}–{room_alloc.end_time} on this day."
            )

    if not staff_ids:
        raise HTTPException(status_code=400, detail="At least one staff member must be assigned.")

    # 2. Check staff roles and permissions
    staff_members = db.query(models.Staff).filter(models.Staff.id.in_(staff_ids)).all()
    if len(staff_members) != len(set(staff_ids)):
        raise HTTPException(status_code=404, detail="One or more staff members not found.")
        
    if room.name == "Reception":
        rec_count = 0
        for staff in staff_members:
            if staff.role != 'receptionist':
                raise HTTPException(
                    status_code=400,
                    detail=f"{staff.name} has role '{staff.role}' but the Reception column must be staffed by Receptionists."
                )
            rec_count += 1
        
        if rec_count > 3:
            raise HTTPException(
                status_code=400,
                detail="Maximum of 3 Receptionists allowed in the Reception room."
            )
            
        if recalls_staff_id is not None:
            if recalls_staff_id not in staff_ids:
                raise HTTPException(
                    status_code=400,
                    detail="The receptionist designated for recalls must be one of the assigned staff members."
                )
    else:
        if recalls_staff_id is not None:
            raise HTTPException(
                status_code=400,
                detail="Recalls designation is only permitted in the Reception room."
            )
            
        dr_count = sum(1 for s in staff_members if s.role == 'doctor')
        hyg_count = sum(1 for s in staff_members if s.role == 'hygienist')
        ast_count = sum(1 for s in staff_members if s.role == 'assistant')
        
        for staff in staff_members:
            if staff.role not in ('doctor', 'hygienist', 'assistant'):
                raise HTTPException(
                    status_code=400,
                    detail=f"{staff.name} has role '{staff.role}' but only Doctors, Hygienists, and Assistants can be in a treatment room."
                )
        
        if dr_count > 0 and hyg_count > 0:
            raise HTTPException(
                status_code=400,
                detail="Cannot mix Doctors and Hygienists in the same treatment room slot."
            )
        if dr_count > 1:
            raise HTTPException(
                status_code=400,
                detail="Maximum of 1 Doctor allowed per treatment room slot."
            )
        if hyg_count > 1:
            raise HTTPException(
                status_code=400,
                detail="Maximum of 1 Hygienist allowed per treatment room slot."
            )
        if ast_count > 1:
            raise HTTPException(
                status_code=400,
                detail="Maximum of 1 Assistant allowed per treatment room slot."
            )
        if dr_count == 0 and hyg_count == 0:
            raise HTTPException(
                status_code=400,
                detail="Treatment rooms must have at least one Dentist (doctor) or Dental Hygienist assigned."
            )

    # 3. Check double-booking for all staff members
    for staff in staff_members:
        # Check if staff is associated with any overlapping allocation
        conflict_query = db.query(models.Allocation).join(models.Allocation.staff_members).filter(
            models.Allocation.date == date,
            models.Allocation.start_time < end_time,
            models.Allocation.end_time > start_time,
            models.Staff.id == staff.id
        )
        if exclude_allocation_id is not None:
            conflict_query = conflict_query.filter(models.Allocation.id != exclude_allocation_id)
            
        conflict = conflict_query.first()
        if conflict:
            other_room = db.query(models.Room).filter(models.Room.id == conflict.room_id).first()
            other_room_name = other_room.name if other_room else f"Room ID {conflict.room_id}"
            raise HTTPException(
                status_code=400,
                detail=f"Staff member {staff.name} is already assigned to '{other_room_name}' during {conflict.start_time}–{conflict.end_time}."
            )


@app.post("/api/login", response_model=schemas.Token)
def login(request: schemas.LoginRequest):
    if request.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Incorrect password")
    
    expire = datetime.utcnow() + timedelta(hours=12)
    token = jwt.encode({"role": "admin", "exp": expire}, SECRET_KEY, algorithm="HS256")
    return {"access_token": token, "token_type": "bearer"}

# --- Rooms API ---
@app.get("/api/rooms", response_model=List[schemas.Room])
def get_rooms(db: Session = Depends(get_db)):
    return db.query(models.Room).all()

@app.post("/api/rooms", response_model=schemas.Room, status_code=201)
def create_room(room: schemas.RoomCreate, db: Session = Depends(get_db), admin: dict = Depends(get_current_admin)):
    db_room = db.query(models.Room).filter(models.Room.name == room.name).first()
    if db_room:
        raise HTTPException(status_code=400, detail="Room with this name already exists.")
    new_room = models.Room(name=room.name)
    db.add(new_room)
    db.commit()
    db.refresh(new_room)
    return new_room


# --- Staff API ---
@app.get("/api/staff", response_model=List[schemas.Staff])
def get_staff(role: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(models.Staff)
    if role:
        if role not in ('doctor', 'hygienist', 'assistant', 'receptionist'):
            raise HTTPException(status_code=400, detail="Invalid role filter.")
        query = query.filter(models.Staff.role == role)
    return query.all()

@app.post("/api/staff", response_model=schemas.Staff, status_code=201)
def create_staff(staff: schemas.StaffCreate, db: Session = Depends(get_db), admin: dict = Depends(get_current_admin)):
    if staff.role not in ('doctor', 'hygienist', 'assistant', 'receptionist'):
        raise HTTPException(status_code=400, detail="Invalid staff role.")
    new_staff = models.Staff(
        name=staff.name, 
        role=staff.role,
        whatsapp_enabled=staff.whatsapp_enabled,
        phone_number=staff.phone_number,
        email=staff.email
    )
    db.add(new_staff)
    db.commit()
    db.refresh(new_staff)
    return new_staff

@app.put("/api/staff/{id}", response_model=schemas.Staff)
def update_staff(id: int, staff_data: schemas.StaffCreate, db: Session = Depends(get_db), admin: dict = Depends(get_current_admin)):
    db_staff = db.query(models.Staff).filter(models.Staff.id == id).first()
    if not db_staff:
        raise HTTPException(status_code=404, detail="Staff member not found")
    
    if staff_data.role not in ('doctor', 'hygienist', 'assistant', 'receptionist'):
        raise HTTPException(status_code=400, detail="Invalid staff role.")
    
    db_staff.name = staff_data.name
    db_staff.role = staff_data.role
    db_staff.whatsapp_enabled = staff_data.whatsapp_enabled
    db_staff.phone_number = staff_data.phone_number
    db_staff.email = staff_data.email
    
    db.commit()
    db.refresh(db_staff)
    return db_staff

@app.post("/api/staff/bulk-update", response_model=List[schemas.Staff])
def bulk_update_staff(staff_list: List[schemas.Staff], db: Session = Depends(get_db), admin: dict = Depends(get_current_admin)):
    updated_staff = []
    for s in staff_list:
        db_staff = db.query(models.Staff).filter(models.Staff.id == s.id).first()
        if db_staff:
            db_staff.name = s.name
            db_staff.role = s.role
            db_staff.whatsapp_enabled = s.whatsapp_enabled
            db_staff.phone_number = s.phone_number
            db_staff.email = s.email
            updated_staff.append(db_staff)
    db.commit()
    
    # Trigger webhook with the updated staff preferences
    try:
        from .notifier import trigger_webhook
        serialized_staff = []
        for s in updated_staff:
            serialized_staff.append({
                "id": s.id,
                "name": s.name,
                "role": s.role,
                "whatsapp_enabled": s.whatsapp_enabled,
                "phone_number": s.phone_number,
                "email": s.email
            })
        trigger_webhook("resource_changes", serialized_staff)
    except Exception as e:
        print("Failed to trigger webhook for resource_changes:", e)
        
    return updated_staff


# --- Allocations API ---
@app.get("/api/allocations", response_model=List[schemas.Allocation])
def get_allocations(
    date: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    room_id: Optional[int] = None,
    staff_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    query = db.query(models.Allocation)
    if date:
        query = query.filter(models.Allocation.date == date)
    if start_date:
        query = query.filter(models.Allocation.date >= start_date)
    if end_date:
        query = query.filter(models.Allocation.date <= end_date)
    
    if room_id is not None:
        query = query.filter(models.Allocation.room_id == room_id)
        
    if staff_id is not None:
        # Match if staff member is in staff_members
        query = query.join(models.Allocation.staff_members).filter(models.Staff.id == staff_id)
        
    return query.all()

@app.post("/api/allocations", response_model=schemas.Allocation, status_code=201)
def create_allocation(allocation: schemas.AllocationCreate, db: Session = Depends(get_db), admin: dict = Depends(get_current_admin)):
    # Run conflict checks
    check_conflicts(
        db=db,
        room_id=allocation.room_id,
        date=allocation.date,
        start_time=allocation.start_time,
        end_time=allocation.end_time,
        staff_ids=allocation.staff_ids,
        recalls_staff_id=allocation.recalls_staff_id
    )

    staff_members = db.query(models.Staff).filter(models.Staff.id.in_(allocation.staff_ids)).all()

    db_allocation = models.Allocation(
        room_id=allocation.room_id,
        date=allocation.date,
        start_time=allocation.start_time,
        end_time=allocation.end_time,
        staff_members=staff_members,
        recalls_staff_id=allocation.recalls_staff_id
    )
    db.add(db_allocation)
    db.commit()
    db.refresh(db_allocation)
    return db_allocation

@app.put("/api/allocations/{id}", response_model=schemas.Allocation)
def update_allocation(
    id: int,
    allocation: schemas.AllocationCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin)
):
    db_alloc = db.query(models.Allocation).filter(models.Allocation.id == id).first()
    if not db_alloc:
        raise HTTPException(status_code=404, detail="Allocation not found.")

    # Run conflict checks, ignoring this allocation's current booking
    check_conflicts(
        db=db,
        room_id=allocation.room_id,
        date=allocation.date,
        start_time=allocation.start_time,
        end_time=allocation.end_time,
        staff_ids=allocation.staff_ids,
        exclude_allocation_id=id,
        recalls_staff_id=allocation.recalls_staff_id
    )

    staff_members = db.query(models.Staff).filter(models.Staff.id.in_(allocation.staff_ids)).all()

    db_alloc.room_id = allocation.room_id
    db_alloc.date = allocation.date
    db_alloc.start_time = allocation.start_time
    db_alloc.end_time = allocation.end_time
    db_alloc.staff_members = staff_members
    db_alloc.recalls_staff_id = allocation.recalls_staff_id

    db.commit()
    db.refresh(db_alloc)
    return db_alloc

@app.delete("/api/allocations/{id}", status_code=204)
def delete_allocation(id: int, db: Session = Depends(get_db), admin: dict = Depends(get_current_admin)):
    db_alloc = db.query(models.Allocation).filter(models.Allocation.id == id).first()
    if not db_alloc:
        raise HTTPException(status_code=404, detail="Allocation not found.")
    db.delete(db_alloc)
    db.commit()
    return None

@app.delete("/api/rooms/{id}", status_code=204)
def delete_room(id: int, db: Session = Depends(get_db), admin: dict = Depends(get_current_admin)):
    room = db.query(models.Room).filter(models.Room.id == id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found.")
    
    if room.name == "Reception":
        raise HTTPException(
            status_code=400,
            detail="The Reception desk is a permanent clinic column and cannot be deleted."
        )
        
    # Cascade delete will handle active allocations
    db.delete(room)
    db.commit()
    return None

@app.delete("/api/staff/{id}", status_code=204)
def delete_staff(id: int, db: Session = Depends(get_db), admin: dict = Depends(get_current_admin)):
    staff = db.query(models.Staff).filter(models.Staff.id == id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found.")
    
    # Restrict delete if staff member is assigned to any active allocations
    active_alloc = db.query(models.Allocation).join(models.Allocation.staff_members).filter(
        models.Staff.id == id
    ).first()
    if active_alloc:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete staff member {staff.name} because they have active allocations in the schedule. Please remove their bookings first."
        )
    
    db.delete(staff)
    db.commit()
    return None


@app.post("/api/allocations/copy-day", status_code=201)
def copy_day_allocations(
    source_date: str,
    target_date: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin)
):
    if source_date == target_date:
        raise HTTPException(
            status_code=400,
            detail="Source and target dates must be different."
        )

    # 1. Fetch source allocations
    source_allocs = db.query(models.Allocation).filter(models.Allocation.date == source_date).all()
    if not source_allocs:
        raise HTTPException(
            status_code=404,
            detail=f"No allocations found on source date {source_date}."
        )

    # 2. Clear target date allocations
    db.query(models.Allocation).filter(models.Allocation.date == target_date).delete()

    # 3. Duplicate allocations to target date
    copied_count = 0
    for alloc in source_allocs:
        new_alloc = models.Allocation(
            room_id=alloc.room_id,
            date=target_date,
            start_time=alloc.start_time,
            end_time=alloc.end_time,
            staff_members=alloc.staff_members
        )
        db.add(new_alloc)
        copied_count += 1

    db.commit()
    return {"detail": f"Successfully copied {copied_count} allocations to {target_date}."}


@app.post("/api/allocations/copy-week", status_code=201)
def copy_week_allocations(
    source_start_date: str,
    target_start_date: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin)
):
    if source_start_date == target_start_date:
        raise HTTPException(
            status_code=400,
            detail="Source and target week start dates must be different."
        )

    from datetime import datetime, timedelta
    try:
        src_sun = datetime.strptime(source_start_date, "%Y-%m-%d")
        tgt_sun = datetime.strptime(target_start_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid date format. Expected YYYY-MM-DD."
        )

    # 1. Clear target week allocations (7 days)
    tgt_end = tgt_sun + timedelta(days=6)
    tgt_sun_str = tgt_sun.strftime("%Y-%m-%d")
    tgt_end_str = tgt_end.strftime("%Y-%m-%d")
    db.query(models.Allocation).filter(
        models.Allocation.date >= tgt_sun_str,
        models.Allocation.date <= tgt_end_str
    ).delete()

    # 2. Copy allocations day by day (7 days)
    copied_count = 0
    new_allocations = []
    for i in range(7):
        src_d = (src_sun + timedelta(days=i)).strftime("%Y-%m-%d")
        tgt_d = (tgt_sun + timedelta(days=i)).strftime("%Y-%m-%d")

        src_allocs = db.query(models.Allocation).filter(models.Allocation.date == src_d).all()
        for alloc in src_allocs:
            check_conflicts(
                db=db,
                room_id=alloc.room_id,
                date=tgt_d,
                start_time=alloc.start_time,
                end_time=alloc.end_time,
                staff_ids=[s.id for s in alloc.staff_members],
                recalls_staff_id=alloc.recalls_staff_id
            )
            
            new_alloc = models.Allocation(
                room_id=alloc.room_id,
                date=tgt_d,
                start_time=alloc.start_time,
                end_time=alloc.end_time,
                recalls_staff_id=alloc.recalls_staff_id,
                staff_members=alloc.staff_members
            )
            db.add(new_alloc)
            new_allocations.append(new_alloc)
            copied_count += 1

    db.commit()

    return {"detail": f"Successfully copied {copied_count} allocations to the week starting {target_start_date}."}

def format_hebrew_date(date_str: str) -> str:
    try:
        from datetime import datetime
        d = datetime.strptime(date_str, "%Y-%m-%d")
        hebrew_days = {
            0: "ב",
            1: "ג",
            2: "ד",
            3: "ה",
            4: "ו",
            5: "שבת",
            6: "א"
        }
        day_str = hebrew_days[d.weekday()]
        return f"יום {day_str} ה-{d.strftime('%d.%m')}"
    except Exception:
        return date_str

def format_whatsapp_number(phone_raw: str) -> str:
    import re
    # Remove all non-numeric characters (dashes, spaces, plus signs, parentheses)
    sanitized = re.sub(r'\D', '', phone_raw)
    
    # Apply Prefix Logic for Israeli numbers
    if sanitized.startswith('0') and len(sanitized) == 10:
        return '972' + sanitized[1:]
    elif sanitized.startswith('972') and len(sanitized) == 12:
        return sanitized
        
    return sanitized

def generate_whatsapp_payloads(allocations, start_date, end_date):
    from collections import defaultdict
    staff_schedules = defaultdict(list)
    for a in allocations:
        room_name = a.room.name
        
        for staff in a.staff_members:
            if not staff.whatsapp_enabled or not staff.phone_number:
                continue
                
            formatted_date = format_hebrew_date(a.date)
            shift_line = f"{formatted_date} ({a.start_time}-{a.end_time}) בחדר {room_name}"
            
            if staff.role in ("doctor", "assistant", "hygienist"):
                partners = [s.name for s in a.staff_members if s.id != staff.id]
                if partners:
                    shift_line += f" יחד עם: {', '.join(partners)}"
            elif staff.role == "receptionist":
                if getattr(a, "recalls_staff_id", None) == staff.id:
                    shift_line += " [אחראי/ת ריקולים]"
                    
            staff_schedules[staff].append(shift_line)
            
    compiled_payloads = []
    
    formatted_start = format_hebrew_date(start_date)
    formatted_end = format_hebrew_date(end_date)
    
    for staff, shifts in staff_schedules.items():
        shifts.sort()
        message = f"שלום {staff.name}, המשמרות שלך לתאריכים {formatted_start} עד {formatted_end} הן:\n" + "\n".join(shifts)
        phone_clean = format_whatsapp_number(staff.phone_number)
        
        compiled_payloads.append({
            "staff_id": staff.id,
            "name": staff.name,
            "phone_raw": staff.phone_number.strip(),
            "phone_clean": phone_clean,
            "message": message
        })
        
    return compiled_payloads

def dispatch_whatsapp_messages(payloads):
    statuses = []
    errors = []
    messages_sent = 0
    url = os.environ.get("WHATSAPP_SERVICE_URL", "http://localhost:3000/send-message")
    headers = {
        "Content-Type": "application/json"
    }
    
    for payload_data in payloads:
        payload = {
            "phoneNumber": payload_data["phone_clean"],
            "message": payload_data["message"]
        }
        
        print(f"--- Sending WhatsApp to {payload_data['name']} ({payload_data['phone_clean']}) ---")
        print("Payload:", json.dumps(payload))
        
        try:
            response = requests.post(url, headers=headers, json=payload)
            
            print("Response Status Code:", response.status_code)
            print("Response Body:", response.text)
            print("--------------------------------------------------")
            
            if response.status_code == 200:
                messages_sent += 1
                statuses.append({
                    "staff_id": payload_data["staff_id"],
                    "name": payload_data["name"],
                    "phone": payload_data["phone_raw"],
                    "status": "Sent Successfully"
                })
            else:
                errors.append({
                    "staff": payload_data["name"],
                    "phone": payload_data["phone_raw"],
                    "error": response.text
                })
                try:
                    error_json = response.json()
                    err_msg = error_json.get("error", "Unknown error")
                except:
                    err_msg = response.text
                    
                statuses.append({
                    "staff_id": payload_data["staff_id"],
                    "name": payload_data["name"],
                    "phone": payload_data["phone_raw"],
                    "status": f"Failed: {err_msg}"
                })
        except Exception as e:
            err_msg = str(e)
            print(f"Connection Error: {err_msg}")
            errors.append({
                "staff": payload_data["name"],
                "phone": payload_data["phone_raw"],
                "error": err_msg
            })
            statuses.append({
                "staff_id": payload_data["staff_id"],
                "name": payload_data["name"],
                "phone": payload_data["phone_raw"],
                "status": f"Failed: Connection Error to Baileys service"
            })
            
    return messages_sent, errors, statuses


@app.post("/api/whatsapp/broadcast-week")
def broadcast_week(
    start_date: str,
    end_date: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin)
):
    allocations = db.query(models.Allocation).filter(
        models.Allocation.date >= start_date,
        models.Allocation.date <= end_date
    ).all()
    
    payloads = generate_whatsapp_payloads(allocations, start_date, end_date)
    if not payloads:
        return {"statuses": []}
        
    _, _, statuses = dispatch_whatsapp_messages(payloads)
    return {"statuses": statuses}


@app.post("/api/allocations/copy-room-day", status_code=201)
def copy_room_day_allocations(
    source_date: str,
    target_date: str,
    room_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin)
):
    if source_date == target_date:
        raise HTTPException(
            status_code=400,
            detail="Source and target dates must be different."
        )

    # 1. Fetch source allocations for the specific room on source date
    source_allocs = db.query(models.Allocation).filter(
        models.Allocation.room_id == room_id,
        models.Allocation.date == source_date
    ).all()

    # 2. Clear target date allocations ONLY for that specific room
    db.query(models.Allocation).filter(
        models.Allocation.room_id == room_id,
        models.Allocation.date == target_date
    ).delete()

    # 3. Duplicate allocations to target date
    copied_count = 0
    for alloc in source_allocs:
        check_conflicts(
            db=db,
            room_id=room_id,
            date=target_date,
            start_time=alloc.start_time,
            end_time=alloc.end_time,
            staff_ids=[s.id for s in alloc.staff_members],
            recalls_staff_id=alloc.recalls_staff_id
        )
        
        new_alloc = models.Allocation(
            room_id=room_id,
            date=target_date,
            start_time=alloc.start_time,
            end_time=alloc.end_time,
            recalls_staff_id=alloc.recalls_staff_id,
            staff_members=alloc.staff_members
        )
        db.add(new_alloc)
        copied_count += 1

    db.commit()
    return {"detail": f"Successfully copied {copied_count} allocations for room ID {room_id} to {target_date}."}



@app.post("/api/allocations/clear-week", status_code=200)
def clear_week_allocations(
    week_start_date: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin)
):
    from datetime import datetime, timedelta
    try:
        start_dt = datetime.strptime(week_start_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Expected YYYY-MM-DD.")
    end_dt = start_dt + timedelta(days=6)
    end_date_str = end_dt.strftime("%Y-%m-%d")

    allocs = db.query(models.Allocation).filter(
        models.Allocation.date >= week_start_date,
        models.Allocation.date <= end_date_str
    ).all()

    # Create snapshot
    allocs_data = []
    for a in allocs:
        allocs_data.append({
            "room_id": a.room_id,
            "date": a.date,
            "start_time": a.start_time,
            "end_time": a.end_time,
            "staff_ids": [s.id for s in a.staff_members]
        })
    
    snapshot = models.AllocationSnapshot(
        week_start_date=week_start_date,
        snapshot_data=json.dumps(allocs_data),
        created_at=datetime.utcnow().isoformat()
    )
    db.add(snapshot)

    # Delete allocs
    db.query(models.Allocation).filter(
        models.Allocation.date >= week_start_date,
        models.Allocation.date <= end_date_str
    ).delete()

    db.commit()
    return {"detail": "Week cleared and snapshot created."}

@app.post("/api/allocations/undo-clear", status_code=200)
def undo_clear_week(
    week_start_date: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin)
):
    snapshot = db.query(models.AllocationSnapshot).filter(
        models.AllocationSnapshot.week_start_date == week_start_date
    ).order_by(models.AllocationSnapshot.id.desc()).first()

    if not snapshot:
        raise HTTPException(status_code=404, detail="No snapshot found for this week.")

    allocs_data = json.loads(snapshot.snapshot_data)
    for a_data in allocs_data:
        new_alloc = models.Allocation(**a_data)
        db.add(new_alloc)
    
    db.delete(snapshot)
    db.commit()
    return {"detail": "Undo successful."}


# --- WhatsApp Cloud API Webhooks & Endpoints ---

@app.get("/webhook")
def verify_webhook(request: Request):
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")
    
    if mode and token:
        if mode == "subscribe" and token == WEBHOOK_VERIFY_TOKEN:
            return HTMLResponse(content=challenge, status_code=200)
        else:
            raise HTTPException(status_code=403, detail="Verification failed")
    raise HTTPException(status_code=400, detail="Missing parameters")


@app.post("/webhook")
async def handle_webhook(request: Request):
    try:
        body = await request.json()
        print("Received WhatsApp Webhook:", json.dumps(body, indent=2))
        return {"status": "ok"}
    except Exception as e:
        print("Webhook Error:", e)
        raise HTTPException(status_code=400, detail="Invalid JSON")


@app.post("/api/send-shift-reminders")
def send_shift_reminders(db: Session = Depends(get_db)):
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    allocations = db.query(models.Allocation).filter(models.Allocation.date == tomorrow).all()
    if not allocations:
        return {"detail": f"No shifts scheduled for tomorrow ({tomorrow})."}
        
    payloads = generate_whatsapp_payloads(allocations, tomorrow, tomorrow)
    if not payloads:
        return {"detail": f"No staff opted-in for WhatsApp for tomorrow ({tomorrow}).", "statuses": [], "errors": []}
        
    messages_sent, errors, statuses = dispatch_whatsapp_messages(payloads)
    
    return {
        "detail": f"Processed {len(payloads)} shift reminders for {tomorrow}.",
        "errors": errors,
        "statuses": statuses
    }


@app.post("/api/whatsapp/send-individual")
def send_individual_reminder(
    staff_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin)
):
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    
    # Verify staff exists and is enabled
    staff = db.query(models.Staff).filter(models.Staff.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")
    if not staff.whatsapp_enabled:
        raise HTTPException(status_code=400, detail="Staff member has not opted in to WhatsApp")
        
    # Fetch their allocations for tomorrow
    # We join with allocations and filter by staff_id
    allocations = db.query(models.Allocation).join(models.Allocation.staff_members).filter(
        models.Allocation.date == tomorrow,
        models.Staff.id == staff_id
    ).all()
    
    if not allocations:
        return {"detail": f"No shifts scheduled for {staff.name} tomorrow ({tomorrow})."}
        
    # generate_whatsapp_payloads expects all allocations and builds message for all staff in them, 
    # but we only want to dispatch for this specific staff_id.
    # To avoid sending to other staff in the same allocation, we will filter the returned payloads.
    payloads = generate_whatsapp_payloads(allocations, tomorrow, tomorrow)
    individual_payload = [p for p in payloads if p["staff_id"] == staff_id]
    
    if not individual_payload:
        return {"detail": f"No payload generated for {staff.name}.", "statuses": [], "errors": []}
        
    messages_sent, errors, statuses = dispatch_whatsapp_messages(individual_payload)
    
    if not statuses or "Failed" in statuses[0].get("status", ""):
        raise HTTPException(status_code=500, detail=f"Failed to send to {staff.name}. Check logs.")
        
    return {
        "detail": f"Sent reminder to {staff.name}",
        "status": statuses[0]
    }


# --- Serve Static Frontend in Production ---
# Resolve frontend/dist directory relative to this file
frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))

@app.get("/{catchall:path}")
def serve_frontend(catchall: str):
    file_path = os.path.join(frontend_dist, catchall)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    
    # Fallback to index.html for SPA client-side routing
    index_path = os.path.join(frontend_dist, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return HTMLResponse("Frontend build index.html not found. Please build the frontend first.", status_code=404)

