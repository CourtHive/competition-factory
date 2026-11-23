import { definedAttributes } from '@Tools/definedAttributes';
import { timeStringMinutes } from '@Tools/dateTime';

export function analyzeScheduleOverlap(a, b) {
  const startA = timeStringMinutes(a.scheduleTime);
  const endA = timeStringMinutes(a.timeAfterRecovery);
  const startB = timeStringMinutes(b.scheduleTime);
  const endB = timeStringMinutes(b.timeAfterRecovery);

  const startOrEndEquivalence = startA === startB || endA === endB;
  const startAisContained = startA > startB && startA < endB;
  const startBisContained = startB > startA && startB < endA;
  const endAisContained = endA > startB && endA < endB;
  const endBisContained = endB > startA && endB < endA;

  const hasOverlap =
    startOrEndEquivalence || startAisContained || endAisContained || startBisContained || endBisContained;

  return definedAttributes(
    {
      hasOverlap,
      startAisContained,
      endAisContained,
      startBisContained,
      endBisContained,
    },
    true,
  );
}
