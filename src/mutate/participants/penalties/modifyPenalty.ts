import { modifyParticipantsNotice } from '@Mutate/notifications/participantNotifications';
import { normalizePenaltyType } from '@Query/participants/normalizePenaltyType';
import { planFieldWrite } from '@Mutate/planCommit';
import { requireParams } from '@Helpers/parameters/requireParams';

import { TOURNAMENT_RECORD, PENALTY_ID } from '@Constants/attributeConstants';
import { Participant, Penalty, Tournament } from '@Types/tournamentTypes';
import penaltyTemplate from '@Helpers/participants/penaltyTemplate';
import type { ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  PENALTY_NOT_FOUND,
  NO_VALID_ATTRIBUTES,
  INVALID_VALUES,
  MISSING_TOURNAMENT_RECORDS,
} from '@Constants/errorConditionConstants';

export function modifyPenalty(params): ResultType & { penalty?: Penalty; modifications?: Partial<Penalty> } {
  const { tournamentRecords } = params;
  if (typeof tournamentRecords !== 'object' || !Object.keys(tournamentRecords).length)
    return { error: MISSING_TOURNAMENT_RECORDS };

  // A successful cross-record search historically assigned penalty lists throughout
  // every visited record. Retain those assignments only if the search succeeds.
  const writes: (() => void)[] = [];
  for (const tournamentRecord of Object.values<Tournament>(tournamentRecords)) {
    const plan = planPenalty({ ...params, tournamentRecord }, writes);
    if ('error' in plan) {
      if (plan.error === PENALTY_NOT_FOUND) continue;
      return plan;
    }
    for (const write of writes) write();
    // Reassigning a document array can cast its entries into new subdocuments.
    const penalty = plan.committedPenalty();
    modifyParticipantsNotice(plan.payload);
    return { ...SUCCESS, penalty };
  }
  return { error: PENALTY_NOT_FOUND };
}

type ModifyPenaltyArgs = {
  tournamentRecord: Tournament;
  modifications: Partial<Penalty>;
  penaltyId: string;
};

function planPenalty({ tournamentRecord, modifications, penaltyId }: ModifyPenaltyArgs, writes: (() => void)[]) {
  const paramsCheck = requireParams({ tournamentRecord, penaltyId }, [TOURNAMENT_RECORD, PENALTY_ID]);
  if (paramsCheck.error) return { ...paramsCheck, error: paramsCheck.error };
  if (!modifications) return { error: INVALID_VALUES, modifications };

  const template = penaltyTemplate();
  const attributes = Object.keys(modifications).filter(
    (key): key is keyof typeof template => key !== 'penaltyId' && Object.hasOwn(template, key),
  );
  if (!attributes.length) return { error: NO_VALID_ATTRIBUTES };

  let committedPenalty: (() => Penalty | undefined) | undefined;
  const modified: Participant[] = [];
  for (const participant of tournamentRecord.participants ?? []) {
    let matched = false;
    const penalties = (participant.penalties ?? []).map((penalty, index) => {
      if (penalty.penaltyId === penaltyId) {
        committedPenalty ??= () => participant.penalties?.[index];
        matched = true;
        for (const key of attributes) {
          const value = modifications[key];
          writes.push(planFieldWrite(penalty, key, key === 'penaltyType' ? normalizePenaltyType(value) : value));
        }
      }
      return penalty;
    });
    writes.push(planFieldWrite(participant, 'penalties', penalties));
    if (matched) modified.push(participant);
  }
  if (!committedPenalty) return { error: PENALTY_NOT_FOUND };
  return {
    committedPenalty,
    payload: { tournamentId: tournamentRecord.tournamentId, participants: modified },
  };
}
