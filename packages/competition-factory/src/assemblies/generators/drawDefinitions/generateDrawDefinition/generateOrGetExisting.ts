import { checkSanctionedEntryLimits } from '@Query/drawDefinition/checkSanctionedEntryLimits';
import { processExistingDrawDefinition } from './processExistingDrawDefinition';
import { generateNewDrawDefinition } from './generateNewDrawDefinition';
import { decorateResult } from '@Functions/global/decorateResult';
import { setUpDrawGeneration } from './setUpDrawGeneration';

// constants
import { QUALIFYING } from '@Constants/drawDefinitionConstants';
import { WITHDRAWN } from '@Constants/entryStatusConstants';

// types
import { DrawMaticArgs, EntryNotPlaced, PolicyDefinitions, ResultType } from '@Types/factoryTypes';
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
  entriesNotPlaced?: EntryNotPlaced[];
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
  let drawDefinition: DrawDefinition | undefined;
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

  const processExisting = !!(setUpResult.existingQualifyingPlaceholderStructureId || addingQualifyingToExistingMain);

  // Qualifying added to an existing draw with no drawEntries takes the event's QUALIFYING entries, as a new draw
  // generated from the event's entries does: the first N that fit, the rest reported as ENTRIES_NOT_PLACED. A draw
  // that already holds QUALIFYING entries (drawEntries carried from the main's generation) keeps those instead.
  const existingHoldsQualifyingEntries = !!existingDrawDefinition?.entries?.some(
    ({ entryStage }) => entryStage === QUALIFYING,
  );
  const eventQualifyingEntries =
    processExisting && !params.drawEntries && !existingHoldsQualifyingEntries
      ? (params.eventEntries ?? []).filter(
          ({ entryStage, entryStatus }) => entryStage === QUALIFYING && entryStatus !== WITHDRAWN,
        )
      : undefined;

  // Refuse before anything is generated: the entries this generation adds must fit the sanctioning constraints
  // (maxWildcards, maxAlternates). processExistingDrawDefinition adds only the QUALIFYING drawEntries (or the event's);
  // generateNewDrawDefinition adds every entry that is not WITHDRAWN. Caller escape flags do not grant sanction permission.
  {
    const entriesToAdd = processExisting
      ? (params.drawEntries ?? eventQualifyingEntries ?? []).filter(({ entryStage }) => entryStage === QUALIFYING)
      : entries.filter(({ entryStatus }) => entryStatus !== WITHDRAWN);
    const limitsResult = checkSanctionedEntryLimits({
      drawDefinition: setUpResult.existingDrawDefinition,
      tournamentRecord: params.tournamentRecord,
      entries: entriesToAdd,
      event: params.event,
    });
    if (limitsResult.error) return decorateResult({ result: limitsResult, stack });
  }

  const genResult: ResultType & {
    entriesNotPlaced?: EntryNotPlaced[];
    drawDefinition?: DrawDefinition;
    positioningReports?: any[];
    structureId?: string;
    conflicts?: any[];
  } =
    (processExisting && processExistingDrawDefinition({ ...params, ...setUpResult, eventQualifyingEntries })) ||
    generateNewDrawDefinition({ ...params, ...setUpResult, entries });
  if (genResult.error) return decorateResult({ result: genResult, stack });

  if (genResult.positioningReports?.length) positioningReports.push(...(genResult.positioningReports ?? []));
  if (genResult.conflicts?.length) conflicts.push(...(genResult.conflicts ?? []));

  drawDefinition = genResult.drawDefinition;
  structureId = genResult.structureId;

  return {
    entriesNotPlaced: genResult.entriesNotPlaced,
    existingDrawDefinition,
    positioningReports,
    drawDefinition,
    structureId,
    conflicts,
    entries,
  };
}
