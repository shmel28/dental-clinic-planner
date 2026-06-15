import os
from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Database path (SQLite file stored in the backend folder)
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = f"sqlite:///{os.path.join(BACKEND_DIR, 'clinic.db')}"

# Connect args needed for SQLite to enforce foreign keys
engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)

# Enforce foreign key constraints in SQLite
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Dependency to get db session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def seed_data(db):
    from .models import Room, Staff, Allocation
    
    # Check if database is already seeded (by checking rooms)
    if db.query(Room).first() is not None:
        return

    # Seed Default Rooms
    rooms = [
        Room(name="Reception"),  # Permanent Reception Desk Column
        Room(name="Room A (General)"),
        Room(name="Room B (Hygiene)"),
        Room(name="Room C (Surgery)"),
        Room(name="Room D (Orthodontics)"),
    ]
    for r in rooms:
        db.add(r)
    db.commit()

    # Seed Default Staff
    staff_members = [
        # Doctors (Dentists)
        Staff(name="Dr. Sarah Jenkins", role="doctor"),
        Staff(name="Dr. Michael Chang", role="doctor"),
        Staff(name="Dr. Elena Rostova", role="doctor"),
        # Hygienists
        Staff(name="Emma Watson", role="hygienist"),
        Staff(name="Liam Carter", role="hygienist"),
        # Assistants
        Staff(name="Chloe Bennett", role="assistant"),
        Staff(name="David Kim", role="assistant"),
        Staff(name="Sofia Martinez", role="assistant"),
        # Receptionists
        Staff(name="Alice Vance", role="receptionist"),
        Staff(name="Bob Vance", role="receptionist"),
    ]
    for s in staff_members:
        db.add(s)
    db.commit()

    # Seed some initial allocations for 2026-06-15 (today in user metadata)
    reception_room = rooms[0]  # Reception
    room_a = rooms[1]          # Room A
    room_b = rooms[2]          # Room B
    
    dr_sarah = staff_members[0]  # Dr. Sarah
    emma = staff_members[3]      # Emma Watson (Hygienist)
    chloe = staff_members[5]     # Chloe Bennett (Assistant)
    david = staff_members[6]     # David Kim (Assistant)
    
    alice_rec = staff_members[8]  # Alice Vance (Receptionist)
    bob_rec = staff_members[9]    # Bob Vance (Receptionist)

    allocations = [
        # Reception Shift 1: Alice Vance, 08:00 - 14:00
        Allocation(
            room_id=reception_room.id,
            date="2026-06-15",
            start_time="08:00",
            end_time="14:00",
            main_practitioner_id=alice_rec.id,
            assistant_id=None
        ),
        # Reception Shift 2: Bob Vance, 14:00 - 20:00
        Allocation(
            room_id=reception_room.id,
            date="2026-06-15",
            start_time="14:00",
            end_time="20:00",
            main_practitioner_id=bob_rec.id,
            assistant_id=None
        ),
        # Dr. Sarah in Room A, 09:00 - 12:00, assisted by Chloe
        Allocation(
            room_id=room_a.id,
            date="2026-06-15",
            start_time="09:00",
            end_time="12:00",
            main_practitioner_id=dr_sarah.id,
            assistant_id=chloe.id
        ),
        # Emma Watson in Room B, 13:00 - 16:00, assisted by David
        Allocation(
            room_id=room_b.id,
            date="2026-06-15",
            start_time="13:00",
            end_time="16:00",
            main_practitioner_id=emma.id,
            assistant_id=david.id
        )
    ]
    for a in allocations:
        db.add(a)
    db.commit()
