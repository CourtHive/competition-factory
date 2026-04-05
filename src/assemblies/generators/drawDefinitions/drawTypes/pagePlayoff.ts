import { structureTemplate } from '../../templates/structureTemplate';
import { pagePlayoffLinks } from '../links/pagePlayoffLinks';
import { treeMatchUps } from './eliminationTree';

// Constants and types
import { INVALID_CONFIGURATION } from '@Constants/errorConditionConstants';
import { MAIN, PLAY_OFF } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { Structure } from '@Types/tournamentTypes';

export function generatePagePlayoff({
  finishingPositionOffset = 0,
  stage = MAIN,
  structureName,
  matchUpType,
  idPrefix,
  drawSize,
  isMock,
  uuids,
}: {
  finishingPositionOffset?: number;
  structureName?: string;
  matchUpType?: string;
  idPrefix?: string;
  drawSize: number;
  isMock?: boolean;
  stage?: string;
  uuids?: string[];
}) {
  if (drawSize !== 4) {
    return { error: INVALID_CONFIGURATION, info: 'PAGE_PLAYOFF requires exactly 4 participants' };
  }

  const structures: Structure[] = [];

  // Structure 1: Qualifier 1 (seed 1 vs seed 2)
  const { matchUps: q1MatchUps } = treeMatchUps({
    idPrefix: idPrefix && `${idPrefix}-q1`,
    drawSize: 2,
    matchUpType,
    isMock,
    uuids,
  });
  const q1Structure = structureTemplate({
    structureName: structureName ? `${structureName} Qualifier 1` : 'Qualifier 1',
    structureAbbreviation: 'Q1',
    structureId: uuids?.pop(),
    matchUps: q1MatchUps,
    stageSequence: 1,
    matchUpType,
    stage,
  });
  structures.push(q1Structure);

  // Structure 2: Eliminator (seed 3 vs seed 4)
  const { matchUps: eliminatorMatchUps } = treeMatchUps({
    finishingPositionOffset: finishingPositionOffset + 2,
    idPrefix: idPrefix && `${idPrefix}-el`,
    drawSize: 2,
    matchUpType,
    isMock,
    uuids,
  });
  const eliminatorStructure = structureTemplate({
    structureName: structureName ? `${structureName} Eliminator` : 'Eliminator',
    structureAbbreviation: 'EL',
    structureId: uuids?.pop(),
    matchUps: eliminatorMatchUps,
    stageSequence: 2,
    matchUpType,
    stage,
  });
  structures.push(eliminatorStructure);

  // Structure 3: Qualifier 2 (Q1 loser vs Eliminator winner)
  const { matchUps: q2MatchUps } = treeMatchUps({
    finishingPositionOffset: finishingPositionOffset + 1,
    idPrefix: idPrefix && `${idPrefix}-q2`,
    drawSize: 2,
    matchUpType,
    isMock,
    uuids,
  });
  const q2Structure = structureTemplate({
    structureName: structureName ? `${structureName} Qualifier 2` : 'Qualifier 2',
    structureAbbreviation: 'Q2',
    structureId: uuids?.pop(),
    stage: PLAY_OFF,
    matchUps: q2MatchUps,
    stageSequence: 3,
    matchUpType,
  });
  structures.push(q2Structure);

  // Structure 4: Final (Q1 winner vs Q2 winner)
  const { matchUps: finalMatchUps } = treeMatchUps({
    finishingPositionOffset,
    idPrefix: idPrefix && `${idPrefix}-fi`,
    drawSize: 2,
    matchUpType,
    isMock,
    uuids,
  });
  const finalStructure = structureTemplate({
    structureName: structureName ? `${structureName} Final` : 'Final',
    structureAbbreviation: 'F',
    structureId: uuids?.pop(),
    matchUps: finalMatchUps,
    stage: PLAY_OFF,
    stageSequence: 4,
    matchUpType,
  });
  structures.push(finalStructure);

  const links = pagePlayoffLinks({
    eliminatorStructure,
    q1Structure,
    q2Structure,
    finalStructure,
  });

  return {
    structures,
    links,
    ...SUCCESS,
  };
}
