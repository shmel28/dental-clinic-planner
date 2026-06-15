# V2 Upgrade Checklist

- [x] **Database & Models Migration**
  - [x] Update `backend/models.py` (replace `time_slot` with `start_time` and `end_time` columns)
  - [x] Update `backend/schemas.py` (update Pydantic structures for serialization)
  - [x] Update `backend/database.py` (update seeding functions for initial range data)
- [x] **Backend Overlap Checks**
  - [x] Update `backend/main.py` conflict checks (implement `New_Start < Existing_End AND New_End > Existing_Start` algorithm)
  - [x] Update `verify_allocations.py` test suite to assert range overlapping conflicts
  - [x] Execute `verify_allocations.py` and verify all tests pass
- [x] **Frontend Implementation**
  - [x] Refactor `frontend/src/App.css` (overhaul UI to a crisp Light Theme Clinical SaaS dashboard)
  - [x] Refactor `frontend/src/App.tsx` (implement RBAC switcher, range selector dropdowns, Weekly view toggle, and CSS Grid spanning calculations)
- [x] **Verification**
  - [x] Run compilation checks (`npm run build`)
  - [x] Update `walkthrough.md` with V2 execution summary
