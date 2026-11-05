import { generateQualifyingStructure } from '@Generators/drawDefinitions/drawTypes/generateQualifyingStructure';
import { attachQualifyingStructure } from '@Mutate/drawDefinitions/attachQualifyingStructure';

// constants and types
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import {
  MISSING_TOURNAMENT_RECORD,
  INVALID_VALUES,
  MISSING_DRAW_DEFINITION,
  MISSING_STRUCTURE_ID,
} from '@Constants/errorConditionConstants';

type AddQualifyingstructureArgs = {
  qualifyingRoundNumber: number;
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  qualifyingPositions: number;
  targetStructureId: string;
  roundTarget: number;
  structureName: string;
  matchUpType: string;
  drawSize: number;
  drawType: string;
  eventId: string;
  event: Event;
};

export function addQualifyingStructure(params: AddQualifyingstructureArgs) {
  const tournamentRecord = params.tournamentRecord;
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const result = addQualifying(params);
  if (result.error) return result;

  return result;
}

type AddQualifyingArgs = {
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  targetStructureId: string;
  qualifyingRoundNumber: number;
  roundTarget: number;
  eventId: string;
  event: Event;
};

export function addQualifying(params: AddQualifyingArgs) {
  if (!params.drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!params.targetStructureId) return { error: MISSING_STRUCTURE_ID };
  const result = generateQualifyingStructure(params);
  if (result.error) return result;
  const { structure, link } = result;
  if (!structure || !link) return { error: INVALID_VALUES };

  return attachQualifyingStructure({
    tournamentRecord: params.tournamentRecord,
    drawDefinition: params.drawDefinition,
    structure,
    link,
  });
}
