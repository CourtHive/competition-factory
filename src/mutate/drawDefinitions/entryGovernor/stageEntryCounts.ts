import { getStageDrawPositionsCount } from '@Query/drawDefinition/getStageDrawPositions';
import { modifyDrawNotice } from '../../notifications/drawNotifications';
import { getQualifiersCount } from '@Query/drawDefinition/getQualifiersCount';
import { modifyEntryProfile } from './modifyEntryProfile';
import {
  stageExists,
  getStageDirectEntriesCount,
  getStageWildcardEntriesCount,
} from '@Query/drawDefinition/stageGetter';

import { ALTERNATE } from '@Constants/entryStatusConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { DRAW_SIZE_MISMATCH, INVALID_STAGE, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { DrawDefinition } from '@Types/tournamentTypes';

export function setStageDrawSize({ stageSequence = 1, drawDefinition, drawSize, stage }) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!stageExists({ drawDefinition, stage })) {
    return { error: INVALID_STAGE };
  }

  const directAcceptanceEntries = getStageDirectEntriesCount({
    drawDefinition,
    stage,
  });

  const { qualifiersCount } = getQualifiersCount({
    drawDefinition,
    stageSequence,
    stage,
  });
  const totalStageDrawPositions = directAcceptanceEntries + qualifiersCount;

  if (drawSize < totalStageDrawPositions) {
    return {
      error: DRAW_SIZE_MISMATCH,
    };
  }

  const { entryProfile } = modifyEntryProfile({
    attributes: [{ [stage]: { drawSize } }],
    drawDefinition,
  });

  modifyDrawNotice({ drawDefinition });
  return { ...SUCCESS, entryProfile };
}

export function setStageAlternatesCount({ alternatesCount, drawDefinition, stage }) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!stageExists({ drawDefinition, stage })) {
    return { error: INVALID_STAGE };
  }

  modifyEntryProfile({
    attributes: [{ [stage]: { alternates: alternatesCount } }],
    drawDefinition,
  });

  if (!alternatesCount) {
    drawDefinition.entries =
      drawDefinition.entries?.filter((entry) => {
        return entry.entryStatus !== ALTERNATE;
      }) ?? [];
  }

  modifyDrawNotice({ drawDefinition });
  return { ...SUCCESS };
}

type SetWildcardsCount = {
  drawDefinition: DrawDefinition;
  wildcardsCount: number;
  stageSequence?: number;
  stage: string;
};
export function setStageWildcardsCount({
  wildcardsCount = 0,
  drawDefinition,
  stageSequence,
  stage,
}: SetWildcardsCount) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!stageExists({ drawDefinition, stage })) {
    return { error: INVALID_STAGE };
  }

  const stageDrawPositions = getStageDrawPositionsCount({
    drawDefinition,
    stage,
  });

  // REMOVE dependency... use link to derive... requires structureId
  const { qualifiersCount } = getQualifiersCount({
    drawDefinition,
    stageSequence,
    stage,
  });
  const wildcardEntriesCount = getStageWildcardEntriesCount({
    drawDefinition,
    stage,
  });
  const directAcceptanceEntriesCount = getStageDirectEntriesCount({
    drawDefinition,
    stage,
  });

  if (wildcardsCount < wildcardEntriesCount) {
    const error = Object.assign(DRAW_SIZE_MISMATCH, {
      message: 'Number of Wildcards cannot be less than number of Wildcards already entered',
    });
    return { error };
  }

  const totalStageEntriesCount = directAcceptanceEntriesCount + wildcardsCount + qualifiersCount;
  if (totalStageEntriesCount > stageDrawPositions) {
    return {
      error: DRAW_SIZE_MISMATCH,
      info: 'Total stage Entries cannot be greater than drawPositions',
    };
  }

  modifyEntryProfile({
    attributes: [{ [stage]: { wildcardsCount } }],
    drawDefinition,
  });

  modifyDrawNotice({ drawDefinition });
  return { ...SUCCESS };
}

export function setStageQualifiersCount({ qualifiersCount = 0, drawDefinition, stage }) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!stageExists({ drawDefinition, stage })) {
    return { error: INVALID_STAGE };
  }
  if (stage !== MAIN) {
    return {
      error: DRAW_SIZE_MISMATCH,
      info: 'qualifiersCount can only be set for main stage',
    };
  }

  modifyEntryProfile({
    attributes: [{ [stage]: { qualifiersCount } }],
    drawDefinition,
  });

  modifyDrawNotice({ drawDefinition });

  return { ...SUCCESS };
}
