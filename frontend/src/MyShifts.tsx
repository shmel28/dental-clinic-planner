import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "./api";
import { getHolidaysForDates } from "./holidaysService";
import type { Holiday } from "./holidaysService";
import "./MyShifts.css";

/**
 * Read-only phone page for one worker, opened from a personal link: /?shifts=<token>.
 * Shows that worker's shifts for one week. No login; the token is the key.
 */

type Partner = { name: string; role: string };
type Shift = {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  room: string;
  with: Partner[];
  created_at: string | null;
  updated_at: string | null;
};
type WeekData = {
  name: string;
  role: string;
  week_start: string;
  days: string[];
  shifts: Shift[];
  vacations: { start_date: string; end_date: string }[];
};

const ROLE_LABELS: Record<string, string> = {
  doctor: "רופא/ה",
  hygienist: "שיננית",
  assistant: "סייעת",
  receptionist: "מזכירות",
  "מזכירות": "מזכירות",
};
const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (iso: string, n: number) => {
  const d = parse(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
const shortDate = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};
const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");

const partnerLabel = (p: Partner) => (p.role === "doctor" ? `ד״ר ${p.name}` : p.name);

/** "Changed today / yesterday / on 05/11" for a UTC timestamp */
const changedLabel = (isoUtc: string) => {
  const changed = new Date(isoUtc);
  const today = new Date();
  const dayDiff = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(changed.getFullYear(), changed.getMonth(), changed.getDate()).getTime()) /
      86400000
  );
  if (dayDiff <= 0) return "שונה היום";
  if (dayDiff === 1) return "שונה אתמול";
  return `שונה ב-${shortDate(toISO(changed))}`;
};

/**
 * The time of the previous visit on this phone, used to flag what's new since then.
 * Kept for the whole browser session so a refresh doesn't clear the flags.
 */
function useLastVisit(token: string): string | null {
  return useMemo(() => {
    const sessionKey = `myShifts.baseline.${token}`;
    const storeKey = `myShifts.lastSeen.${token}`;
    try {
      let baseline = sessionStorage.getItem(sessionKey);
      if (baseline === null) {
        baseline = localStorage.getItem(storeKey) ?? "";
        sessionStorage.setItem(sessionKey, baseline);
      }
      localStorage.setItem(storeKey, new Date().toISOString());
      return baseline || null;
    } catch {
      return null; // private mode or storage blocked: just skip the flags
    }
  }, [token]);
}

