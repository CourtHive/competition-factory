import { checkScoreHasValue } from '@Scoring/analysis/checkScoreHasValue';
import { generateScoreString } from '@Scoring/views/generateScoreString';
import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { getMatchUpUpset } from '@Query/matchUp/getMatchUpUpset';
import { isConvertableInteger } from '@Tools/numeric';

// constants and types
import type { OperatorDrawPresentation, OperatorMatchPresentation } from '@Types/operatorPresentation';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { ResultType } from '@Types/factoryTypes';

/**
 * Presentation projection of an ALREADY AUTHORIZED hydrated matchUp, never a raw tournament or participant record.
 * Canonical factory queries compute score presence, score text and upset. No client renderer needs these queries.
 * This is not an authorization boundary or an action offer; CFS must authorize/filter upstream and add the document
 * envelope (audience, source revision, freshness). Only explicitly selected display fields leave this projector.
 */
export function operatorMatchPresentation(matchUp: HydratedMatchUp): OperatorMatchPresentation {
  const scoreText = generateScoreString({
    sets: [...(matchUp.score?.sets ?? [])], // the canonical formatter sorts its array; never give it the input array
    matchUpFormat: matchUp.matchUpFormat,
    matchUpStatus: matchUp.matchUpStatus,
    winningSide: matchUp.winningSide,
    winnerFirst: false,
  });
  return {
    matchUpId: matchUp.matchUpId,
    roundPosition: matchUp.roundPosition,
    status: matchUp.matchUpStatus,
    scoreText: typeof scoreText === 'string' ? scoreText : '',
    hasScore: checkScoreHasValue({ matchUp }),
    isUpset: getMatchUpUpset({ matchUp }).isUpset,
    sides: ([1, 2] as const).map((sideNumber) => {
      const side = matchUp.sides?.find((candidate) => candidate.sideNumber === sideNumber);
      return {
        sideNumber,
        participantId: side?.participantId ?? side?.participant?.participantId,
        name: side?.participant?.participantName,
        seed:
          side?.seedValue === undefined && side?.seedNumber === undefined
            ? undefined
            : String(side.seedValue ?? side.seedNumber),
        bye: !!side?.bye,
        qualifier: !!side?.qualifier,
        isWinner: matchUp.winningSide === sideNumber,
      };
    }),
    schedule: matchUp.schedule
      ? {
          date: matchUp.schedule.scheduledDate,
          time: matchUp.schedule.scheduledTime,
          court: matchUp.schedule.courtName,
          venue: matchUp.schedule.venueName,
        }
      : undefined,
  };
}

/**
 * One round-backed structure, in the factory's round order. Unrounded/ad-hoc matches are refused, never silently lost. The caller supplies the authorized hydrated subset plus WINNER-link
 * round numbers from the canonical producer context. There are no seat offers or eligibility booleans here.
 */
export function operatorDrawPresentation({
  winnerLinkRoundNumbers,
  structureId,
  matchUps,
  drawId,
}: {
  winnerLinkRoundNumbers?: number[];
  matchUps: HydratedMatchUp[];
  structureId: string;
  drawId: string;
}): ResultType & { presentation?: OperatorDrawPresentation } {
  if (
    !drawId ||
    !structureId ||
    !Array.isArray(matchUps) ||
    matchUps.some(
      (matchUp) =>
        !matchUp?.matchUpId ||
        matchUp.drawId !== drawId ||
        matchUp.structureId !== structureId ||
        !isConvertableInteger(matchUp.roundNumber) ||
        Number(matchUp.roundNumber) < 1,
    ) ||
    new Set(matchUps.map((matchUp) => matchUp.matchUpId)).size !== matchUps.length
  ) {
    return { error: INVALID_VALUES };
  }
  const roundData = getRoundMatchUps({ matchUps, winnerLinkRoundNumbers });
  if (roundData.error) return { error: roundData.error };
  return {
    presentation: {
      schemaVersion: 'operator-presentation.v1',
      drawId,
      structureId,
      rounds: (roundData.roundNumbers ?? []).map((roundNumber) => ({
        roundNumber,
        name: roundData.roundProfile?.[roundNumber]?.roundName,
        feedRound: !!roundData.roundProfile?.[roundNumber]?.feedRound,
        matches: (roundData.roundMatchUps?.[roundNumber] ?? []).map(operatorMatchPresentation),
      })),
    },
  };
}
