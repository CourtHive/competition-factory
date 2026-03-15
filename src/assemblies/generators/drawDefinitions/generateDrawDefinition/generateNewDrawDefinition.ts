import { generateDrawTypeAndModifyDrawDefinition } from '@Generators/drawDefinitions/generateDrawTypeAndModifyDrawDefinition';
import { addDrawEntry } from '@Mutate/drawDefinitions/entryGovernor/addDrawEntries';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { generateAdHoc } from './generateAdHoc';
import { prepareStage } from './prepareStage';
import { ensureInt } from '@Tools/ensureInt';

// constants and types
import { AD_HOC, MAIN } from '@Constants/drawDefinitionConstants';
import { DrawDefinition } from '@Types/tournamentTypes';
import { ResultType } from '@Types/factoryTypes';

export function generateNewDrawDefinition(params): ResultType & {
  drawDefinition?: DrawDefinition;
  positioningReports?: any[];
  structureId?: string;
  conflicts?: any[];
} {
  const drawTypeResult = generateDrawTypeAndModifyDrawDefinition({
    ...params,
    modifyOriginal: false,
  });
  if (drawTypeResult.error) return drawTypeResult;
  const drawDefinition = drawTypeResult.drawDefinition;

  const {
    suppressDuplicateEntries = true,
    ignoreStageSpace,
    appliedPolicies,
    qualifyingOnly,
    seedingProfile,
    participants,
    drawEntries,
    placeByes,
    drawSize,
    drawType,
    entries,
  } = params;

  const positioningReports: any[] = [];
  let conflicts: any[] = [];

  const addResult = addEntries({
    suppressDuplicateEntries,
    ignoreStageSpace,
    drawDefinition,
    drawEntries,
    drawType,
    entries,
  });
  if (addResult.error) return addResult;

  // temporary until seeding is supported in LUCKY_DRAW
  const seedsCount = isLuckyBasedDraw(drawType) ? 0 : ensureInt(params.seedsCount ?? 0);

  const structureResult = prepareStage({
    ...params,
    qualifyingOnly: !drawSize || qualifyingOnly, // ooo!! If there is no drawSize then MAIN is not being generated
    appliedPolicies,
    drawDefinition,
    seedingProfile,
    participants,
    stage: MAIN,
    seedsCount,
    placeByes,
    drawSize,
    entries,
  });

  if (structureResult.error && !structureResult.conflicts) return structureResult;
  if (structureResult.positioningReport?.length) positioningReports.push({ [MAIN]: structureResult.positioningReport });

  const structureId = structureResult.structureId;
  if (structureResult.conflicts) conflicts = structureResult.conflicts;

  if (drawType === AD_HOC && params.roundsCount) {
    generateAdHoc({ ...params, drawDefinition, structureId });
  }

  return { drawDefinition, positioningReports, conflicts, structureId };
}

function addEntries(params) {
  const { ignoreStageSpace, drawDefinition, drawEntries, drawType, entries } = params;
  // add all entries to the draw
  for (const entry of entries) {
    // if drawEntries and entryStage !== stage ignore
    if (drawEntries && entry.entryStage && entry.entryStage !== MAIN) continue;

    const entryData = {
      ...entry,
      ignoreStageSpace: ignoreStageSpace ?? drawType === AD_HOC,
      entryStage: entry.entryStage ?? MAIN,
      event: params.event,
      drawDefinition,
      drawType,
    };
    const result = addDrawEntry(entryData);
    if (drawEntries && result.error) {
      // only report errors with drawEntries
      // if entries are taken from event.entries assume stageSpace is not available
      return result;
    }
  }

  return { error: undefined };
}
