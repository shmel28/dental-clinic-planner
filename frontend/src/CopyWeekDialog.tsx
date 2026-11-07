import { useEffect, useState } from "react";
import { apiFetch } from "./api";

type Props = {
  sourceWeekStart: string; // Sunday, YYYY-MM-DD
  language: "he" | "en";
  onClose: () => void;
  onCopied: (targetWeekStart: string) => void;
  showToast: (message: string, type?: "success" | "error" | "info" | "warning") => void;
};

const WEEKS_AHEAD = 8;

const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const addDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return toISO(new Date(y, m - 1, d + days));
};

const shortDate = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

/** Lets the admin copy the current week to any of the coming weeks. */
export default function CopyWeekDialog({ sourceWeekStart, language, onClose, onCopied, showToast }: Props) {
  const L = (he: string, en: string) => (language === "he" ? he : en);
  const [targetStart, setTargetStart] = useState(addDays(sourceWeekStart, 7));
  const [existingCount, setExistingCount] = useState<number | null>(null);
  const [copying, setCopying] = useState(false);

  // Count what's already in the target week, so the admin knows what will be replaced
  useEffect(() => {
    let alive = true;
    setExistingCount(null);
    apiFetch(`/allocations?start_date=${targetStart}&end_date=${addDays(targetStart, 6)}`)
      .then((r) => r.json())
      .then((data) => alive && setExistingCount(Array.isArray(data) ? data.length : 0))
      .catch(() => alive && setExistingCount(0));
    return () => {
      alive = false;
    };
  }, [targetStart]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !copying) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [copying, onClose]);

  const weeks = Array.from({ length: WEEKS_AHEAD }, (_, i) => addDays(sourceWeekStart, 7 * (i + 1)));

  const weekLabel = (start: string, i: number) => {
    const range = `${shortDate(start)}–${shortDate(addDays(start, 5))}`;
    if (i === 0) return L(`שבוע הבא (${range})`, `Next week (${range})`);
    return L(`בעוד ${i + 1} שבועות (${range})`, `In ${i + 1} weeks (${range})`);
  };

  const copy = async () => {
    setCopying(true);
    try {
      await apiFetch(`/allocations/copy-week?source_start_date=${sourceWeekStart}&target_start_date=${targetStart}`, {
        method: "POST",
      });
      showToast(L("השבוע הועתק בהצלחה", "Week copied successfully"), "success");
      onCopied(targetStart);
    } catch (err: any) {
      showToast(err.message || L("ההעתקה נכשלה", "Failed to copy week"), "error");
      setCopying(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => !copying && onClose()}>
      <div className="modal-content confirm-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{L("העתקת שבוע", "Copy week")}</h3>
        <p className="confirm-dialog-message">
          {L(
            `להעתיק את כל השיבוצים של השבוע ${shortDate(sourceWeekStart)}–${shortDate(addDays(sourceWeekStart, 5))} אל:`,
            `Copy all assignments from ${shortDate(sourceWeekStart)}–${shortDate(addDays(sourceWeekStart, 5))} to:`
          )}
        </p>

        <div className="copy-week-options" role="radiogroup">
          {weeks.map((start, i) => (
            <label key={start} className={`copy-week-option ${targetStart === start ? "selected" : ""}`}>
              <input
                type="radio"
                name="copy-week-target"
                checked={targetStart === start}
                onChange={() => setTargetStart(start)}
              />
              {weekLabel(start, i)}
            </label>
          ))}
        </div>

        <p className={`copy-week-note ${existingCount ? "warning" : ""}`}>
          {existingCount === null
            ? L("בודק את שבוע היעד…", "Checking the target week…")
            : existingCount > 0
              ? L(
                  `בשבוע היעד יש כבר ${existingCount} שיבוצים. הם יימחקו ויוחלפו.`,
                  `The target week already has ${existingCount} assignments. They will be replaced.`
                )
              : L("שבוע היעד ריק.", "The target week is empty.")}
        </p>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={copying}>
            {L("ביטול", "Cancel")}
          </button>
          <button
            type="button"
            className={existingCount ? "btn-danger" : "btn-primary"}
            onClick={copy}
            disabled={copying || existingCount === null}
          >
            {copying ? L("מעתיק…", "Copying…") : existingCount ? L("החלף והעתק", "Replace and copy") : L("העתק", "Copy")}
          </button>
        </div>
      </div>
    </div>
  );
}
