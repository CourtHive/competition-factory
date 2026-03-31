import { generateTieMatchUps } from '@Assemblies/generators/drawDefinitions/tieMatchUps';
import { getGenerators } from '@Assemblies/generators/drawDefinitions/getGenerators';
import { automatedPositioning } from '@Mutate/drawDefinitions/automatedPositioning';
import { resolveTieFormat } from '@Query/hierarchical/tieFormats/resolveTieFormat';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { copyTieFormat } from '@Query/hierarchical/tieFormats/copyTieFormat';
import { getStageEntries } from '@Query/drawDefinition/stageGetter';
import { validateTieFormat } from '@Validators/validateTieFormat';
import { definedAttributes } from '@Tools/definedAttributes';
import { getDrawStructures } from '@Acquire/findStructure';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { constantToString } from '@Tools/strings';
import { nextPowerOf2 } from '@Tools/math';

// Constants and Types
import { EQUIVALENT_ACCEPTANCE_STATUSES } from '@Constants/entryStatusConstants';
import { PlayoffAttributes, SeedingProfile } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  EXISTING_STRUCTURE,
  ErrorType,
  INVALID_DRAW_SIZE,
  MISSING_DRAW_DEFINITION,
  STAGE_SEQUENCE_LIMIT,
  UNRECOGNIZED_DRAW_TYPE,
} from '@Constants/errorConditionConstants';
import {
  DOUBLE_ELIMINATION,
  FEED_IN,
  LUCKY_DRAW,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
  VOLUNTARY_CONSOLATION,
} from '@Constants/drawDefinitionConstants';
import {
  DrawDefinition,
  DrawLink,
  Event,
  Structure,
  TieFormat,
  Tournament,
  EventTypeUnion,
} from '@Types/tournamentTypes';

type GenerateVoluntaryConsolationArgs = {
  playoffAttributes?: PlayoffAttributes;
  tournamentRecord: Tournament;
  seedingProfile?: SeedingProfile;
  drawDefinition: DrawDefinition;
  matchUpType?: EventTypeUnion;
  applyPositioning?: boolean;
  staggeredEntry?: boolean;
  structureOptions?: { groupSize?: number };
  random?: () => number;
  structureName?: string;
  matchUpFormat?: string;
  tieFormat?: TieFormat;
  automated?: boolean;
  placeByes?: boolean;
  drawType?: string;
  isMock?: boolean;
  event?: Event;
};

/**
 * Generates voluntary consolation structures and links without mutating the drawDefinition.
 * Returns { structures, links } for the caller to attach via attachConsolationStructures.
 *
 * This is a generator (not a mutation). In client/server scenarios, the caller should:
 * 1. Call this method to generate structures/links
 * 2. Send the result through attachConsolationStructures via mutationRequest
 * This ensures both client and server receive identical structure/matchUp UUIDs.
 */
