import { processExistingDrawDefinition } from './processExistingDrawDefinition';
import { generateNewDrawDefinition } from './generateNewDrawDefinition';
import { decorateResult } from '@Functions/global/decorateResult';
import { setUpDrawGeneration } from './setUpDrawGeneration';

// constants and types
import { DrawMaticArgs, PolicyDefinitions, ResultType } from '@Types/factoryTypes';
import {
  DrawDefinition,
  DrawTypeUnion,
  Entry,
  Event,
  EventTypeUnion,
  Participant,
  TieFormat,
  Tournament,
} from '@Types/tournamentTypes';

type GenerateOrGetExisting = {
  automated?: boolean | { seedsOnly: boolean };
  policyDefinitions?: PolicyDefinitions;
  suppressDuplicateEntries?: boolean;
  appliedPolicies?: PolicyDefinitions;
  tournamentRecord: Tournament;
  matchUpType?: EventTypeUnion;
  participants?: Participant[];
  ignoreStageSpace?: boolean;
  qualifyingProfiles?: any[];
  drawMatic?: DrawMaticArgs;
  qualifyingOnly?: boolean;
  drawType?: DrawTypeUnion;
  processCodes?: string[];
  random?: () => number;
  seedingProfile?: string;
  matchUpFormat?: string;
  eventEntries?: Entry[];
  drawEntries?: Entry[];
  tieFormat?: TieFormat;
  roundsCount?: number;
  seedsCount?: number;
  placeByes?: boolean;
  drawSize?: number;
  idPrefix?: string;
  isMock?: boolean;
  uuids?: string[];
  drawId?: string;
  event: Event;
};

export function generateOrGetExisting(params: GenerateOrGetExisting): ResultType & {
  existingDrawDefinition?: DrawDefinition;
  drawDefinition?: DrawDefinition;
  positioningReports?: any[];
  drawTypeResult?: any;
  structureId?: string;
  entries?: Entry[];
  conflicts?: any[];
} {
  const stack = 'generateOrGetExisting';
  const positioningReports: any[] = [];
  const conflicts: any[] = [];

  const setUpResult = setUpDrawGeneration(params);
  if (setUpResult.error) return decorateResult({ result: setUpResult, stack });

  const existingDrawDefinition = setUpResult.existingDrawDefinition;
  let drawDefinition: any;
  let structureId: string | undefined;

  const entries = params.drawEntries ?? params.eventEntries ?? [];

  // Route to processExistingDrawDefinition when adding qualifying to a draw that
  // already has a real main structure but no qualifying placeholder. Without
  // this, generateNewDrawDefinition tries to regenerate the main and collides
  // with the existing one — surfacing as EXISTING_STAGE (or, when the existing
  // main lacks matchUps but has qualifier slots, as INVALID_DRAW_SIZE / a
  // STRUCTURE_NOT_FOUND in prepareStage for the QUALIFYING stage).
  const addingQualifyingToExistingMain = !!(
    setUpResult.existingDrawDefinition &&
    setUpResult.structureId &&
    !setUpResult.existingQualifyingPlaceholderStructureId &&
    params.qualifyingProfiles?.length
  );

  const genResult: ResultType & {
    drawDefinition?: DrawDefinition;
    positioningReports?: any[];
    structureId?: string;
    conflicts?: any[];
  } =
    ((setUpResult.existingQualifyingPlaceholderStructureId || addingQualifyingToExistingMain) &&
      processExistingDrawDefinition({ ...params, ...setUpResult })) ||
    generateNewDrawDefinition({ ...params, ...setUpResult, entries });
  if (genResult.error) return decorateResult({ result: genResult, stack });

  if (genResult.positioningReports?.length) positioningReports.push(...(genResult.positioningReports ?? []));
  if (genResult.conflicts?.length) conflicts.push(...(genResult.conflicts ?? []));

  drawDefinition = genResult.drawDefinition;
  structureId = genResult.structureId;

  return {
    existingDrawDefinition,
    positioningReports,
    drawDefinition,
    structureId,
    conflicts,
    entries,
  };
}
