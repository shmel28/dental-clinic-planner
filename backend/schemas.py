from typing import Optional, List
import re
from pydantic import BaseModel, validator

_TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

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
class StaffHours(BaseModel):
    """A person's own hours inside a shift, when they don't work all of it."""
    staff_id: int
    start_time: str  # HH:MM
    end_time: str  # HH:MM

    class Config:
        orm_mode = True

class AllocationBase(BaseModel):
    room_id: int
    date: str  # YYYY-MM-DD
    start_time: str  # HH:MM
    end_time: str  # HH:MM
    staff_ids: List[int] = []
    recalls_staff_id: Optional[int] = None
    staff_hours: List[StaffHours] = []

    # Times are compared as text, so they must always be HH:MM (e.g. "08:00", never "8:00")
    @validator("start_time", "end_time")
    def _time_format(cls, v):
        if not _TIME.match(v or ""):
            raise ValueError("השעה צריכה להיות בפורמט HH:MM, למשל 08:00")
        return v

    @validator("date")
    def _date_format(cls, v):
        if not _DATE.match(v or ""):
            raise ValueError("התאריך צריך להיות בפורמט YYYY-MM-DD")
        return v

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
    staff_hours: List[StaffHours] = []

    class Config:
        orm_mode = True

# Auth Schemas
class Token(BaseModel):
    access_token: str
    token_type: str

class LoginRequest(BaseModel):
    password: str

# Vacation Schemas
class VacationBase(BaseModel):
    staff_id: int
    start_date: str # YYYY-MM-DD
    end_date: str   # YYYY-MM-DD
    notes: Optional[str] = None

class VacationCreate(VacationBase):
    pass

class VacationUpdate(BaseModel):
    staff_id: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    notes: Optional[str] = None

class Vacation(VacationBase):
    id: int
    staff: Optional[Staff] = None

    class Config:
        orm_mode = True