export function generateVoluntaryConsolation(params: GenerateVoluntaryConsolationArgs): {
  structures?: Structure[];
  links?: DrawLink[];
  success?: boolean;
  error?: ErrorType;
} {
  const {
    drawType = SINGLE_ELIMINATION,
    applyPositioning = true,
    tournamentRecord,
    staggeredEntry, // optional - specifies main structure FEED_IN for drawTypes CURTIS_CONSOLATION, FEED_IN_CHAMPIONSHIPS, FMLC
    automated,
    placeByes,
    isMock,
    event,
  } = params;

  let drawDefinition = params?.drawDefinition;

  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const stage = VOLUNTARY_CONSOLATION;
  const entries = getStageEntries({
    entryStatuses: EQUIVALENT_ACCEPTANCE_STATUSES,
    stageSequence: 1,
    drawDefinition,
    stage,
  });
  const NON_POWER_OF_2_TYPES = [ROUND_ROBIN, DOUBLE_ELIMINATION, ROUND_ROBIN_WITH_PLAYOFF, LUCKY_DRAW];
  const drawSize = NON_POWER_OF_2_TYPES.includes(drawType) ? entries.length : nextPowerOf2(entries.length);

  if (
    (!staggeredEntry && drawType === FEED_IN && entries.length < 2) ||
    (drawType === ROUND_ROBIN && entries.length < 3)
  )
    return { error: INVALID_DRAW_SIZE };

  let { tieFormat, matchUpType } = params;
  if (tieFormat) {
    const result = validateTieFormat({ tieFormat });
    if (result.error) return result;
  }

  tieFormat = copyTieFormat(tieFormat ?? resolveTieFormat({ drawDefinition })?.tieFormat);
  matchUpType = matchUpType ?? drawDefinition.matchUpType;

  const { structures: stageStructures } = getDrawStructures({
    stageSequence: 1,
    drawDefinition,
    stage,
  });

  // invalid to have more than one existing VOLUNTARY_CONSOLATION structure
  const structureCount = stageStructures.length;
  if (structureCount > 1) return { error: STAGE_SEQUENCE_LIMIT };

  // invalid to already have matchUps generated for any existing structure
  if (stageStructures?.[0]?.matchUps?.length) return { error: EXISTING_STRUCTURE };
  const structureId = stageStructures?.[0]?.structureId;

  Object.assign(
    params,
    definedAttributes({
      structureName: params.structureName ?? constantToString(VOLUNTARY_CONSOLATION),
      structureId,
      matchUpType,
      tieFormat,
      drawSize,
      stage,
    }),
  );

  const result = getGenerators(params);
  if (result.error) return result;

  const generator = result.generators[drawType];
  if (!generator) return { error: UNRECOGNIZED_DRAW_TYPE };

  const generatorResult = generator?.();
  if (generatorResult.error) return generatorResult;

  const { structures, links } = generatorResult;

  const matchUps = structures.flatMap((structure) => getAllStructureMatchUps({ structure }).matchUps);

  if (tieFormat) {
    matchUps.forEach((matchUp) => {
      const { tieMatchUps } = generateTieMatchUps({ matchUp, tieFormat, isMock });
      Object.assign(matchUp, { tieMatchUps, matchUpType });
    });
  }

  // Work on a deep copy so the original drawDefinition is never mutated.
  // The caller is responsible for attaching via attachConsolationStructures.
  const workingDD = makeDeepCopy(drawDefinition, false, true);

  workingDD.links ??= [];
  if (links.length) workingDD.links.push(...links);
  const generatedStructureIds = new Set(structures.map(({ structureId }) => structureId));
  workingDD.structures ??= [];
  const existingStructureIds = new Set(workingDD.structures.map(({ structureId }) => structureId));

  // replace any existing structures with newly generated structures
  // this is done because it is possible that a consolation structure exists without matchUps
  workingDD.structures = workingDD.structures.map((structure) => {
    return generatedStructureIds.has(structure.structureId)
      ? structures.find(({ structureId }) => structureId === structure.structureId)
      : structure;
  });

  const newStructures = structures.filter(({ structureId }) => !existingStructureIds.has(structureId));
  if (newStructures.length) workingDD.structures.push(...newStructures);

  if (automated && applyPositioning) {
    const primaryStructure = structures[0];
    const multipleStructures = (primaryStructure?.structures?.length || 0) > 1;

    automatedPositioning({
      structureId: structureId || primaryStructure?.structureId,
      seedingProfile: params.seedingProfile,
      drawDefinition: workingDD,
      random: params.random,
      multipleStructures,
      applyPositioning,
      tournamentRecord,
      placeByes,
      event,
    });
  }

  // Return the structures from the working drawDefinition (includes positioning results)
  const returnStructures = workingDD.structures.filter(({ structureId: sid }) => generatedStructureIds.has(sid));
  return { links, structures: returnStructures, ...SUCCESS };
}
