interface AssignmentForOnTime {
  order_id: string | null;
  custom_order_id: string | null;
  status: string;
  delivered_at: string | null;
}

interface OrderForOnTime {
  id: string;
  scheduled_date: string;
}

interface CustomOrderForOnTime {
  id: string;
  delivery_date: string;
}

export function calculateOnTimeDeliveryDays(
  assignments: AssignmentForOnTime[],
  orders: OrderForOnTime[],
  customOrders: CustomOrderForOnTime[],
  cutoffHHMM: string | null,
): number {
  if (!cutoffHHMM) return 0;

  const orderDateMap = new Map<string, string>();
  orders.forEach((o) => orderDateMap.set(o.id, o.scheduled_date));

  const customOrderDateMap = new Map<string, string>();
  customOrders.forEach((o) => customOrderDateMap.set(o.id, o.delivery_date));

  const getDate = (a: AssignmentForOnTime): string | null => {
    if (a.order_id && orderDateMap.has(a.order_id)) return orderDateMap.get(a.order_id)!;
    if (a.custom_order_id && customOrderDateMap.has(a.custom_order_id)) return customOrderDateMap.get(a.custom_order_id)!;
    return null;
  };

  const isWithinCutoff = (deliveredAt: string | null): boolean => {
    if (!deliveredAt) return false;
    const istDate = new Date(new Date(deliveredAt).getTime() + 5.5 * 60 * 60 * 1000);
    const hhmm = `${String(istDate.getUTCHours()).padStart(2, '0')}:${String(istDate.getUTCMinutes()).padStart(2, '0')}`;
    return hhmm <= cutoffHHMM;
  };

  const byDate = new Map<string, { total: number; onTime: number }>();
  assignments.forEach((a) => {
    const date = getDate(a);
    if (!date) return;
    const entry = byDate.get(date) ?? { total: 0, onTime: 0 };
    entry.total += 1;
    if (a.status === 'delivered' && isWithinCutoff(a.delivered_at)) entry.onTime += 1;
    byDate.set(date, entry);
  });

  let qualifyingDays = 0;
  byDate.forEach((entry) => {
    if (entry.total > 0 && entry.total === entry.onTime) qualifyingDays += 1;
  });

  return qualifyingDays;
}
