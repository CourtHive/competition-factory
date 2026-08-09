import { decorateResult } from '@Functions/global/decorateResult';
import { generateAdHocMatchUps } from './generateAdHocMatchUps';
import { generateRange } from '@Tools/arrays';

// types
import { DrawDefinition, Event, MatchUp } from '@Types/tournamentTypes';
import { getParticipantIds } from './drawMatic/getParticipantIds';
import { ResultType } from '@Types/factoryTypes';

type GenerateAdHocRoundsArgs = {
  restrictMatchUpsCount?: boolean;
  restrictRoundsCount?: boolean;
  drawDefinition: DrawDefinition;
  // permits a roundsCount of up to (entrants - 1) * 2, replaying pairings a second time
  enableDoubleRobin?: boolean;
  matchUpsCount?: number; // number of matchUps to be generated
  matchUpIds?: string[];
  roundNumber?: number;
  structureId?: string;
  roundsCount: number;
  newRound?: boolean; // optional - whether to auto-increment to the next roundNumber
  idPrefix?: string;
  isMock?: boolean;
  event: Event;
};

export function generateAdHocRounds(params: GenerateAdHocRoundsArgs): ResultType & { matchUps?: MatchUp[] } {
  const matchUps: MatchUp[] = [];
  const { roundsCount = 1, drawDefinition, matchUpsCount, structureId, idPrefix, isMock, event } = params;
  let roundNumber;

  const idsResult = getParticipantIds(params);
  if (idsResult.error) return idsResult;

  for (const iteration of generateRange(1, roundsCount + 1)) {
    // on the first iteration roundNumber is undefined and generateAdHocMatchUps will infer the roundNumber from existing matchUps
    // on subsequent iterations roundNumber will be incremented and ignoreLastRoundNumber will be true to avoid inference error
    const genResult = generateAdHocMatchUps({
      restrictMatchUpsCount: params.restrictMatchUpsCount,
      ignoreLastRoundNumber: !!roundNumber,
      newRound: !roundNumber,
      drawDefinition,
      matchUpsCount,
      structureId,
      roundNumber,
      idPrefix,
      isMock,
      event,
    });
    if (genResult.error) return decorateResult({ result: genResult, info: { iteration } });
    if (genResult.matchUps?.length) matchUps.push(...genResult.matchUps);
    roundNumber = (genResult?.roundNumber ?? 1) + 1;
  }

  return { matchUps };
}
