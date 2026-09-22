import { todayISTString } from './attendanceCheckIn';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function getCurrentMonthIST(): string {
  return todayISTString().slice(0, 7);
}

export function getMonthRangeIST(month?: string): {
  monthStart: string;
  nextMonth: string;
  monthStartISO: string;
  nextMonthISO: string;
} {
  const m = month ?? getCurrentMonthIST();
  const [year, mon] = m.split('-').map(Number);
  const monthStart = `${m}-01`;
  const nextMonthDate = new Date(Date.UTC(year, mon, 1));
  const nextMonth = nextMonthDate.toISOString().slice(0, 10);
  const monthStartISO = new Date(`${monthStart}T00:00:00+05:30`).toISOString();
  const nextMonthISO = new Date(`${nextMonth}T00:00:00+05:30`).toISOString();
  return { monthStart, nextMonth, monthStartISO, nextMonthISO };
}

export function isOnTimeIST(isoTimestamp: string | null, deadlineHHMM: string | null): boolean {
  if (!isoTimestamp || !deadlineHHMM) return true;
  const istDate = new Date(new Date(isoTimestamp).getTime() + IST_OFFSET_MS);
  const istMinutes = istDate.getUTCHours() * 60 + istDate.getUTCMinutes();
  const [hh, mm] = deadlineHHMM.split(':').map(Number);
  return istMinutes <= hh * 60 + mm;
}
