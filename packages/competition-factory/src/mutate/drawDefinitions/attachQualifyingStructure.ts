import { getAvailableQualifyingTargets } from '@Query/drawDefinition/getAvailableQualifyingTargets';
import { addMatchUpsNotice, modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getLinkQualifiersCount } from '@Query/drawDefinition/getQualifiersCount';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { resequenceStructures } from './structureGovernor/resequenceStructures';
import { decorateResult } from '@Functions/global/decorateResult';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { DRAW_DEFINITION, OBJECT, OF_TYPE, STRUCTURE, TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { MISSING_TARGET_LINK, QUALIFYING_CAPACITY_EXCEEDED } from '@Constants/errorConditionConstants';
import { DrawDefinition, DrawLink, Structure } from '@Types/tournamentTypes';

// constants
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

  // several qualifying structures may feed one round, but never more qualifiers than it has drawPositions
  const targetRoundNumber = link.target.roundNumber ?? 1;
  const targetsResult = getAvailableQualifyingTargets({ drawDefinition, structureId: targetStructureId });
  if (targetsResult.error) return decorateResult({ result: targetsResult, stack: 'attachQualifyingStructure' });
  const target = targetsResult.targets?.find((t) => t.roundNumber === targetRoundNumber);
  const qualifiersCount = getLinkQualifiersCount({ drawDefinition, sourceStructure: structure, link });
  if (!target || qualifiersCount > target.structuralCapacity) {
    return decorateResult({
      result: { error: QUALIFYING_CAPACITY_EXCEEDED },
      context: {
        structuralCapacity: target?.structuralCapacity ?? 0,
        promisedQualifiers: target?.promisedQualifiers,
        roundNumber: targetRoundNumber,
        targetStructureId,
        qualifiersCount,
      },
      stack: 'attachQualifyingStructure',
    });
  }

  drawDefinition.structures ??= [];
  drawDefinition.links ??= [];
  drawDefinition.structures.push(structure);
  drawDefinition.links.push(link);

  resequenceStructures({ drawDefinition });

  // Draw size is now derived from the attached structure itself

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
