// constants and types
import type { RotatingPartnerStatusTreatment, RotatingPartnerTallyPolicy } from '@Types/rotatingPartnerTally';
import { completedMatchUpStatuses, COMPLETED } from '@Constants/matchUpStatusConstants';

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isRotatingPartnerStatusTreatment(value: unknown): value is RotatingPartnerStatusTreatment {
  if (!object(value)) return false;
  if (value.kind === 'CREDIT')
    return (
      Object.keys(value).length === 3 &&
      Number.isSafeInteger(value.winningPoints) &&
      Number(value.winningPoints) >= 0 &&
      Number.isSafeInteger(value.losingPoints) &&
      Number(value.losingPoints) >= 0
    );
  return Object.keys(value).length === 1 && new Set(['UNRESOLVED', 'EXCLUDE', 'PLAYED_POINTS']).has(String(value.kind));
}

/** Completed scores always contribute; live/pending statuses cannot be settled by policy. */
export function isRotatingPartnerTallyPolicy(value: unknown): value is RotatingPartnerTallyPolicy {
  if (!object(value)) return false;
  const keys = new Set(['version', 'decidingPoints', 'overtimePoints', 'statusTreatments']);
  if (Object.keys(value).length !== keys.size || Object.keys(value).some((key) => !keys.has(key))) return false;
  if (value.version !== 1 || !object(value.statusTreatments)) return false;
  const choices = new Set(['INCLUDE', 'EXCLUDE']);
  if (!choices.has(String(value.decidingPoints)) || !choices.has(String(value.overtimePoints))) return false;
  const terminal = new Set<string>(completedMatchUpStatuses.filter((status) => status !== COMPLETED));
  return Object.entries(value.statusTreatments).every(
    ([status, treatment]) => terminal.has(status) && isRotatingPartnerStatusTreatment(treatment),
  );
}