function downloadCalendar(data: WeekData) {
  const stamp = (date: string, time: string) => `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
  const events = data.shifts.map((s) =>
    [
      "BEGIN:VEVENT",
      `UID:shift-${s.id}@clinic`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
      // Floating local time: the phone shows it in its own (Israel) time zone
      `DTSTART:${stamp(s.date, s.start_time)}`,
      `DTEND:${stamp(s.date, s.end_time)}`,
      `SUMMARY:משמרת - ${s.room}`,
      s.with.length ? `DESCRIPTION:עם ${s.with.map(partnerLabel).join(", ")}` : "",
      "END:VEVENT",
    ]
      .filter(Boolean)
      .join("\r\n")
  );
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Clinic//My Shifts//HE", ...events, "END:VCALENDAR"].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `shifts_${data.week_start}.ics`;
  link.click();
  URL.revokeObjectURL(url);
}

// Drawn chevrons: text glyphs like ‹ › can render mirrored depending on font and direction
const Chevron = ({ pointsTo }: { pointsTo: "left" | "right" }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points={pointsTo === "left" ? "15 6 9 12 15 18" : "9 6 15 12 9 18"} />
  </svg>
);

export default function MyShifts({ token }: { token: string }) {
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [data, setData] = useState<WeekData | null>(null);
  const [error, setError] = useState<"" | "not-found" | "network">("");
  const [slow, setSlow] = useState(false);
  const [holidays, setHolidays] = useState<Record<string, Holiday>>({});
  const lastVisit = useLastVisit(token);

  // The main app's body has a dark background; this page uses a light one
  useEffect(() => {
    document.body.classList.add("my-shifts-body");
    document.documentElement.lang = "he";
    document.title = "המשמרות שלי";
    return () => document.body.classList.remove("my-shifts-body");
  }, []);

  useEffect(() => {
    let alive = true;
    setError("");
    setSlow(false);
    // Free hosting sleeps when idle; the first load of the day can take a while
    const slowTimer = setTimeout(() => alive && setSlow(true), 4000);
    const query = weekStart ? `?week_start=${weekStart}` : "";
    fetch(`${API_BASE_URL}/my/${encodeURIComponent(token)}${query}`)
      .then(async (res) => {
        if (res.status === 404) throw new Error("not-found");
        if (!res.ok) throw new Error("network");
        return res.json();
      })
      .then((d: WeekData) => {
        if (!alive) return;
        setData(d);
        getHolidaysForDates(d.days).then((h) => alive && setHolidays(h)).catch(() => {});
      })
      .catch((e) => alive && setError(e.message === "not-found" ? "not-found" : "network"))
      .finally(() => clearTimeout(slowTimer));
    return () => {
      alive = false;
      clearTimeout(slowTimer);
    };
  }, [token, weekStart]);

  if (error === "not-found") {
    return (
      <main className="ms-page" dir="rtl">
        <div className="ms-message">
          <p className="ms-message-title">הקישור לא תקין</p>
          <p>ייתכן שהוחלף בקישור חדש. בקשו מהמרפאה לשלוח לכם את הקישור שוב.</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="ms-page" dir="rtl">
        <div className="ms-message">
          {error === "network" ? (
            <>
              <p className="ms-message-title">אין חיבור כרגע</p>
              <p>נסו לרענן את הדף בעוד רגע.</p>
            </>
          ) : (
            <>
              <div className="ms-spinner" aria-hidden="true" />
              <p>טוען את המשמרות…</p>
              {slow && <p className="ms-muted">בפעם הראשונה בבוקר זה יכול לקחת עד דקה.</p>}
            </>
          )}
        </div>
      </main>
    );
  }

  const today = toISO(new Date());
  const nowHHMM = new Date().toTimeString().slice(0, 5);
  // On Saturday (clinic closed) "this week" means the coming one, matching the server
  const dow = new Date().getDay();
  const thisWeekStart = dow === 6 ? addDays(today, 1) : addDays(today, -dow);
  const weekOffset = Math.round((parse(data.week_start).getTime() - parse(thisWeekStart).getTime()) / (7 * 86400000));
  const weekTitle =
    weekOffset === 0 ? "השבוע" : weekOffset === 1 ? "שבוע הבא" : weekOffset === -1 ? "שבוע שעבר" : "שבוע";
  const onVacation = (date: string) => data.vacations.some((v) => date >= v.start_date && date <= v.end_date);

  const badgeFor = (s: Shift): { text: string; kind: "new" | "changed" } | null => {
    if (!lastVisit) return null; // first visit on this phone: everything is new, so flag nothing
    if (s.created_at && s.created_at > lastVisit) return { text: "חדש", kind: "new" };
    if (s.updated_at && s.updated_at > lastVisit) return { text: changedLabel(s.updated_at), kind: "changed" };
    return null;
  };

  return (
    <main className="ms-page" dir="rtl">
      <header className="ms-header">
        <div>
          <h1 className="ms-hello">שלום, {data.name.split(" ")[0]}</h1>
          <p className="ms-muted">{ROLE_LABELS[data.role] ?? data.role}</p>
        </div>
        <div className="ms-avatar" aria-hidden="true">{initials(data.name)}</div>
      </header>

      {/* Laid out left-to-right like a timeline: previous on the left, next on the right */}
      <nav className="ms-week" dir="ltr" aria-label="בחירת שבוע">
        <button type="button" className="ms-arrow" onClick={() => setWeekStart(addDays(data.week_start, -7))} aria-label="השבוע הקודם">
          <Chevron pointsTo="left" />
        </button>
        <div className="ms-week-label" dir="rtl">
          <p className="ms-week-title">
            {weekTitle} · <bdi dir="ltr">{shortDate(data.days[0])}–{shortDate(data.days[data.days.length - 1])}</bdi>
          </p>
          <p className="ms-muted">
            {data.shifts.length === 0 ? "אין משמרות" : data.shifts.length === 1 ? "משמרת אחת" : `${data.shifts.length} משמרות`}
          </p>
        </div>
        <button type="button" className="ms-arrow" onClick={() => setWeekStart(addDays(data.week_start, 7))} aria-label="השבוע הבא">
          <Chevron pointsTo="right" />
        </button>
      </nav>

      {weekOffset !== 0 && (
        <button type="button" className="ms-back-today" onClick={() => setWeekStart(null)}>
          חזרה לשבוע הנוכחי
        </button>
      )}

      <ol className="ms-days">
        {data.days.map((date) => {
          const dayShifts = data.shifts.filter((s) => s.date === date);
          const isToday = date === today;
          const isPast = date < today;
          const holiday = holidays[date];
          const dayName = `${DAY_NAMES[parse(date).getDay()]} ${shortDate(date)}`;

          if (dayShifts.length === 0) {
            const vacation = onVacation(date);
            return (
              <li key={date} className={`ms-day ms-day-empty ${vacation ? "ms-day-vacation" : ""} ${isPast ? "ms-past" : ""}`}>
                <span>
                  {isToday ? `היום · ${dayName}` : dayName}
                  {holiday && <span className="ms-holiday"> · {holiday.hebrew}</span>}
                </span>
                <span>{vacation ? "בחופש" : "יום חופשי"}</span>
              </li>
            );
          }

          return dayShifts.map((s) => {
            const live = isToday && nowHHMM >= s.start_time && nowHHMM < s.end_time;
            const badge = badgeFor(s);
            return (
              <li key={s.id} className={`ms-day ms-shift ${isToday ? "ms-today" : ""} ${isPast ? "ms-past" : ""}`}>
                <div className="ms-shift-top">
                  <span className="ms-day-name">
                    {isToday ? `היום · ${dayName}` : dayName}
                    {holiday && <span className="ms-holiday"> · {holiday.hebrew}</span>}
                  </span>
                  {badge ? (
                    <span className={`ms-badge ms-badge-${badge.kind}`}>{badge.text}</span>
                  ) : live ? (
                    <span className="ms-badge ms-badge-live">עכשיו בעבודה</span>
                  ) : null}
                </div>
                <p className="ms-time">
                  <bdi dir="ltr">
                    {s.start_time}–{s.end_time}
                  </bdi>
                </p>
                <p className="ms-where">
                  {s.room}
                  {s.with.length > 0 && <> · עם {s.with.map(partnerLabel).join(", ")}</>}
                </p>
              </li>
            );
          });
        })}
      </ol>

      {data.shifts.length > 0 && (
        <button type="button" className="ms-calendar" onClick={() => downloadCalendar(data)}>
          הוספת המשמרות ליומן בטלפון
        </button>
      )}
    </main>
  );
}
