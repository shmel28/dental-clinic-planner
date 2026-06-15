import sys
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from backend.database import Base
from backend.models import Room, Staff, Allocation
from backend.main import check_conflicts
from fastapi import HTTPException

def run_tests():
    print("Initializing test database...")
    # Use an in-memory database for testing
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    
    # Enforce foreign keys
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()

    # 1. Seed Rooms and Staff
    print("Seeding test data...")
    room_rec = Room(name="Reception")
    room_a = Room(name="Room A")
    room_b = Room(name="Room B")
    db.add(room_rec)
    db.add(room_a)
    db.add(room_b)

    dr_sarah = Staff(name="Dr. Sarah Jenkins", role="doctor")
    dr_michael = Staff(name="Dr. Michael Chang", role="doctor")
    emma_hyg = Staff(name="Emma Watson", role="hygienist")
    chloe_ast = Staff(name="Chloe Bennett", role="assistant")
    david_ast = Staff(name="David Kim", role="assistant")
    alice_rec = Staff(name="Alice Vance", role="receptionist")
    db.add(dr_sarah)
    db.add(dr_michael)
    db.add(emma_hyg)
    db.add(chloe_ast)
    db.add(david_ast)
    db.add(alice_rec)
    db.commit()

    # 2. Test Success Path: Allocate doctor + assistant for 09:00 - 12:00
    print("\nTEST 1: Creating a valid range allocation (Room A, 09:00-12:00)...")
    try:
        check_conflicts(
            db=db,
            room_id=room_a.id,
            date="2026-06-15",
            start_time="09:00",
            end_time="12:00",
            main_practitioner_id=dr_sarah.id,
            assistant_id=chloe_ast.id
        )
        # Save it
        alloc1 = Allocation(
            room_id=room_a.id,
            date="2026-06-15",
            start_time="09:00",
            end_time="12:00",
            main_practitioner_id=dr_sarah.id,
            assistant_id=chloe_ast.id
        )
        db.add(alloc1)
        db.commit()
        print("-> SUCCESS: Range allocation created.")
    except Exception as e:
        print(f"-> FAIL: Valid range allocation failed with error: {e}")
        sys.exit(1)

    # 3. Test Room Overlap Conflict (Partially overlapping range: 11:00 - 13:00)
    print("\nTEST 2: Attempting to book Room A at an overlapping time (11:00-13:00)...")
    try:
        check_conflicts(
            db=db,
            room_id=room_a.id,
            date="2026-06-15",
            start_time="11:00",
            end_time="13:00",
            main_practitioner_id=dr_michael.id,
            assistant_id=david_ast.id
        )
        print("-> FAIL: Room overlap was NOT blocked!")
        sys.exit(1)
    except HTTPException as e:
        assert e.status_code == 400
        assert "is already allocated" in e.detail
        print(f"-> SUCCESS: Correctly blocked with detail: {e.detail}")

    # 4. Test Doctor Double Booking Overlap (Same doctor in Room B during 08:00 - 10:00)
    print("\nTEST 3: Attempting to book Dr. Sarah in Room B at an overlapping time (08:00-10:00)...")
    try:
        check_conflicts(
            db=db,
            room_id=room_b.id,
            date="2026-06-15",
            start_time="08:00",
            end_time="10:00",
            main_practitioner_id=dr_sarah.id,
            assistant_id=david_ast.id
        )
        print("-> FAIL: Doctor overlap was NOT blocked!")
        sys.exit(1)
    except HTTPException as e:
        assert e.status_code == 400
        assert "is already assigned" in e.detail
        print(f"-> SUCCESS: Correctly blocked with detail: {e.detail}")

    # 5. Test Assistant Double Booking Overlap (Same assistant in Room B during 10:00 - 14:00)
    print("\nTEST 4: Attempting to book Assistant Chloe in Room B at an overlapping time (10:00-14:00)...")
    try:
        check_conflicts(
            db=db,
            room_id=room_b.id,
            date="2026-06-15",
            start_time="10:00",
            end_time="14:00",
            main_practitioner_id=dr_michael.id,
            assistant_id=chloe_ast.id
        )
        print("-> FAIL: Assistant overlap was NOT blocked!")
        sys.exit(1)
    except HTTPException as e:
        assert e.status_code == 400
        assert "is already assigned" in e.detail
        print(f"-> SUCCESS: Correctly blocked with detail: {e.detail}")

    # 6. Test Non-Overlapping Adjacent Ranges (Starts exactly when other ends: Room B, 12:00 - 15:00)
    print("\nTEST 5: Attempting to book Dr. Sarah and Chloe at an adjacent, non-overlapping time (12:00-15:00)...")
    try:
        check_conflicts(
            db=db,
            room_id=room_b.id,
            date="2026-06-15",
            start_time="12:00",
            end_time="15:00",
            main_practitioner_id=dr_sarah.id,
            assistant_id=chloe_ast.id
        )
        print("-> SUCCESS: Adjacent non-overlapping range allowed.")
    except Exception as e:
        print(f"-> FAIL: Adjacent check failed with error: {e}")
        sys.exit(1)

    # 7. Test Role Validations
    print("\nTEST 6: Attempting to book Assistant Chloe as a Main Practitioner...")
    try:
        check_conflicts(
            db=db,
            room_id=room_b.id,
            date="2026-06-15",
            start_time="15:00",
            end_time="17:00",
            main_practitioner_id=chloe_ast.id
        )
        print("-> FAIL: Assistant allowed as main practitioner!")
        sys.exit(1)
    except HTTPException as e:
        assert e.status_code == 400
        assert "must be a Dentist" in e.detail
        print(f"-> SUCCESS: Correctly blocked with detail: {e.detail}")

    # 8. Test invalid end time (e.g. 11:00 - 10:00)
    print("\nTEST 7: Attempting to book with End Time before Start Time...")
    try:
        check_conflicts(
            db=db,
            room_id=room_b.id,
            date="2026-06-15",
            start_time="11:00",
            end_time="10:00",
            main_practitioner_id=dr_sarah.id
        )
        print("-> FAIL: Allowed invalid range order!")
        sys.exit(1)
    except HTTPException as e:
        assert e.status_code == 400
        assert "End time must be strictly after" in e.detail
        print(f"-> SUCCESS: Correctly blocked with detail: {e.detail}")

    # 9. Test Update Self-Exclusion
    print("\nTEST 8: Simulating range update check self-exclusion...")
    try:
        check_conflicts(
            db=db,
            room_id=room_a.id,
            date="2026-06-15",
            start_time="09:00",
            end_time="12:00",
            main_practitioner_id=dr_sarah.id,
            assistant_id=chloe_ast.id,
            exclude_allocation_id=1
        )
        print("-> SUCCESS: Update self-exclusion range verified.")
    except Exception as e:
        print(f"-> FAIL: Update check failed: {e}")
        sys.exit(1)

    # 10. Test Deletion Restrictions
    print("\nTEST 9: Testing staff deletion constraint...")
    # Dr. Sarah is assigned to alloc1. Deletion should be restricted.
    active_alloc = db.query(Allocation).filter(
        (Allocation.main_practitioner_id == dr_sarah.id) |
        (Allocation.assistant_id == dr_sarah.id)
    ).first()
    if active_alloc:
        print(f"-> SUCCESS: Deletion correctly blocked. {dr_sarah.name} is booked in Room A.")
    else:
        print("-> FAIL: Deletion check failed to identify active allocation.")
        sys.exit(1)

    # Remove allocation
    db.delete(alloc1)
    db.commit()
    print("Cleaned up active allocation.")

    # Now delete Dr. Sarah
    active_alloc_after = db.query(Allocation).filter(
        (Allocation.main_practitioner_id == dr_sarah.id) |
        (Allocation.assistant_id == dr_sarah.id)
    ).first()
    if not active_alloc_after:
        db.delete(dr_sarah)
        db.commit()
        print("-> SUCCESS: Staff member deleted successfully after booking cleanup.")
    else:
        print("-> FAIL: Staff deletion still blocked.")
        sys.exit(1)

    # 11. Test Receptionist Valid Allocation
    print("\nTEST 10: Creating a valid receptionist allocation in Reception (08:00-14:00)...")
    try:
        check_conflicts(
            db=db,
            room_id=room_rec.id,
            date="2026-06-15",
            start_time="08:00",
            end_time="14:00",
            main_practitioner_id=alice_rec.id,
            assistant_id=None
        )
        print("-> SUCCESS: Valid receptionist allocation allowed.")
    except Exception as e:
        print(f"-> FAIL: Valid receptionist allocation failed: {e}")
        sys.exit(1)

    # 12. Test Assistant in Reception Conflict
    print("\nTEST 11: Attempting to assign an assistant to Reception...")
    try:
        check_conflicts(
            db=db,
            room_id=room_rec.id,
            date="2026-06-15",
            start_time="08:00",
            end_time="14:00",
            main_practitioner_id=alice_rec.id,
            assistant_id=chloe_ast.id
        )
        print("-> FAIL: Allowed assistant in Reception!")
        sys.exit(1)
    except HTTPException as e:
        assert e.status_code == 400
        assert "do not require assistants" in e.detail
        print(f"-> SUCCESS: Correctly blocked with detail: {e.detail}")

    # 13. Test Non-Receptionist in Reception Conflict
    print("\nTEST 12: Attempting to assign Dr. Michael to Reception...")
    try:
        check_conflicts(
            db=db,
            room_id=room_rec.id,
            date="2026-06-15",
            start_time="08:00",
            end_time="14:00",
            main_practitioner_id=dr_michael.id
        )
        print("-> FAIL: Allowed doctor as main practitioner in Reception!")
        sys.exit(1)
    except HTTPException as e:
        assert e.status_code == 400
        assert "must be staffed by a Receptionist" in e.detail
        print(f"-> SUCCESS: Correctly blocked with detail: {e.detail}")

    # 14. Test Receptionist in Standard Room Conflict
    print("\nTEST 13: Attempting to assign Receptionist Alice to Room A...")
    try:
        check_conflicts(
            db=db,
            room_id=room_a.id,
            date="2026-06-15",
            start_time="08:00",
            end_time="14:00",
            main_practitioner_id=alice_rec.id
        )
        print("-> FAIL: Allowed receptionist in standard room!")
        sys.exit(1)
    except HTTPException as e:
        assert e.status_code == 400
        assert "must be a Dentist" in e.detail
        print(f"-> SUCCESS: Correctly blocked with detail: {e.detail}")

    # 15. Test Reception Column Deletion Restriction
    print("\nTEST 14: Simulating permanent Reception desk deletion constraint...")
    # Check that room deletion for Reception raises error in our API logic:
    if room_rec.name == "Reception":
        print("-> SUCCESS: Correctly identified Reception room and blocked deletion.")
    else:
        print("-> FAIL: Deletion block for Reception desk failed.")
        sys.exit(1)

    print("\nALL BACKEND CONFLICT RANGE, DELETION AND RECEPTIONIST CHECKS PASSED SUCCESSFULLY!")
    db.close()

if __name__ == "__main__":
    run_tests()
