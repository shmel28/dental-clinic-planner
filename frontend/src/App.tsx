import React, { useState, useEffect } from "react";
import { Joyride, STATUS } from "react-joyride";
import type { Step, EventData } from "react-joyride";
import { Analytics } from "@vercel/analytics/react";
import "./App.css";
import { apiFetch, getAuthToken, clearAuthToken } from "./api";
import { LoginModal } from "./LoginModal";
import { WhatsAppDashboard } from "./WhatsAppDashboard";
import { getHolidaysForDates } from "./holidaysService";
import type { Holiday } from "./holidaysService";

// --- Typings ---
interface Room {
  id: number;
  name: string;
}

interface Staff {
  id: number;
  name: string;
  role: "doctor" | "hygienist" | "assistant" | "מזכירות" | "receptionist" | "ALL";
  whatsapp_enabled?: boolean;
  gcal_enabled?: boolean;
  phone_number?: string;
  email?: string;
}

interface Allocation {
  id: number;
  room_id: number;
  date: string;
  start_time: string; // HH:MM
  end_time: string;   // HH:MM
  room: Room;
  staff_members: Staff[];
  recalls_staff_id?: number | null;
}


interface Vacation {
  id: number;
  staff_id: number;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  notes?: string;
  staff?: Staff;
}

// 1-hour interval labels (operating hours 08:00 to 20:00)
const HOURS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];
const END_HOURS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];

// Smart default end time based on shift start
const getDefaultEndTime = (startHour: string): string => {
  if (startHour === "08:00") return "14:00";
  if (startHour === "14:00") return "20:00";
  
  const startIdx = HOURS.indexOf(startHour);
  if (startIdx !== -1 && startIdx < END_HOURS.length) {
    return END_HOURS[startIdx];
  }
  
  const [hStr, mStr] = (startHour || "08:00").split(":");
  const h = parseInt(hStr, 10);
  const nextH = Math.min(isNaN(h) ? 9 : h + 1, 20);
  return `${String(nextH).padStart(2, "0")}:${mStr || "00"}`;
};

const DAYS_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const I18N = {
  he: {
    "Sunday": "ראשון",
    "Monday": "שני",
    "Tuesday": "שלישי",
    "Wednesday": "רביעי",
    "Thursday": "חמישי",
    "Friday": "שישי",
    "TOUR": "סיור",
    "Clear Week": "נקה שבוע",
    "Undo": "בטל",
    "Vacations": "חופשים",
    "Staff Vacations": "חופשות צוות",
    "Add Vacation": "הוסף חופשה",
    "Edit Vacation": "עריכת חופשה",
    "Edit": "ערוך",
    "Update Vacation": "עדכן חופשה",
    "Delete Vacation": "מחק חופשה",
    "Cancel Edit": "ביטול עריכה",
    "Are you sure you want to delete this vacation?": "האם אתה בטוח שברצונך למחוק חופשה זו?",
    "Select Staff": "בחר איש צוות",
    "Start Date": "תאריך התחלה",
    "End Date": "תאריך סיום",
    "Notes": "הערות",
    "No recorded vacations.": "אין חופשות רשומות.",
    "Please select a staff member.": "אנא בחר איש צוות.",
    "Please select start and end dates.": "אנא בחר תאריך התחלה וסיום.",
    "Start date cannot be after end date.": "תאריך התחלה אינו יכול להיות מאוחר מתאריך סיום.",
    "Vacation added successfully.": "חופשה נוספה בהצלחה.",
    "Vacation updated successfully.": "חופשה עודכנה בהצלחה.",
    "Vacation removed.": "חופשה נמחקה.",
    "(בחופש)": "(בחופש)",
    "Copy Entire Week": "העתק שבוע שלם",
    "Room": "חדר",
    "Date": "תאריך",
    "Start Time": "שעת התחלה",
    "End Time": "שעת סיום",
    "Dentist": "רופא/ת",
    "Hygienist": "שיננית",
    "Assistant": "סייע/ת",
    "Receptionist": "מזכירות",
    "מזכירות": "מזכירות",
    "Assigned Receptionists": "מזכירות משובצות",
    "Assigned Practitioners & Assistants": "רופאים, שינניות וסייעות משובצים",
    "ALL (Unrestricted)": "הכל",
    "Name": "שם",
    "Role": "תפקיד",
    "Phone Number": "מספר טלפון",
    "Email": "אימייל",
    "Phone (WhatsApp)": "טלפון (WhatsApp)",
    "Email (GCal Sync)": "אימייל (סנכרון GCal)",
    "Integrations": "אינטגרציות",
    "Clinic Resources Dashboard": "ניהול משאבי המרפאה",
    "Staff & Alert Integrations": "צוות והתראות",
    "Treatment Rooms Layout": "פריסת חדרי טיפולים",
    "Quick Edit": "עריכה מהירה",
    "Start": "התחלה",
    "End": "סיום",
    "No eligible staff found.": "לא נמצא איש צוות מתאים.",
    "Updating Schedule...": "מעדכן לו״ז...",
    "Cancel Assignment": "בטל שיבוץ",
    "Copy Day": "העתק יום",
    "Copy to Today": "העתק להיום",
    "Copy to Tomorrow": "העתק למחר",
    "Copy to Next Week": "העתק לשבוע הבא",
    "+ Book": "+ שיבוץ",
    "Daily": "יומי",
    "Weekly": "שבועי",
    "Schedule Log": "יומן שיבוצים",
    "Manage Database": "ניהול מסד נתונים",
    "Staff": "צוות",
    "Rooms": "חדרים",
    "Close": "סגור",
    "Cancel": "ביטול",
    "Save changes": "שמור שינויים",
    "Add Staff": "הוסף צוות",
    "Add Room": "הוסף חדר",
    "Delete": "מחק",
    "Yes, Delete": "כן, מחק",
    "Confirm Deletion": "אשר מחיקה",
    "Copy Schedule": "העתק לו״ז",
    "Submit": "אישור",
    "+ Add Room": "+ הוסף חדר",
    "+ Add Staff": "+ הוסף איש צוות",
    "Send Weekly Schedule via WhatsApp": "שלח לו״ז שבועי בוואטסאפ",
    "Send Shift Reminders": "שלח תזכורות משמרת",
    "Clear Form": "נקה טופס",
    "Assign Staff": "שבץ צוות",
    "Send Daily WhatsApp Schedule": "שליחת סידור עבודה יומי בוואטסאפ",
    "Are you sure you want to send the daily schedule to the staff?": "האם לשלוח סידור עבודה יומי לצוות?",
    "Send Now": "שלח עכשיו",
    "Sending...": "שולח..."
  }
};

// Deterministic pastel color palette for practitioners
interface PaletteColor {
  bg: string;
  text: string;
  border: string;
  leftBorder: string;
}

const SPECTRUMS: Record<string, PaletteColor[]> = {
  doctor: [
    { bg: "#e0f2fe", text: "#0369a1", border: "#bae6fd", leftBorder: "#0ea5e9" }, // 0: Sky Blue
    { bg: "#e0e7ff", text: "#4338ca", border: "#c7d2fe", leftBorder: "#6366f1" }, // 1: Periwinkle / Light Lavender-Blue
    { bg: "#ccfbf1", text: "#0f766e", border: "#99f6e4", leftBorder: "#14b8a6" }, // 2: Pale Cyan / Teal
    { bg: "#e1f5fe", text: "#0288d1", border: "#b3e5fc", leftBorder: "#03a9f4" }, // 3: Bright Ice Blue
    { bg: "#ebf8ff", text: "#1e3a8a", border: "#bee3f8", leftBorder: "#3182ce" }, // 4: Deep Indigo Tint
    { bg: "#e0f7fa", text: "#006064", border: "#b2ebf2", leftBorder: "#00acc1" }, // 5: Deep Ocean Cyan
  ],
  hygienist: [
    { bg: "#ecfdf5", text: "#065f46", border: "#a7f3d0", leftBorder: "#10b981" }, // 0: Mint Green
    { bg: "#f0fdf4", text: "#166534", border: "#dcfce7", leftBorder: "#22c55e" }, // 1: Sage Green
    { bg: "#f7fee7", text: "#4d7c0f", border: "#ecfccb", leftBorder: "#84cc16" }, // 2: Pale Emerald
    { bg: "#f1f5f9", text: "#334155", border: "#e2e8f0", leftBorder: "#64748b" }, // 3: Soft Slate / Sage
    { bg: "#f0f4c3", text: "#33691e", border: "#e6ee9c", leftBorder: "#9ccc65" }, // 4: Tea Green
    { bg: "#e8f5e9", text: "#1b5e20", border: "#c8e6c9", leftBorder: "#4caf50" }, // 5: Fresh Forest Lime
  ],
  receptionist: [
    { bg: "#fff1f2", text: "#9f1239", border: "#ffe4e6", leftBorder: "#fda4af" }, // 0: Light Rose
    { bg: "#fff7ed", text: "#9a3412", border: "#ffedd5", leftBorder: "#f97316" }, // 1: Soft Peach / Apricot
    { bg: "#f3e8ff", text: "#6b21a8", border: "#e9d5ff", leftBorder: "#a855f7" }, // 2: Warm Lavender
    { bg: "#fae8ff", text: "#86198f", border: "#f5d0fe", leftBorder: "#d946ef" }, // 3: Soft Fuchsia / Pink
    { bg: "#ffe0b2", text: "#e65100", border: "#ffcc80", leftBorder: "#ff9800" }, // 4: Light Salmon
    { bg: "#f3e5f5", text: "#4a148c", border: "#e1bee7", leftBorder: "#9c27b0" }, // 5: Light Amethyst
  ],
  "מזכירות": [
    { bg: "#fff1f2", text: "#9f1239", border: "#ffe4e6", leftBorder: "#fda4af" }, // 0: Light Rose
    { bg: "#fff7ed", text: "#9a3412", border: "#ffedd5", leftBorder: "#f97316" }, // 1: Soft Peach / Apricot
    { bg: "#f3e8ff", text: "#6b21a8", border: "#e9d5ff", leftBorder: "#a855f7" }, // 2: Warm Lavender
    { bg: "#fae8ff", text: "#86198f", border: "#f5d0fe", leftBorder: "#d946ef" }, // 3: Soft Fuchsia / Pink
    { bg: "#ffe0b2", text: "#e65100", border: "#ffcc80", leftBorder: "#ff9800" }, // 4: Light Salmon
    { bg: "#f3e5f5", text: "#4a148c", border: "#e1bee7", leftBorder: "#9c27b0" }, // 5: Light Amethyst
  ]
};

const hashName = (name: string): number => {
  return name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
};

const getPractitionerStyle = (role: string, name: string): PaletteColor => {
  const normalizedRole = role ? role.toLowerCase() : "doctor";
  const spectrumKey = normalizedRole === "מזכירות" ? "מזכירות" : (normalizedRole === "receptionist" ? "מזכירות" : normalizedRole);
  const spectrum = (SPECTRUMS as any)[spectrumKey] || (SPECTRUMS as any).doctor;
  const hash = hashName(name);
  return spectrum[hash % spectrum.length];
};

