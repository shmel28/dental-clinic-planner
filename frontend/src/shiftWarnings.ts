import type { StaffHours } from "./StaffHoursEditor";

/**
 * Warnings about how a treatment-room shift is staffed. They never block saving;
 * they only point out something that is usually a mistake.
 */

type Person = { id: number; name: string; role: string };
type Lang = (he: string, en: string) => string;

const PLACEHOLDER = "חסר איש צוות";

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

  for (const [from, to] of assistantGaps(assistants.map((a) => a.id), hours, start, end)) {
    out.push(L(`אין סייעת בין ${from} ל-${to}`, `No assistant between ${from} and ${to}`));
  }

  return out;
}
