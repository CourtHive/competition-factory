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
  if (!isSettlementInstant(record.recordedAt)) return false;
  if (!isRotatingPartnerStatusTreatment(record.treatment)) return false;
  const outcome = record.expectedOutcome;
  if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) return false;
  if (Object.keys(outcome).some((key) => !new Set(['matchUpStatus', 'winningSide', 'score']).has(key))) return false;
  if (!terminal.has(outcome.matchUpStatus)) return false;
  if (outcome.winningSide !== undefined && outcome.winningSide !== 1 && outcome.winningSide !== 2) return false;
  if (outcome.score === undefined) return true;
  if (!outcome.score || typeof outcome.score !== 'object' || Array.isArray(outcome.score)) return false;
  return (
    outcome.score.sets === undefined ||
    (Array.isArray(outcome.score.sets) &&
      outcome.score.sets.every((set) => !!set && typeof set === 'object' && !Array.isArray(set)))
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
  return (
    canonicalJson(sportingOutcome(record.expectedOutcome)) ===
    canonicalJson(sportingOutcome(settlementOutcome(matchUp)))
  );
}

function nonEmpty(value: unknown): boolean {
  return typeof value === 'string' && !!value.trim();
}

/** Presentation strings do not determine whether an approved sporting result changed. */
export function sportingOutcome(outcome: RotatingPartnerSettlementOutcome) {
  return {
    matchUpStatus: outcome.matchUpStatus,
    winningSide: outcome.winningSide,
    sets: (outcome.score?.sets ?? []).map((set) => ({
      setNumber: set.setNumber,
      side1Score: set.side1Score,
      side2Score: set.side2Score,
      side1TiebreakScore: set.side1TiebreakScore,
      side2TiebreakScore: set.side2TiebreakScore,
      side1PointScore: set.side1PointScore,
      side2PointScore: set.side2PointScore,
    })),
  };
}

/** Preserve the supplied offset and precision; validation never normalizes the instant through Date. */
function isSettlementInstant(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const match =
    /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(
      value,
    );
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}
