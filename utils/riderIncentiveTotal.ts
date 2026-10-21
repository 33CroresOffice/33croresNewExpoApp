export interface RiderIncentiveDefinition {
  id: string;
  amount: number | string | null;
  type: string | null;
  evaluation_basis: string | null;
  bonus_category: string | null;
}

export interface RiderIncentiveEvaluation {
  incentive_id: string;
  status: string;
  earned_amount: number | string | null;
}

export interface RiderIncentiveCounts {
  absentDays: number;
  onTimeAttendanceDays: number;
  onTimeDeliveryDays: number;
}

export function calculateRiderIncentiveTotal(
  incentives: RiderIncentiveDefinition[],
  evaluations: RiderIncentiveEvaluation[],
  counts: RiderIncentiveCounts,
): number {
  const evaluationMap = new Map(
    evaluations.map((evaluation) => [evaluation.incentive_id, evaluation]),
  );

  return incentives.reduce((total, incentive) => {
    const amount = Number(incentive.amount ?? 0);
    const basis = incentive.evaluation_basis ?? incentive.type;
    const evaluation = evaluationMap.get(incentive.id);
    const noLeaveDisqualified = incentive.bonus_category === 'no_leave' && counts.absentDays > 0;
    let eligibleCount = 0;

    if (incentive.bonus_category === 'on_time_attendance') {
      eligibleCount = counts.onTimeAttendanceDays;
    } else if (incentive.bonus_category === 'on_time_delivery') {
      eligibleCount = counts.onTimeDeliveryDays;
    } else if (!noLeaveDisqualified && evaluation?.status === 'passed' && amount > 0) {
      eligibleCount = basis === 'per_day'
        ? Math.round(Number(evaluation.earned_amount ?? 0) / amount)
        : 1;
    }

    return total + (eligibleCount > 0 && amount > 0 ? eligibleCount * amount : 0);
  }, 0);
}
