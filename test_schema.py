from backend.database import SessionLocal
from backend.models import Allocation, Room, Staff
from backend.schemas import Allocation as AllocationSchema
import traceback

db = SessionLocal()
try:
    allocs = db.query(Allocation).all()
    print("Allocs:", len(allocs))
    for a in allocs:
        print("Validating alloc", a.id)
        try:
            schema = AllocationSchema.from_orm(a)
            print("OK")
        except Exception as e:
            print("Validation error:", e)
            traceback.print_exc()
except Exception as e:
    print("DB Error:", e)
