from typing import Optional, List
from pydantic import BaseModel

# Room Schemas
class RoomBase(BaseModel):
    name: str

class RoomCreate(RoomBase):
    pass

class Room(RoomBase):
    id: int

    class Config:
        orm_mode = True

# Staff Schemas
class StaffBase(BaseModel):
    name: str
    role: str  # 'doctor', 'hygienist', 'assistant'

class StaffCreate(StaffBase):
    pass

class Staff(StaffBase):
    id: int

    class Config:
        orm_mode = True

# Allocation Schemas
class AllocationBase(BaseModel):
    room_id: int
    date: str  # YYYY-MM-DD
    start_time: str  # HH:MM
    end_time: str  # HH:MM
    main_practitioner_id: int
    assistant_id: Optional[int] = None

class AllocationCreate(AllocationBase):
    pass

class Allocation(BaseModel):
    id: int
    room_id: int
    date: str
    start_time: str
    end_time: str
    main_practitioner_id: int
    assistant_id: Optional[int] = None

    # Nested objects for convenience
    room: Room
    main_practitioner: Staff
    assistant: Optional[Staff] = None

    class Config:
        orm_mode = True
