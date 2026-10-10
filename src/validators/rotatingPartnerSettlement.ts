import { isRotatingPartnerStatusTreatment } from './rotatingPartnerTallyPolicy';
import { canonicalJson } from '@Tools/canonicalJson';

// constants and types
import type { RotatingPartnerSettlement, RotatingPartnerSettlementOutcome } from '@Types/rotatingPartnerSettlement';
import { completedMatchUpStatuses, COMPLETED } from '@Constants/matchUpStatusConstants';
import type { DrawDefinition, MatchUp } from '@Types/tournamentTypes';

const terminal = new Set<string>(completedMatchUpStatuses.filter((status) => status !== COMPLETED));
const keys = new Set([
  'version',
  'requestId',
  'matchUpId',
  'roundNumber',
  'expectedOutcome',
  'treatment',
  'reason',
  'recordedBy',
  'recordedAt',
  'supersedesRequestId',
]);

export function settlementOutcome(matchUp: MatchUp): RotatingPartnerSettlementOutcome {
  return {
    matchUpStatus: matchUp.matchUpStatus!,
    ...(matchUp.winningSide !== undefined ? { winningSide: matchUp.winningSide } : {}),
    ...(matchUp.score !== undefined ? { score: structuredClone(matchUp.score) } : {}),
  };
}

export function isRotatingPartnerSettlement(value: unknown): value is RotatingPartnerSettlement {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as RotatingPartnerSettlement;
  if (Object.keys(value).some((key) => !keys.has(key))) return false;
  if (record.version !== 1 || !Number.isSafeInteger(record.roundNumber) || record.roundNumber < 1) return false;
  if (![record.requestId, record.matchUpId, record.reason, record.recordedBy].every(nonEmpty)) return false;
  if (record.supersedesRequestId !== undefined && !nonEmpty(record.supersedesRequestId)) return false;
  if (typeof record.recordedAt !== 'string' || !Number.isFinite(Date.parse(record.recordedAt))) return false;
  if (new Date(record.recordedAt).toISOString() !== record.recordedAt) return false;
  if (!isRotatingPartnerStatusTreatment(record.treatment)) return false;
  const outcome = record.expectedOutcome;
  if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) return false;
  if (Object.keys(outcome).some((key) => !new Set(['matchUpStatus', 'winningSide', 'score']).has(key))) return false;
  if (!terminal.has(outcome.matchUpStatus)) return false;
  if (outcome.winningSide !== undefined && outcome.winningSide !== 1 && outcome.winningSide !== 2) return false;
  return (
    outcome.score === undefined ||
    (!!outcome.score && typeof outcome.score === 'object' && !Array.isArray(outcome.score))
  );
}

export function validRotatingPartnerSettlementHistory(draw: DrawDefinition): boolean {
  const records = draw.competitionSettlements ?? [];
  if (!Array.isArray(records)) return false;
  const ids = new Set<string>();
  const latest = new Map<string, string>();
  for (const record of records) {
    if (!isRotatingPartnerSettlement(record) || ids.has(record.requestId)) return false;
    const round = draw.competitionRounds?.find((candidate) => candidate.roundNumber === record.roundNumber);
    if (!round || !new Set(round.matchUpIds).has(record.matchUpId)) return false;
    if (record.supersedesRequestId !== latest.get(record.matchUpId)) return false;
    ids.add(record.requestId);
    latest.set(record.matchUpId, record.requestId);
  }
  return true;
}

export function settlementMatches(record: RotatingPartnerSettlement, matchUp: MatchUp): boolean {
  return canonicalJson(record.expectedOutcome) === canonicalJson(settlementOutcome(matchUp));
}

function nonEmpty(value: unknown): boolean {
  return typeof value === 'string' && !!value.trim();
}
