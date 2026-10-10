import { matchUpsOf } from '@Acquire/structureMembers';

import { isCompetitionProfile } from './competitionProfile';

// constants and types
import type { DrawDefinition, Event, Participant, Tournament, MatchUp } from '@Types/tournamentTypes';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { AD_HOC } from '@Constants/drawDefinitionConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import type { ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { DOUBLES } from '@Constants/eventConstants';
import {
  INVALID_PARTICIPANT_IDS,
  INVALID_VALUES,
  SHARED_INDIVIDUAL_PARTICIPANT,
} from '@Constants/errorConditionConstants';

export function isRotatingPartnerDraw(drawDefinition?: DrawDefinition, event?: Event): boolean {
  const profile = drawDefinition?.competitionProfile;
  return (
    isCompetitionProfile(profile) &&
    profile.format !== 'LADDER' &&
    drawDefinition?.drawType === AD_HOC &&
    (drawDefinition.matchUpType ?? event?.eventType) === DOUBLES
  );
}

export function isRotatingPartnerEntrant(participant?: Participant): boolean {
  return (
    participant?.participantType === INDIVIDUAL &&
    (!participant.participantRole || participant.participantRole === COMPETITOR)
  );
}

/** The roster contains individuals. Partnership scaffolding is never an entrant. */
export function validateRotatingPartnerEntrants({
  participantIds,
  tournamentRecord,
}: {
  participantIds: string[];
  tournamentRecord?: Tournament;
}): ResultType {
  const participants = new Map(
    (tournamentRecord?.participants ?? []).map((participant) => [participant.participantId, participant]),
  );
  const invalidParticipantIds = participantIds.filter((id) => !isRotatingPartnerEntrant(participants.get(id)));
  return invalidParticipantIds.length
    ? { error: INVALID_PARTICIPANT_IDS, context: { invalidParticipantIds } }
    : { ...SUCCESS };
}

/** PAIR sides may be outside the entrant list, but every member must be an entered individual. */
export function validateRotatingPartnerMatchUps({
  drawDefinition,
  tournamentRecord,
  matchUps,
}: {
  drawDefinition: DrawDefinition;
  tournamentRecord?: Tournament;
  matchUps: MatchUp[];
}): ResultType {
  const participants = new Map(
    (tournamentRecord?.participants ?? []).map((participant) => [participant.participantId, participant]),
  );
  const entrants = new Set((drawDefinition.entries ?? []).map((entry) => entry.participantId));
  const seen = new Map<number, Set<string>>();
  const existing = (drawDefinition.structures ?? []).flatMap((structure) => matchUpsOf(structure) ?? []);
  for (const matchUp of [...existing, ...matchUps]) {
    if (!Number.isSafeInteger(matchUp.roundNumber) || (matchUp.roundNumber ?? 0) < 1 || matchUp.sides?.length !== 2)
      return { error: INVALID_VALUES, info: 'rotating-partner matches require a round and two PAIR sides' };
    const round = matchUp.roundNumber!;
    const roundIndividuals = seen.get(round) ?? new Set<string>();
    for (const side of matchUp.sides) {
      const pair = participants.get(side.participantId ?? '');
      const members = pair?.individualParticipantIds;
      if (
        pair?.participantType !== PAIR ||
        !Array.isArray(members) ||
        members.length !== 2 ||
        new Set(members).size !== 2 ||
        members.some((id) => !entrants.has(id) || !isRotatingPartnerEntrant(participants.get(id)))
      )
        return { error: INVALID_VALUES, info: 'PAIR sides require two distinct individual entrants' };
      for (const id of members) {
        if (roundIndividuals.has(id))
          return { error: SHARED_INDIVIDUAL_PARTICIPANT, context: { participantId: id, roundNumber: round } };
        roundIndividuals.add(id);
      }
    }
    seen.set(round, roundIndividuals);
  }
  return { ...SUCCESS };
}
