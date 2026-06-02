import { addFinishingRounds } from '../addFinishingRounds';
import { generateMatchUpId } from '../generateMatchUpId';
import { isConvertableInteger } from '@Tools/math';
import { generateRange } from '@Tools/arrays';
import { ensureInt } from '@Tools/ensureInt';
import { buildRound } from '../buildRound';

// Constants
import { ErrorType, INVALID_VALUES } from '@Constants/errorConditionConstants';

type CustomLuckyDrawParams = {
  finishingPositionOffset?: number;
  qualifyingRoundNumber?: number;
  qualifyingPositions?: number;
  roundProfile?: number[];
  matchUpType?: string;
  roundLimit?: number;
  idPrefix?: string;
  drawSize: number;
  isMock?: boolean;
  uuids?: string[];
};

type CustomLuckyDrawResult = {
  roundProfile?: number[];
  roundsCount: number;
  roundLimit?: number;
  matchUps: any[];
  error?: ErrorType;
  info?: string;
};

/**
 * Generates matchUps for a LUCKY_DRAW when the caller supplies an explicit
 * per-round matchUp-count `roundProfile`, instead of the default auto
 * ceil-halving cascade. Dispatched from `getGenerators.LUCKY_DRAW` when
 * `params.roundProfile` is present. The number of lucky losers promoted
 * into each round is implied by the size delta:
 *
 *   luckyLoserCount(n → n+1) = 2 * roundProfile[n+1] - roundProfile[n]
 *
 * Example profile [20, 12, 8, 4, 2, 1] for drawSize 40:
 *   R1: 20 matchUps (40 players, 0 LL in)
 *   R2: 12 matchUps (20 winners + 4 LL = 24)
 *   R3:  8 matchUps (12 winners + 4 LL = 16)
 *   R4:  4 matchUps ( 8 winners       =  8)
 *   R5:  2 matchUps ( 4 winners       =  4)
 *   R6:  1 matchUp  ( 2 winners       =  2)
 *
 * Returns the matchUps plus the validated `roundProfile` so the dispatcher in
 * getGenerators.ts can persist it as a structure extension — the advancement
 * mutation reads it back to know how many LL each transition requires.
 */
export function customLuckyDraw(params: CustomLuckyDrawParams): CustomLuckyDrawResult {
  const {
    finishingPositionOffset,
    qualifyingRoundNumber,
    qualifyingPositions,
    matchUpType,
    idPrefix,
    drawSize,
    isMock,
    uuids,
  } = params;

  if (!isConvertableInteger(drawSize) || drawSize < 2) {
    return { matchUps: [], roundsCount: 0 };
  }

  const validation = validateRoundProfile(params.roundProfile, drawSize);
  if (validation.error || !validation.profile) {
    return { matchUps: [], roundsCount: 0, error: validation.error, info: validation.info };
  }
  const profile = validation.profile;

  const firstRoundParticipants = profile[0] * 2;
  const nodes = generateRange(1, firstRoundParticipants + 1).map((drawPosition) => ({ drawPosition }));

  let matchUps: any[] = [];
  let roundNumber = 1;

  ({ matchUps } = buildRound({
    roundNumber,
    matchUpType,
    idPrefix,
    matchUps,
    isMock,
    nodes,
    uuids,
  }));
  roundNumber++;

  let roundLimit = params.roundLimit || qualifyingRoundNumber;

  for (let i = 1; i < profile.length; i++) {
    const roundMatchUpsCount = profile[i];

    if (qualifyingPositions && roundMatchUpsCount === qualifyingPositions) {
      roundLimit = roundNumber - 1;
    }

    const roundMatchUps = generateRange(1, roundMatchUpsCount + 1).map((roundPosition) => ({
      roundPosition,
      roundNumber,
      matchUpId: generateMatchUpId({ roundPosition, roundNumber, idPrefix, uuids }),
    }));

    matchUps.push(...roundMatchUps);
    roundNumber++;
  }

  const roundsCount = roundNumber - 1;

  matchUps = addFinishingRounds({
    finishingPositionOffset,
    lucky: true,
    roundsCount,
    roundLimit,
    matchUps,
  });

  if (roundLimit) {
    matchUps = matchUps.filter((matchUp) => matchUp.roundNumber <= roundLimit);
  }

  return { matchUps, roundsCount, roundLimit, roundProfile: profile };
}

type ValidationResult = {
  profile?: number[];
  error?: ErrorType;
  info?: string;
};

function validateRoundProfile(roundProfile, drawSize): ValidationResult {
  if (!Array.isArray(roundProfile) || !roundProfile.length) {
    return { error: INVALID_VALUES, info: 'roundProfile must be a non-empty array' };
  }

  const profile = roundProfile.map((n) => ensureInt(n));

  if (profile.some((n) => !Number.isInteger(n) || n < 1)) {
    return { error: INVALID_VALUES, info: 'roundProfile entries must be positive integers' };
  }

  if (profile[profile.length - 1] !== 1) {
    return { error: INVALID_VALUES, info: 'roundProfile must end with 1 (final matchUp)' };
  }

  const expectedDrawSize = profile[0] * 2;
  if (ensureInt(drawSize) !== expectedDrawSize) {
    return {
      error: INVALID_VALUES,
      info: `roundProfile[0] * 2 (${expectedDrawSize}) must equal drawSize (${drawSize})`,
    };
  }

  for (let i = 0; i < profile.length - 1; i++) {
    const winners = profile[i];
    const nextSlots = profile[i + 1] * 2;
    if (nextSlots < winners) {
      return {
        error: INVALID_VALUES,
        info: `round ${i + 2} has ${nextSlots} slots but round ${i + 1} produces ${winners} winners (would drop winners)`,
      };
    }
  }

  return { profile };
}
