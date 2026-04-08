import { generateDrawTypeAndModifyDrawDefinition } from '@Generators/drawDefinitions/generateDrawTypeAndModifyDrawDefinition';
import { generateQualifyingLink } from '@Generators/drawDefinitions/links/generateQualifyingLink';
import { addDrawEntry } from '@Mutate/drawDefinitions/entryGovernor/addDrawEntries';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import structureTemplate from '@Generators/templates/structureTemplate';
import { isAdHocType } from '@Query/drawDefinition/isAdHocType';
import { constantToString } from '@Tools/strings';
import { generateAdHoc } from './generateAdHoc';
import { prepareStage } from './prepareStage';
import { ensureInt } from '@Tools/ensureInt';

// constants and types
import { MAIN, POSITION, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { WITHDRAWN } from '@Constants/entryStatusConstants';
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

  // When qualifyingPlaceholder is requested, create the placeholder structure and link
  // BEFORE positioning so that getByesData/getQualifiersCount can account for qualifier positions
  const { qualifyingPlaceholder, qualifyingProfiles, qualifiersCount } = params;
  if (qualifyingPlaceholder && !qualifyingProfiles?.length && qualifiersCount && drawDefinition) {
    const mainStructureId = drawDefinition.structures?.find(
      (s) => s.stage === MAIN && s.stageSequence === 1,
    )?.structureId;

    if (mainStructureId) {
      const qualifyingStructure = structureTemplate({
        structureName: constantToString(QUALIFYING),
        stage: QUALIFYING,
        qualifyingOnly,
        tieFormat: params.tieFormat,
      });
      const { link } = generateQualifyingLink({
        sourceStructureId: qualifyingStructure.structureId,
        targetStructureId: mainStructureId,
        qualifyingPositions: qualifiersCount,
        sourceRoundNumber: 0,
        linkType: POSITION,
      });
      drawDefinition.structures ??= [];
      drawDefinition.structures.push(qualifyingStructure);
      drawDefinition.links ??= [];
      drawDefinition.links.push(link);
    }
  }

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

  if (isAdHocType(drawType) && params.roundsCount) {
    generateAdHoc({ ...params, drawDefinition, structureId });
  }

  return { drawDefinition, positioningReports, conflicts, structureId };
}

function addEntries(params) {
  const { ignoreStageSpace, drawDefinition, drawEntries, drawType, entries } = params;
  // add all entries to the draw
  for (const entry of entries) {
    // safeguard: never add WITHDRAWN entries to draw definition
    if (entry.entryStatus === WITHDRAWN) continue;
    // if drawEntries and entryStage !== stage ignore
    if (drawEntries && entry.entryStage && entry.entryStage !== MAIN) continue;

    const entryData = {
      ...entry,
      ignoreStageSpace: ignoreStageSpace ?? isAdHocType(drawType),
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
