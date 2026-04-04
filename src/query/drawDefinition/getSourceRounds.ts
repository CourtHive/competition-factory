import { getFinishingPositionSourceRoundsMap } from '@Query/structure/structureUtils';
import { getStructureRoundProfile } from '../structure/getStructureRoundProfile';
import { requireParams } from '@Helpers/parameters/requireParams';
import { getPositionsPlayedOff } from './getPositionsPlayedOff';
import { generateRange } from '@Tools/arrays';
import { numericSort } from '@Tools/sorting';
import { ensureInt } from '@Tools/ensureInt';

// constants and types
import { DRAW_DEFINITION, STRUCTURE_ID } from '@Constants/attributeConstants';
import { ErrorType, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { DrawDefinition } from '@Types/tournamentTypes';
import { RoundProfile } from '@Types/factoryTypes';

type GetSourceRoundsArgs = {
  excludeRoundNumbers?: number[];
  drawDefinition: DrawDefinition;
  playoffPositions?: number[];
  structureId: string;
};

type SourceRoundsResult = {
  playoffPositionsReturned?: number[];
  playedOffSourceRounds?: number[];
  playoffSourceRounds?: number[];
  playoffRoundsRanges?: any;
  roundProfile?: RoundProfile;
  sourceRounds?: number[];
  error?: ErrorType;
  info?: string;
};

export function getSourceRounds({
  excludeRoundNumbers = [],
  playoffPositions = [],
  drawDefinition,
  structureId,
}: GetSourceRoundsArgs): SourceRoundsResult {
  const paramsCheck = requireParams({ drawDefinition, structureId }, [DRAW_DEFINITION, STRUCTURE_ID]);
  if (paramsCheck.error) return paramsCheck;
  if (!playoffPositions) return { error: MISSING_VALUE, info: 'missing playoffPositions' };

  // NOTE: in this instance do not pass in structureIds
  const result = getPositionsPlayedOff({ drawDefinition });

  if (result.error) return result;
  const positionsPlayedOff = result.positionsPlayedOff;

  // filter out playoff positions which are already being played off
  const relevantPlayoffPositions = playoffPositions.filter((position) => !positionsPlayedOff.includes(position));

  // get a map of which rounds produce which finishingPositions for positions
  // which are relevant, e.g. aren't already playedoff positions in current structure
  const playoffPositionSourceRoundsMap: any = getFinishingPositionSourceRoundsMap({
    finishingPositions: relevantPlayoffPositions,
    drawDefinition,
    structureId,
  });

  // reduce the sourceRoundsMap to roundNumbers, not including excludedRoundNumbers
  const keys: any[] = Object.values(playoffPositionSourceRoundsMap);
  const relevantPlayoffSourceRounds: any = keys
    .reduce((rounds: any[], round: any) => {
      return rounds.includes(round.roundNumber) ? rounds : rounds.concat(round.roundNumber);
    }, [])
    .map((roundNumber) => ensureInt(roundNumber))
    .filter((roundNumber) => !excludeRoundNumbers.includes(roundNumber));

  // generate a map of finishingPosition: { roundNumber }
  const playedOffRoundsMap = getFinishingPositionSourceRoundsMap({
    finishingPositions: positionsPlayedOff,
    drawDefinition,
    structureId,
  });

  // determine which rounds produced played off positions
  const roundsMapValues: any[] = playedOffRoundsMap ? Object.values(playedOffRoundsMap) : [];
  const playedOffSourceRounds = playedOffRoundsMap
    ? roundsMapValues
        .reduce((rounds: any[], round: any) => {
          return rounds.includes(round.roundNumber) ? rounds : rounds.concat(round.roundNumber);
        }, [])
        .map((round) => ensureInt(round))
    : [];

  // available playoffSourceRounds are those relevantPlayoffSourceRounds which are not included in playoffSourceRounds
  const playoffSourceRounds = relevantPlayoffSourceRounds
    .filter((roundNumber) => !playedOffSourceRounds.includes(roundNumber))
    .sort(numericSort);

  const { roundProfile } = getStructureRoundProfile({
    drawDefinition,
    structureId,
  });

  const playoffPositionsReturned = playoffSourceRounds
    .map((round) => {
      const rangeDefinition = roundProfile?.[round].finishingPositionRange.loser;
      const [min, max] = rangeDefinition ?? [0, 0];
      return generateRange(min, (max || min) + 1);
    })
    .flat()
    .sort(numericSort);

  const { playoffRoundsRanges } = getPlayoffRoundsRanges({
    playoffSourceRounds,
    roundProfile,
  });

  const sourceRounds = [...playoffSourceRounds, ...playedOffSourceRounds];

  return {
    playoffPositionsReturned,
    playedOffSourceRounds,
    playoffRoundsRanges,
    playoffSourceRounds,
    sourceRounds,
    roundProfile,
  };
}

export function getPlayoffRoundsRanges({ playoffSourceRounds, roundProfile }) {
  const playoffRoundsRanges = playoffSourceRounds.map((roundNumber) => {
    const rangeDefinition = roundProfile[roundNumber].finishingPositionRange.loser;
    const [min, max] = rangeDefinition;
    const finishingPositions = generateRange(min, (max || min) + 1);
    return {
      finishingPositionRange: rangeDefinition.join('-'),
      finishingPositions,
      roundNumber,
    };
  });
  return { playoffRoundsRanges };
}
