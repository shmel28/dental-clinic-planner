import type { StaffHours } from "./StaffHoursEditor";

/**
 * Warnings about how a treatment-room shift is staffed. They never block saving;
 * they only point out something that is usually a mistake.
 */

type Person = { id: number; name: string; role: string };
type Lang = (he: string, en: string) => string;

const PLACEHOLDER = "חסר איש צוות";
/** Doctors who always work with two assistants */
const NEEDS_TWO_ASSISTANTS = ["ניר פורת"];

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const toTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Parts of [start, end] that no assistant covers, e.g. [["11:00", "11:30"]] */
export const assistantGaps = (assistantIds: number[], hours: StaffHours[], start: string, end: string): [string, string][] => {
  if (assistantIds.length === 0 || start >= end) return [];
  const spans = assistantIds
    .map((id) => {
      const h = hours.find((x) => x.staff_id === id);
      return [toMin(h?.start_time ?? start), toMin(h?.end_time ?? end)] as [number, number];
    })
    .sort((a, b) => a[0] - b[0]);

  const gaps: [string, string][] = [];
  let covered = toMin(start);
  for (const [s, e] of spans) {
    if (s > covered) gaps.push([toTime(covered), toTime(s)]);
    covered = Math.max(covered, e);
  }
  if (covered < toMin(end)) gaps.push([toTime(covered), end]);
  return gaps;
};

/** Parts of [start, end] covered by fewer than `need` assistants, e.g. [["11:00", "12:00"]] */
export const assistantShortfall = (assistantIds: number[], hours: StaffHours[], start: string, end: string, need: number): [string, string][] => {
  if (start >= end) return [];
  const spans = assistantIds.map((id) => {
    const h = hours.find((x) => x.staff_id === id);
    return [toMin(h?.start_time ?? start), toMin(h?.end_time ?? end)] as [number, number];
  });
  // Check each stretch between consecutive start/end points
  const points = [...new Set([toMin(start), toMin(end), ...spans.flat()])]
    .filter((p) => p >= toMin(start) && p <= toMin(end))
    .sort((a, b) => a - b);
  const short: [number, number][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i], points[i + 1]];
    const count = spans.filter(([s, e]) => s <= a && e >= b).length;
    if (count < need) {
      const last = short[short.length - 1];
      if (last && last[1] === a) last[1] = b;
      else short.push([a, b]);
    }
  }
  return short.map(([a, b]) => [toTime(a), toTime(b)]);
};

export function shiftWarnings(opts: {
  people: Person[];
  hours: StaffHours[];
  start: string;
  end: string;
  isReception: boolean;
  L: Lang;
}): string[] {
  const { people, hours, start, end, isReception, L } = opts;
  if (isReception) return [];

  const real = people.filter((p) => p.name !== PLACEHOLDER);
  const hasPlaceholder = real.length !== people.length;
  const doctors = real.filter((p) => p.role === "doctor");
  const assistants = real.filter((p) => p.role === "assistant");
  const out: string[] = [];

  if (doctors.length > 1) {
    const names = doctors.map((d) => d.name).join(", ");
    out.push(L(`יש במשמרת ${doctors.length} רופאים: ${names}`, `${doctors.length} doctors in this shift: ${names}`));
  }

  // A placeholder usually stands in for the missing doctor, so no warning then
  const hasLead = real.some((p) => p.role === "doctor" || p.role === "hygienist" || p.role === "ALL");
  if (assistants.length > 0 && !hasLead && !hasPlaceholder) {
    out.push(L("במשמרת יש רק סייעות, בלי רופא או שיננית", "Only assistants in this shift, no doctor or hygienist"));
  }

  for (const d of doctors.filter((x) => NEEDS_TWO_ASSISTANTS.includes(x.name))) {
    if (assistants.length < 2) {
      out.push(L(`${d.name} עובד עם 2 סייעות, במשמרת יש ${assistants.length === 0 ? "0" : "רק 1"}`, `${d.name} works with 2 assistants; this shift has ${assistants.length}`));
    } else {
      for (const [from, to] of assistantShortfall(assistants.map((a) => a.id), hours, start, end, 2)) {
        out.push(L(`ל${d.name} יש פחות מ-2 סייעות בין ${from} ל-${to}`, `${d.name} has fewer than 2 assistants between ${from} and ${to}`));
      }
    }
  }

  for (const [from, to] of assistantGaps(assistants.map((a) => a.id), hours, start, end)) {
    out.push(L(`אין סייעת בין ${from} ל-${to}`, `No assistant between ${from} and ${to}`));
  }

  return out;
}
