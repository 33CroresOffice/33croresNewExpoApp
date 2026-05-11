import { addDays, startOfDay } from 'date-fns';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function nowInIST(): Date {
  const utcMs = Date.now();
  return new Date(utcMs + IST_OFFSET_MS);
}

export function isPastCutoffIST(): boolean {
  const ist = nowInIST();
  const hours = ist.getUTCHours();
  const minutes = ist.getUTCMinutes();
  return hours > 17 || (hours === 17 && minutes >= 0);
}

export function getMinAllowedDate(): Date {
  return startOfDay(addDays(new Date(), 1));
}

export function getMinSubscriptionStartDate(): Date {
  const daysToAdd = isPastCutoffIST() ? 2 : 1;
  return startOfDay(addDays(new Date(), daysToAdd));
}

export function toLocalDateStr(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function getCutoffNotice(minDate: Date): string {
  const d = minDate;
  const dd = String(d.getDate()).padStart(2, '0');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mm = months[d.getMonth()];
  const yyyy = d.getFullYear();
  return `Orders placed after 5 PM are delivered the next day from 10 AM onwards. Earliest delivery: ${dd} ${mm} ${yyyy}.`;
}

export function getSubscriptionCutoffNotice(): string {
  const minDate = getMinSubscriptionStartDate();
  const d = minDate;
  const dd = String(d.getDate()).padStart(2, '0');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mm = months[d.getMonth()];
  const yyyy = d.getFullYear();
  return `Actions after 5 PM take effect from the day after tomorrow. Earliest date: ${dd} ${mm} ${yyyy}.`;
}
