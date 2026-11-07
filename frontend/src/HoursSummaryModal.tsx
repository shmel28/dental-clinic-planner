import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "./api";

type StaffRef = { id: number; name: string; role: string };
type Allocation = { id: number; date: string; start_time: string; end_time: string; staff_members: StaffRef[] };

type Props = {
  anchorDate: string; // YYYY-MM-DD, the date currently shown in the schedule
  language: "he" | "en";
  formatRole: (role: string) => string;
  onClose: () => void;
};

type Row = { id: number; name: string; role: string; shifts: number; minutes: number; days: Set<string> };

// Placeholder used for open slots; it isn't a real person
const PLACEHOLDER_NAME = "חסר איש צוות";
// The server deletes allocations older than this on startup
const RETENTION_DAYS = 60;

const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const formatHours = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}:${String(m).padStart(2, "0")}` : `${h}`;
};
const shortDate = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

/** Range for the period containing `anchor`: a Sunday–Saturday week or a calendar month. */
function getRange(anchor: string, period: "week" | "month") {
  const d = parse(anchor);
  if (period === "week") {
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: toISO(start), end: toISO(end) };
  }
  return { start: toISO(new Date(d.getFullYear(), d.getMonth(), 1)), end: toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
}

export default function HoursSummaryModal({ anchorDate, language, formatRole, onClose }: Props) {
  const L = (he: string, en: string) => (language === "he" ? he : en);
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(anchorDate);
  const [allocations, setAllocations] = useState<Allocation[] | null>(null);
  const [error, setError] = useState("");

  const range = getRange(anchor, period);

  useEffect(() => {
    let alive = true;
    setAllocations(null);
    setError("");
    apiFetch(`/allocations?start_date=${range.start}&end_date=${range.end}`)
      .then((r) => r.json())
      .then((data) => alive && setAllocations(data))
      .catch((e) => alive && setError(e.message || "Error"));
    return () => {
      alive = false;
    };
  }, [range.start, range.end]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows = useMemo(() => {
    const byStaff = new Map<number, Row>();
    for (const a of allocations ?? []) {
      const minutes = Math.max(0, toMinutes(a.end_time) - toMinutes(a.start_time));
      for (const s of a.staff_members) {
        if (s.name === PLACEHOLDER_NAME) continue;
        const row = byStaff.get(s.id) ?? { id: s.id, name: s.name, role: s.role, shifts: 0, minutes: 0, days: new Set<string>() };
        row.shifts += 1;
        row.minutes += minutes;
        row.days.add(a.date);
        byStaff.set(s.id, row);
      }
    }
    return [...byStaff.values()].sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name, "he"));
  }, [allocations]);

  const totalMinutes = rows.reduce((sum, r) => sum + r.minutes, 0);

  const move = (direction: 1 | -1) => {
    const d = parse(anchor);
    if (period === "week") d.setDate(d.getDate() + 7 * direction);
    else d.setMonth(d.getMonth() + direction, 1);
    setAnchor(toISO(d));
  };

  const periodLabel =
    period === "week"
      ? `${shortDate(range.start)}–${shortDate(range.end)}`
      : parse(range.start).toLocaleDateString(language === "he" ? "he-IL" : "en-US", { month: "long", year: "numeric" });

  const retentionCutoff = new Date();
  retentionCutoff.setDate(retentionCutoff.getDate() - RETENTION_DAYS);
  const partlyDeleted = parse(range.start) < retentionCutoff;

  const exportCsv = () => {
    const header = [L("שם", "Name"), L("תפקיד", "Role"), L("משמרות", "Shifts"), L("ימי עבודה", "Days"), L("שעות", "Hours")];
    const lines = rows.map((r) => [r.name, formatRole(r.role), r.shifts, r.days.size, (r.minutes / 60).toFixed(2)]);
    const csv = [header, ...lines].map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    // BOM so Excel reads Hebrew correctly
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hours_${range.start}_${range.end}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content hours-summary" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">⏱️ {L("סיכום שעות", "Hours summary")}</h3>
          <button type="button" className="btn-close" onClick={onClose} aria-label={L("סגור", "Close")}>×</button>
        </div>

        <div className="hours-toolbar">
          <div className="hours-period-toggle" role="tablist">
            <button type="button" className={period === "week" ? "active" : ""} onClick={() => setPeriod("week")}>
              {L("שבוע", "Week")}
            </button>
            <button type="button" className={period === "month" ? "active" : ""} onClick={() => setPeriod("month")}>
              {L("חודש", "Month")}
            </button>
          </div>
          <div className="hours-nav">
            {/* In RTL the "previous" arrow sits on the right */}
            <button type="button" className="btn-secondary" onClick={() => move(-1)} aria-label={L("הקודם", "Previous")}>
              {language === "he" ? "→" : "←"}
            </button>
            <span className="hours-period-label">{periodLabel}</span>
            <button type="button" className="btn-secondary" onClick={() => move(1)} aria-label={L("הבא", "Next")}>
              {language === "he" ? "←" : "→"}
            </button>
          </div>
        </div>

        {partlyDeleted && (
          <p className="hours-note">
            {L(
              `שימו לב: המערכת מוחקת שיבוצים ישנים מ-${RETENTION_DAYS} יום, אז הנתונים לתקופה הזו עלולים להיות חלקיים.`,
              `Note: assignments older than ${RETENTION_DAYS} days are deleted automatically, so this period may be incomplete.`
            )}
          </p>
        )}

        <div className="hours-table-wrap">
          {error ? (
            <p className="hours-empty">{error}</p>
          ) : allocations === null ? (
            <p className="hours-empty">{L("טוען…", "Loading…")}</p>
          ) : rows.length === 0 ? (
            <p className="hours-empty">{L("אין משמרות בתקופה הזו.", "No shifts in this period.")}</p>
          ) : (
            <table className="hours-table">
              <thead>
                <tr>
                  <th>{L("שם", "Name")}</th>
                  <th>{L("תפקיד", "Role")}</th>
                  <th className="num">{L("משמרות", "Shifts")}</th>
                  <th className="num">{L("ימי עבודה", "Days")}</th>
                  <th className="num">{L("שעות", "Hours")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td className="muted">{formatRole(r.role)}</td>
                    <td className="num">{r.shifts}</td>
                    <td className="num">{r.days.size}</td>
                    <td className="num strong">{formatHours(r.minutes)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>{L("סה״כ", "Total")}</td>
                  <td className="num strong">{formatHours(totalMinutes)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={exportCsv} disabled={!rows.length}>
            {L("ייצוא לאקסל", "Export to Excel")}
          </button>
          <button type="button" className="btn-primary" onClick={onClose}>
            {L("סגור", "Close")}
          </button>
        </div>
      </div>
    </div>
  );
}
