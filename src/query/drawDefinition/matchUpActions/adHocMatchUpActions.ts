import { buildIndividualIdsMap } from '@Query/participants/individualParticipantIds';
import { getEventAlternateParticipantIds } from './getEventAlternateParticipantids';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { getParticipantId } from '@Functions/global/extractors';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { unique } from '@Tools/arrays';

// constants and types
import { ALTERNATE, DIRECT_ENTRY_STATUSES, UNGROUPED, UNPAIRED, WITHDRAWN } from '@Constants/entryStatusConstants';
import { ASSIGN_SIDE_METHOD, REMOVE_PARTICIPANT, REMOVE_SIDE_METHOD } from '@Constants/matchUpActionConstants';
import { HydratedParticipant } from '@Types/hydrated';
import {
  ASSIGN_PARTICIPANT,
  SWAP_ADHOC_PARTICIPANT_METHOD,
  SWAP_PARTICIPANTS,
} from '@Constants/positionActionConstants';

export function adHocMatchUpActions({
  tournamentParticipants,
  matchUpParticipantIds,
  otherFlightEntries,
  drawDefinition,
  structureId,
  sideNumber,
  matchUpId,
  structure,
  matchUp,
  drawId,
  event,
}: {
  tournamentParticipants?: HydratedParticipant[];
  matchUpParticipantIds: string[];
  otherFlightEntries?: boolean;
  structureId: string;
  sideNumber?: number;
  drawDefinition: any;
  matchUpId: string;
  drawId: string;
  structure: any;
  matchUp: any;
  event: any;
}) {
  const validActions: any = [];

  const matchUps = structure?.matchUps ?? [];
  const side = matchUp.sides?.find((side) => side.sideNumber === sideNumber);
  const sideParticipantId = side?.participantId;
  const roundMatchUps = matchUps.filter(({ roundNumber }) => roundNumber === matchUp.roundNumber);

  const enteredParticipantIds =
    drawDefinition?.entries
      ?.filter(({ entryStatus }) => entryStatus && DIRECT_ENTRY_STATUSES.includes(entryStatus))
      .map(getParticipantId) ?? [];

  const roundAssignedParticipantIds = new Set<string>(
    roundMatchUps
      .map((matchUp) => (matchUp.sides ?? []).flatMap(getParticipantId))
      .flat()
      .filter(Boolean),
  );

  // Participants are checked by id, and also by the people they are made of: a PAIR sharing an
  // individual with the opposing side would put that person on both sides, and one sharing an
  // individual with anyone already in the round would put that person in two matchUps at once.
  // Assignment refuses both, so neither is offered. The participant being replaced on this side
  // frees its individuals.
  const individualIdsMap = buildIndividualIdsMap(tournamentParticipants as any);
  const individualsOf = (participantIds: string[]) =>
    new Set(participantIds.flatMap((participantId) => individualIdsMap[participantId] ?? []));
  const opposingIndividualIds = individualsOf(
    (matchUp.sides ?? [])
      .filter((side) => side.sideNumber !== sideNumber)
      .map(getParticipantId)
      .filter(Boolean),
  );
  const roundIndividualIds = individualsOf(
    [...roundAssignedParticipantIds].filter((participantId) => participantId !== sideParticipantId),
  );
  const sharesIndividual = (participantId: string, individualIds: Set<string>) =>
    (individualIdsMap[participantId] ?? []).some((id) => individualIds.has(id));
  const isAvailable = (participantId: string) =>
    !matchUpParticipantIds.includes(participantId) &&
    !sharesIndividual(participantId, opposingIndividualIds) &&
    !roundAssignedParticipantIds.has(participantId) &&
    !sharesIndividual(participantId, roundIndividualIds);

  const availableParticipantIds = enteredParticipantIds.filter(isAvailable);
  const availableParticipantIdSet = new Set(availableParticipantIds);

  const participantsAvailable = tournamentParticipants
    ?.filter((participant) => availableParticipantIdSet.has(participant.participantId))
    .map((participant) => makeDeepCopy(participant, undefined, true));

  participantsAvailable?.forEach((participant: HydratedParticipant) => {
    const entry = (drawDefinition.entries ?? []).find((entry) => entry.participantId === participant.participantId);
    // used to sort available participants
    participant.entryPosition = entry?.entryPosition;
  });

  if (availableParticipantIds.length) {
    validActions.push({
      payload: { drawId, matchUpId, structureId, sideNumber },
      method: ASSIGN_SIDE_METHOD,
      type: ASSIGN_PARTICIPANT,
      availableParticipantIds,
      participantsAvailable,
    });
  }

  const eventEntries = event?.entries ?? [];
  const availableEventAlternatesParticipantIds = getEventAlternateParticipantIds({ eventEntries, structure });

  let availableAlternatesParticipantIds = unique(enteredParticipantIds.concat(availableEventAlternatesParticipantIds));

  if (otherFlightEntries) {
    const flightProfile: any = event ? getFlightProfile({ event }) : undefined;
    const otherFlightEnteredParticipantIds = flightProfile?.flights
      ?.filter((flight) => flight.drawId !== drawId)
      .flatMap((flight) =>
        flight.drawEntries
          .filter((entry) => entry.participantId && ![WITHDRAWN, UNGROUPED, UNPAIRED].includes(entry.entryStatus))
          .map(({ participantId }) => participantId),
      )
      .filter(Boolean);

    if (otherFlightEnteredParticipantIds?.length) {
      // include direct acceptance participants from other flights
      availableAlternatesParticipantIds.push(...otherFlightEnteredParticipantIds);
    }
  }

  availableAlternatesParticipantIds = availableAlternatesParticipantIds.filter(
    (participantId) => !availableParticipantIdSet.has(participantId) && isAvailable(participantId),
  );

  const availableAlternatesSet = new Set(availableAlternatesParticipantIds);
  const availableAlternates = tournamentParticipants
    ?.filter((participant) => availableAlternatesSet.has(participant.participantId))
    .map((participant) => makeDeepCopy(participant, undefined, true));
  availableAlternates?.forEach((alternate: HydratedParticipant) => {
    const entry = (drawDefinition.entries ?? []).find((entry) => entry.participantId === alternate.participantId);
    alternate.entryPosition = entry?.entryPosition;
  });
  availableAlternates?.sort((a, b) => (a.entryPosition || Infinity) - (b.entryPosition || Infinity));

  if (availableAlternatesParticipantIds.length) {
    validActions.push({
      payload: { drawId, matchUpId, structureId, sideNumber },
      availableParticipantIds: availableAlternatesParticipantIds,
      participantsAvailable: availableAlternates,
      method: ASSIGN_SIDE_METHOD,
      type: ALTERNATE,
    });
  }

  if (!checkScoreHasValue(matchUp) && sideNumber && sideParticipantId) {
    validActions.push({
      payload: { drawId, matchUpId, structureId, sideNumber },
      method: REMOVE_SIDE_METHOD,
      type: REMOVE_PARTICIPANT,
    });

    const getMatchUpPairing = (matchUp) => matchUp.sides.map(getParticipantId);
    const notThisMatchUp = ({ matchUpId }) => matchUpId !== matchUp.matchUpId;
    const noScoreValue = (matchUp) => !checkScoreHasValue(matchUp);
    const opponentParticipantId = matchUp.sides?.find((side) => side.sideNumber !== sideNumber)?.participantId;
    const otherRoundMatchUps = matchUps.filter(({ roundNumber }) => roundNumber !== matchUp.roundNumber);
    const otherRoundParticipantPairings = otherRoundMatchUps.filter(notThisMatchUp).map(getMatchUpPairing);
    const otherOpponents = [
      opponentParticipantId,
      ...otherRoundParticipantPairings.filter((pairing) => pairing.includes(sideParticipantId)).flat(),
    ].filter(Boolean);
    const notPreviousOpponent = (id) => !otherOpponents.flat().includes(id);

    const availableSwaps = roundMatchUps
      .filter(noScoreValue)
      .filter(notThisMatchUp)
      .map(getMatchUpPairing)
      .flat()
      .filter(notPreviousOpponent);

    if (availableSwaps.length) {
      const swappableParticipants = tournamentParticipants
        ?.filter((participant) => availableSwaps.includes(participant.participantId))
        .map((participant) => makeDeepCopy(participant, undefined, true));
      validActions.push({
        payload: {
          participantIds: [sideParticipantId],
          roundNumber: matchUp.roundNumber,
          structureId,
          sideNumber,
          matchUpId,
          drawId,
        },
        swappableParticipantIds: availableSwaps,
        method: SWAP_ADHOC_PARTICIPANT_METHOD,
        type: SWAP_PARTICIPANTS,
        swappableParticipants,
      });
    }
  }

  return validActions;
}
