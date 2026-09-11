import { resolveTieFormat } from '@Query/hierarchical/tieFormats/resolveTieFormat';
import { generateTieMatchUps } from '@Generators/drawDefinitions/tieMatchUps';
import { getAvailableMatchUpsCount } from './getAvailableMatchUpsCount';
import { decorateResult } from '@Functions/global/decorateResult';
import { definedAttributes } from '@Tools/definedAttributes';
import { isConvertableInteger } from '@Tools/math';
import { generateRange } from '@Tools/arrays';
import { UUID } from '@Tools/UUID';

// constants and types
import { INVALID_VALUES, MISSING_DRAW_DEFINITION, ErrorType } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, MatchUp, MatchUpStatusUnion, Tournament } from '@Types/tournamentTypes';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { TEAM } from '@Constants/matchUpTypes';

type GenerateAdHocMatchUpsArgs = {
  participantIdPairings?: {
    participantIds: [string | undefined, string | undefined];
  }[];
  ignoreLastRoundNumber?: boolean;
  restrictMatchUpsCount?: boolean; // defaults to true
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsCount?: number; // number of matchUps to be generated
  matchUpIds?: string[];
  roundNumber?: number;
  structureId?: string;
  newRound?: boolean; // optional - whether to auto-increment to the next roundNumber
  idPrefix?: string;
  isMock?: boolean;
  event: Event;
};

export function generateAdHocMatchUps(params: GenerateAdHocMatchUpsArgs): {
  matchUpsCount?: number;
  roundNumber?: number;
  matchUps?: MatchUp[];
  error?: ErrorType;
  info?: any;
} {
  const { matchUpIds = [], drawDefinition, roundNumber, newRound, isMock, event } = params;
  if (typeof drawDefinition !== 'object') return { error: MISSING_DRAW_DEFINITION };
  let { participantIdPairings, matchUpsCount } = params;

  const availableResult = getAvailableMatchUpsCount(params);
  if (availableResult.error) return decorateResult({ result: availableResult });

  const { lastRoundNumber, availableMatchUpsCount = 0, roundMatchUpsCount = 0 } = availableResult;

  if (!matchUpsCount) {
    if (newRound) {
      matchUpsCount = roundMatchUpsCount;
    } else if (availableMatchUpsCount > 0) matchUpsCount = availableMatchUpsCount;
  } else if (matchUpsCount > roundMatchUpsCount && params.restrictMatchUpsCount !== false) {
    return decorateResult({
      result: { error: INVALID_VALUES, info: 'matchUpsCount error', context: { roundMatchUpsCount } },
    });
  }

  if (
    (participantIdPairings && !Array.isArray(participantIdPairings)) ||
    (matchUpsCount && !isConvertableInteger(matchUpsCount)) ||
    (matchUpIds && !Array.isArray(matchUpIds)) ||
    (!participantIdPairings && !matchUpsCount)
  ) {
    return { error: INVALID_VALUES, info: 'matchUpsCount or pairings error' };
  }

  if (matchUpsCount && params.restrictMatchUpsCount !== false && matchUpsCount > 32) {
    return { error: INVALID_VALUES, info: 'matchUpsCount must be less than 33' };
  }

  if (roundNumber && !params.ignoreLastRoundNumber && roundNumber - 1 > (lastRoundNumber || 0)) {
    return { error: INVALID_VALUES, info: 'roundNumber error' };
  }

  const nextRoundNumber = roundNumber ?? ((newRound && (lastRoundNumber ?? 0) + 1) || lastRoundNumber || 1);

  participantIdPairings =
    participantIdPairings ??
    generateRange(0, matchUpsCount).map(() => ({
      participantIds: [undefined, undefined],
    }));

  const getPrefixedId = (index: number) => {
    if (!params.idPrefix) return undefined;
    const drawId = drawDefinition.drawId;
    const idPrefix = params.idPrefix ?? 'ah';
    return `${drawId}-${idPrefix}-${nextRoundNumber}-${index}`;
  };

  const matchUps = participantIdPairings?.map((pairing, i) => {
    const idStack = pairing?.participantIds ?? [undefined, undefined];
    // ensure there are always 2 sides in generated matchUps
    idStack.push(...[undefined, undefined]);
    const participantIds = idStack.slice(0, 2);
    const sides = participantIds.map((participantId, i) =>
      definedAttributes({
        sideNumber: i + 1,
        participantId,
      }),
    );

    const matchUpId = matchUpIds[i] ?? getPrefixedId(i) ?? UUID();

    return {
      roundNumber: nextRoundNumber,
      // object-literal inference widens the literal const to `string`; re-narrow to
      // the matchUpStatus union so the built matchUp is assignable to MatchUp.
      matchUpStatus: TO_BE_PLAYED as MatchUpStatusUnion,
      matchUpId,
      sides,
    };
  });

  if (matchUps?.length) {
    const tieFormat = resolveTieFormat({ drawDefinition, event })?.tieFormat;

    if (tieFormat) {
      matchUps.forEach((matchUp) => {
        const { tieMatchUps } = generateTieMatchUps({
          tieFormat,
          matchUp,
          isMock,
        });
        Object.assign(matchUp, { tieMatchUps, matchUpType: TEAM });
      });
    }
  }

  return { roundNumber: nextRoundNumber, matchUpsCount: matchUps?.length ?? 0, matchUps, ...SUCCESS };
}
