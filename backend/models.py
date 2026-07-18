from sqlalchemy import Column, Integer, String, ForeignKey, CheckConstraint, Boolean
from sqlalchemy.orm import relationship
from .database import Base

class Room(Base):
    __tablename__ = "rooms"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)

    allocations = relationship("Allocation", back_populates="room", cascade="all, delete-orphan")

from sqlalchemy import Table

allocation_staff = Table(
    'allocation_staff', Base.metadata,
    Column('allocation_id', Integer, ForeignKey('allocations.id', ondelete="CASCADE"), primary_key=True),
    Column('staff_id', Integer, ForeignKey('staff.id', ondelete="CASCADE"), primary_key=True)
)

class Staff(Base):
    __tablename__ = "staff"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    whatsapp_enabled = Column(Boolean, default=False, nullable=False)
    phone_number = Column(String, nullable=True)
    email = Column(String, nullable=True)

    __table_args__ = (
        CheckConstraint("role IN ('doctor', 'hygienist', 'assistant', 'receptionist', 'receptionist_recalls')", name="check_valid_role"),
    )

class Allocation(Base):
    __tablename__ = "allocations"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False)
    date = Column(String, nullable=False)  # Format YYYY-MM-DD
    start_time = Column(String, nullable=False)  # Format HH:MM (e.g. "08:00")
    end_time = Column(String, nullable=False)  # Format HH:MM (e.g. "12:00")

    # Relationships
    room = relationship("Room", back_populates="allocations")
    staff_members = relationship("Staff", secondary=allocation_staff, backref="allocations")

class AllocationSnapshot(Base):
    __tablename__ = "allocation_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    week_start_date = Column(String, nullable=False, index=True) # e.g. "2026-07-12"
    snapshot_data = Column(String, nullable=False) # JSON serialized array of allocations
    created_at = Column(String, nullable=False) # Timestamp

