import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { structureAssignedDrawPositions } from './positionsGetter';
import { getQualifiersCount } from './getQualifiersCount';
import { getStageEntries } from './stageGetter';

// constants
import { STRUCTURE_SELECTED_STATUSES } from '@Constants/entryStatusConstants';
import { CONSOLATION, CONTAINER } from '@Constants/drawDefinitionConstants';

// types
import type { DrawDefinition, Event, Structure } from '@Types/tournamentTypes';
import type { MatchUpsMap } from '@Types/factoryTypes';

type GetByesDataArgs = {
  provisionalPositioning?: boolean;
  drawDefinition: DrawDefinition;
  // positions reserved for qualifiers when no link into the structure accounts for them
  qualifiersCount?: number;
  matchUpsMap?: MatchUpsMap;
  structure: Structure;
  event?: Event;
};

export function getByesData({
  qualifiersCount: reservedQualifiersCount,
  provisionalPositioning,
  drawDefinition,
  matchUpsMap,
  structure,
  event,
}: GetByesDataArgs) {
  const matchUpFilters = { isCollectionMatchUp: false };
  const { matchUps, roundMatchUps } = getAllStructureMatchUps({
    afterRecoveryTimes: false,
    provisionalPositioning,
    drawDefinition,
    matchUpFilters,
    matchUpsMap,
    structure,
    event,
  });
  const firstRoundMatchUps = roundMatchUps?.[1] ?? [];

  // firstRoundMatchUps don't work for CONTAINER / ROUND_ROBIN structures

  const isRoundRobin = structure?.structureType === CONTAINER;
  const relevantMatchUps = isRoundRobin ? matchUps : firstRoundMatchUps;

  // maxByes for RR can only be the number of structures... no more than one bye per structure
  const maxByes = isRoundRobin ? structure?.structures?.length || 0 : matchUps.length;

  // get stage/stageSequence Entries and qualifiers
  const { structureId, stage, stageSequence } = structure;
  const entries = getStageEntries({
    entryStatuses: STRUCTURE_SELECTED_STATUSES,
    provisionalPositioning,
    drawDefinition,
    stageSequence,
    structureId,
    stage,
  });

  const { qualifiersCount: derivedQualifiersCount } = getQualifiersCount({
    provisionalPositioning,
    drawDefinition,
    stageSequence,
    structureId,
    stage,
  });
  const qualifiersCount = derivedQualifiersCount || reservedQualifiersCount || 0;
  const entriesCount = entries.length + qualifiersCount;

  // # Byes = drawSize (positionAssignments) - total entries
  // const { positionAssignments, qualifierPositions, byePositions, unassignedPositions } = structureAssignedDrawPositions({structure});
  const { positionAssignments, unassignedPositions } = structureAssignedDrawPositions({ structure });
  const unassignedDrawPositions = unassignedPositions?.map((position) => position.drawPosition);
  const placedByes = positionAssignments?.filter((assignment) => assignment.bye).length;
  const placedByePositions = positionAssignments
    ?.filter((assignment) => assignment.bye)
    .map((assignment) => assignment.drawPosition);

  const positionsToAvoidDoubleBye = relevantMatchUps
    .map((matchUp) => matchUp.drawPositions)
    .filter((drawPositions) => {
      return drawPositions?.reduce((noBye, drawPosition) => !placedByePositions?.includes(drawPosition) && noBye, true);
    })
    .flat(Infinity)
    .filter((drawPosition) => unassignedDrawPositions?.includes(drawPosition));

  const drawSize = positionAssignments?.length;
  let byesCount = drawSize ? drawSize - entriesCount : 0;
  if (byesCount > maxByes && structure.stageSequence === 1 && structure.stage !== CONSOLATION) {
    byesCount = maxByes;
  }

  return {
    placedByes,
    byesCount,
    relevantMatchUps,
    placedByePositions,
    roundMatchUps,
    positionsToAvoidDoubleBye,
  };
}
