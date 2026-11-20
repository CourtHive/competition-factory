import { isOperatorPresentationAudience } from './operatorPresentationSchema';
import { checkScoreHasValue } from '@Scoring/analysis/checkScoreHasValue';
import { generateScoreString } from '@Scoring/views/generateScoreString';
import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { getMatchUpUpset } from '@Query/matchUp/getMatchUpUpset';
import { isConvertableInteger } from '@Tools/numeric';

// constants and types
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { ResultType } from '@Types/factoryTypes';
import type {
  OperatorPresentationAudience,
  OperatorDrawPresentation,
  OperatorMatchPresentation,
} from '@Types/operatorPresentation';

/**
 * Presentation projection of an ALREADY AUTHORIZED hydrated matchUp, never a raw tournament or participant record.
 * Canonical factory queries compute score presence, score text and upset. No client renderer needs these queries.
 * This is not an authorization boundary or an action offer; CFS must authorize/filter upstream and add the document
 * envelope (audience, source revision, freshness). Only explicitly selected display fields leave this projector.
 */
function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function operatorMatchPresentation(
  matchUp: HydratedMatchUp,
  options?: { audience: OperatorPresentationAudience; venueTimeZone?: string },
): ResultType & { presentation?: OperatorMatchPresentation } {
  if (!isOperatorPresentationAudience(options?.audience) || !text(matchUp?.matchUpId)) return { error: INVALID_VALUES };
  return { presentation: buildMatchPresentation(matchUp, options.audience, options.venueTimeZone) };
}

function buildMatchPresentation(
  matchUp: HydratedMatchUp,
  audience: OperatorPresentationAudience,
  venueTimeZone?: string,
): OperatorMatchPresentation {
  const scoreText = generateScoreString({
    sets: [...(matchUp.score?.sets ?? [])], // the canonical formatter sorts its array; never give it the input array
    matchUpFormat: matchUp.matchUpFormat,
    matchUpStatus: matchUp.matchUpStatus,
    winningSide: matchUp.winningSide,
    winnerFirst: false,
  });
  return {
    audience,
    matchUpId: matchUp.matchUpId,
    roundPosition:
      typeof matchUp.roundPosition === 'number' && Number.isFinite(matchUp.roundPosition)
        ? matchUp.roundPosition
        : undefined,
    status: text(matchUp.matchUpStatus),
    scoreText: typeof scoreText === 'string' ? scoreText : '',
    hasScore: checkScoreHasValue({ matchUp }),
    isUpset: getMatchUpUpset({ matchUp }).isUpset,
    sides: ([1, 2] as const).map((sideNumber) => {
      const side = matchUp.sides?.find((candidate) => candidate.sideNumber === sideNumber);
      return {
        sideNumber,
        participantId: text(side?.participantId ?? side?.participant?.participantId),
        name: text(side?.participant?.participantName),
        seed:
          typeof (side?.seedValue ?? side?.seedNumber) === 'string' ||
          typeof (side?.seedValue ?? side?.seedNumber) === 'number'
            ? String(side?.seedValue ?? side?.seedNumber)
            : undefined,
        bye: !!side?.bye,
        qualifier: !!side?.qualifier,
        isWinner: matchUp.winningSide === sideNumber,
      };
    }),
    schedule: matchUp.schedule
      ? {
          date: text(matchUp.schedule.scheduledDate),
          time: text(matchUp.schedule.scheduledTime),
          timeZone: text(venueTimeZone),
          court: text(matchUp.schedule.courtName),
          venue: text(matchUp.schedule.venueName),
        }
      : undefined,
  };
}

/**
 * One round-backed structure, in the factory's round order. Unrounded/ad-hoc matches are refused, never silently lost. The caller supplies the authorized hydrated subset plus WINNER-link
 * round numbers from the canonical producer context. There are no seat offers or eligibility booleans here.
 */
export function operatorDrawPresentation(params?: {
  audience: OperatorPresentationAudience;
  winnerLinkRoundNumbers?: number[];
  venueTimeZones?: Readonly<Record<string, string>>;
  matchUps: HydratedMatchUp[];
  structureId: string;
  drawId: string;
}): ResultType & { presentation?: OperatorDrawPresentation } {
  const { winnerLinkRoundNumbers, venueTimeZones, structureId, matchUps, drawId, audience } = params ?? {};
  if (
    !isOperatorPresentationAudience(audience) ||
    typeof drawId !== 'string' ||
    !drawId ||
    typeof structureId !== 'string' ||
    !structureId ||
    !Array.isArray(matchUps) ||
    matchUps.some(
      (matchUp) =>
        !text(matchUp?.matchUpId) ||
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
      audience,
      schemaVersion: 'operator-presentation.v1',
      drawId,
      structureId,
      rounds: (roundData.roundNumbers ?? []).map((roundNumber) => ({
        roundNumber,
        name: text(roundData.roundProfile?.[roundNumber]?.roundName),
        feedRound: !!roundData.roundProfile?.[roundNumber]?.feedRound,
        matches: (roundData.roundMatchUps?.[roundNumber] ?? []).map((matchUp) =>
          buildMatchPresentation(
            matchUp,
            audience,
            matchUp.schedule?.venueId ? venueTimeZones?.[matchUp.schedule.venueId] : undefined,
          ),
        ),
      })),
    },
  };
}
