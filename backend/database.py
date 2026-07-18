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

    # Seed Clinic Staff
    raw_staff = [
      { "name": "הילטון קנגיסר", "phone": "054-4802294", "role": "doctor" },
      { "name": "עופר יערי", "phone": "050-8231355", "role": "doctor" },
      { "name": "רונן הובר", "phone": "054-6611677", "role": "doctor" },
      { "name": "גלית לביא", "phone": "052-6473112", "role": "doctor" },
      { "name": "שי גורן", "phone": "052-9204537", "role": "doctor" },
      { "name": "ניר פורת", "phone": "054-3278200", "role": "doctor" },
      { "name": "רומי אמסלם", "phone": "053-7089185", "role": "assistant" },
      { "name": "רומה רפפורט", "phone": "052-8331390", "role": "assistant" },
      { "name": "הדר דוד", "phone": "052-8608030", "role": "assistant" },
      { "name": "דריה סלזיובה", "phone": "050-3005511", "role": "hygienist" },
      { "name": "קתי אילקשי", "phone": "052-8357998", "role": "hygienist" },
      { "name": "עידית הנקין", "phone": "052-8345101", "role": "assistant" },
      { "name": "סבינה שנדלר", "phone": "052-2555665", "role": "assistant" },
      { "name": "דורה לב", "phone": "054-2069153", "role": "assistant" },
      { "name": "אולגה וורסין", "phone": "054-7902298", "role": "assistant" },
      { "name": "איווט", "phone": "050-6651222", "role": "assistant" },
      { "name": "עדן כהן", "phone": "052-6780672", "role": "assistant" },
      { "name": "שמחה פולג", "phone": "054-5337317", "role": "receptionist" },
      { "name": "דסי מנדלסון", "phone": "054-4546257", "role": "receptionist" },
      { "name": "דינה פלק", "phone": "052-3403036", "role": "receptionist" },
      { "name": "לילך קרינדלר", "phone": "052-3917979", "role": "receptionist" },
      { "name": "רואה מרסאווה", "phone": "054-9488811", "role": "receptionist" },
      { "name": "חפצי שטיינגוס", "phone": "050-6966603", "role": "receptionist_recalls" },
      { "name": "תרצה טפירו", "phone": "050-9419495", "role": "receptionist" },
      { "name": "מירי קנגיסר", "phone": "050-3647452", "role": "receptionist" },
      { "name": "ברכה", "phone": "052-8949010", "role": "receptionist" },
      { "name": "סיגל אלול", "phone": "050-3450045", "role": "receptionist" }
    ]

    staff_members = []
    for s in raw_staff:
        staff_obj = Staff(name=s["name"], phone_number=s["phone"], role=s["role"], whatsapp_enabled=True)
        staff_members.append(staff_obj)
        db.add(staff_obj)
    db.commit()

    # Seed some initial allocations for 2026-06-15 using the new staff
    reception_room = rooms[0]  # Reception
    room_a = rooms[1]          # Room A
    room_b = rooms[2]          # Room B
    
    dr_hilton = staff_members[0]        # הילטון קנגיסר
    darya_hyg = staff_members[9]        # דריה סלזיובה
    romi_ast = staff_members[6]         # רומי אמסלם
    roma_ast = staff_members[7]         # רומה רפפורט
    
    simcha_rec = staff_members[17]      # שמחה פולג
    dassi_rec = staff_members[18]       # דסי מנדלסון
    heftzi_recalls = staff_members[22]  # חפצי שטיינגוס

    allocations = [
        # Reception Shift 1: Simcha and Heftzi (Recalls)
        Allocation(
            room_id=reception_room.id,
            date="2026-06-15",
            start_time="08:00",
            end_time="14:00",
            staff_members=[simcha_rec, heftzi_recalls]
        ),
        # Reception Shift 2: Dassi
        Allocation(
            room_id=reception_room.id,
            date="2026-06-15",
            start_time="14:00",
            end_time="20:00",
            staff_members=[dassi_rec]
        ),
        # Dr. Hilton in Room A
        Allocation(
            room_id=room_a.id,
            date="2026-06-15",
            start_time="09:00",
            end_time="12:00",
            staff_members=[dr_hilton, romi_ast]
        ),
        # Darya (Hygienist) in Room B
        Allocation(
            room_id=room_b.id,
            date="2026-06-15",
            start_time="13:00",
            end_time="16:00",
            staff_members=[darya_hyg, roma_ast]
        )
    ]
    for a in allocations:
        db.add(a)
    db.commit()
