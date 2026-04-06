import { generateAdHocMatchUps } from '../generateAdHocMatchUps';
import { generateSwissPairings } from './swissPairing';
import { getAdHocRatings } from '../drawMatic/getAdHocRatings';
import { getParticipantIds } from '../drawMatic/getParticipantIds';
import { findStructure } from '@Acquire/findStructure';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';

import { MISSING_DRAW_DEFINITION, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import type { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import type { SwissPolicy } from '@Types/swissTypes';
import { findExtension } from '@Acquire/findExtension';
import { ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

type GenerateSwissRoundArgs = {
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  swissPolicy?: SwissPolicy;
  participantIds?: string[];
  structureId?: string;
  matchUpIds?: string[];
  scaleName?: string;
  idPrefix?: string;
  isMock?: boolean;
  event: Event;
};

type GenerateSwissRoundResult = ResultType & {
  byeParticipantId?: string;
  roundNumber?: number;
  matchUps?: MatchUp[];
};

export function generateSwissRound(params: GenerateSwissRoundArgs): GenerateSwissRoundResult {
  const { drawDefinition, tournamentRecord, event } = params;
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const structure = params.structureId
    ? findStructure({ drawDefinition, structureId: params.structureId }).structure
    : drawDefinition.structures?.find((s) => isAdHoc({ structure: s }));

  if (!structure) return { error: STRUCTURE_NOT_FOUND };

  const idsResult = getParticipantIds({ ...params, restrictEntryStatus: true });
  if (idsResult.error) return idsResult;
  const participantIds = idsResult.participantIds ?? [];

  // get ratings for initial round seeding
  const adHocRatings = getAdHocRatings({
    participantIds,
    tournamentRecord,
    scaleName: params.scaleName,
    event,
  });

  // get swiss policy from extension or params
  const swissPolicy =
    params.swissPolicy ??
    (findExtension({ element: drawDefinition, name: 'swissPolicy' })?.extension?.value as SwissPolicy | undefined);

  const existingMatchUps = structure.matchUps ?? [];

  const { participantIdPairings, byeParticipantId } = generateSwissPairings({
    allowDraws: swissPolicy?.allowDraws,
    matchUps: existingMatchUps,
    participantIds,
    adHocRatings,
  });

  const result = generateAdHocMatchUps({
    structureId: structure.structureId,
    participantIdPairings,
    matchUpIds: params.matchUpIds,
    idPrefix: params.idPrefix,
    isMock: params.isMock,
    drawDefinition,
    newRound: true,
    event,
  });

  if (result.error) return result;

  return {
    roundNumber: result.roundNumber,
    matchUps: result.matchUps,
    byeParticipantId,
    ...SUCCESS,
  };
}
