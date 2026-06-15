from sqlalchemy import Column, Integer, String, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from .database import Base

class Room(Base):
    __tablename__ = "rooms"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)

    allocations = relationship("Allocation", back_populates="room", cascade="all, delete-orphan")

class Staff(Base):
    __tablename__ = "staff"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False)

    __table_args__ = (
        CheckConstraint("role IN ('doctor', 'hygienist', 'assistant', 'receptionist')", name="check_valid_role"),
    )

class Allocation(Base):
    __tablename__ = "allocations"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False)
    date = Column(String, nullable=False)  # Format YYYY-MM-DD
    start_time = Column(String, nullable=False)  # Format HH:MM (e.g. "08:00")
    end_time = Column(String, nullable=False)  # Format HH:MM (e.g. "12:00")

    main_practitioner_id = Column(Integer, ForeignKey("staff.id", ondelete="RESTRICT"), nullable=False)
    assistant_id = Column(Integer, ForeignKey("staff.id", ondelete="RESTRICT"), nullable=True)

    # Relationships
    room = relationship("Room", back_populates="allocations")
    main_practitioner = relationship("Staff", foreign_keys=[main_practitioner_id])
    assistant = relationship("Staff", foreign_keys=[assistant_id])
