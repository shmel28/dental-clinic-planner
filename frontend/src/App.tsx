import React, { useState, useEffect } from "react";
import "./App.css";

// --- Typings ---
interface Room {
  id: number;
  name: string;
}

interface Staff {
  id: number;
  name: string;
  role: "doctor" | "hygienist" | "assistant" | "receptionist";
}

interface Allocation {
  id: number;
  room_id: number;
  date: string;
  start_time: string; // HH:MM
  end_time: string;   // HH:MM
  room: Room;
  main_practitioner: Staff;
  assistant?: Staff;
  main_practitioner_id: number;
  assistant_id?: number;
}

const API_BASE_URL = "/api";

// 1-hour interval labels (operating hours 08:00 to 20:00)
const HOURS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];
const END_HOURS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];

const DAYS_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

// Deterministic pastel color palette for practitioners
interface PaletteColor {
  bg: string;
  text: string;
  border: string;
  leftBorder: string;
}

const PALETTE: PaletteColor[] = [
  { bg: "#f3e8ff", text: "#6b21a8", border: "#e9d5ff", leftBorder: "#a855f7" }, // Lavender (Doctor A)
  { bg: "#e0f2fe", text: "#0369a1", border: "#bae6fd", leftBorder: "#0ea5e9" }, // Blue (Doctor B)
  { bg: "#ccfbf1", text: "#0f766e", border: "#99f6e4", leftBorder: "#14b8a6" }, // Teal (Doctor C)
  { bg: "#fef3c7", text: "#92400e", border: "#fde68a", leftBorder: "#f59e0b" }, // Amber (Doctor D)
  { bg: "#ffe4e6", text: "#9f1239", border: "#fecaca", leftBorder: "#f43f5e" }, // Rose (Doctor E)
  { bg: "#ecfdf5", text: "#065f46", border: "#a7f3d0", leftBorder: "#10b981" }, // Emerald
  { bg: "#fef2f2", text: "#991b1b", border: "#fee2e2", leftBorder: "#ef4444" }, // Red
  { bg: "#fff7ed", text: "#9a3412", border: "#ffedd5", leftBorder: "#f97316" }, // Orange
];

const getPractitionerStyle = (staffId: number): PaletteColor => {
  const index = staffId % PALETTE.length;
  return PALETTE[index];
};


// Timezone-safe date parser
const parseDate = (dateStr: string): Date => {
  const parts = dateStr.split("-");
  return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
};

