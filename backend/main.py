import os
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional

from .database import engine, Base, get_db, seed_data
from . import models, schemas

# Initialize database tables
Base.metadata.create_all(bind=engine)

# Seed initial rooms, staff and allocations
db_session = next(get_db())
try:
    seed_data(db_session)
finally:
    db_session.close()

app = FastAPI(title="Dental Clinic Resource Allocation API V2")

# Enable CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For local development, allow all origins
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
    main_practitioner_id: int,
    assistant_id: Optional[int] = None,
    exclude_allocation_id: Optional[int] = None
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

    # 1. Check room overlap conflict
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

    # 2. Check main practitioner role and permissions
    mp = db.query(models.Staff).filter(models.Staff.id == main_practitioner_id).first()
    if not mp:
        raise HTTPException(status_code=404, detail="Main practitioner not found.")
        
    if room.name == "Reception":
        if mp.role != "receptionist":
            raise HTTPException(
                status_code=400,
                detail=f"{mp.name} has role '{mp.role}' but the Reception column must be staffed by a Receptionist."
            )
        if assistant_id is not None:
            raise HTTPException(
                status_code=400,
                detail="Receptionists do not require assistants. Please clear the assistant selection."
            )
    else:
        if mp.role not in ('doctor', 'hygienist'):
            raise HTTPException(
                status_code=400,
                detail=f"{mp.name} has role '{mp.role}' but main practitioner in a treatment room must be a Dentist (doctor) or Dental Hygienist."
            )
        
        # 3. Check assistant role if provided
        if assistant_id is not None:
            ass = db.query(models.Staff).filter(models.Staff.id == assistant_id).first()
            if not ass:
                raise HTTPException(status_code=404, detail="Assistant not found.")
            if ass.role != 'assistant':
                raise HTTPException(
                    status_code=400,
                    detail=f"{ass.name} has role '{ass.role}' but assistant must be a Dental Assistant."
                )

    # 4. Check main practitioner double-booking range overlap in other rooms
    mp_conflict_query = db.query(models.Allocation).filter(
        models.Allocation.date == date,
        models.Allocation.start_time < end_time,
        models.Allocation.end_time > start_time,
        ((models.Allocation.main_practitioner_id == main_practitioner_id) | (models.Allocation.assistant_id == main_practitioner_id))
    )
    if exclude_allocation_id is not None:
        mp_conflict_query = mp_conflict_query.filter(models.Allocation.id != exclude_allocation_id)
    mp_conflict = mp_conflict_query.first()
    if mp_conflict:
        other_room = db.query(models.Room).filter(models.Room.id == mp_conflict.room_id).first()
        other_room_name = other_room.name if other_room else f"Room ID {mp_conflict.room_id}"
        raise HTTPException(
            status_code=400,
            detail=f"Staff member {mp.name} is already assigned to '{other_room_name}' during {mp_conflict.start_time}–{mp_conflict.end_time}."
        )

    # 5. Check assistant double-booking range overlap in other rooms
    if assistant_id is not None:
        ass_conflict_query = db.query(models.Allocation).filter(
            models.Allocation.date == date,
            models.Allocation.start_time < end_time,
            models.Allocation.end_time > start_time,
            ((models.Allocation.main_practitioner_id == assistant_id) | (models.Allocation.assistant_id == assistant_id))
        )
        if exclude_allocation_id is not None:
            ass_conflict_query = ass_conflict_query.filter(models.Allocation.id != exclude_allocation_id)
        ass_conflict = ass_conflict_query.first()
        if ass_conflict:
            other_room = db.query(models.Room).filter(models.Room.id == ass_conflict.room_id).first()
            other_room_name = other_room.name if other_room else f"Room ID {ass_conflict.room_id}"
            raise HTTPException(
                status_code=400,
                detail=f"Staff member {ass.name} is already assigned to '{other_room_name}' during {ass_conflict.start_time}–{ass_conflict.end_time}."
            )


