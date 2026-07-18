from backend.database import SessionLocal
from backend.models import Allocation, Room, Staff

db = SessionLocal()
try:
    rooms = db.query(Room).all()
    print("Rooms:", len(rooms))
    allocs = db.query(Allocation).all()
    print("Allocs:", len(allocs))
    for a in allocs:
        print("Alloc id", a.id, "staff members count:", len(a.staff_members))
except Exception as e:
    print("DB Error:", e)
