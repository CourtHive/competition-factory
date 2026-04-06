import { addMatchUpsNotice, modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { setStageDrawSize } from './entryGovernor/stageEntryCounts';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { resequenceStructures } from './structureGovernor/resequenceStructures';
import { decorateResult } from '@Functions/global/decorateResult';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { DRAW_DEFINITION, OBJECT, OF_TYPE, STRUCTURE, TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { DrawDefinition, DrawLink, Structure } from '@Types/tournamentTypes';
import { MISSING_TARGET_LINK } from '@Constants/errorConditionConstants';
import { QUALIFYING } from '@Constants/drawDefinitionConstants';
import { ERROR, SUCCESS } from '@Constants/resultConstants';

export function attachQualifyingStructure(params) {
  const paramsCheck = checkRequiredParameters(params, [{ [TOURNAMENT_RECORD]: true, [DRAW_DEFINITION]: true }]);
  if (paramsCheck.error) return paramsCheck;
  const { tournamentRecord, drawDefinition, structure, link } = params;

  return attachQualifying({
    tournamentId: tournamentRecord.tournamentId,
    drawDefinition,
    structure,
    link,
  });
}

type AttachQualifyingArgs = {
  drawDefinition: DrawDefinition;
  tournamentId?: string;
  structure: Structure;
  eventId?: string;
  link: DrawLink;
};
export function attachQualifying(params: AttachQualifyingArgs) {
  const paramsCheck = checkRequiredParameters(params, [
    { [DRAW_DEFINITION]: true, [STRUCTURE]: true },
    { link: true, [OF_TYPE]: OBJECT, [ERROR]: MISSING_TARGET_LINK },
  ]);
  if (paramsCheck.error) return paramsCheck;

  const { drawDefinition, tournamentId, structure, eventId, link } = params;

  const targetStructureId = link.target.structureId;
  const result = findStructure({
    drawDefinition,
    structureId: targetStructureId,
  });
  if (result.error)
    return decorateResult({
      stack: 'attachQualifyingStructure',
      context: { targetStructureId },
      result,
    });

  drawDefinition.structures ??= [];
  drawDefinition.links ??= [];
  drawDefinition.structures.push(structure);
  drawDefinition.links.push(link);

  resequenceStructures({ drawDefinition });

  // Set up the QUALIFYING entry profile so addDrawEntries/getValidStage succeeds
  const drawSize = structure.positionAssignments?.length || structure.structures?.[0]?.positionAssignments?.length || 0;
  if (drawSize && structure.stage === QUALIFYING) {
    setStageDrawSize({ drawDefinition, stage: QUALIFYING, drawSize });
  }

  const matchUps = getAllStructureMatchUps({ structure })?.matchUps ?? [];

  addMatchUpsNotice({
    drawDefinition,
    tournamentId,
    matchUps,
    eventId,
  });
  modifyDrawNotice({ drawDefinition, structureIds: [structure.structureId] });

  return { ...SUCCESS };
}