# --- Rooms API ---
@app.get("/api/rooms", response_model=List[schemas.Room])
def get_rooms(db: Session = Depends(get_db)):
    return db.query(models.Room).all()

@app.post("/api/rooms", response_model=schemas.Room, status_code=201)
def create_room(room: schemas.RoomCreate, db: Session = Depends(get_db)):
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
def create_staff(staff: schemas.StaffCreate, db: Session = Depends(get_db)):
    if staff.role not in ('doctor', 'hygienist', 'assistant', 'receptionist'):
        raise HTTPException(status_code=400, detail="Invalid staff role.")
    new_staff = models.Staff(name=staff.name, role=staff.role)
    db.add(new_staff)
    db.commit()
    db.refresh(new_staff)
    return new_staff


# --- Allocations API ---
@app.get("/api/allocations", response_model=List[schemas.Allocation])
def get_allocations(
    date: str,
    room_id: Optional[int] = None,
    staff_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    query = db.query(models.Allocation).filter(models.Allocation.date == date)
    
    if room_id is not None:
        query = query.filter(models.Allocation.room_id == room_id)
        
    if staff_id is not None:
        # Match if staff member is main practitioner or assistant
        query = query.filter(
            (models.Allocation.main_practitioner_id == staff_id) |
            (models.Allocation.assistant_id == staff_id)
        )
        
    return query.all()

@app.post("/api/allocations", response_model=schemas.Allocation, status_code=201)
def create_allocation(allocation: schemas.AllocationCreate, db: Session = Depends(get_db)):
    # Run conflict checks
    check_conflicts(
        db=db,
        room_id=allocation.room_id,
        date=allocation.date,
        start_time=allocation.start_time,
        end_time=allocation.end_time,
        main_practitioner_id=allocation.main_practitioner_id,
        assistant_id=allocation.assistant_id
    )

    db_allocation = models.Allocation(
        room_id=allocation.room_id,
        date=allocation.date,
        start_time=allocation.start_time,
        end_time=allocation.end_time,
        main_practitioner_id=allocation.main_practitioner_id,
        assistant_id=allocation.assistant_id
    )
    db.add(db_allocation)
    db.commit()
    db.refresh(db_allocation)
    return db_allocation

@app.put("/api/allocations/{id}", response_model=schemas.Allocation)
def update_allocation(
    id: int,
    allocation: schemas.AllocationCreate,
    db: Session = Depends(get_db)
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
        main_practitioner_id=allocation.main_practitioner_id,
        assistant_id=allocation.assistant_id,
        exclude_allocation_id=id
    )

    db_alloc.room_id = allocation.room_id
    db_alloc.date = allocation.date
    db_alloc.start_time = allocation.start_time
    db_alloc.end_time = allocation.end_time
    db_alloc.main_practitioner_id = allocation.main_practitioner_id
    db_alloc.assistant_id = allocation.assistant_id

    db.commit()
    db.refresh(db_alloc)
    return db_alloc

@app.delete("/api/allocations/{id}", status_code=204)
def delete_allocation(id: int, db: Session = Depends(get_db)):
    db_alloc = db.query(models.Allocation).filter(models.Allocation.id == id).first()
    if not db_alloc:
        raise HTTPException(status_code=404, detail="Allocation not found.")
    db.delete(db_alloc)
    db.commit()
    return None

@app.delete("/api/rooms/{id}", status_code=204)
def delete_room(id: int, db: Session = Depends(get_db)):
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
def delete_staff(id: int, db: Session = Depends(get_db)):
    staff = db.query(models.Staff).filter(models.Staff.id == id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found.")
    
    # Restrict delete if staff member is assigned to any active allocations
    active_alloc = db.query(models.Allocation).filter(
        (models.Allocation.main_practitioner_id == id) |
        (models.Allocation.assistant_id == id)
    ).first()
    if active_alloc:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete staff member {staff.name} because they have active allocations in the schedule. Please remove their bookings first."
        )
    
    db.delete(staff)
    db.commit()
    return None


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

