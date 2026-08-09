import { generateRoundRobinPairings, PairingRound } from './roundRobinPairing/generateRoundRobinPairings';
import { decorateResult } from '@Functions/global/decorateResult';
import { generateAdHocMatchUps } from './generateAdHocMatchUps';
import { generateRange } from '@Tools/arrays';

// types
import { DrawDefinition, Event, MatchUp } from '@Types/tournamentTypes';
import { PairingProfile, ResultType } from '@Types/factoryTypes';
import { getParticipantIds } from './drawMatic/getParticipantIds';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

type GenerateAdHocRoundsArgs = {
  restrictMatchUpsCount?: boolean;
  restrictRoundsCount?: boolean;
  drawDefinition: DrawDefinition;
  // permits a roundsCount of up to (entrants - 1) * 2, replaying pairings a second time
  enableDoubleRobin?: boolean;
  // applies a pairing SHAPE to round generation (e.g. a round robin over the entrants)
  pairingProfile?: PairingProfile;
  matchUpsCount?: number; // number of matchUps to be generated
  matchUpIds?: string[];
  roundNumber?: number;
  structureId?: string;
  roundsCount?: number;
  newRound?: boolean; // optional - whether to auto-increment to the next roundNumber
  idPrefix?: string;
  isMock?: boolean;
  event: Event;
};

export function generateAdHocRounds(params: GenerateAdHocRoundsArgs): ResultType & { matchUps?: MatchUp[] } {
  const { roundsCount = 1, drawDefinition, matchUpsCount, structureId, idPrefix, isMock, event } = params;

  // a shaped schedule validates its own rounds against the shape, so the generic roundsCount
  // restriction (which knows only about a single round robin) must not pre-empt it
  const idsResult = getParticipantIds(params.pairingProfile ? { ...params, restrictRoundsCount: false } : params);
  if (idsResult.error) return idsResult;

  const shapedResult = params.pairingProfile
    ? resolveShapedRounds({ pairingProfile: params.pairingProfile, participantIds: idsResult.participantIds, params })
    : undefined;
  if (shapedResult?.error) return shapedResult;

  const shapedRounds = shapedResult?.rounds;
  const iterations = shapedRounds ? shapedRounds.length : roundsCount;
  const matchUps: MatchUp[] = [];
  let roundNumber;

  for (const iteration of generateRange(1, iterations + 1)) {
    const participantIdPairings = shapedRounds?.[iteration - 1]?.map((pairing) => ({
      participantIds: [pairing[0], pairing[1]] as [string | undefined, string | undefined],
    }));

    // on the first iteration roundNumber is undefined and generateAdHocMatchUps will infer the roundNumber from existing matchUps
    // on subsequent iterations roundNumber will be incremented and ignoreLastRoundNumber will be true to avoid inference error
    const genResult = generateAdHocMatchUps({
      restrictMatchUpsCount: params.restrictMatchUpsCount,
      ignoreLastRoundNumber: !!roundNumber,
      matchUpsCount: participantIdPairings ? undefined : matchUpsCount,
      newRound: !roundNumber,
      participantIdPairings,
      drawDefinition,
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

function resolveShapedRounds({ pairingProfile, participantIds, params }): ResultType & { rounds?: PairingRound[] } {
  if (pairingProfile.shape !== ROUND_ROBIN) {
    return {
      error: INVALID_VALUES,
      info: 'unrecognized pairingProfile shape',
      context: { shape: pairingProfile.shape },
    };
  }

  return generateRoundRobinPairings({
    participantIds: participantIds ?? [],
    encounters: pairingProfile.encounters,
    mirrored: pairingProfile.mirrored,
    roundsCount: params.roundsCount,
  });
}
