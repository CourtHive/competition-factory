import { unique } from '@Tools/arrays';
import { UUID } from '@Tools/UUID';

// constants and types
import { MatchUp, SeedAssignment, Structure, TieFormat } from '@Types/tournamentTypes';
import { ROUND_OUTCOME } from '@Constants/drawDefinitionConstants';
import { SeedingProfile } from '@Types/factoryTypes';

type StructureTemplateArgs = {
  hasExistingDrawDefinition?: boolean;
  seedAssignments?: SeedAssignment[];
  qualifyingRoundNumber?: number;
  structureAbbreviation?: string;
  seedingProfile?: SeedingProfile;
  finishingPosition?: string;
  structures?: Structure[];
  qualifyingOnly?: boolean;
  structureOrder?: number;
  matchUpFormat?: string;
  stageSequence?: number;
  structureName?: string;
  structureType?: string;
  tieFormat?: TieFormat;
  matchUpType?: string;
  matchUps?: MatchUp[];
  roundOffset?: number;
  structureId?: string;
  roundLimit?: number;
  stageOrder?: number;
  stage?: string;
};

export const structureTemplate = ({
  finishingPosition = ROUND_OUTCOME,
  hasExistingDrawDefinition,
  qualifyingRoundNumber,
  structureAbbreviation,
  seedAssignments = [],
  stageSequence = 1,
  qualifyingOnly,
  structureOrder,
  seedingProfile,
  matchUpFormat,
  structureType,
  structureName,
  matchUps = [],
  matchUpType,
  structureId,
  roundOffset,
  roundLimit,
  stageOrder,
  structures,
  tieFormat,
  stage,
}: StructureTemplateArgs) => {
  const structure: any = {
    structureId: structureId ?? UUID(),
    structureAbbreviation,
    finishingPosition,
    seedAssignments,
    matchUpFormat,
    stageSequence,
    structureName,
  };

  // CONSIDER: when tieFormatId is implemented, tieFormats should not be attached to structures
  if (qualifyingOnly || (hasExistingDrawDefinition && tieFormat)) structure.tieFormat = tieFormat; // FUTURE: only attach if differs from drawDefinition.tieFormat
  if (structureOrder) structure.structureOrder = structureOrder;
  if (structureType) structure.structureType = structureType;
  if (seedingProfile) {
    if (typeof seedingProfile === 'string') {
      structure.seedingProfile = seedingProfile;
    } else if (typeof seedingProfile === 'object' && typeof seedingProfile.positioning === 'string') {
      structure.seedingProfile = seedingProfile.positioning;
    }
  }
  if (matchUpType) structure.matchUpType = matchUpType;
  if (roundOffset) structure.roundOffset = roundOffset;
  if (stageOrder) structure.stageOrder = stageOrder;
  if (roundLimit) structure.roundLimit = roundLimit;
  if (stage) structure.stage = stage;

  if (qualifyingRoundNumber) structure.qualifyingRoundNumber = qualifyingRoundNumber;

  const drawPositions = matchUps.flatMap(({ drawPositions }) => drawPositions).filter(Boolean);

  if (structures) {
    structure.structures = structures;
  } else {
    structure.matchUps = matchUps;
    structure.positionAssignments = unique(drawPositions)
      .sort((a, b) => a - b)
      .map((drawPosition) => ({ drawPosition }));
  }

  return structure;
};

export default structureTemplate;