// Helper to sort staff list forcing 'חסר איש צוות' to the very bottom
const sortStaffWithMissingAtEnd = (staffList: Staff[]): Staff[] => {
  const normal = staffList.filter(s => s.name !== "חסר איש צוות");
  const missing = staffList.filter(s => s.name === "חסר איש צוות");
  return [...normal, ...missing];
};


// Timezone-safe date parser
const parseDate = (dateStr: string): Date => {
  const parts = dateStr.split("-");
  return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
};

// Get today's date formatted as YYYY-MM-DD
const getTodayDateString = (): string => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

const joyrideSteps: Step[] = [
  {
    target: ".weekly-grid",
    title: "Weekly Logistical Matrix",
    content: "Welcome to the Dental Clinic Planner! This matrix gives you a full weekly overview of all treatment rooms and dates at a glance.",
    placement: "center",
    skipBeacon: true
  },
  {
    target: ".btn-weekly-cell-add-footer",
    title: "Scheduling Staff",
    content: "Ready to schedule? Click any '+ Book' button within a room cell to assign practitioners and assistants to specific time ranges.",
    placement: "top"
  },
  {
    target: ".btn-copy-week",
    title: "Duplicate Weekly Schedule",
    content: "Use the 'Copy Entire Week to Next Week' button to replicate your complete weekly schedule forward with one click.",
    placement: "bottom"
  },
  {
    target: ".weekly-cell-copy-wrapper",
    title: "Copy Single Room Day",
    content: "Hover over any room's day cell to reveal the 'Copy Day' button. You can copy a single room's daily schedule to other days of the week.",
    placement: "left"
  },
  {
    target: ".weekly-alloc-card",
    title: "Drag & Drop Rescheduling",
    content: "Want to reschedule? Simply drag and drop any shift to a different room or a different day to update the schedule instantly!",
    placement: "right"
  }
];

