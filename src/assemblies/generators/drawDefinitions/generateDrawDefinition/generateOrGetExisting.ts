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

  const genResult: ResultType & {
    drawDefinition?: DrawDefinition;
    positioningReports?: any[];
    structureId?: string;
    conflicts?: any[];
  } =
    (setUpResult.existingQualifyingPlaceholderStructureId &&
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
