import { useState } from "react";
import type { ComponentType } from "react";

/** One person's own hours inside a shift (everyone else works the whole shift). */
export interface StaffHours {
  staff_id: number;
  start_time: string; // HH:MM
  end_time: string; // HH:MM
}

type ShiftLike = { start_time: string; end_time: string; staff_hours?: StaffHours[] };
type Lang = (he: string, en: string) => string;

/** The hours a person actually works in a shift. */
export const personHours = (shift: ShiftLike, staffId: number): [string, string] => {
  const h = shift.staff_hours?.find((x) => x.staff_id === staffId);
  return h ? [h.start_time, h.end_time] : [shift.start_time, shift.end_time];
};

/** "עד 11:30" / "מ-11:30" / "09:00–11:30", or "" for the whole shift. */
export const hoursLabel = (start: string, end: string, shiftStart: string, shiftEnd: string, L: Lang): string => {
  if (start === shiftStart && end === shiftEnd) return "";
  if (start === shiftStart) return L(`עד ${end}`, `until ${end}`);
  if (end === shiftEnd) return L(`מ-${start}`, `from ${start}`);
  return `${start}–${end}`;
};

/** Hours inside the shift? (used to flag tags after the shift's times change) */
const fitsShift = (h: StaffHours, shiftStart: string, shiftEnd: string) =>
  h.start_time >= shiftStart && h.end_time <= shiftEnd && h.start_time < h.end_time;

type TagProps = {
  hours: StaffHours;
  shiftStart: string;
  shiftEnd: string;
  L: Lang;
  onEdit: () => void;
  onRemove: () => void;
};

/** Small chip next to a name: "עד 11:30 ✕". Click the text to edit, ✕ to go back to the whole shift. */
export function HoursTag({ hours, shiftStart, shiftEnd, L, onEdit, onRemove }: TagProps) {
  const ok = fitsShift(hours, shiftStart, shiftEnd);
  const label = hoursLabel(hours.start_time, hours.end_time, shiftStart, shiftEnd, L) || `${hours.start_time}–${hours.end_time}`;
  return (
    <span className={`hours-tag${ok ? "" : " hours-tag-bad"}`} onClick={(e) => e.preventDefault()}>
      <button
        type="button"
        className="hours-tag-text"
        onClick={onEdit}
        title={ok ? L("עריכת השעות", "Edit hours") : L("השעות מחוץ לשעות המשמרת", "Hours are outside the shift")}
      >
        <bdi>{label}</bdi>
      </button>
      <button type="button" className="hours-tag-remove" onClick={onRemove} aria-label={L("כל המשמרת", "Whole shift")}>
        ✕
      </button>
    </span>
  );
}

export type HoursDraft = { staffId: number; start: string; end: string } | null;

type EditorProps = {
  /** People currently selected in the shift */
  people: { id: number; name: string; role?: string }[];
  shiftStart: string;
  shiftEnd: string;
  value: StaffHours[];
  onChange: (next: StaffHours[]) => void;
  draft: HoursDraft;
  setDraft: (d: HoursDraft) => void;
  L: Lang;
  /** The same scroll-list time picker the shift's own start/end use */
  TimePicker: ComponentType<{ value: string; onChange: (v: string) => void; isEnd?: boolean }>;
};

/** One quiet "+ שעות שונות" line under the staff list; opens a single row to set someone's hours. */
export function StaffHoursEditor({ people, shiftStart, shiftEnd, value, onChange, draft, setDraft, L, TimePicker }: EditorProps) {
  const [error, setError] = useState("");

  // Only useful when at least two people share the shift
  if (people.length < 2 && !draft) return null;

  if (!draft) {
    return (
      <button
        type="button"
        className="hours-add-link"
        onClick={() => {
          setError("");
          // Usually it's an assistant who comes or goes mid-shift, so start with someone who isn't the doctor
          const free = people.filter((p) => !value.some((h) => h.staff_id === p.id));
          const pick = free.find((p) => p.role !== "doctor") ?? free[0] ?? people[0];
          setDraft({ staffId: pick.id, start: shiftStart, end: shiftEnd });
        }}
      >
        + {L("שעות שונות למישהו מהצוות", "Different hours for someone")}
      </button>
    );
  }

  const save = () => {
    if (draft.start >= draft.end) {
      setError(L("שעת הסיום חייבת להיות אחרי שעת ההתחלה", "End must be after start"));
      return;
    }
    if (draft.start < shiftStart || draft.end > shiftEnd) {
      setError(L(`השעות חייבות להיות בתוך המשמרת (${shiftStart}–${shiftEnd})`, `Hours must be inside the shift (${shiftStart}–${shiftEnd})`));
      return;
    }
    const rest = value.filter((h) => h.staff_id !== draft.staffId);
    // The whole shift needs no entry
    const next =
      draft.start === shiftStart && draft.end === shiftEnd
        ? rest
        : [...rest, { staff_id: draft.staffId, start_time: draft.start, end_time: draft.end }];
    onChange(next);
    setDraft(null);
    setError("");
  };

  return (
    <div className="hours-editor">
      <div className="hours-editor-row">
        <select
          className="form-select hours-editor-person"
          value={draft.staffId}
          onChange={(e) => {
            const id = Number(e.target.value);
            const existing = value.find((h) => h.staff_id === id);
            setDraft({ staffId: id, start: existing?.start_time ?? shiftStart, end: existing?.end_time ?? shiftEnd });
          }}
        >
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="hours-editor-word">{L("מ-", "from")}</span>
        <div className="hours-editor-time" aria-label={L("משעה", "From")}>
          <TimePicker value={draft.start} onChange={(v) => setDraft({ ...draft, start: v })} />
        </div>
        <span className="hours-editor-word">{L("עד", "to")}</span>
        <div className="hours-editor-time" aria-label={L("עד שעה", "To")}>
          <TimePicker value={draft.end} onChange={(v) => setDraft({ ...draft, end: v })} isEnd />
        </div>
        <button type="button" className="hours-editor-ok" onClick={save} aria-label={L("שמירה", "Save")}>
          ✓
        </button>
        <button
          type="button"
          className="hours-editor-cancel"
          onClick={() => {
            setDraft(null);
            setError("");
          }}
          aria-label={L("ביטול", "Cancel")}
        >
          ✕
        </button>
      </div>
      {error && <div className="hours-editor-error">{error}</div>}
    </div>
  );
}
