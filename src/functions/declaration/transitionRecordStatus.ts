// Generic finite-state-machine transition primitive for declaration-style records.
// Extracted from the officiating engine's three near-identical transition functions
// (assignment / certification / evaluation) so any population (officials, players)
// can drive a lifecycle state machine over a keyed sub-collection of a record.
//
// Domain error identity is preserved by INJECTION: the consumer supplies its own
// `missingRecord` / `notFound` / `invalidTransition` error constants, and this
// primitive attaches the `{ fromStatus, toStatus, validTargets }` context so the
// emitted result is byte-for-byte identical to the original per-domain function.

// constants and types
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

type TransitionEntity = {
  status: string;
  statusHistory?: Array<{
    fromStatus: string;
    toStatus: string;
    transitionedAt: string;
    transitionedBy?: string;
    reason?: string;
  }>;
  [key: string]: any;
};

export type TransitionRecordStatusArgs = {
  record: any;
  collectionKey: string;
  idKey: string;
  entityId?: string;
  toStatus?: string;
  transitionedBy?: string;
  reason?: string;
  machineDef: Record<string, string[]>;
  resultKey: string;
  errors: { missingRecord: any; notFound: any; invalidTransition: any };
  preTransition?: (args: {
    record: any;
    entity: TransitionEntity;
    toStatus: string;
  }) => { error: any; context?: any } | undefined;
  touch?: (record: any, timestamp: string) => void;
};

export function transitionRecordStatus({
  record,
  collectionKey,
  idKey,
  entityId,
  toStatus,
  transitionedBy,
  reason,
  machineDef,
  resultKey,
  errors,
  preTransition,
  touch,
}: TransitionRecordStatusArgs): { error?: any; success?: boolean; [key: string]: any } {
  if (!record) return { error: errors.missingRecord };
  if (!entityId) return { error: INVALID_VALUES, context: { message: `Missing ${idKey}` } };
  if (!toStatus) return { error: INVALID_VALUES, context: { message: 'Missing toStatus' } };

  const entity: TransitionEntity | undefined = record[collectionKey]?.find((item: any) => item[idKey] === entityId);
  if (!entity) return { error: errors.notFound, context: { [idKey]: entityId } };

  const validTargets = machineDef[entity.status];
  if (!validTargets?.includes(toStatus)) {
    return { error: errors.invalidTransition, context: { fromStatus: entity.status, toStatus, validTargets } };
  }

  if (preTransition) {
    const pre = preTransition({ record, entity, toStatus });
    if (pre?.error) return pre;
  }

  const now = new Date().toISOString();
  entity.statusHistory ??= [];
  entity.statusHistory.push({ fromStatus: entity.status, toStatus, transitionedAt: now, transitionedBy, reason });
  entity.status = toStatus;

  if (touch) touch(record, now);
  else record.updatedAt = now;

  return { ...SUCCESS, [resultKey]: entity };
}
