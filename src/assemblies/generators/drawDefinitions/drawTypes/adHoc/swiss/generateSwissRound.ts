// Query
import { getCompetitionState } from '@Query/drawDefinition/competition/getCompetitionState';
import { getCompetitionPolicy } from '@Query/drawDefinition/competition/getCompetitionPolicy';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';

// Generators
import { getParticipantIds } from '../drawMatic/getParticipantIds';
import { generateAdHocMatchUps } from '../generateAdHocMatchUps';
import { getAdHocRatings } from '../drawMatic/getAdHocRatings';
import { generateSwissPairings } from './swissPairing';

// Acquire
import { findStructure } from '@Acquire/findStructure';
import { findExtension } from '@Acquire/findExtension';

// Constants
import { MISSING_DRAW_DEFINITION, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { QUALIFYING, WINNER } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import type { SwissPolicy } from '@Types/swissTypes';
import { ResultType } from '@Types/factoryTypes';

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
    : // Prefer a MAIN stage ad-hoc structure (e.g. Swiss main) over any other (qualifying placeholder)
      (drawDefinition.structures?.find((s) => s.stage === 'MAIN' && isAdHoc({ structure: s })) ??
      drawDefinition.structures?.find((s) => isAdHoc({ structure: s })));

  if (!structure) return { error: STRUCTURE_NOT_FOUND };

  const idsResult = getParticipantIds({ ...params, restrictEntryStatus: true, targetStage: structure.stage });
  if (idsResult.error) return idsResult;
  const entryParticipantIds = idsResult.participantIds ?? [];

  // Include qualifier winners from linked qualifying structures.
  // Collected from either positionAssignments (if already advanced) or by reading
  // the final round of qualifying matchUps (for Swiss/ad-hoc main structures that
  // can't use the standard qualifierProgression flow which requires matchUps).
  const positionParticipantIds =
    structure.positionAssignments
      ?.map((pa: any) => pa.participantId)
      .filter((pid: string | undefined): pid is string => !!pid) ?? [];

  const qualifierWinnerIds = getQualifierWinners({ drawDefinition, targetStructureId: structure.structureId });

  const participantIds = Array.from(
    new Set([...entryParticipantIds, ...positionParticipantIds, ...qualifierWinnerIds]),
  );

  // Competition policy: use dynamic form ratings when available
  const { competitionPolicy } = getCompetitionPolicy({ tournamentRecord, drawDefinition, event });
  const { competitionState } = competitionPolicy
    ? getCompetitionState({ drawDefinition })
    : { competitionState: undefined };

  let adHocRatings: Record<string, number>;
  if (competitionPolicy && competitionState && competitionPolicy.pairingPolicy.ratingSource === 'DYNAMIC_FORM') {
    adHocRatings = {};
    for (const [pid, pState] of Object.entries(competitionState.participantStates)) {
      adHocRatings[pid] = pState.dynamicFormRating;
    }
  } else {
    // get ratings for initial round seeding
    adHocRatings = getAdHocRatings({
      participantIds,
      tournamentRecord,
      scaleName: params.scaleName,
      event,
    });
  }

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

/**
 * Collect participantIds of qualifying structure winners for a given target structure.
 * Finds all WINNER-type links targeting the structure whose source is a QUALIFYING structure,
 * then reads the winners of the qualifying matchUps at the source round.
 */
function getQualifierWinners({
  drawDefinition,
  targetStructureId,
}: {
  drawDefinition: DrawDefinition;
  targetStructureId: string;
}): string[] {
  const links = drawDefinition.links ?? [];
  const relevantLinks = links.filter(
    (link: any) => link.linkType === WINNER && link.target?.structureId === targetStructureId,
  );
  const winnerIds: string[] = [];
  for (const link of relevantLinks) {
    const sourceStructure = drawDefinition.structures?.find((s) => s.structureId === (link as any).source?.structureId);
    if (sourceStructure?.stage !== QUALIFYING) continue;

    const sourceRound = (link as any).source?.roundNumber;
    // roundNumber 0 is the placeholder link (no qualifying structure generated yet)
    if (!sourceRound) continue;

    const { matchUps } = getAllStructureMatchUps({
      matchUpFilters: { roundNumbers: [sourceRound], isCollectionMatchUp: false, hasWinningSide: true },
      afterRecoveryTimes: false,
      structure: sourceStructure,
      inContext: true,
    });
    for (const m of matchUps ?? []) {
      const winningSide = m.sides?.find((s: any) => s?.sideNumber === m.winningSide);
      if (winningSide?.participantId) winnerIds.push(winningSide.participantId);
    }
  }
  return winnerIds;
}