export default function App() {
  // --- State Variables ---
  const [rooms, setRooms] = useState<Room[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("2026-06-15"); // default local date
  
  // V2 Features: RBAC and View Mode
  const [currentUserRole, setCurrentUserRole] = useState<"user" | "admin">("admin");
  const [viewMode, setViewMode] = useState<"daily" | "weekly">("daily");
  const [selectedRoomId, setSelectedRoomId] = useState<number | "">("");

  // Filters
  const [filterRoom, setFilterRoom] = useState<string>("");
  const [filterMain, setFilterMain] = useState<string>("");
  const [filterAssistant, setFilterAssistant] = useState<string>("");

  // Modals
  const [showBookingModal, setShowBookingModal] = useState<boolean>(false);
  const [showManagerModal, setShowManagerModal] = useState<boolean>(false);
  
  // Active Booking state
  const [bookingId, setBookingId] = useState<number | null>(null);
  const [bookingRoomId, setBookingRoomId] = useState<number>(0);
  const [bookingDate, setBookingDate] = useState<string>("");
  const [bookingStartTime, setBookingStartTime] = useState<string>("08:00");
  const [bookingEndTime, setBookingEndTime] = useState<string>("09:00");
  const [bookingMainId, setBookingMainId] = useState<string>("");
  const [bookingAssistantId, setBookingAssistantId] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Resource Manager tab & form states
  const [managerTab, setManagerTab] = useState<"staff" | "rooms">("staff");
  const [newStaffName, setNewStaffName] = useState<string>("");
  const [newStaffRole, setNewStaffRole] = useState<"doctor" | "hygienist" | "assistant" | "receptionist">("doctor");
  const [newRoomName, setNewRoomName] = useState<string>("");
  const [managerError, setManagerError] = useState<string>("");

  // --- Date/Week helpers ---
  const getSunday = (dateStr: string): Date => {
    const baseDate = parseDate(dateStr);
    const day = baseDate.getDay(); // 0 = Sunday, 1 = Monday ...
    const sun = new Date(baseDate);
    sun.setDate(baseDate.getDate() - day);
    return sun;
  };

  const getWeekDays = (dateStr: string): string[] => {
    const sun = getSunday(dateStr);
    const days: string[] = [];
    for (let i = 0; i < 6; i++) {
      const next = new Date(sun);
      next.setDate(sun.getDate() + i);
      const yyyy = next.getFullYear();
      const mm = String(next.getMonth() + 1).padStart(2, "0");
      const dd = String(next.getDate()).padStart(2, "0");
      days.push(`${yyyy}-${mm}-${dd}`);
    }
    return days;
  };

  const weekDates = getWeekDays(selectedDate);

  // --- API Calls ---
  const fetchData = async () => {
    try {
      const roomsRes = await fetch(`${API_BASE_URL}/rooms`);
      const roomsData = await roomsRes.json();
      setRooms(roomsData);
      
      // Select the first room as default for Weekly view
      if (roomsData.length > 0 && selectedRoomId === "") {
        setSelectedRoomId(roomsData[0].id);
      }

      const staffRes = await fetch(`${API_BASE_URL}/staff`);
      const staffData = await staffRes.json();
      setStaff(staffData);
    } catch (err) {
      console.error("Error loading clinic metadata:", err);
    }
  };

  const fetchAllocations = async () => {
    try {
      if (viewMode === "daily") {
        // Fetch only for the selected date
        const res = await fetch(`${API_BASE_URL}/allocations?date=${selectedDate}`);
        const data = await res.json();
        setAllocations(data);
      } else {
        // Fetch allocations for all days of the week in parallel
        const promises = weekDates.map(async (d) => {
          const res = await fetch(`${API_BASE_URL}/allocations?date=${d}`);
          return res.json();
        });
        const results = await Promise.all(promises);
        setAllocations(results.flat());
      }
    } catch (err) {
      console.error("Error loading allocations:", err);
    }
  };

  // Initial load
  useEffect(() => {
    fetchData();
  }, []);

  // Fetch when dependencies change
  useEffect(() => {
    fetchAllocations();
  }, [selectedDate, viewMode, selectedRoomId]);

  // Date Navigator navigates by day or week
  const changeDateByDays = (days: number) => {
    const d = parseDate(selectedDate);
    d.setDate(d.getDate() + days);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    setSelectedDate(`${yyyy}-${mm}-${dd}`);
  };

  // --- Allocation Actions ---
  const openNewBooking = (roomId: number, dateStr: string, startHour: string) => {
    setBookingId(null);
    setBookingRoomId(roomId);
    setBookingDate(dateStr);
    setBookingStartTime(startHour);
    
    // Set default end time to startHour + 1 hour
    const startIdx = HOURS.indexOf(startHour);
    const defaultEnd = startIdx !== -1 && startIdx < END_HOURS.length ? END_HOURS[startIdx] : END_HOURS[0];
    setBookingEndTime(defaultEnd);
    
    setBookingMainId("");
    setBookingAssistantId("");
    setErrorMsg("");
    setShowBookingModal(true);
  };

  const openEditBooking = (alloc: Allocation) => {
    setBookingId(alloc.id);
    setBookingRoomId(alloc.room_id);
    setBookingDate(alloc.date);
    setBookingStartTime(alloc.start_time);
    setBookingEndTime(alloc.end_time);
    setBookingMainId(String(alloc.main_practitioner_id));
    setBookingAssistantId(alloc.assistant_id ? String(alloc.assistant_id) : "");
    setErrorMsg("");
    setShowBookingModal(true);
  };

  const saveBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!bookingMainId) {
      setErrorMsg("Please select a main practitioner (Dentist or Hygienist).");
      return;
    }

    if (bookingStartTime >= bookingEndTime) {
      setErrorMsg("End time must be strictly after the start time.");
      return;
    }

    const bookingRoom = rooms.find((r) => r.id === bookingRoomId);
    const isReception = bookingRoom?.name === "Reception";

    const payload = {
      room_id: bookingRoomId,
      date: bookingDate,
      start_time: bookingStartTime,
      end_time: bookingEndTime,
      main_practitioner_id: parseInt(bookingMainId, 10),
      assistant_id: isReception ? null : (bookingAssistantId ? parseInt(bookingAssistantId, 10) : null),
    };

    try {
      const url = bookingId 
        ? `${API_BASE_URL}/allocations/${bookingId}` 
        : `${API_BASE_URL}/allocations`;
      const method = bookingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.detail || "Conflict or validation error occurred.");
      } else {
        setShowBookingModal(false);
        fetchAllocations();
      }
    } catch (err) {
      setErrorMsg("Failed to connect to backend server.");
    }
  };

  const deleteBooking = async (id: number) => {
    if (!window.confirm("Are you sure you want to remove this assignment?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/allocations/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setShowBookingModal(false);
        fetchAllocations();
      }
    } catch (err) {
      console.error("Failed to delete booking:", err);
    }
  };

  // --- Resource Manager Handlers ---
  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setManagerError("");
    if (!newStaffName.trim()) {
      setManagerError("Staff name cannot be empty.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newStaffName, role: newStaffRole }),
      });
      if (res.ok) {
        const addedStaff = await res.json();
        setStaff((prev) => [...prev, addedStaff]);
        setNewStaffName("");
        fetchData();
      } else {
        const data = await res.json();
        setManagerError(data.detail || "Error adding staff.");
      }
    } catch (err) {
      setManagerError("Server error adding staff.");
    }
  };

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setManagerError("");
    if (!newRoomName.trim()) {
      setManagerError("Room name cannot be empty.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newRoomName }),
      });
      if (res.ok) {
        const addedRoom = await res.json();
        setRooms((prev) => [...prev, addedRoom]);
        setNewRoomName("");
        fetchData();
      } else {
        const data = await res.json();
        setManagerError(data.detail || "Room already exists or error occurred.");
      }
    } catch (err) {
      setManagerError("Server error adding room.");
    }
  };

  const deleteRoom = async (id: number) => {
    const roomToDelete = rooms.find((r) => r.id === id);
    if (roomToDelete?.name === "Reception") {
      alert("The Reception desk is a permanent clinic column and cannot be deleted.");
      return;
    }
    if (!window.confirm("Are you sure you want to delete this room? Doing so will permanently cancel all allocations inside it.")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/rooms/${id}`, { method: "DELETE" });
      if (res.ok) {
        setRooms((prev) => prev.filter((r) => r.id !== id));
        fetchData();
        fetchAllocations();
      } else {
        const data = await res.json();
        setManagerError(data.detail || "Failed to delete room.");
      }
    } catch (err) {
      setManagerError("Server error deleting room.");
    }
  };

  const deleteStaff = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this staff member?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/staff/${id}`, { method: "DELETE" });
      if (res.ok) {
        setStaff((prev) => prev.filter((s) => s.id !== id));
        fetchData();
        fetchAllocations();
      } else {
        const data = await res.json();
        setManagerError(data.detail || "Failed to delete staff member.");
      }
    } catch (err) {
      setManagerError("Server error deleting staff member.");
    }
  };

  // --- Grid Spanning Calculations ---
  const getGridRowRange = (start: string, end: string) => {
    const startHour = parseInt(start.split(":")[0], 10);
    const endHour = parseInt(end.split(":")[0], 10);
    const startRow = startHour - 8 + 2; // header is row 1, 08:00 is row 2
    const endRow = endHour - 8 + 2;
    return `${startRow} / ${endRow}`;
  };

  // --- Filter Logic ---
  const sortedRooms = [...rooms].sort((a, b) => {
    if (a.name === "Reception") return -1;
    if (b.name === "Reception") return 1;
    return a.id - b.id;
  });

  const filteredRooms = sortedRooms.filter((r) => !filterRoom || r.id === parseInt(filterRoom, 10));

  const isFilteredOut = (alloc: Allocation) => {
    if (filterMain && alloc.main_practitioner_id !== parseInt(filterMain, 10)) {
      return true;
    }
    if (filterAssistant && alloc.assistant_id !== parseInt(filterAssistant, 10)) {
      return true;
    }
    return false;
  };

  const clearFilters = () => {
    setFilterRoom("");
    setFilterMain("");
    setFilterAssistant("");
  };

  const formatRole = (role: string) => {
    if (role === "doctor") return "Dentist";
    if (role === "hygienist") return "Hygienist";
    if (role === "receptionist") return "Receptionist";
    return "Assistant";
  };

  const formatDateLabel = (dateStr: string) => {
    const d = parseDate(dateStr);
    return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  };

  const bookingRoom = rooms.find((r) => r.id === bookingRoomId);
  const isReception = bookingRoom?.name === "Reception";

  // Style properties for Daily View grid (extended to 12 rows for 20:00 shifts)
  const dailyGridStyle = {
    gridTemplateColumns: `80px repeat(${filteredRooms.length}, minmax(200px, 1fr))`,
    gridTemplateRows: `auto repeat(12, 80px)`,
  };

  // Style properties for Weekly View grid (Rooms vs. Days Matrix)
  const weeklyMatrixGridStyle = {
    gridTemplateColumns: `120px repeat(${sortedRooms.length}, minmax(180px, 1fr))`,
    gridTemplateRows: `auto repeat(6, minmax(120px, auto))`,
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header saas-panel">
        <div className="brand-section">
          <h1 className="brand-title">Dental Clinic Allocator</h1>
          <div className="brand-subtitle">
            <span>Clinical Resource Dashboard</span>
            <span className="brand-subtitle-badge">No Patient Data</span>
          </div>
        </div>

        {/* V2 Feature: RBAC switch */}
        <div className="role-switcher-container">
          <span className="role-switcher-label">Logged in as:</span>
          <div className="role-switcher-group">
            <button
              className={`role-switcher-btn ${currentUserRole === "user" ? "active" : ""}`}
              onClick={() => setCurrentUserRole("user")}
            >
              Regular User
            </button>
            <button
              className={`role-switcher-btn ${currentUserRole === "admin" ? "active" : ""}`}
              onClick={() => setCurrentUserRole("admin")}
            >
              Admin
            </button>
          </div>

          {/* Admin resource panel button */}
          {currentUserRole === "admin" && (
            <button
              className="btn-primary"
              style={{ marginLeft: "1rem" }}
              onClick={() => { setManagerError(""); setShowManagerModal(true); }}
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              Manage Resources
            </button>
          )}
        </div>
      </header>

      {/* Control Bar (Filters, Date, Daily/Weekly View toggles) */}
      <section className="control-bar saas-panel">
        {/* Toggle between Daily & Weekly view */}
        <div className="view-mode-tabs">
          <button
            className={`view-mode-tab ${viewMode === "daily" ? "active" : ""}`}
            onClick={() => setViewMode("daily")}
          >
            Daily View
          </button>
          <button
            className={`view-mode-tab ${viewMode === "weekly" ? "active" : ""}`}
            onClick={() => setViewMode("weekly")}
          >
            Weekly View
          </button>
        </div>

        {/* Date Selector */}
        <div className="date-navigator">
          <button className="btn-nav" onClick={() => changeDateByDays(viewMode === "daily" ? -1 : -7)} title="Back">
            ❮
          </button>
          <input
            type="date"
            className="date-picker-input"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
          <button className="btn-nav" onClick={() => changeDateByDays(viewMode === "daily" ? 1 : 7)} title="Forward">
            ❯
          </button>
        </div>

        {/* Filter controls only visible/active in Daily View */}
        {viewMode === "daily" ? (
          <div className="filter-controls">
            <div className="filter-group">
              <label className="filter-label">Room:</label>
              <select className="select-input" value={filterRoom} onChange={(e) => setFilterRoom(e.target.value)}>
                <option value="">All Rooms</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label className="filter-label">Practitioner:</label>
              <select className="select-input" value={filterMain} onChange={(e) => setFilterMain(e.target.value)}>
                <option value="">All</option>
                {staff
                  .filter((s) => s.role === "doctor" || s.role === "hygienist")
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({formatRole(s.role)})
                    </option>
                  ))}
              </select>
            </div>

            <div className="filter-group">
              <label className="filter-label">Assistant:</label>
              <select className="select-input" value={filterAssistant} onChange={(e) => setFilterAssistant(e.target.value)}>
                <option value="">All</option>
                {staff
                  .filter((s) => s.role === "assistant")
                  .map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
              </select>
            </div>

            {(filterRoom || filterMain || filterAssistant) && (
              <button className="btn-clear" onClick={clearFilters}>
                Clear
              </button>
            )}
          </div>
        ) : (
          /* Weekly View Matrix Dashboard Header */
          <div className="filter-controls">
            <div className="filter-group">
              <span className="brand-subtitle-badge" style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem", background: "#f1f5f9", color: "#475569" }}>
                📅 Logistical Matrix (Rooms vs Days)
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Active Filter Banner (Daily View only) */}
      {viewMode === "daily" && (filterRoom || filterMain || filterAssistant) && (
        <div className="filter-active-banner">
          <span>Active filter is restricting the schedule grid.</span>
          <button className="btn-clear" onClick={clearFilters}>Reset View</button>
        </div>
      )}

      {/* --- GRID VIEWS --- */}
      {viewMode === "daily" ? (
        // DAILY VIEW
        <main className="schedule-grid-container">
          <div className="schedule-grid" style={dailyGridStyle}>
            {/* Header row */}
            <div className="grid-header">
              <div className="grid-cell-header grid-cell-header-time">Time</div>
              {filteredRooms.map((r) => (
                <div key={r.id} className="grid-cell-header">
                  {r.name}
                </div>
              ))}
            </div>

            {/* Background hourly slots and '+' buttons */}
            {HOURS.map((hour) => (
              <div className="grid-row" key={hour}>
                <div className="grid-cell grid-cell-time">{hour}</div>
                {filteredRooms.map((room) => (
                  <div className="grid-cell" key={`${room.id}-${hour}`}>
                    <button
                      className="btn-cell-add"
                      onClick={() => openNewBooking(room.id, selectedDate, hour)}
                    >
                      + Book
                    </button>
                  </div>
                ))}
              </div>
            ))}

            {/* Absolute-positioned Range Allocation Cards */}
            {allocations
              .filter((a) => rooms.some((r) => r.id === a.room_id) && !isFilteredOut(a))
              .map((alloc) => {
                const roomIndex = filteredRooms.findIndex((r) => r.id === alloc.room_id);
                if (roomIndex === -1) return null; // filtered out room
                
                const colIndex = roomIndex + 2;
                const rowRange = getGridRowRange(alloc.start_time, alloc.end_time);

                const colors = getPractitionerStyle(alloc.main_practitioner_id);
                return (
                  <div
                    key={alloc.id}
                    className={`allocation-card ${alloc.main_practitioner.role}-lead`}
                    style={{
                      gridColumn: `${colIndex} / ${colIndex + 1}`,
                      gridRow: rowRange,
                      backgroundColor: colors.bg,
                      color: colors.text,
                      borderColor: colors.border,
                      borderLeft: `4px solid ${colors.leftBorder}`,
                    }}
                  >
                    <div>
                      <div className="allocation-card-main">
                        <span className="allocation-practitioner" title={alloc.main_practitioner.name}>
                          {alloc.main_practitioner.name}
                        </span>
                        <span className={`role-badge ${alloc.main_practitioner.role}`}>
                          {alloc.main_practitioner.role === "doctor" ? "DR" : alloc.main_practitioner.role === "hygienist" ? "HYG" : "REC"}
                        </span>
                      </div>
                      <div className="allocation-time-range">
                        {alloc.start_time} – {alloc.end_time}
                      </div>
                    </div>

                    {alloc.assistant && (
                      <div className="allocation-assistant-wrapper">
                        <span className="role-badge assistant">AST</span>
                        <span className="allocation-assistant-name" title={alloc.assistant.name}>
                          {alloc.assistant.name}
                        </span>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="allocation-actions">
                      <button
                        className="action-icon-btn"
                        title="Edit Assignment"
                        onClick={() => openEditBooking(alloc)}
                      >
                        ✎
                      </button>
                      <button
                        className="action-icon-btn delete"
                        title="Cancel Assignment"
                        onClick={() => deleteBooking(alloc.id)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </main>
      ) : (
        // WEEKLY VIEW - Rooms vs. Days Matrix
        <main className="schedule-grid-container">
          <div className="weekly-grid" style={weeklyMatrixGridStyle}>
            {/* Header row */}
            <div className="grid-header">
              <div className="grid-cell-header weekly-header-first">Day</div>
              {sortedRooms.map((r) => (
                <div key={r.id} className="grid-cell-header">
                  {r.name}
                </div>
              ))}
            </div>

            {/* Matrix Day Rows */}
            {weekDates.map((dateStr, dayIndex) => (
              <div className="grid-row" key={dateStr}>
                {/* Day Label (Y-axis header) */}
                <div className="grid-cell weekly-day-cell">
                  <div className="weekly-day-name">{DAYS_NAMES[dayIndex]}</div>
                  <div className="weekly-day-date">
                    {dateStr.split("-")[2]}/{dateStr.split("-")[1]}
                  </div>
                </div>

                {/* Rooms cells */}
                {sortedRooms.map((room) => {
                  const dayAllocations = allocations.filter(
                    (a) => a.date === dateStr && a.room_id === room.id
                  );
                  const sortedDayAllocations = [...dayAllocations].sort((a, b) =>
                    a.start_time.localeCompare(b.start_time)
                  );

                  if (sortedDayAllocations.length === 0) {
                    return (
                      <div className="grid-cell weekly-cell empty" key={`${room.id}-${dateStr}`}>
                        <div className="weekly-empty-state">
                          <button
                            className="btn-weekly-add-minimal"
                            onClick={() => openNewBooking(room.id, dateStr, "08:00")}
                          >
                            + Book
                          </button>
                        </div>
                      </div>
                    );
                  }

                  // Calculate unallocated gaps (operating hours: 08:00 to 20:00)
                  const gaps: string[] = [];
                  let current = 8 * 60;
                  const endLimit = 20 * 60;

                  sortedDayAllocations.forEach((alloc) => {
                    const [startH, startM] = alloc.start_time.split(":").map(Number);
                    const [endH, endM] = alloc.end_time.split(":").map(Number);
                    const startMin = startH * 60 + startM;
                    const endMin = endH * 60 + endM;

                    if (startMin - current >= 60) {
                      const gapStart = `${String(Math.floor(current / 60)).padStart(2, "0")}:${String(current % 60).padStart(2, "0")}`;
                      const gapEnd = `${String(Math.floor(startMin / 60)).padStart(2, "0")}:${String(startMin % 60).padStart(2, "0")}`;
                      gaps.push(`${gapStart}–${gapEnd}`);
                    }
                    if (endMin > current) {
                      current = endMin;
                    }
                  });

                  if (endLimit - current >= 60) {
                    const gapStart = `${String(Math.floor(current / 60)).padStart(2, "0")}:${String(current % 60).padStart(2, "0")}`;
                    const gapEnd = `${String(Math.floor(endLimit / 60)).padStart(2, "0")}:${String(endLimit % 60).padStart(2, "0")}`;
                    gaps.push(`${gapStart}–${gapEnd}`);
                  }

                  return (
                    <div className="grid-cell weekly-cell" key={`${room.id}-${dateStr}`}>
                      <div className="weekly-allocs-stack">
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                          {sortedDayAllocations.map((alloc) => {
                            const colors = getPractitionerStyle(alloc.main_practitioner_id);
                            return (
                              <div
                                key={alloc.id}
                                className={`weekly-alloc-card ${alloc.main_practitioner.role}-lead`}
                                onClick={() => openEditBooking(alloc)}
                                style={{
                                  cursor: "pointer",
                                  backgroundColor: colors.bg,
                                  color: colors.text,
                                  borderColor: colors.border,
                                  borderLeft: `4px solid ${colors.leftBorder}`,
                                }}
                              >
                                <div className="weekly-alloc-header">
                                  <span className="weekly-alloc-time">
                                    {alloc.start_time} – {alloc.end_time}
                                  </span>
                                  <button
                                    className="weekly-alloc-delete"
                                    title="Cancel Assignment"
                                    onClick={(e) => {
                                      e.stopPropagation(); // prevent modal popup
                                      deleteBooking(alloc.id);
                                    }}
                                  >
                                    ✕
                                  </button>
                                </div>
                                <div className="weekly-alloc-body">
                                  <div className="weekly-alloc-practitioner">
                                    <span>{alloc.main_practitioner.name}</span>
                                    <span className="role-indicator">
                                      {alloc.main_practitioner.role === "doctor"
                                        ? " [DR]"
                                        : alloc.main_practitioner.role === "hygienist"
                                        ? " [HYG]"
                                        : " [REC]"}
                                    </span>
                                  </div>
                                  {alloc.assistant && (
                                    <div className="weekly-alloc-assistant">
                                      Ast: {alloc.assistant.name}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                          {gaps.length > 0 && (
                            <div className="weekly-gaps-container">
                              {gaps.map((gapStr) => (
                                <div key={gapStr} className="weekly-gap-text">
                                  Open: {gapStr}
                                </div>
                              ))}
                            </div>
                          )}

                          <button
                            className="btn-weekly-cell-add-footer"
                            onClick={() => {
                              const defaultStart = gaps.length > 0 ? gaps[0].split("–")[0] : "08:00";
                              openNewBooking(room.id, dateStr, defaultStart);
                            }}
                          >
                            + Book
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </main>
      )}

      {/* --- BOOKING ASSIGNMENT MODAL --- */}
      {showBookingModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">
                {bookingId ? "Edit Assignment" : "New Range Allocation"}
              </h3>
              <button className="btn-close" onClick={() => setShowBookingModal(false)}>
                ×
              </button>
            </div>

            <form onSubmit={saveBooking}>
              <div className="form-group">
                <label className="form-label">Room</label>
                <div className="form-input-static">
                  {rooms.find((r) => r.id === bookingRoomId)?.name || "Unknown Room"}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Date</label>
                <div className="form-input-static">
                  {bookingDate} ({formatDateLabel(bookingDate)})
                </div>
              </div>

              {/* V2 Feature: Start and End Time Selectors */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Start Time</label>
                  <select
                    className="form-select"
                    value={bookingStartTime}
                    onChange={(e) => setBookingStartTime(e.target.value)}
                    required
                  >
                    {HOURS.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">End Time</label>
                  <select
                    className="form-select"
                    value={bookingEndTime}
                    onChange={(e) => setBookingEndTime(e.target.value)}
                    required
                  >
                    {END_HOURS.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Main Practitioner Selection */}
              <div className="form-group">
                <label className="form-label">
                  {isReception ? "Main Practitioner (Receptionist)" : "Main Practitioner (Dentist / Hygienist)"}
                </label>
                <select
                  className="form-select"
                  value={bookingMainId}
                  onChange={(e) => setBookingMainId(e.target.value)}
                  required
                >
                  <option value="">
                    {isReception ? "-- Select Receptionist --" : "-- Select Doctor or Hygienist --"}
                  </option>
                  {staff
                    .filter((s) => isReception ? s.role === "receptionist" : (s.role === "doctor" || s.role === "hygienist"))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({formatRole(s.role)})
                      </option>
                    ))}
                </select>
              </div>

              {/* Optional Assistant Selection */}
              {!isReception && (
                <div className="form-group">
                  <label className="form-label">Dental Assistant (Optional)</label>
                  <select
                    className="form-select"
                    value={bookingAssistantId}
                    onChange={(e) => setBookingAssistantId(e.target.value)}
                  >
                    <option value="">-- None --</option>
                    {staff
                      .filter((s) => s.role === "assistant")
                      .map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                  </select>
                </div>
              )}

              {/* Overlap Error Display */}
              {errorMsg && (
                <div className="error-banner">
                  <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="modal-actions">
                {bookingId && (
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={() => deleteBooking(bookingId)}
                  >
                    Delete Assignment
                  </button>
                )}
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowBookingModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- RESOURCE MANAGER MODAL (Admin Only) --- */}
      {showManagerModal && currentUserRole === "admin" && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "600px" }}>
            <div className="modal-header">
              <h3 className="modal-title">Clinic Resources Manager</h3>
              <button className="btn-close" onClick={() => setShowManagerModal(false)}>
                ×
              </button>
            </div>

            {/* Tabs */}
            <div className="manager-tabs">
              <button
                className={`manager-tab ${managerTab === "staff" ? "active" : ""}`}
                onClick={() => { setManagerTab("staff"); setManagerError(""); }}
              >
                Clinic Staff
              </button>
              <button
                className={`manager-tab ${managerTab === "rooms" ? "active" : ""}`}
                onClick={() => { setManagerTab("rooms"); setManagerError(""); }}
              >
                Treatment Rooms
              </button>
            </div>

            {/* Tabs content */}
            {managerTab === "staff" ? (
              <div>
                {/* Add Staff */}
                <form className="manager-add-form" onSubmit={handleAddStaff}>
                  <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                    <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                      <input
                        type="text"
                        placeholder="Staff Name"
                        className="form-select"
                        value={newStaffName}
                        onChange={(e) => setNewStaffName(e.target.value)}
                      />
                    </div>
                    <div className="form-group" style={{ width: "150px", marginBottom: 0 }}>
                      <select
                        className="form-select"
                        value={newStaffRole}
                        onChange={(e) => setNewStaffRole(e.target.value as any)}
                      >
                        <option value="doctor">Dentist</option>
                        <option value="hygienist">Hygienist</option>
                        <option value="assistant">Assistant</option>
                        <option value="receptionist">Receptionist</option>
                      </select>
                    </div>
                    <button type="submit" className="btn-primary" style={{ padding: "0 1.25rem" }}>
                      Add
                    </button>
                  </div>
                </form>

                {/* Staff List */}
                <div className="manager-list">
                  {staff.map((s) => (
                    <div className="manager-item" key={s.id}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span className="manager-item-name">{s.name}</span>
                        <span className={`role-badge ${s.role}`}>{formatRole(s.role)}</span>
                      </div>
                      <button
                        className="action-icon-btn delete"
                        title="Delete Staff Member"
                        onClick={() => deleteStaff(s.id)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                {/* Add Room */}
                <form className="manager-add-form" onSubmit={handleAddRoom}>
                  <div style={{ display: "flex", gap: "0.75rem" }}>
                    <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                      <input
                        type="text"
                        placeholder="Room Name (e.g. Room E)"
                        className="form-select"
                        value={newRoomName}
                        onChange={(e) => setNewRoomName(e.target.value)}
                      />
                    </div>
                    <button type="submit" className="btn-primary" style={{ padding: "0 1.25rem" }}>
                      Add Room
                    </button>
                  </div>
                </form>

                {/* Rooms List */}
                <div className="manager-list">
                  {rooms.map((r) => (
                    <div className="manager-item" key={r.id}>
                      <span className="manager-item-name">{r.name}</span>
                      {r.name !== "Reception" && (
                        <button
                          className="action-icon-btn delete"
                          title="Delete Room"
                          onClick={() => deleteRoom(r.id)}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {managerError && (
              <div className="error-banner" style={{ marginTop: "1rem" }}>
                <span>{managerError}</span>
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: "1.5rem" }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowManagerModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
