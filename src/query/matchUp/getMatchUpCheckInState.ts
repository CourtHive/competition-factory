import { getCheckedInParticipantIds } from './getCheckedInParticipantIds';
import { getMatchUpParticipantIds } from './getMatchUpParticipantIds';
import { findMatchUp } from '@Acquire/findMatchUp';

// constants and types
import { ErrorType, MISSING_MATCHUP, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { HydratedMatchUp, HydratedSide } from '@Types/hydrated';
import { SUCCESS } from '@Constants/resultConstants';

export type CheckInIndividual = {
  participantId: string;
  participantName?: string;
  sideNumber?: number;
  checkedIn: boolean;
};

export type MatchUpCheckInState = {
  /** Everyone who may check in, side 1 first: an INDIVIDUAL side, or each member of a PAIR or TEAM side. */
  participants: CheckInIndividual[];
  total: number;
  checkedInCount: number;
  /** False for a matchUp with nobody in it: "everyone is here" means nothing when there is no one. */
  allCheckedIn: boolean;
  /** Some, but not all, are at the desk: the state a desk most needs to see. */
  partial: boolean;
};

type GetMatchUpCheckInStateArgs = {
  /** A hydrated matchUp ({ inContext: true }); when absent it is found from `matchUpId`. */
  matchUp?: HydratedMatchUp;
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  matchUpId?: string;
  event?: Event;
};

/**
 * Who is at the desk for a matchUp: each individual who may check in, whether they have, and the counts.
 *
 * Check-in is per matchUp and per INDIVIDUAL: `checkInParticipant` refuses a PAIR or TEAM as the subject,
 * and a side's presence is derived from its members on read. This answers the desk's question in one
 * call, so a client does not re-derive the membership rule; who may check in is `getMatchUpParticipantIds`,
 * and who has is `getCheckedInParticipantIds`, so the answer agrees with what the writes accept.
 *
 * Who attested a check-in is deliberately absent: it is stripped from every bulk read and is returned only
 * by `getMatchUpCheckInHistory`, which a server can gate on its own.
 */
export function getMatchUpCheckInState(
  params: GetMatchUpCheckInStateArgs,
): (MatchUpCheckInState & { success: boolean }) | { error: ErrorType } {
  const { matchUp, error } = params.matchUp?.hasContext
    ? { matchUp: params.matchUp, error: undefined }
    : resolve(params);
  if (error || !matchUp) return { error: error ?? MISSING_MATCHUP };

  const { individualParticipantIds = [] } = getMatchUpParticipantIds({ matchUp });
  const eligible = new Set(individualParticipantIds);
  const checkedIn = new Set(getCheckedInParticipantIds({ matchUp }).checkedInParticipantIds ?? []);

  const participants: CheckInIndividual[] = [];
  for (const side of (matchUp.sides ?? []) as HydratedSide[]) {
    const participant = side?.participant;
    const members = participant?.individualParticipants?.length ? participant.individualParticipants : [participant];
    for (const member of members) {
      const participantId = member?.participantId;
      // `eligible` is the factory's own rule: a PAIR or TEAM whose members were not hydrated is not a person
      if (!participantId || !eligible.has(participantId)) continue;
      participants.push({
        participantId,
        participantName: member.participantName,
        sideNumber: side.sideNumber,
        checkedIn: checkedIn.has(participantId),
      });
    }
  }

  const total = participants.length;
  const checkedInCount = participants.filter((participant) => participant.checkedIn).length;

  return {
    participants,
    total,
    checkedInCount,
    allCheckedIn: total > 0 && checkedInCount === total,
    partial: checkedInCount > 0 && checkedInCount < total,
    ...SUCCESS,
  };
}

function resolve(params: GetMatchUpCheckInStateArgs): { matchUp?: HydratedMatchUp; error?: ErrorType } {
  const { tournamentRecord, drawDefinition, matchUpId, event } = params;
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!matchUpId) return { error: MISSING_MATCHUP };
  return findMatchUp({ tournamentRecord, drawDefinition, matchUpId, event, inContext: true });
}
