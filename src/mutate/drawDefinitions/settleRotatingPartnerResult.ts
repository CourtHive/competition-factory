import { getRotatingPartnerStandings } from '@Query/drawDefinition/getRotatingPartnerStandings';
import { checkMutationLock } from '@Assemblies/engines/parts/checkMutationLock';
import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { isRotatingPartnerDraw } from '@Validators/rotatingPartnerDraw';
import { matchUpsOf } from '@Acquire/structureMembers';
import { canonicalJson } from '@Tools/canonicalJson';
import {
  validRotatingPartnerSettlementHistory,
  isRotatingPartnerSettlement,
  settlementMatches,
} from '@Validators/rotatingPartnerSettlement';

// constants and types
import type { RotatingPartnerSettlement, RotatingPartnerSettlementOutcome } from '@Types/rotatingPartnerSettlement';
import type { RotatingPartnerStatusTreatment } from '@Types/rotatingPartnerTally';
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

export function settleRotatingPartnerResult(params: {
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  event?: Event;
  matchUpId: string;
  requestId: string;
  expectedOutcome: RotatingPartnerSettlementOutcome;
  treatment: RotatingPartnerStatusTreatment;
  reason: string;
  recordedBy: string;
  recordedAt: string;
  supersedesRequestId?: string;
  lockToken?: string;
}): ResultType & { settlement?: RotatingPartnerSettlement; existingSettlement?: boolean } {
  const { drawDefinition, tournamentRecord, event } = params;
  if (!isRotatingPartnerDraw(drawDefinition, event) || !tournamentRecord) return { error: INVALID_VALUES };
  const locked = checkMutationLock('settleRotatingPartnerResult', params, tournamentRecord);
  if (locked) return locked;
  if (!validRotatingPartnerSettlementHistory(drawDefinition))
    return { error: INVALID_VALUES, info: 'corrupt settlement history' };
  const round = drawDefinition.competitionRounds?.find((candidate) =>
    new Set(candidate.matchUpIds).has(params.matchUpId),
  );
  const structure = drawDefinition.structures?.find((candidate) => candidate.structureId === round?.structureId);
  const matchUp = matchUpsOf(structure)?.find((candidate) => candidate.matchUpId === params.matchUpId);
  if (!round || !matchUp) return { error: INVALID_VALUES, info: 'matchUp must belong to an applied rotating round' };
  const settlement: RotatingPartnerSettlement = {
    version: 1,
    requestId: params.requestId,
    matchUpId: params.matchUpId,
    roundNumber: round.roundNumber,
    expectedOutcome: params.expectedOutcome,
    treatment: params.treatment,
    reason: params.reason,
    recordedBy: params.recordedBy,
    recordedAt: params.recordedAt,
    ...(params.supersedesRequestId !== undefined ? { supersedesRequestId: params.supersedesRequestId } : {}),
  };
  if (!isRotatingPartnerSettlement(settlement))
    return { error: INVALID_VALUES, info: 'invalid settlement contract or terminal outcome' };
  const prior = drawDefinition.competitionSettlements?.find((record) => record.requestId === params.requestId);
  if (prior) {
    if (canonicalJson(prior) !== canonicalJson(settlement))
      return { error: INVALID_VALUES, info: 'requestId already used for a different settlement' };
    return { ...SUCCESS, settlement: structuredClone(prior), existingSettlement: true };
  }
  if (!settlementMatches(settlement, matchUp)) return { error: INVALID_VALUES, info: 'stale settlement outcome' };
  const latest = drawDefinition.competitionSettlements?.findLast((record) => record.matchUpId === params.matchUpId);
  if (params.supersedesRequestId !== latest?.requestId)
    return { error: INVALID_VALUES, info: 'latest settlement must be explicitly superseded' };
  const staged = structuredClone(drawDefinition);
  staged.competitionSettlements ??= [];
  staged.competitionSettlements.push(structuredClone(settlement));
  const preflight = getRotatingPartnerStandings({ tournamentRecord, drawDefinition: staged, event });
  if (preflight.error) return preflight;
  drawDefinition.competitionSettlements ??= [];
  drawDefinition.competitionSettlements.push(structuredClone(settlement));
  modifyDrawNotice({ drawDefinition, tournamentId: tournamentRecord.tournamentId, eventId: event?.eventId });
  return { ...SUCCESS, settlement: structuredClone(settlement) };
}
