import { liveNoticeEffects, nextUpdatedAt } from '@Mutate/notifications/drawNotifications';
import { addNotice } from '@Global/state/globalState';
import { planFieldWrite } from '@Mutate/planCommit';

/** Keep the ordinary draw/match notice envelopes and once-per-engine-call stamp rules. */
export function replacementEffects() {
  const writes: (() => void)[] = [];
  type Notice = Parameters<typeof addNotice>[0];
  const notices: (Notice | (() => Notice))[] = [];
  const ledger = liveNoticeEffects.getCapturedStamps();
  const stamps = new Map<object, string>();
  const effects = {
    ...liveNoticeEffects,
    addNotice: (notice: Parameters<typeof addNotice>[0]) => {
      notices.push(notice);
    },
    planStamp(entity: { updatedAt?: string | Date }) {
      if (ledger && (ledger.has(entity) || stamps.has(entity))) return;
      const previous = stamps.get(entity) ?? entity.updatedAt;
      const value = nextUpdatedAt(previous, liveNoticeEffects.readClock({ kind: 'updatedAt', target: entity }));
      stamps.set(entity, value);
      writes.push(planFieldWrite(entity, 'updatedAt', value));
      if (ledger)
        writes.push(() => {
          ledger.add(entity);
        });
    },
  };
  return { writes, notices, effects };
}
