export interface MonthlyAttendanceRecord {
  date: string;
  status: string;
}

export function calculateMonthlyAttendanceCounts(
  records: MonthlyAttendanceRecord[],
  month: string,
  today: string,
): { present: number; absent: number } {
  const presentDates = new Set(
    records
      .filter((record) => record.status === 'present')
      .map((record) => record.date),
  );

  const present = presentDates.size;
  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const elapsedDays = today.slice(0, 7) === month
    ? Math.min(Number(today.slice(8, 10)) - 1, daysInMonth)
    : today < `${month}-01`
      ? 0
      : daysInMonth;

  let absent = 0;
  for (let day = 1; day <= elapsedDays; day += 1) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    if (!presentDates.has(date)) absent += 1;
  }

  return { present, absent };
}