const ScrollableTimePicker = ({ value, onChange, isEnd = false }: { value: string, onChange: (v: string) => void, isEnd?: boolean }) => {
  const [showPicker, setShowPicker] = useState(false);
  
  const [hourStr, minStr] = value ? value.split(":") : (isEnd ? ["09", "00"] : ["08", "00"]);
  const hours = isEnd 
    ? ["09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20"]
    : ["08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19"];
  const minutes = ["00", "15", "30", "45"];

  const handleHourClick = (h: string) => {
    onChange(`${h}:${minStr}`);
  };

  const handleMinClick = (m: string) => {
    onChange(`${hourStr}:${m}`);
  };

  return (
    <div style={{ position: "relative" }}>
      <div 
        className="form-select" 
        style={{ cursor: "pointer", background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}
        onClick={() => setShowPicker(!showPicker)}
      >
        <span>{value || (isEnd ? "09:00" : "08:00")}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </div>

      {showPicker && (
        <>
          <div 
            style={{ position: "fixed", inset: 0, zIndex: 40 }} 
            onClick={() => setShowPicker(false)}
          />
          <div style={{
            position: "absolute", top: "100%", left: 0, width: "100%", zIndex: 50,
            background: "white", border: "1px solid var(--border-light)", borderRadius: "var(--radius-md)",
            boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)", display: "flex", height: "160px", overflow: "hidden",
            marginTop: "4px"
          }}>
            <div style={{ flex: 1, overflowY: "auto", borderRight: "1px solid var(--border-light)" }} className="hide-scrollbar">
              {hours.map(h => (
                <div 
                  key={h} 
                  onClick={() => handleHourClick(h)}
                  style={{
                    padding: "8px", textAlign: "center", cursor: "pointer",
                    background: h === hourStr ? "var(--primary-light)" : "transparent",
                    fontWeight: h === hourStr ? "bold" : "normal",
                    color: h === hourStr ? "var(--primary-dark)" : "var(--text-main)"
                  }}
                >
                  {h}
                </div>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: "auto" }} className="hide-scrollbar">
              {minutes.map(m => (
                <div 
                  key={m} 
                  onClick={() => handleMinClick(m)}
                  style={{
                    padding: "8px", textAlign: "center", cursor: "pointer",
                    background: m === minStr ? "var(--primary-light)" : "transparent",
                    fontWeight: m === minStr ? "bold" : "normal",
                    color: m === minStr ? "var(--primary-dark)" : "var(--text-main)"
                  }}
                >
                  {m}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default function App() {
  // --- State Variables ---
  const [language, setLanguage] = useState<'he' | 'en'>('he');
  const t = (key: string) => {
    if (language === 'he') return (I18N.he as any)[key] || key;
    return key;
  };

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [runTour, setRunTour] = useState<boolean>(false);
  const [draggedRoomIndex, setDraggedRoomIndex] = useState<number | null>(null);
  const [editingRoomId, setEditingRoomId] = useState<number | null>(null);
  const [editingRoomName, setEditingRoomName] = useState<string>("");

  const showToast = (message: string, type: "success" | "error" | "info" | "warning" = "info") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Auto-trigger tour on first load
  useEffect(() => {
    const completed = localStorage.getItem("tutorialCompleted");
    if (!completed) {
      const timer = setTimeout(() => {
        setRunTour(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleJoyrideCallback = (data: EventData) => {
    const { status } = data;
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      localStorage.setItem("tutorialCompleted", "true");
      setRunTour(false);
    }
  };

  const [rooms, setRooms] = useState<Room[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [holidays, setHolidays] = useState<Record<string, Holiday>>({});
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString()); // default local date
  
  // V2 Features: RBAC and View Mode
  const [currentUserRole, setCurrentUserRole] = useState<"user" | "admin">(getAuthToken() ? "admin" : "user");
  const [viewMode, setViewMode] = useState<"weekly" | "manager" | "whatsapp">("weekly");
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);

  // Listen for auth expiration
  useEffect(() => {
    const handleAuthExpired = () => {
      setCurrentUserRole("user");
      showToast("Session expired. Please log in again.", "error");
    };
    window.addEventListener("auth-expired", handleAuthExpired);
    return () => window.removeEventListener("auth-expired", handleAuthExpired);
  }, []);
  const [selectedRoomId, setSelectedRoomId] = useState<number | "">("");

  // Filters


  // Modals
  const [showBookingModal, setShowBookingModal] = useState<boolean>(false);
  
  // Active Booking state
  const [bookingId, setBookingId] = useState<number | null>(null);
  const [bookingRoomId, setBookingRoomId] = useState<number>(0);
  const [bookingDate, setBookingDate] = useState<string>("");
  const [bookingStartTime, setBookingStartTime] = useState<string>("08:00");
  const [bookingEndTime, setBookingEndTime] = useState<string>("14:00");
  const [bookingStaffIds, setBookingStaffIds] = useState<number[]>([]);
  const [bookingRecallsStaffId, setBookingRecallsStaffId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Resource Manager form states
  const [newStaffName, setNewStaffName] = useState<string>("");
  const [newStaffRole, setNewStaffRole] = useState<"doctor" | "hygienist" | "assistant" | "מזכירות" | "receptionist" | "ALL">("doctor");
  const [newStaffPhone, setNewStaffPhone] = useState<string>("");
  const [newStaffEmail, setNewStaffEmail] = useState<string>("");
  const [newRoomName, setNewRoomName] = useState<string>("");
  const [managerError, setManagerError] = useState<string>("");

  // V2.3 Features: Proportional, Day Copy, D&D, Popover Quick Edit
  const [loading, setLoading] = useState<boolean>(false);
  const [copySourceDate, setCopySourceDate] = useState<string | null>(null);
  const [copySourceRoomId, setCopySourceRoomId] = useState<number | null>(null);
  
  // Fast edit popover state
  const [popoverAllocId, setPopoverAllocId] = useState<number | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<{ x: number; y: number } | null>(null);
  const [popoverStaffIds, setPopoverStaffIds] = useState<number[]>([]);
  const [popoverStartTime, setPopoverStartTime] = useState<string>("08:00");
  const [popoverEndTime, setPopoverEndTime] = useState<string>("14:00");
  const [popoverRecallsStaffId, setPopoverRecallsStaffId] = useState<number | null>(null);

  // Vacations state
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [showVacationsModal, setShowVacationsModal] = useState<boolean>(false);
  const [editingVacationId, setEditingVacationId] = useState<number | null>(null);
  const [vacationStaffId, setVacationStaffId] = useState<number | "">("");
  const [vacationStartDate, setVacationStartDate] = useState<string>("");
  const [vacationEndDate, setVacationEndDate] = useState<string>("");
  const [vacationNotes, setVacationNotes] = useState<string>("");
  const [vacationError, setVacationError] = useState<string>("");

  // --- WhatsApp Daily Schedule state ---
  const [isWhatsAppConnected, setIsWhatsAppConnected] = useState<boolean>(false);
  const [confirmDailyWhatsAppDate, setConfirmDailyWhatsAppDate] = useState<string | null>(null);
  const [isSendingDailyWhatsApp, setIsSendingDailyWhatsApp] = useState<boolean>(false);

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

  // --- Room Customizations ---
  const applyLocalStorageRoomCustomizations = (dbRooms: Room[]): Room[] => {
    // 1. Rename based on localStorage
    const savedRenames = localStorage.getItem("roomsRenames");
    let customizedRooms = dbRooms;
    if (savedRenames) {
      try {
        const renames: Record<string, string> = JSON.parse(savedRenames);
        customizedRooms = dbRooms.map(r => ({
          ...r,
          name: renames[r.id] !== undefined ? renames[r.id] : r.name
        }));
      } catch (e) {
        console.error("Error parsing room renames:", e);
      }
    }

    // 2. Sort based on localStorage order
    const savedOrder = localStorage.getItem("roomsOrder");
    if (savedOrder) {
      try {
        const orderedIds: number[] = JSON.parse(savedOrder);
        const orderMap = new Map<number, number>();
        orderedIds.forEach((id, idx) => orderMap.set(id, idx));

        customizedRooms = [...customizedRooms].sort((a, b) => {
          const indexA = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
          const indexB = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
          return indexA - indexB;
        });
      } catch (e) {
        console.error("Error parsing room order:", e);
      }
    }

    return customizedRooms;
  };

  // --- API Calls ---
  const fetchVacations = async () => {
    try {
      const res = await apiFetch(`/vacations`);
      const data = await res.json();
      setVacations(data);
    } catch (err) {
      console.error("Error loading vacations:", err);
    }
  };

  const isStaffOnVacation = (staffId: number, dateStr: string): boolean => {
    if (!dateStr || !staffId) return false;
    return vacations.some(
      (v) => v.staff_id === staffId && dateStr >= v.start_date && dateStr <= v.end_date
    );
  };

  const fetchData = async () => {
    try {
      const roomsRes = await apiFetch(`/rooms`);
      const roomsData = await roomsRes.json();
      const customized = applyLocalStorageRoomCustomizations(roomsData);
      setRooms(customized);
      
      // Select the first room as default for Weekly view
      if (customized.length > 0 && selectedRoomId === "") {
        setSelectedRoomId(customized[0].id);
      }

      const staffRes = await apiFetch(`/staff`);
      const staffData = await staffRes.json();
      setStaff(staffData);

      await fetchVacations();
    } catch (err) {
      console.error("Error loading clinic metadata:", err);
    }
  };

  const fetchAllocations = async () => {
    try {
      if (viewMode === "weekly" && weekDates.length > 0) {
        const startDate = weekDates[0];
        const endDate = weekDates[weekDates.length - 1];
        const res = await apiFetch(`/allocations?start_date=${startDate}&end_date=${endDate}`);
        const data = await res.json();
        setAllocations(data);
      } else if (viewMode === "manager") {
        // Manager doesn't show allocations directly, but just in case
        const res = await apiFetch(`/allocations?date=${selectedDate}`);
        const data = await res.json();
        setAllocations(data);
      }
    } catch (err) {
      console.error("Error loading allocations:", err);
    }
  };

  // WhatsApp Status check
  const checkWhatsAppStatus = async () => {
    try {
      const res = await apiFetch(`/whatsapp/status`);
      const data = await res.json();
      setIsWhatsAppConnected(data.status === "connected");
    } catch {
      setIsWhatsAppConnected(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchData();
    checkWhatsAppStatus();
    const interval = setInterval(checkWhatsAppStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  // Fetch when dependencies change
  useEffect(() => {
    fetchAllocations();
  }, [selectedDate, viewMode, selectedRoomId]);

  // Fetch Israeli / Jewish holidays for current week
  useEffect(() => {
    let isMounted = true;
    if (weekDates.length > 0) {
      getHolidaysForDates(weekDates).then((fetchedHolidays) => {
        if (isMounted) {
          setHolidays(fetchedHolidays);
        }
      });
    }
    return () => {
      isMounted = false;
    };
  }, [weekDates.join(",")]);

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
    
    // Set smart default end time (08:00 -> 14:00, 14:00 -> 20:00, or +1 hour)
    const defaultEnd = getDefaultEndTime(startHour);
    setBookingEndTime(defaultEnd);
    
    setBookingStaffIds([]);
    setBookingRecallsStaffId(null);
    setErrorMsg("");
    setShowBookingModal(true);
  };

  const saveBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (bookingStaffIds.length === 0) {
      setErrorMsg("Please select at least one staff member.");
      return;
    }

    if (bookingStartTime >= bookingEndTime) {
      setErrorMsg("End time must be strictly after the start time.");
      return;
    }

    const payload = {
      room_id: bookingRoomId,
      date: bookingDate,
      start_time: bookingStartTime,
      end_time: bookingEndTime,
      staff_ids: bookingStaffIds,
      recalls_staff_id: bookingRecallsStaffId,
    };

    try {
      const url = bookingId 
        ? `/allocations/${bookingId}` 
        : `/allocations`;
      const method = bookingId ? "PUT" : "POST";

      await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setShowBookingModal(false);
      fetchAllocations();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to connect to backend server.");
    }
  };



  const handleDragStart = (e: React.DragEvent, alloc: Allocation) => {
    e.dataTransfer.setData("text/plain", JSON.stringify({ id: alloc.id, sourceRoomId: alloc.room_id, sourceDate: alloc.date }));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetDate: string, targetRoomId: number) => {
    e.preventDefault();
    const dataStr = e.dataTransfer.getData("text/plain");
    if (!dataStr) return;
    try {
      const { id, sourceRoomId, sourceDate } = JSON.parse(dataStr);
      if (sourceRoomId === targetRoomId && sourceDate === targetDate) return;
      
      setLoading(true);
      const alloc = allocations.find((a) => a.id === id);
      if (!alloc) return;

      const targetRoom = rooms.find((r) => r.id === targetRoomId);
      const isTargetReception = targetRoom?.name === "Reception" || targetRoom?.name === "קבלה" || targetRoom?.name === "מזכירות";
      const isMainPractitionerReceptionist = alloc.staff_members.some(s => s.role === 'מזכירות' || s.role === 'receptionist');
      
      if (isTargetReception && !isMainPractitionerReceptionist) {
        showToast(t("Only a Receptionist can be assigned to the Reception desk.") || "Only a Receptionist can be assigned to the Reception desk.", "error");
        setLoading(false);
        return;
      }
      if (!isTargetReception && isMainPractitionerReceptionist) {
        showToast(t("Receptionists cannot be assigned to standard treatment rooms.") || "Receptionists cannot be assigned to standard treatment rooms.", "error");
        setLoading(false);
        return;
      }

      const payload = {
        room_id: targetRoomId,
        date: targetDate,
        start_time: alloc.start_time,
        end_time: alloc.end_time,
        staff_ids: alloc.staff_members.map(s => s.id),
        recalls_staff_id: isTargetReception ? alloc.recalls_staff_id : null,
      };

      await apiFetch(`/allocations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      fetchAllocations();
    } catch (err: any) {
      console.error("Drag and drop failed:", err);
      showToast(err.message || "Conflict or validation error occurred during drag and drop.", "error");
    } finally {
      setLoading(false);
    }
  };

  const copyRoomDayAllocations = async (sourceDate: string, targetDate: string, roomId: number) => {
    if (sourceDate === targetDate) return;
    const room = rooms.find((r) => r.id === roomId);
    const roomName = room ? room.name : `Room ${roomId}`;
    const confirmMsg = language === 'he'
      ? `האם אתה בטוח שברצונך להעתיק את הלו״ז של ${roomName} מתאריך ${sourceDate} לתאריך ${targetDate}? שיבוצים קיימים בחדר זה בתאריך היעד יימחקו ויעודכנו.`
      : `Are you sure you want to copy the schedule of ${roomName} from ${sourceDate} to ${targetDate}? Existing allocations for this room on ${targetDate} will be overwritten.`;
    
    if (!window.confirm(confirmMsg)) {
      setCopySourceDate(null);
      setCopySourceRoomId(null);
      return;
    }
    
    try {
      setLoading(true);
      const res = await apiFetch(`/allocations/copy-room-day?source_date=${sourceDate}&target_date=${targetDate}&room_id=${roomId}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.detail || "Failed to copy room schedule.", "error");
      } else {
        showToast(language === 'he' ? "הלו״ז הועתק בהצלחה." : "Schedule copied successfully.", "success");
        fetchAllocations();
      }
    } catch (err) {
      showToast("Server error copying room schedule.", "error");
    } finally {
      setCopySourceDate(null);
      setCopySourceRoomId(null);
      setLoading(false);
    }
  };


  const handleClearWeek = async () => {
    if (!window.confirm("Are you sure you want to clear the entire week? This will back up the schedule and you can undo it immediately.")) return;
    try {
      const currentWeekStart = weekDates[0];
      await apiFetch(`/allocations/clear-week?week_start_date=${currentWeekStart}`, { method: "POST" });
      showToast("Week cleared successfully.", "success");
      fetchAllocations();
    } catch (err: any) {
      showToast(err.message || "Failed to clear week", "error");
    }
  };

  const handleUndoWeek = async () => {
    try {
      const currentWeekStart = weekDates[0];
      await apiFetch(`/allocations/undo-clear?week_start_date=${currentWeekStart}`, { method: "POST" });
      showToast("Undo successful.", "success");
      fetchAllocations();
    } catch (err: any) {
      showToast(err.message || "Failed to undo week clear", "error");
    }
  };

  const handleCopyWeek = async () => {
    const currentWeekStart = weekDates[0];
    const currentSundayDate = parseDate(currentWeekStart);
    
    const nextSundayDate = new Date(currentSundayDate);
    nextSundayDate.setDate(currentSundayDate.getDate() + 7);
    
    const yyyy = nextSundayDate.getFullYear();
    const mm = String(nextSundayDate.getMonth() + 1).padStart(2, "0");
    const dd = String(nextSundayDate.getDate()).padStart(2, "0");
    const nextWeekStart = `${yyyy}-${mm}-${dd}`;

    const confirmMsg = `Are you sure you want to copy the entire current week's schedule to the following week? This will overwrite existing assignments on those days.`;
    if (!window.confirm(confirmMsg)) {
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch(`/allocations/copy-week?source_start_date=${currentWeekStart}&target_start_date=${nextWeekStart}`, {
        method: "POST"
      });

      if (!res.ok) {
        const errData = await res.json();
        showToast(errData.detail || "Failed to copy week.", "error");
        return;
      }

      showToast("Week cloned successfully!", "success");
      setSelectedDate(nextWeekStart);
    } catch (err) {
      console.error("Error copying week:", err);
      showToast("Failed to connect to backend server.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCardClick = (e: React.MouseEvent, alloc: Allocation) => {
    e.preventDefault();
    e.stopPropagation();
    
    const rect = e.currentTarget.getBoundingClientRect();
    setPopoverAnchor({
      x: rect.left + window.scrollX,
      y: rect.bottom + window.scrollY + 5
    });
    
    setPopoverAllocId(alloc.id);
    setPopoverStaffIds(alloc.staff_members.map(s => s.id));
    setPopoverStartTime(alloc.start_time);
    setPopoverEndTime(alloc.end_time);
    setPopoverRecallsStaffId(alloc.recalls_staff_id || null);
  };

  const closePopover = () => {
    setPopoverAllocId(null);
    setPopoverAnchor(null);
  };

  const saveFastEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!popoverAllocId) return;
    
    if (popoverStartTime >= popoverEndTime) {
      showToast("End time must be strictly after the start time.", "error");
      return;
    }

    setLoading(true);
    try {
      const alloc = allocations.find((a) => a.id === popoverAllocId);
      if (!alloc) return;

      const payload = {
        room_id: alloc.room_id,
        date: alloc.date,
        start_time: popoverStartTime,
        end_time: popoverEndTime,
        staff_ids: popoverStaffIds,
        recalls_staff_id: popoverRecallsStaffId,
      };

      await apiFetch(`/allocations/${popoverAllocId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      closePopover();
      fetchAllocations();
    } catch (err: any) {
      showToast(err.message || "Server error updating allocation.", "error");
    } finally {
      setLoading(false);
    }
  };
  
  const deleteBooking = async (id: number) => {
    if (!window.confirm("Are you sure you want to remove this assignment?")) return;
    try {
      const res = await apiFetch(`/allocations/${id}`, {
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

  const deleteFastEdit = async () => {
    if (!popoverAllocId) return;
    if (!window.confirm("Are you sure you want to delete this shift?")) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/allocations/${popoverAllocId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        closePopover();
        fetchAllocations();
      } else {
        showToast("Failed to delete allocation.", "error");
      }
    } catch (err) {
      console.error("Failed to delete booking:", err);
      showToast("Server error.", "error");
    } finally {
      setLoading(false);
    }
  };

  // --- Vacation Handlers ---
  const handleSaveVacation = async (e: React.FormEvent) => {
    e.preventDefault();
    setVacationError("");
    if (!vacationStaffId) {
      setVacationError(t("Please select a staff member."));
      return;
    }
    if (!vacationStartDate || !vacationEndDate) {
      setVacationError(t("Please select start and end dates."));
      return;
    }
    if (vacationStartDate > vacationEndDate) {
      setVacationError(t("Start date cannot be after end date."));
      return;
    }
    try {
      if (editingVacationId) {
        const res = await apiFetch(`/vacations/${editingVacationId}`, {
          method: "PUT",
          body: JSON.stringify({
            staff_id: Number(vacationStaffId),
            start_date: vacationStartDate,
            end_date: vacationEndDate,
            notes: vacationNotes.trim() || undefined
          })
        });
        const updatedVac = await res.json();
        setVacations(prev => prev.map(v => v.id === editingVacationId ? updatedVac : v));
        setEditingVacationId(null);
        setVacationNotes("");
        showToast(t("Vacation updated successfully."), "success");
      } else {
        const res = await apiFetch("/vacations", {
          method: "POST",
          body: JSON.stringify({
            staff_id: Number(vacationStaffId),
            start_date: vacationStartDate,
            end_date: vacationEndDate,
            notes: vacationNotes.trim() || undefined
          })
        });
        const newVac = await res.json();
        setVacations(prev => [...prev, newVac]);
        setVacationNotes("");
        showToast(t("Vacation added successfully."), "success");
      }
    } catch (err: any) {
      setVacationError(err.message || "Failed to save vacation");
    }
  };

  const startEditVacation = (v: Vacation) => {
    setEditingVacationId(v.id);
    setVacationStaffId(v.staff_id);
    setVacationStartDate(v.start_date);
    setVacationEndDate(v.end_date);
    setVacationNotes(v.notes || "");
    setVacationError("");
  };

  const cancelEditVacation = () => {
    setEditingVacationId(null);
    setVacationStaffId("");
    setVacationStartDate(selectedDate);
    setVacationEndDate(selectedDate);
    setVacationNotes("");
    setVacationError("");
  };

  const handleDeleteVacation = async (id: number) => {
    if (!window.confirm(t("Are you sure you want to delete this vacation?"))) {
      return;
    }
    try {
      await apiFetch(`/vacations/${id}`, { method: "DELETE" });
      setVacations(prev => prev.filter(v => v.id !== id));
      if (editingVacationId === id) {
        cancelEditVacation();
      }
      showToast(t("Vacation removed."), "success");
    } catch (err: any) {
      showToast(err.message || "Failed to delete vacation", "error");
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
      const res = await apiFetch(`/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newStaffName,
          role: newStaffRole,
          whatsapp_enabled: false,
          gcal_enabled: false,
          phone_number: newStaffPhone,
          email: newStaffEmail,
        }),
      });
      if (res.ok) {
        const addedStaff = await res.json();
        setStaff((prev) => [...prev, addedStaff]);
        setNewStaffName("");
        setNewStaffPhone("");
        setNewStaffEmail("");
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
      const res = await apiFetch(`/rooms`, {
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
      showToast("The Reception desk is a permanent clinic column and cannot be deleted.", "error");
      return;
    }
    if (!window.confirm("Are you sure you want to delete this room? Doing so will permanently cancel all allocations inside it.")) return;
    try {
      const res = await apiFetch(`/rooms/${id}`, { method: "DELETE" });
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

  // --- Room Reordering & Renaming Handlers ---
  const handleRoomDragStart = (e: React.DragEvent, index: number) => {
    setDraggedRoomIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleRoomDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleRoomDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedRoomIndex === null || draggedRoomIndex === index) return;

    const reorderedRooms = [...rooms];
    const [draggedItem] = reorderedRooms.splice(draggedRoomIndex, 1);
    reorderedRooms.splice(index, 0, draggedItem);

    // Save order of IDs to localStorage
    const orderedIds = reorderedRooms.map(r => r.id);
    localStorage.setItem("roomsOrder", JSON.stringify(orderedIds));

    // Update state
    setRooms(reorderedRooms);
    setDraggedRoomIndex(null);
  };

  const handleRoomDragEnd = () => {
    setDraggedRoomIndex(null);
  };

  const handleSaveRoomRename = (id: number) => {
    if (!editingRoomName.trim()) return;

    // Update state inline (temporary, committed to localStorage on clicking Apply)
    setRooms((prev) =>
      prev.map((r) => (r.id === id ? { ...r, name: editingRoomName.trim() } : r))
    );
    setEditingRoomId(null);
    showToast("Room renamed in manager window.", "info");
  };

  const handleApplyResourceChanges = async () => {
    try {
      // 1. Save staff preferences to backend database
      const response = await apiFetch(`/staff/bulk-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(staff),
      });

      if (!response.ok) {
        throw new Error("Failed to save staff preferences to database.");
      }

      // 2. Save room order to localStorage
      const orderedIds = rooms.map((r) => r.id);
      localStorage.setItem("roomsOrder", JSON.stringify(orderedIds));

      // 3. Save room renames to localStorage
      const savedRenames = localStorage.getItem("roomsRenames") || "{}";
      let renames: Record<string, string> = {};
      try {
        renames = JSON.parse(savedRenames);
      } catch (e) {
        console.error("Error parsing renames:", e);
      }
      rooms.forEach((r) => {
        renames[r.id] = r.name;
      });
      localStorage.setItem("roomsRenames", JSON.stringify(renames));

      // 4. Sync and re-render grid
      fetchData();
      fetchAllocations();

      showToast("Resource changes applied successfully!", "success");
      setViewMode("weekly");
    } catch (err) {
      console.error("Error applying resource changes:", err);
      setManagerError("Failed to save changes. Please try again.");
    }
  };

  const deleteStaff = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this staff member?")) return;
    try {
      const res = await apiFetch(`/staff/${id}`, { method: "DELETE" });
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

  // --- Filter Logic ---
  const sortedRooms = [...rooms].sort((a, b) => {
    const savedOrder = localStorage.getItem("roomsOrder");
    if (savedOrder) {
      try {
        const orderedIds: number[] = JSON.parse(savedOrder);
        const indexA = orderedIds.indexOf(a.id);
        const indexB = orderedIds.indexOf(b.id);
        const finalA = indexA !== -1 ? indexA : 9999;
        const finalB = indexB !== -1 ? indexB : 9999;
        return finalA - finalB;
      } catch (e) {
        // Fallback
      }
    }
    if (a.name === "Reception" || a.name === "קבלה" || a.name === "מזכירות") return -1;
    if (b.name === "Reception" || b.name === "קבלה" || b.name === "מזכירות") return 1;
    return a.id - b.id;
  });



  const formatRole = (role: string) => {
    if (role === "doctor") return t("Dentist");
    if (role === "hygienist") return t("Hygienist");
    if (role === "assistant") return t("Assistant");
    if (role === "receptionist" || role === "מזכירות") return t("Receptionist");
    if (role === "ALL") return t("ALL (Unrestricted)");
    return role;
  };

  const formatDateLabel = (dateStr: string) => {
    const d = parseDate(dateStr);
    return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  };

  const formatDailyModalDate = (dateStr: string) => {
    if (!dateStr) return "";
    const d = parseDate(dateStr);
    const dayIndex = d.getDay();
    const dayName = DAYS_NAMES[dayIndex] ? t(DAYS_NAMES[dayIndex]) : "";
    const parts = dateStr.split("-");
    const formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
    return language === "he" ? `יום ${dayName} (${formattedDate})` : `${dayName} (${formattedDate})`;
  };

  const handleSendDailyWhatsApp = async (dateStr: string) => {
    setIsSendingDailyWhatsApp(true);
    try {
      const res = await apiFetch(`/whatsapp/send-daily-schedule/${dateStr}`, {
        method: "POST",
      });
      const data = await res.json();
      const count = data.count !== undefined ? data.count : (data.statuses ? data.statuses.length : 0);
      if (count === 0) {
        showToast(
          language === "he"
            ? "לא נמצאו אנשי צוות עם משמרות ו-WhatsApp מופעל לתאריך זה."
            : "No staff members with shifts and WhatsApp enabled found for this date.",
          "info"
        );
      } else {
        const failedCount = (data.statuses || []).filter((s: any) => s.status && s.status.toString().startsWith("Failed")).length;
        if (failedCount > 0) {
          showToast(
            language === "he"
              ? `נשלח ל-${count - failedCount} מתוך ${count} אנשי צוות (${failedCount} נכשלו).`
              : `Sent to ${count - failedCount} of ${count} staff (${failedCount} failed).`,
            "warning"
          );
        } else {
          showToast(
            language === "he"
              ? `סידור העבודה היומי נשלח בהצלחה ל-${count} אנשי צוות!`
              : `Daily schedule sent successfully to ${count} staff members!`,
            "success"
          );
        }
      }
      setConfirmDailyWhatsAppDate(null);
    } catch (err: any) {
      showToast(err.message || (language === "he" ? "שגיאה בשליחת סידור עבודה יומי." : "Failed to send daily schedule."), "error");
    } finally {
      setIsSendingDailyWhatsApp(false);
    }
  };

  const bookingRoom = rooms.find((r) => r.id === bookingRoomId);
  const isReception = bookingRoom?.name === "Reception" || bookingRoom?.name === "קבלה" || bookingRoom?.name === "מזכירות";

  // Style properties for Weekly View grid (Days vs. Rooms Matrix)
  const weeklyMatrixGridStyle = {
    gridTemplateColumns: `150px repeat(6, minmax(140px, 1fr))`,
    gridTemplateRows: `auto repeat(${sortedRooms.length}, 160px)`,
  };

  const renderCellCopyAction = (dateStr: string, room: Room, dayIndex?: number) => {
    const srcDate = parseDate(dateStr);
    const nextWeekDateObj = new Date(srcDate);
    nextWeekDateObj.setDate(srcDate.getDate() + 7);
    const nextYyyy = nextWeekDateObj.getFullYear();
    const nextMm = String(nextWeekDateObj.getMonth() + 1).padStart(2, "0");
    const nextDd = String(nextWeekDateObj.getDate()).padStart(2, "0");
    const nextWeekTargetDate = `${nextYyyy}-${nextMm}-${nextDd}`;

    const dayOfWeekIndex = srcDate.getDay();
    const dayNameEn = DAYS_NAMES[dayOfWeekIndex] || "Sunday";
    const nextWeekLabel = language === 'he'
      ? `יום ${t(dayNameEn)} בשבוע הבא (${nextDd}/${nextMm})`
      : `${dayNameEn} next week (${nextDd}/${nextMm})`;

    return (
      <div className="weekly-cell-copy-wrapper">
        <button
          type="button"
          className="btn-copy-day-trigger"
          title={`Copy ${room.name} schedule`}
          onClick={(e) => {
            e.stopPropagation();
            setCopySourceDate(copySourceDate === dateStr && copySourceRoomId === room.id ? null : dateStr);
            setCopySourceRoomId(copySourceDate === dateStr && copySourceRoomId === room.id ? null : room.id);
          }}
        >
          📋 Copy Day
        </button>

        {copySourceDate === dateStr && copySourceRoomId === room.id && (
          <div
            className="copy-day-dropdown"
            style={
              dayIndex !== undefined && dayIndex >= 4
                ? { left: "auto", right: "100%", marginRight: "10px", marginLeft: "0" }
                : {}
            }
          >
            <div className="copy-day-dropdown-header">
              {language === 'he' ? `העתק לו״ז ${room.name} אל:` : `Copy ${room.name} Schedule To:`}
            </div>
            {weekDates.map((targetDate, idx) => {
              if (targetDate === dateStr) return null;
              return (
                <button
                  key={targetDate}
                  type="button"
                  className="copy-day-dropdown-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    copyRoomDayAllocations(dateStr, targetDate, room.id);
                  }}
                >
                  {t(DAYS_NAMES[idx])} ({targetDate.split("-")[2]}/{targetDate.split("-")[1]})
                </button>
              );
            })}
            <button
              type="button"
              className="copy-day-dropdown-item next-week-item"
              style={{
                borderTop: "1px solid var(--border-light, #e2e8f0)",
                color: "#6366f1",
                fontWeight: 600,
                marginTop: "0.2rem",
                paddingTop: "0.45rem"
              }}
              onClick={(e) => {
                e.stopPropagation();
                copyRoomDayAllocations(dateStr, nextWeekTargetDate, room.id);
              }}
            >
              {nextWeekLabel}
            </button>
            <button
              type="button"
              className="copy-day-dropdown-cancel"
              onClick={(e) => {
                e.stopPropagation();
                setCopySourceDate(null);
                setCopySourceRoomId(null);
              }}
            >
              {t("Cancel")}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="app-container" dir={language === 'he' ? 'rtl' : 'ltr'}>
      {/* Control Bar (Filters, Date, Daily/Weekly View toggles) */}
      <section className="control-bar saas-panel" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
          <div style={{ fontWeight: 700, color: "#334155", fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.2rem" }}>🦷</span> Dental Clinic Allocator
          </div>
          {/* Toggle between Daily & Weekly view */}
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <div className="view-mode-tabs">
            
            <button
              className={`view-mode-tab ${viewMode === "weekly" ? "active" : ""}`}
              onClick={() => setViewMode("weekly")}
            >
              {t("Weekly View")}
            </button>
            {currentUserRole === "admin" && (
              <>
                <button
                  className={`view-mode-tab ${viewMode === "manager" ? "active" : ""}`}
                  onClick={() => { setManagerError(""); setViewMode("manager"); }}
                >
                  {t("Manage Staff")}
                </button>
                <button
                  className={`view-mode-tab ${viewMode === "whatsapp" ? "active" : ""}`}
                  onClick={() => setViewMode("whatsapp")}
                >
                  {t("WhatsApp Dashboard")}
                </button>
              </>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
            {currentUserRole === "admin" ? (
              <button
                className="btn-tour-trigger"
                style={{ background: "#dc2626", color: "white", borderColor: "#dc2626" }}
                onClick={() => { clearAuthToken(); setCurrentUserRole("user"); window.dispatchEvent(new Event("auth-expired")); }}
              >
                {t("Logout")}
              </button>
            ) : (
              <button
                className="btn-tour-trigger"
                style={{ background: "#2563eb", color: "white", borderColor: "#2563eb" }}
                onClick={() => setShowLoginModal(true)}
              >
                {t("Admin Login")}
              </button>
            )}
            <button
              className="btn-tour-trigger"
              onClick={() => {
                setViewMode("weekly");
                setRunTour(true);
              }}
              title={t("Start Onboarding Tour")}
            >
              ❓ {t("TOUR")}
            </button>
            <button
              className="btn-tour-trigger"
              onClick={() => setLanguage(language === 'he' ? 'en' : 'he')}
              style={{ fontWeight: 'bold' }}
            >
              {language === 'he' ? 'HE / EN' : 'EN / HE'}
            </button>
          </div>
        </div>

        {/* Date Selector */}
        {viewMode !== "manager" && viewMode !== "whatsapp" && (
          <div className="date-navigator">
            <button className="btn-nav" onClick={() => changeDateByDays(-7)} title="Back">
              ❮
            </button>
            <input
              type="date"
              className="date-picker-input"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
            <button className="btn-nav" onClick={() => changeDateByDays(7)} title="Forward">
              ❯
            </button>
          </div>
        )}

        {viewMode === "weekly" ? (
          /* Weekly View Matrix Dashboard Header */
          <div className="filter-controls" style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
            <div className="filter-group">
              <span className="brand-subtitle-badge" style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem", background: "#f1f5f9", color: "#475569" }}>
                📅 Logistical Matrix (Rooms vs Days)
              </span>
            </div>
            {currentUserRole === "admin" && (
              <>
                <button
                  type="button"
                  className="btn-copy-week"
                  onClick={handleCopyWeek}
                  title={t("Copy Entire Week")}
                >
                  📋 {t("Copy Entire Week")}
                </button>
                <button
                  type="button"
                  className="btn-copy-week"
                  style={{ background: "#ef4444", color: "white", borderColor: "#dc2626" }}
                  onClick={handleClearWeek}
                  title={t("Clear Week")}
                >
                  🗑️ {t("Clear Week")}
                </button>
                <button
                  type="button"
                  className="btn-copy-week"
                  style={{ background: "#f59e0b", color: "white", borderColor: "#f59e0b" }}
                  onClick={handleUndoWeek}
                  title={t("Undo")}
                >
                  ↩️ {t("Undo")}
                </button>
                <button
                  type="button"
                  className="btn-copy-week"
                  style={{ background: "#8b5cf6", color: "white", borderColor: "#7c3aed" }}
                  onClick={() => {
                    setEditingVacationId(null);
                    setVacationStaffId("");
                    setVacationStartDate(selectedDate);
                    setVacationEndDate(selectedDate);
                    setVacationNotes("");
                    setVacationError("");
                    setShowVacationsModal(true);
                  }}
                  title={t("Vacations")}
                >
                  🏖️ {t("Vacations")}
                </button>
              </>
            )}
            <button
              type="button"
              className="btn-copy-week btn-print-schedule"
              onClick={() => window.print()}
              title="הדפס לוח שבועי"
            >
              הדפס לוח שבועי
            </button>
          </div>
        ) : viewMode === "whatsapp" ? (
          /* WhatsApp Dashboard Header (handled within the component) */
          <div />
        ) : (
          /* Resource Manager View Header */
          <div className="filter-controls" style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <div className="filter-group">
              <span className="brand-subtitle-badge" style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem", background: "#e0e7ff", color: "#4f46e5" }}>
                🛠️ Staff Management Directory
              </span>
            </div>
          </div>
        )}
      </section>



      {/* --- GRID VIEWS --- */}
      {viewMode === "whatsapp" ? (
        <WhatsAppDashboard 
          startDate={weekDates.length > 0 ? weekDates[0] : selectedDate} 
          endDate={weekDates.length > 0 ? weekDates[weekDates.length - 1] : selectedDate} 
        />
      ) : viewMode === "manager" ? (
        // RESOURCE MANAGER FULL-PAGE VIEW
        <main className="schedule-grid-container" style={{ padding: "1.5rem", background: "var(--bg-light)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
            <div>
              <h2 style={{ fontSize: "1.25rem", fontWeight: "700", color: "var(--text-dark)", margin: 0 }}>Clinic Resources Dashboard</h2>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: "0.25rem 0 0 0" }}>
                Manage staff accounts, phone/email contact details, automated messaging/sync integrations, and treatment room sorting.
              </p>
            </div>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  fetchData(); // Reset any unapplied state customizations
                  setViewMode("weekly");
                }}
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleApplyResourceChanges}
              >
                Apply Changes
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "flex-start" }}>
            {/* Left Column: Staff Directory */}
            <div className="saas-panel" style={{ flex: 3, padding: "1.5rem", minWidth: "500px" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "1.25rem", color: "var(--text-dark)" }}>Staff & Alert Integrations</h3>
              
              {/* Inline Add Staff Form */}
              <form onSubmit={handleAddStaff} style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.5rem", padding: "1rem", background: "#f8fafc", borderRadius: "var(--radius-md)", border: "1px solid var(--border-light)" }}>
                <div style={{ flex: 1, minWidth: "150px" }}>
                  <label className="form-label" style={{ fontSize: "0.65rem", textTransform: "uppercase", fontWeight: "700" }}>Name</label>
                  <input
                    type="text"
                    placeholder="Full Name"
                    className="form-select"
                    style={{ background: "#ffffff" }}
                    value={newStaffName}
                    onChange={(e) => setNewStaffName(e.target.value)}
                  />
                </div>
                <div style={{ width: "130px" }}>
                  <label className="form-label" style={{ fontSize: "0.65rem", textTransform: "uppercase", fontWeight: "700" }}>Role</label>
                  <select
                    className="form-select"
                    style={{ background: "#ffffff" }}
                    value={newStaffRole}
                    onChange={(e) => setNewStaffRole(e.target.value as any)}
                  >
                    <option value="doctor">{t("Dentist")}</option>
                    <option value="hygienist">{t("Hygienist")}</option>
                    <option value="assistant">{t("Assistant")}</option>
                    <option value="מזכירות">{t("Receptionist")}</option>
                    <option value="ALL">{t("ALL (Unrestricted)")}</option>
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: "150px" }}>
                  <label className="form-label" style={{ fontSize: "0.65rem", textTransform: "uppercase", fontWeight: "700" }}>Phone Number</label>
                  <input
                    type="text"
                    placeholder="+972501234567"
                    className="form-select"
                    style={{ background: "#ffffff" }}
                    value={newStaffPhone}
                    onChange={(e) => setNewStaffPhone(e.target.value)}
                  />
                </div>
                <div style={{ flex: 1, minWidth: "180px" }}>
                  <label className="form-label" style={{ fontSize: "0.65rem", textTransform: "uppercase", fontWeight: "700" }}>Email</label>
                  <input
                    type="email"
                    placeholder="name@clinic.com"
                    className="form-select"
                    style={{ background: "#ffffff" }}
                    value={newStaffEmail}
                    onChange={(e) => setNewStaffEmail(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn-primary" style={{ alignSelf: "flex-end", height: "38px" }}>
                  {t("Add Staff")}
                </button>
              </form>

              {/* Staff Table */}
              <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "65vh" }}>
                <table className="staff-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ position: "sticky", top: 0, background: "#ffffff", zIndex: 10 }}>
                    <tr style={{ borderBottom: "2px solid var(--border-light)", textAlign: "left" }}>
                      <th style={{ padding: "0.75rem 0.5rem", fontSize: "1.1rem", textTransform: "uppercase", color: "var(--text-muted)" }}>Name</th>
                      <th style={{ padding: "0.75rem 0.5rem", fontSize: "1.1rem", textTransform: "uppercase", color: "var(--text-muted)", width: "130px" }}>Role</th>
                      <th style={{ padding: "0.75rem 0.5rem", fontSize: "1.1rem", textTransform: "uppercase", color: "var(--text-muted)" }}>Phone (WhatsApp)</th>
                      <th style={{ padding: "0.75rem 0.5rem", fontSize: "1.1rem", textTransform: "uppercase", color: "var(--text-muted)" }}>Email (GCal Sync)</th>
                      <th style={{ padding: "0.75rem 0.5rem", fontSize: "1.1rem", textTransform: "uppercase", color: "var(--text-muted)", width: "220px" }}>Integrations</th>
                      <th style={{ padding: "0.75rem 0.5rem", width: "40px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortStaffWithMissingAtEnd(staff).map((s) => (
                      <tr key={s.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                        <td style={{ padding: "0.75rem 0.5rem" }}>
                          <input
                            type="text"
                            className="form-select"
                            style={{ border: "1px solid transparent", background: "transparent", fontWeight: "600", fontSize: "1.2rem", padding: "0.25rem 0.5rem", width: "100%" }}
                            value={s.name}
                            onChange={(e) => {
                              setStaff((prev) => prev.map((item) => item.id === s.id ? { ...item, name: e.target.value } : item));
                            }}
                            onFocus={(e) => e.target.style.border = "1px solid var(--border-light)"}
                            onBlur={(e) => e.target.style.border = "1px solid transparent"}
                          />
                        </td>
                        <td style={{ padding: "0.75rem 0.5rem" }}>
                          <select
                            className="form-select"
                            style={{ border: "1px solid transparent", background: "transparent", fontSize: "1.15rem", padding: "0.25rem 0.5rem" }}
                            value={s.role}
                            onChange={(e) => {
                              setStaff((prev) => prev.map((item) => item.id === s.id ? { ...item, role: e.target.value as any } : item));
                            }}
                            onFocus={(e) => e.target.style.border = "1px solid var(--border-light)"}
                            onBlur={(e) => e.target.style.border = "1px solid transparent"}
                          >
                            <option value="doctor">{t("Dentist")}</option>
                            <option value="hygienist">{t("Hygienist")}</option>
                            <option value="assistant">{t("Assistant")}</option>
                            <option value="מזכירות">{t("Receptionist")}</option>
                            <option value="ALL">{t("ALL (Unrestricted)")}</option>
                          </select>
                        </td>
                        <td style={{ padding: "0.75rem 0.5rem" }}>
                          <input
                            type="text"
                            className="form-select"
                            style={{ border: "1px solid transparent", background: "transparent", fontSize: "1.15rem", padding: "0.25rem 0.5rem", width: "100%" }}
                            placeholder="Add phone"
                            value={s.phone_number || ""}
                            onChange={(e) => {
                              setStaff((prev) => prev.map((item) => item.id === s.id ? { ...item, phone_number: e.target.value } : item));
                            }}
                            onFocus={(e) => e.target.style.border = "1px solid var(--border-light)"}
                            onBlur={(e) => e.target.style.border = "1px solid transparent"}
                          />
                        </td>
                        <td style={{ padding: "0.75rem 0.5rem" }}>
                          <input
                            type="email"
                            className="form-select"
                            style={{ border: "1px solid transparent", background: "transparent", fontSize: "1.15rem", padding: "0.25rem 0.5rem", width: "100%" }}
                            placeholder="Add email"
                            value={s.email || ""}
                            onChange={(e) => {
                              setStaff((prev) => prev.map((item) => item.id === s.id ? { ...item, email: e.target.value } : item));
                            }}
                            onFocus={(e) => e.target.style.border = "1px solid var(--border-light)"}
                            onBlur={(e) => e.target.style.border = "1px solid transparent"}
                          />
                        </td>
                        <td style={{ padding: "0.75rem 0.5rem" }}>
                          <div style={{ display: "flex", gap: "0.75rem" }}>
                            <label className="pref-checkbox-label" style={{ fontSize: "1.05rem", display: "flex", alignItems: "center", gap: "0.25rem", cursor: "pointer", userSelect: "none" }}>
                              <input
                                type="checkbox"
                                checked={s.whatsapp_enabled || false}
                                onChange={() => {
                                  setStaff((prev) => prev.map((item) => item.id === s.id ? { ...item, whatsapp_enabled: !item.whatsapp_enabled } : item));
                                }}
                              />
                              WhatsApp
                            </label>
                            <label className="pref-checkbox-label" style={{ fontSize: "1.05rem", display: "flex", alignItems: "center", gap: "0.25rem", cursor: "pointer", userSelect: "none" }}>
                              <input
                                type="checkbox"
                                checked={s.gcal_enabled || false}
                                onChange={() => {
                                  setStaff((prev) => prev.map((item) => item.id === s.id ? { ...item, gcal_enabled: !item.gcal_enabled } : item));
                                }}
                              />
                              Google Sync
                            </label>
                          </div>
                        </td>
                        <td style={{ padding: "0.75rem 0.5rem" }}>
                          <button
                            type="button"
                            className="action-icon-btn delete"
                            title="Delete Staff Member"
                            onClick={() => deleteStaff(s.id)}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {managerError && (
                <div className="error-banner" style={{ marginTop: "1rem" }}>
                  <span>{managerError}</span>
                </div>
              )}
            </div>

            {/* Right Column: Rooms Management */}
            <div className="saas-panel" style={{ flex: 1, padding: "1.5rem", minWidth: "300px" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "1.25rem", color: "var(--text-dark)" }}>Treatment Rooms Layout</h3>
              
              {/* Add Room Form */}
              <form onSubmit={handleAddRoom} style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
                <input
                  type="text"
                  placeholder="Room Name"
                  className="form-select"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                />
                <button type="submit" className="btn-primary" style={{ whiteSpace: "nowrap" }}>
                  {t("Add Room")}
                </button>
              </form>

              {/* Rooms list with drag and rename */}
              <div className="manager-list">
                {rooms.map((r, index) => (
                  <div
                    key={r.id}
                    className={`manager-item ${draggedRoomIndex === index ? "dragging" : ""}`}
                    draggable
                    onDragStart={(e) => handleRoomDragStart(e, index)}
                    onDragOver={handleRoomDragOver}
                    onDrop={(e) => handleRoomDrop(e, index)}
                    onDragEnd={handleRoomDragEnd}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1 }}>
                      <span style={{ cursor: "grab", color: "var(--text-muted)" }}>⋮⋮</span>
                      {editingRoomId === r.id ? (
                        <form
                          onSubmit={(e) => { e.preventDefault(); handleSaveRoomRename(r.id); }}
                          style={{ display: "flex", gap: "0.25rem", flex: 1 }}
                        >
                          <input
                            type="text"
                            className="form-select"
                            style={{ padding: "0.2rem 0.4rem", fontSize: "0.85rem" }}
                            value={editingRoomName}
                            onChange={(e) => setEditingRoomName(e.target.value)}
                          />
                          <button type="submit" className="action-icon-btn text-success" style={{ background: "none", border: "none" }} title="Save">✓</button>
                          <button type="button" className="action-icon-btn text-danger" style={{ background: "none", border: "none" }} onClick={() => setEditingRoomId(null)} title="Cancel">✕</button>
                        </form>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                          <span className="manager-item-name">{r.name}</span>
                          <div style={{ display: "flex", gap: "0.25rem" }}>
                            <button
                              type="button"
                              className="action-icon-btn edit"
                              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.85rem" }}
                              title="Rename Room"
                              onClick={() => { setEditingRoomId(r.id); setEditingRoomName(r.name); }}
                            >
                              ✏️
                            </button>
                            {r.name !== "Reception" && (
                              <button
                                type="button"
                                className="action-icon-btn delete"
                                title="Delete Room"
                                onClick={(e) => { e.stopPropagation(); deleteRoom(r.id); }}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      ) : (
        // WEEKLY VIEW - Days vs. Rooms Matrix
        <main className="schedule-grid-container" dir={language === 'he' ? 'rtl' : 'ltr'}>
          <div className="weekly-grid" style={weeklyMatrixGridStyle}>
            {/* Header row */}
            <div className="grid-header">
              <div className="grid-cell-header weekly-header-first">{t("Room")}</div>
              {weekDates.map((dateStr, dayIndex) => {
                const holiday = holidays[dateStr];
                return (
                  <div key={dateStr} className="grid-cell-header">
                    <div className="weekly-header-day-row">
                      <div className="weekly-day-name">{t(DAYS_NAMES[dayIndex])}</div>
                      <button
                        type="button"
                        className={`btn-daily-whatsapp ${isWhatsAppConnected ? "connected" : "disabled"}`}
                        disabled={!isWhatsAppConnected}
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDailyWhatsAppDate(dateStr);
                        }}
                        title={
                          !isWhatsAppConnected
                            ? (language === "he" ? "WhatsApp מנותק - יש להתחבר בלוח הבקרה" : "WhatsApp is disconnected - connect in dashboard")
                            : (language === "he" ? `שליחת סידור עבודה יומי ליום ${t(DAYS_NAMES[dayIndex])}` : `Send daily schedule for ${DAYS_NAMES[dayIndex]}`)
                        }
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                        </svg>
                      </button>
                    </div>
                    <div className="weekly-day-date">
                      {dateStr.split("-")[2]}/{dateStr.split("-")[1]}
                    </div>
                    {holiday && (
                      <div
                        className="weekly-day-holiday"
                        title={language === "he" ? holiday.hebrew : holiday.name}
                      >
                        {language === "he" ? holiday.hebrew : holiday.name}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Matrix Room Rows */}
            {sortedRooms.map((room) => (
              <div className="grid-row" key={room.id}>
                {/* Room Label (Y-axis header) */}
                <div className="grid-cell weekly-day-cell">
                  <div className="weekly-day-name">{room.name}</div>
                </div>

                {/* Day cells */}
                {weekDates.map((dateStr, dayIndex) => {
                  const dayAllocations = allocations.filter(
                    (a) => a.date === dateStr && a.room_id === room.id
                  );
                  const sortedDayAllocations = [...dayAllocations].sort((a, b) =>
                    a.start_time.localeCompare(b.start_time)
                  );

                  if (sortedDayAllocations.length === 0) {
                    return (
                      <div
                        className="grid-cell weekly-cell empty"
                        key={`${room.id}-${dateStr}`}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, dateStr, room.id)}
                      >
                        {renderCellCopyAction(dateStr, room, dayIndex)}
                        <div className="weekly-empty-state">
                          <button
                            className="btn-weekly-add-minimal"
                            onClick={() => openNewBooking(room.id, dateStr, "08:00")}
                          >
                            {t("+ Book")}
                          </button>
                        </div>
                      </div>
                    );
                  }

                  // Chronological timeline items (operating hours: 08:00 to 20:00)
                  const startLimit = 8 * 60;
                  const endLimit = 20 * 60;
                  const totalMinutes = endLimit - startLimit; // 720 mins

                  interface TimelineItem {
                    type: "alloc" | "gap";
                    startMin: number;
                    endMin: number;
                    alloc?: Allocation;
                    gapStart?: string;
                    gapEnd?: string;
                  }

                  const timelineItems: TimelineItem[] = [];
                  let currentMin = startLimit;

                  sortedDayAllocations.forEach((alloc) => {
                    const [startH, startM] = alloc.start_time.split(":").map(Number);
                    const [endH, endM] = alloc.end_time.split(":").map(Number);
                    const startMin = startH * 60 + startM;
                    const endMin = endH * 60 + endM;

                    if (startMin > currentMin) {
                      const gapStartStr = `${String(Math.floor(currentMin / 60)).padStart(2, "0")}:${String(currentMin % 60).padStart(2, "0")}`;
                      const gapEndStr = `${String(Math.floor(startMin / 60)).padStart(2, "0")}:${String(startMin % 60).padStart(2, "0")}`;
                      timelineItems.push({
                        type: "gap",
                        startMin: currentMin,
                        endMin: startMin,
                        gapStart: gapStartStr,
                        gapEnd: gapEndStr
                      });
                    }

                    timelineItems.push({
                      type: "alloc",
                      startMin: startMin,
                      endMin: endMin,
                      alloc: alloc
                    });

                    if (endMin > currentMin) {
                      currentMin = endMin;
                    }
                  });

                  if (endLimit > currentMin) {
                    const gapStartStr = `${String(Math.floor(currentMin / 60)).padStart(2, "0")}:${String(currentMin % 60).padStart(2, "0")}`;
                    const gapEndStr = `${String(Math.floor(endLimit / 60)).padStart(2, "0")}:${String(endLimit % 60).padStart(2, "0")}`;
                    timelineItems.push({
                      type: "gap",
                      startMin: currentMin,
                      endMin: endLimit,
                      gapStart: gapStartStr,
                      gapEnd: gapEndStr
                    });
                  }

                  return (
                    <div
                      className="grid-cell weekly-cell"
                      key={`${room.id}-${dateStr}`}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, dateStr, room.id)}
                    >
                      {renderCellCopyAction(dateStr, room, dayIndex)}
                      <div className="weekly-allocs-stack">
                        <div className="weekly-timeline-container">
                          {timelineItems.map((item, index) => {
                            const itemDuration = item.endMin - item.startMin;
                            const heightPercent = (itemDuration / totalMinutes) * 100;
                            
                            if (item.type === "alloc" && item.alloc) {
                              const alloc = item.alloc;
                              const hasMissingStaff = alloc.staff_members.some(s => s.name === "חסר איש צוות");
                              const mainStaff = alloc.staff_members.length > 0 ? alloc.staff_members[0] : { role: "doctor", name: "Unknown" };
                              const colors = hasMissingStaff
                                ? { bg: "#fee2e2", text: "#991b1b", border: "#ef4444", leftBorder: "#dc2626" }
                                : getPractitionerStyle(mainStaff.role, mainStaff.name);
                              return (
                                <div
                                  key={alloc.id}
                                  className={`weekly-alloc-card ${hasMissingStaff ? "missing-staff-lead" : `${mainStaff.role}-lead`}`}
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, alloc)}
                                  onClick={(e) => handleCardClick(e, alloc)}
                                  style={{
                                    cursor: "grab",
                                    backgroundColor: colors.bg,
                                    color: colors.text,
                                    borderColor: colors.border,
                                    borderLeft: `4px solid ${colors.leftBorder}`,
                                    minHeight: `${heightPercent}%`,
                                    height: "auto",
                                  }}
                                >
                                  <div className="weekly-alloc-header">
                                    <span className="weekly-alloc-time">
                                      {alloc.start_time} – {alloc.end_time}
                                    </span>
                                    <button
                                      type="button"
                                      className="weekly-alloc-delete"
                                      title="Cancel Assignment"
                                      onClick={(e) => {
                                        e.stopPropagation(); // prevent modal and popover popups
                                        deleteBooking(alloc.id);
                                      }}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                  <div className="weekly-alloc-body" style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                                    {alloc.staff_members.map(s => (
                                      <div key={s.id} className="weekly-alloc-practitioner">
                                        <span style={{ fontWeight: s.name === "חסר איש צוות" ? "bold" : undefined }}>{s.name}</span>
                                        <span className="role-indicator">
                                          {s.name === "חסר איש צוות"
                                            ? "⚠️"
                                            : s.role === "doctor"
                                            ? "🦷"
                                            : s.role === "hygienist"
                                            ? "🪥"
                                            : alloc.recalls_staff_id === s.id
                                            ? "📞"
                                            : s.role === "assistant"
                                            ? "🤝"
                                            : s.role === "ALL"
                                            ? "🌟"
                                            : "📞"}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            } else {
                              return (
                                <div
                                  key={`gap-${index}`}
                                  className="weekly-gap-text"
                                  onClick={() => openNewBooking(room.id, dateStr, item.gapStart || "08:00")}
                                  title="Click to book this open slot"
                                  style={{
                                    cursor: "pointer",
                                    minHeight: `${heightPercent}%`,
                                    height: "auto",
                                  }}
                                >
                                  Open: {item.gapStart}–{item.gapEnd}
                                </div>
                              );
                            }
                          })}
                        </div>

                        <button
                          type="button"
                          className="btn-weekly-cell-add-footer"
                          onClick={() => {
                            const firstGap = timelineItems.find((t) => t.type === "gap");
                            const defaultStart = firstGap ? firstGap.gapStart || "08:00" : "08:00";
                            openNewBooking(room.id, dateStr, defaultStart);
                          }}
                        >
                          {t("+ Book")}
                        </button>
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
                <label className="form-label">{t("Date")}</label>
                <div className="form-input-static">
                  {bookingDate} ({formatDateLabel(bookingDate)})
                </div>
              </div>

              {/* V2 Feature: Start and End Time Selectors */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t("Start Time")}</label>
                  <ScrollableTimePicker
                    value={bookingStartTime}
                    onChange={(newStartTime) => {
                      setBookingStartTime(newStartTime);
                      setBookingEndTime(getDefaultEndTime(newStartTime));
                    }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{t("End Time")}</label>
                  <ScrollableTimePicker
                    value={bookingEndTime}
                    onChange={setBookingEndTime}
                    isEnd={true}
                  />
                </div>
              </div>

              {/* Staff Member Selection (Array Support) */}
              <div className="form-group">
                <label className="form-label">
                  {isReception ? (t("Assigned Receptionists") || "Assigned Receptionists") : (t("Assigned Practitioners & Assistants") || "Assigned Practitioners & Assistants")}
                </label>
                <div className="staff-checkbox-list" style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: '0.375rem', padding: '0.5rem' }}>
                  {sortStaffWithMissingAtEnd(
                    staff.filter((s) => s.role === "ALL" || (isReception ? (s.role === "מזכירות" || s.role === "receptionist") : (s.role === "doctor" || s.role === "hygienist" || s.role === "assistant")))
                  ).map((s) => {
                      const isAssigned = bookingStaffIds.includes(s.id);
                      const onVacation = bookingDate ? isStaffOnVacation(s.id, bookingDate) : false;
                      return (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.25rem 0', borderBottom: '1px solid var(--border-light)' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', flex: 1 }}>
                            <input
                              type="checkbox"
                              checked={isAssigned}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setBookingStaffIds([...bookingStaffIds, s.id]);
                                } else {
                                  setBookingStaffIds(bookingStaffIds.filter(id => id !== s.id));
                                  if (bookingRecallsStaffId === s.id) setBookingRecallsStaffId(null);
                                }
                              }}
                            />
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                              <span style={{ fontWeight: isAssigned ? "600" : "400" }}>{s.name}</span>
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>({formatRole(s.role)})</span>
                              {onVacation && (
                                <span style={{ color: "#ef4444", fontSize: "0.8rem", fontWeight: "bold" }}>
                                  (בחופש)
                                </span>
                              )}
                            </span>
                          </label>
                          {isReception && isAssigned && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                              <input 
                                type="radio" 
                                name="bookingRecalls"
                                checked={bookingRecallsStaffId === s.id}
                                onChange={() => setBookingRecallsStaffId(s.id)}
                              />
                              Recalls
                            </label>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>

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
                  {t("Cancel")}
                </button>
                <button type="submit" className="btn-primary">
                  Save Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- FAST EDIT POPOVER --- */}
      {popoverAllocId && popoverAnchor && (
        <>
          {/* Click outside to close backdrop */}
          <div className="popover-backdrop" onClick={closePopover} />
          
          <div
            className="fast-edit-popover saas-panel"
            style={{
              position: "absolute",
              left: `${popoverAnchor.x}px`,
              top: `${popoverAnchor.y}px`,
            }}
          >
            <div className="popover-header">
              <h4 className="popover-title">Quick Edit</h4>
              <button type="button" className="btn-close-popover" onClick={closePopover}>×</button>
            </div>
            
            <form onSubmit={saveFastEdit}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: "0.65rem" }}>Start</label>
                  <ScrollableTimePicker
                    value={popoverStartTime}
                    onChange={(newStartTime) => {
                      setPopoverStartTime(newStartTime);
                      setPopoverEndTime(getDefaultEndTime(newStartTime));
                    }}
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: "0.65rem" }}>End</label>
                  <ScrollableTimePicker
                    value={popoverEndTime}
                    onChange={setPopoverEndTime}
                    isEnd={true}
                  />
                </div>
              </div>
              
              <div className="form-group" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <label className="form-label" style={{ fontSize: "0.65rem", marginBottom: "0.25rem" }}>
                  {t("Assigned Staff") || "Assigned Staff"}
                </label>
                <div className="staff-checkbox-list" style={{ 
                  maxHeight: "150px", 
                  overflowY: "auto", 
                  border: "1px solid var(--border-color)", 
                  borderRadius: "6px", 
                  padding: "0.25rem",
                  fontSize: "0.85rem"
                }}>
                  {(() => {
                    const alloc = allocations.find((a) => a.id === popoverAllocId);
                    const room = rooms.find((r) => r.id === alloc?.room_id);
                    const isReception = room?.name === "Reception" || room?.name === "קבלה" || room?.name === "מזכירות";

                    const filteredStaff = sortStaffWithMissingAtEnd(
                      staff.filter(s => {
                        if (s.role === 'ALL') return true;
                        if (isReception) {
                          return s.role === 'מזכירות' || s.role === 'receptionist';
                        } else {
                          return s.role === 'doctor' || s.role === 'hygienist' || s.role === 'assistant';
                        }
                      })
                    );

                    if (filteredStaff.length === 0) {
                      return <div style={{ padding: "0.5rem", color: "var(--text-secondary)" }}>{t("No eligible staff found.") || "No eligible staff found."}</div>;
                    }

                    return filteredStaff.map(s => {
                      const isChecked = popoverStaffIds.includes(s.id);
                      const onVacation = alloc?.date ? isStaffOnVacation(s.id, alloc.date) : false;
                      return (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.25rem 0.5rem", borderRadius: "4px", backgroundColor: isChecked ? "rgba(99, 102, 241, 0.05)" : "transparent" }}>
                          <label className="checkbox-label" style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", flex: 1 }}>
                            <input 
                              type="checkbox" 
                              checked={isChecked} 
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setPopoverStaffIds([...popoverStaffIds, s.id]);
                                } else {
                                  setPopoverStaffIds(popoverStaffIds.filter(id => id !== s.id));
                                  if (popoverRecallsStaffId === s.id) setPopoverRecallsStaffId(null);
                                }
                              }}
                            />
                            <span style={{ fontWeight: isChecked ? "600" : "400", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                              {s.name}
                              <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: "normal" }}>({formatRole(s.role)})</span>
                              {onVacation && (
                                <span style={{ color: "#ef4444", fontSize: "0.75rem", fontWeight: "bold" }}>
                                  (בחופש)
                                </span>
                              )}
                            </span>
                          </label>
                          {isReception && isChecked && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                              <input 
                                type="radio" 
                                name="popoverRecalls"
                                checked={popoverRecallsStaffId === s.id}
                                onChange={() => setPopoverRecallsStaffId(s.id)}
                              />
                              Recalls
                            </label>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
              
              <div className="popover-actions" style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
                <button type="button" className="btn-secondary" style={{ padding: "0.3rem 0.75rem", fontSize: "0.8rem", color: "var(--danger)", borderColor: "var(--danger)" }} onClick={deleteFastEdit}>
                  Delete
                </button>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button type="button" className="btn-secondary" style={{ padding: "0.3rem 0.75rem", fontSize: "0.8rem" }} onClick={closePopover}>
                    {t("Cancel")}
                  </button>
                  <button type="submit" className="btn-primary" style={{ padding: "0.3rem 0.75rem", fontSize: "0.8rem" }}>
                    Save
                  </button>
                </div>
              </div>
            </form>
          </div>
        </>
      )}

      {/* --- GLOBAL LOADING SPINNER --- */}
      {loading && (
        <div className="global-spinner-overlay">
          <div className="spinner" />
          <div className="loading-text">Updating Schedule...</div>
        </div>
      )}

      {/* --- TOAST NOTIFICATIONS --- */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-card toast-${t.type}`}>
            <span className="toast-icon">{t.type === "success" ? "✓" : t.type === "error" ? "⚠️" : "ℹ️"}</span>
            <span className="toast-message">{t.message}</span>
            <button className="toast-close" onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}>×</button>
          </div>
        ))}
      </div>

      {/* --- ONBOARDING TOUR TUTORIAL --- */}
      <Joyride
        steps={joyrideSteps}
        run={runTour}
        continuous={true}
        onEvent={handleJoyrideCallback}
        options={{
          primaryColor: "#6366f1",
          zIndex: 100000,
          showProgress: true,
          buttons: ["back", "close", "primary", "skip"]
        }}
      />

      {/* --- STAFF VACATIONS MODAL --- */}
      {showVacationsModal && (
        <div className="modal-overlay" onClick={() => setShowVacationsModal(false)}>
          <div className="modal-content" style={{ maxWidth: "550px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                🏖️ {t("Staff Vacations")}
              </h3>
              <button className="btn-close" onClick={() => setShowVacationsModal(false)}>
                ×
              </button>
            </div>

            {/* Form to add or edit a vacation */}
            <form onSubmit={handleSaveVacation} style={{ marginBottom: "1.5rem", background: editingVacationId ? "rgba(139, 92, 246, 0.06)" : "var(--bg-secondary, #f8fafc)", padding: "1rem", borderRadius: "8px", border: `1px solid ${editingVacationId ? "#8b5cf6" : "var(--border-color, #e2e8f0)"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: "600", fontSize: "0.9rem", marginBottom: "0.75rem", color: editingVacationId ? "#8b5cf6" : "var(--text-primary)" }}>
                <span>{editingVacationId ? `✏️ ${t("Edit Vacation")}` : `+ ${t("Add Vacation")}`}</span>
                {editingVacationId && (
                  <button type="button" onClick={cancelEditVacation} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.8rem", textDecoration: "underline" }}>
                    {t("Cancel Edit")}
                  </button>
                )}
              </div>

              {vacationError && (
                <div style={{ color: "#ef4444", fontSize: "0.85rem", marginBottom: "0.75rem", background: "#fef2f2", padding: "0.5rem", borderRadius: "6px", border: "1px solid #fecaca" }}>
                  ⚠️ {vacationError}
                </div>
              )}

              <div className="form-group" style={{ marginBottom: "0.75rem" }}>
                <label className="form-label" style={{ fontSize: "0.8rem" }}>{t("Select Staff")}</label>
                <select
                  className="form-input"
                  value={vacationStaffId}
                  onChange={(e) => setVacationStaffId(e.target.value ? Number(e.target.value) : "")}
                  required
                >
                  <option value="">-- {t("Select Staff")} --</option>
                  {staff.filter(s => s.name !== "חסר איש צוות").map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({formatRole(s.role)})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem" }}>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: "0.8rem" }}>{t("Start Date")}</label>
                  <input
                    type="date"
                    className="form-input"
                    value={vacationStartDate}
                    onChange={(e) => {
                      setVacationStartDate(e.target.value);
                      if (!vacationEndDate || vacationEndDate < e.target.value) {
                        setVacationEndDate(e.target.value);
                      }
                    }}
                    required
                  />
                </div>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: "0.8rem" }}>{t("End Date")}</label>
                  <input
                    type="date"
                    className="form-input"
                    value={vacationEndDate}
                    onChange={(e) => setVacationEndDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: "0.75rem" }}>
                <label className="form-label" style={{ fontSize: "0.8rem" }}>{t("Notes")}</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={language === 'he' ? "הערות (אופציונלי)" : "Notes (optional)"}
                  value={vacationNotes}
                  onChange={(e) => setVacationNotes(e.target.value)}
                />
              </div>

              {editingVacationId ? (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem" }}>
                  <button
                    type="button"
                    onClick={() => handleDeleteVacation(editingVacationId)}
                    style={{
                      padding: "0.4rem 0.8rem",
                      fontSize: "0.85rem",
                      background: "#ef4444",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem"
                    }}
                  >
                    🗑️ {t("Delete Vacation")}
                  </button>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button type="button" onClick={cancelEditVacation} className="btn-secondary" style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}>
                      {t("Cancel")}
                    </button>
                    <button type="submit" className="btn-primary" style={{ padding: "0.4rem 1rem", fontSize: "0.85rem", background: "#8b5cf6", borderColor: "#7c3aed" }}>
                      💾 {t("Save changes")}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button type="submit" className="btn-primary" style={{ padding: "0.4rem 1rem", fontSize: "0.85rem", background: "#8b5cf6", borderColor: "#7c3aed" }}>
                    + {t("Add Vacation")}
                  </button>
                </div>
              )}
            </form>

            {/* List of recorded vacations */}
            <div style={{ fontWeight: "600", fontSize: "0.9rem", marginBottom: "0.5rem", color: "var(--text-primary)" }}>
              📋 {t("Staff Vacations")} ({vacations.length})
            </div>

            <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid var(--border-color, #e2e8f0)", borderRadius: "6px" }}>
              {vacations.length === 0 ? (
                <div style={{ padding: "1rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  {t("No recorded vacations.")}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {vacations.map((v) => {
                    const st = staff.find((s) => s.id === v.staff_id) || v.staff;
                    const isBeingEdited = editingVacationId === v.id;
                    return (
                      <div
                        key={v.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "0.6rem 0.8rem",
                          borderBottom: "1px solid var(--border-light, #f1f5f9)",
                          fontSize: "0.85rem",
                          backgroundColor: isBeingEdited ? "rgba(139, 92, 246, 0.08)" : "transparent",
                          transition: "background-color 0.2s"
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: "600", color: isBeingEdited ? "#7c3aed" : "var(--text-primary)" }}>
                            {st ? st.name : `Staff #${v.staff_id}`}
                            {st && <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginInlineStart: "0.3rem", fontWeight: "normal" }}>({formatRole(st.role)})</span>}
                          </div>
                          <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.15rem" }}>
                            📅 {v.start_date === v.end_date ? v.start_date : `${v.start_date} ➔ ${v.end_date}`}
                            {v.notes && <span style={{ marginInlineStart: "0.5rem", fontStyle: "italic" }}>• {v.notes}</span>}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => startEditVacation(v)}
                          style={{
                            background: isBeingEdited ? "#8b5cf6" : "#f1f5f9",
                            color: isBeingEdited ? "white" : "#475569",
                            border: "1px solid",
                            borderColor: isBeingEdited ? "#7c3aed" : "#cbd5e1",
                            cursor: "pointer",
                            padding: "0.3rem 0.6rem",
                            borderRadius: "6px",
                            fontSize: "0.8rem",
                            fontWeight: "500",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.25rem"
                          }}
                          title={t("Edit")}
                        >
                          ✏️ {t("Edit")}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="modal-actions" style={{ marginTop: "1rem", display: "flex", justifyContent: "flex-end" }}>
              <button type="button" className="btn-secondary" onClick={() => setShowVacationsModal(false)}>
                {t("Close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Sending Daily WhatsApp Schedule */}
      {confirmDailyWhatsAppDate && (
        <div className="modal-overlay" onClick={() => !isSendingDailyWhatsApp && setConfirmDailyWhatsAppDate(null)}>
          <div className="modal-content" style={{ maxWidth: "420px", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ justifyContent: "center", borderBottom: "none", paddingBottom: "0.25rem" }}>
              <div style={{
                width: "52px",
                height: "52px",
                borderRadius: "50%",
                backgroundColor: "#dcfce7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#16a34a",
                margin: "0.25rem auto 0.5rem auto"
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                </svg>
              </div>
            </div>
            <h3 className="modal-title" style={{ fontSize: "1.2rem", fontWeight: "700", marginBottom: "0.5rem" }}>
              {language === "he" ? "שליחת סידור עבודה יומי" : "Send Daily Schedule"}
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "1rem", lineHeight: "1.5", margin: "0.5rem 0 1.25rem 0" }}>
              {language === "he" 
                ? "האם לשלוח סידור עבודה יומי לצוות?" 
                : "Are you sure you want to send the daily schedule to the staff?"}
              <br />
              <strong style={{ color: "var(--text-primary)", display: "inline-block", marginTop: "0.4rem", fontSize: "1.05rem" }}>
                {formatDailyModalDate(confirmDailyWhatsAppDate)}
              </strong>
            </p>
            <div className="modal-actions" style={{ justifyContent: "center", gap: "0.75rem", marginTop: "0.5rem" }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={isSendingDailyWhatsApp}
                onClick={() => setConfirmDailyWhatsAppDate(null)}
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{ backgroundColor: "#25D366", borderColor: "#22c55e", display: "inline-flex", alignItems: "center", gap: "0.4rem", fontWeight: "600" }}
                disabled={isSendingDailyWhatsApp}
                onClick={() => handleSendDailyWhatsApp(confirmDailyWhatsAppDate)}
              >
                {isSendingDailyWhatsApp ? (
                  <>
                    <span className="spinner" style={{ width: "14px", height: "14px", border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 1s linear infinite" }} />
                    {language === "he" ? "שולח..." : "Sending..."}
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                    </svg>
                    {language === "he" ? "שלח עכשיו" : "Send Now"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- VERCEL ANALYTICS --- */}
      <Analytics />
      {showLoginModal && (
        <LoginModal
          onSuccess={() => {
            setShowLoginModal(false);
            setCurrentUserRole("admin");
            showToast("Successfully logged in as Admin.", "success");
          }}
          onClose={() => setShowLoginModal(false)}
        />
      )}
    </div>
  );
}