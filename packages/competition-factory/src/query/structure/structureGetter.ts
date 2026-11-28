import { findStructure, getDrawStructures } from '@Acquire/findStructure';

// constants and types
import { MISSING_DRAW_DEFINITION, MISSING_EVENT, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { DrawDefinition, Structure, Event, StageTypeUnion, Tournament } from '@Types/tournamentTypes';

type GetPlayoffStructuresArgs = {
  drawDefinition: DrawDefinition;
  structureId: string;
};

export function getPlayoffStructures({ drawDefinition, structureId }: GetPlayoffStructuresArgs) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const { structure } = findStructure({ drawDefinition, structureId });

  const targetStructureIds = (drawDefinition?.links ?? [])
    .filter((link) => link.source?.structureId === structureId)
    .map((link) => link.target?.structureId);

  const playoffStructures = (drawDefinition?.structures ?? []).filter((structure) =>
    targetStructureIds.includes(structure.structureId),
  );

  return { playoffStructures, structure };
}

type GetEventStructuresArgs = {
  withStageGrouping?: boolean;
  stageSequences?: string[];
  stageSequence?: number;
  roundTarget?: number;
  stages?: StageTypeUnion[];
  event: Event;
  stage?: StageTypeUnion;
};
export function getEventStructures({
  withStageGrouping,
  stageSequences,
  stageSequence,
  roundTarget,
  stages,
  event,
  stage,
}: GetEventStructuresArgs) {
  if (!event) return { error: MISSING_EVENT };
  const stageStructures = {};
  const structures: Structure[] = [];

  for (const drawDefinition of event.drawDefinitions ?? []) {
    const { structures: drawStructures, stageStructures: drawStageStructures } = getDrawStructures({
      withStageGrouping,
      stageSequences,
      drawDefinition,
      stageSequence,
      roundTarget,
      stages,
      stage,
    });

    structures.push(...drawStructures);
    if (drawStageStructures) {
      for (const stage of Object.keys(drawStageStructures)) {
        if (!stageStructures[stage]) stageStructures[stage] = [];
        stageStructures[stage].push(...drawStageStructures[stage]);
      }
    }
  }

  return { structures, stageStructures };
}

type GetTournamentStructuresArgs = {
  withStageGrouping?: boolean;
  tournamentRecord: Tournament;
  stageSequences?: string[];
  stageSequence?: number;
  roundTarget?: number;
  stages?: StageTypeUnion[];
  stage?: StageTypeUnion;
};
export function getTournamentStructures({
  withStageGrouping,
  tournamentRecord,
  stageSequences,
  stageSequence,
  roundTarget,
  stages,
  stage,
}: GetTournamentStructuresArgs) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  const stageStructures = {};
  const structures: Structure[] = [];

  for (const event of tournamentRecord.events ?? []) {
    const { structures: eventStructures, stageStructures: eventStageStructures } = getEventStructures({
      withStageGrouping,
      stageSequences,
      stageSequence,
      roundTarget,
      stages,
      event,
      stage,
    });

    if (eventStructures) structures.push(...eventStructures);
    if (eventStageStructures) {
      for (const stage of Object.keys(eventStageStructures)) {
        if (!stageStructures[stage]) stageStructures[stage] = [];
        stageStructures[stage].push(...eventStageStructures[stage]);
      }
    }
  }

  return { structures, stageStructures };
}
