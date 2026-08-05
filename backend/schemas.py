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
    role: str  # 'doctor', 'hygienist', 'assistant', 'מזכירות'
    whatsapp_enabled: bool = False
    phone_number: Optional[str] = None
    email: Optional[str] = None

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
    staff_ids: List[int] = []
    recalls_staff_id: Optional[int] = None

class AllocationCreate(AllocationBase):
    pass

class Allocation(BaseModel):
    id: int
    room_id: int
    date: str
    start_time: str
    end_time: str
    recalls_staff_id: Optional[int] = None

    # Nested objects for convenience
    room: Room
    staff_members: List[Staff] = []

    class Config:
        orm_mode = True

# Auth Schemas
class Token(BaseModel):
    access_token: str
    token_type: str

class LoginRequest(BaseModel):
    password: str

