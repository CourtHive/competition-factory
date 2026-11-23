import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { getReferencedParticipants } from '@Query/participants/getReferencedParticipants';
import { hydrateParticipants } from '@Query/participants/hydrateParticipants';
import { getContextContent } from '@Query/hierarchical/getContextContent';
import { withContextExclusion } from '@Query/matchUps/contextExclusion';
import { allDrawMatchUps } from '@Query/matchUps/getAllDrawMatchUps';
import { findDrawMatchUp } from './findDrawMatchUp';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { locateMatchUp } from './locateMatchUp';
import { findEvent } from './findEvent';

// constants and types
import { ContextContent, ContextProfile, ParticipantsProfile } from '@Types/factoryTypes';
import { DrawDefinition, Tournament, Event, Structure } from '@Types/tournamentTypes';
import { HydratedMatchUp } from '@Types/hydrated';
import {
  DRAW_DEFINITION_NOT_FOUND,
  ErrorType,
  MATCHUP_NOT_FOUND,
  MISSING_MATCHUP_ID,
  MISSING_TOURNAMENT_RECORD,
} from '@Constants/errorConditionConstants';

type FindMatchUpType = {
  participantsProfile?: ParticipantsProfile;
  contextContent?: ContextContent;
  contextProfile?: ContextProfile;
  drawDefinition?: DrawDefinition;
  afterRecoveryTimes?: boolean;
  tournamentRecord: Tournament;
  nextMatchUps?: boolean;
  inContext?: boolean;
  matchUpId: string;
  eventId?: string;
  drawId?: string;
  event?: Event;
};

type FindMatchUpResult = {
  drawDefinition?: DrawDefinition;
  matchUp?: HydratedMatchUp;
  structure?: Structure;
  error?: ErrorType;
};

export function publicFindMatchUp(params: FindMatchUpType): FindMatchUpResult {
  Object.assign(params, { inContext: true });
  const { matchUp, error } = findMatchUp(params);
  return { matchUp: makeDeepCopy(matchUp, true, true), error };
}

export function findMatchUp(params: FindMatchUpType) {
  return withContextExclusion(params, findMatchUpUnredacted);
}

function findMatchUpUnredacted({
  participantsProfile,
  afterRecoveryTimes,
  tournamentRecord,
  contextContent,
  contextProfile,
  drawDefinition,
  nextMatchUps,
  matchUpId,
  inContext,
  eventId,
  drawId,
  event,
}: FindMatchUpType): FindMatchUpResult {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (typeof matchUpId !== 'string') return { error: MISSING_MATCHUP_ID };

  if (!drawDefinition || !event) {
    // The stored structures say which event and draw hold the matchUp, so nothing is hydrated to find out;
    // only the hit is hydrated below. Where the hydrated walk might disagree, the walk itself answers.
    const { location, exact } = locateMatchUp({ tournamentRecord, matchUpId });
    const located = exact ? location : bruteForceLocation({ tournamentRecord, nextMatchUps, matchUpId });
    if (!located) return { error: MATCHUP_NOT_FOUND };

    // since drawEngineFindMatchUp is being used, additional context needs to be provided
    ({ eventId, drawId } = located);
    ({ event, drawDefinition } = findEvent({
      tournamentRecord,
      eventId,
      drawId,
    }));
  }

  if (!drawDefinition) return { error: DRAW_DEFINITION_NOT_FOUND };

  if (contextProfile && !contextContent) contextContent = getContextContent({ tournamentRecord, contextProfile });

  const additionalContext = {
    surfaceCategory: event?.surfaceCategory ?? tournamentRecord.surfaceCategory,
    indoorOutDoor: event?.indoorOutdoor ?? tournamentRecord.indoorOutdoor,
    endDate: event?.endDate ?? tournamentRecord.endDate,
    tournamentId: tournamentRecord.tournamentId,
    eventId: eventId ?? event?.eventId,
    drawId,
  };

  // one draw's matchUps read only the participants that draw references (and their groupings), so only those are
  // copied: hydrating the whole pool made one lookup linear in the tournament's participants
  const { participants: tournamentParticipants = [] } = hydrateParticipants({
    participants: getReferencedParticipants({
      participants: tournamentRecord.participants ?? [],
      record: drawDefinition,
    }),
    participantsProfile,
    tournamentRecord,
    contextProfile,
    inContext,
  });

  if (nextMatchUps) {
    const matchUps =
      allDrawMatchUps({
        context: inContext ? additionalContext : undefined,
        participants: tournamentParticipants,
        afterRecoveryTimes,
        tournamentRecord,
        contextContent,
        contextProfile,
        drawDefinition,
        nextMatchUps,
        inContext,
        event,
      }).matchUps ?? [];
    const inContextMatchUp = matchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
    if (!inContextMatchUp) return { error: MATCHUP_NOT_FOUND };
    const structure = drawDefinition?.structures?.find(
      (structure) => structure.structureId === inContextMatchUp.structureId,
    );
    return { drawDefinition, structure, matchUp: inContextMatchUp };
  } else {
    const { matchUp, structure } = findDrawMatchUp({
      context: inContext ? additionalContext : undefined,
      tournamentParticipants,
      tournamentRecord,
      participantsProfile,
      afterRecoveryTimes,
      contextContent,
      drawDefinition,
      contextProfile,
      matchUpId,
      inContext,
      event,
    });

    return { matchUp, structure, drawDefinition };
  }
}

/** Every matchUp in the tournament hydrated, to read where one of them lives: only for what `locateMatchUp` cannot answer. */
function bruteForceLocation({
  tournamentRecord,
  nextMatchUps,
  matchUpId,
}: {
  tournamentRecord: Tournament;
  nextMatchUps?: boolean;
  matchUpId: string;
}): HydratedMatchUp | undefined {
  const matchUps = allTournamentMatchUps({ tournamentRecord, nextMatchUps }).matchUps ?? [];
  return matchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
}
