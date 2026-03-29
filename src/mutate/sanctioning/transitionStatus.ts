import { validateStatusTransition } from '@Validators/sanctioning/validateStatusTransition';

// Constants
import { MISSING_SANCTIONING_RECORD, INVALID_STATUS_TRANSITION } from '@Constants/sanctioningConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type {
  SanctioningRecord,
  SanctioningStatus,
  SanctioningPolicy,
  StatusTransition,
  TransitionGuard,
} from '@Types/sanctioningTypes';

type TransitionStatusArgs = {
  sanctioningRecord: SanctioningRecord;
  toStatus: SanctioningStatus;
  sanctioningPolicy?: SanctioningPolicy;
  transitionedBy?: string;
  reason?: string;
};

export function transitionStatus({
  sanctioningRecord,
  toStatus,
  sanctioningPolicy,
  transitionedBy,
  reason,
}: TransitionStatusArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };

  const validation = validateStatusTransition({ fromStatus: sanctioningRecord.status, toStatus });
  if (validation.error) return validation;

  // Evaluate policy transition guards
  const policy = sanctioningPolicy ?? sanctioningRecord.policySnapshot;
  if (policy?.transitionGuards?.length) {
    const guardResult = evaluateGuards({
      sanctioningRecord,
      guards: policy.transitionGuards,
      from: sanctioningRecord.status,
      to: toStatus,
    });
    if (guardResult.error) return guardResult;
  }

  const now = new Date().toISOString();

  const transition: StatusTransition = {
    fromStatus: sanctioningRecord.status,
    toStatus,
    transitionedAt: now,
    transitionedBy,
    reason,
  };

  sanctioningRecord.statusHistory ??= [];
  sanctioningRecord.statusHistory.push(transition);
  sanctioningRecord.status = toStatus;
  sanctioningRecord.updatedAt = now;
  sanctioningRecord.version += 1;

  return { ...SUCCESS };
}

function evaluateGuards({
  sanctioningRecord,
  guards,
  from,
  to,
}: {
  sanctioningRecord: SanctioningRecord;
  guards: TransitionGuard[];
  from: SanctioningStatus;
  to: SanctioningStatus;
}) {
  const applicable = guards.filter((g) => g.from === from && g.to === to);

  // Filter by tier if specified
  const tierFiltered = applicable.filter(
    (g) => !g.tiers?.length || g.tiers.includes(sanctioningRecord.sanctioningLevel ?? ''),
  );

  for (const guard of tierFiltered) {
    const passed = checkGuard(sanctioningRecord, guard);
    if (!passed) {
      return {
        error: INVALID_STATUS_TRANSITION,
        context: {
          guard: guard.guard,
          message: guard.message ?? `Transition guard failed: ${guard.guard}`,
        },
      };
    }
  }

  return { ...SUCCESS };
}

function checkGuard(record: SanctioningRecord, guard: TransitionGuard): boolean {
  switch (guard.guard) {
    case 'ENDORSEMENT_REQUIRED': {
      const endorsements = record.endorsements ?? (record.endorsement ? [record.endorsement] : []);
      return endorsements.some((e) => e.status === 'ENDORSED' || e.status === 'NOT_REQUIRED');
    }
    case 'PROPOSAL_VALID':
      // A full validation would require the policy — here we just check completeness basics
      return !!(
        record.proposal?.tournamentName &&
        record.proposal?.proposedStartDate &&
        record.proposal?.events?.length
      );
    case 'ALL_CONDITIONS_MET':
      return record.conditions?.every((c) => c.met) ?? true;
    case 'COMPLIANCE_COMPLETE': {
      const required = record.compliance?.items?.filter((i) => i.required) ?? [];
      return required.every((i) => i.status === 'VERIFIED' || i.status === 'WAIVED');
    }
    case 'CUSTOM':
      if (!guard.customGuardField) return true;
      return !!getNestedValue(record, guard.customGuardField);
    default:
      return true;
  }
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}
