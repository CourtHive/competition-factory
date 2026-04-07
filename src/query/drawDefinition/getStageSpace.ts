// Query
import { getDrawCompositionConstraints } from './getDrawCompositionConstraints';
import { getStageDrawPositionsAvailable } from './getStageDrawPositions';
import { getStageEntryTypeCount } from './stageGetter';

// Constants
import { ALTERNATE, DIRECT_ACCEPTANCE, WILDCARD } from '@Constants/entryStatusConstants';
import { VOLUNTARY_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  ENTRY_STATUS_NOT_ALLOWED_IN_STAGE,
  ErrorType,
  NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS,
} from '@Constants/errorConditionConstants';

// Types
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';

type GetStageSpaceArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  stageSequence?: number;
  entryStatus?: string;
  event?: Event;
  stage: string;
};

export function getStageSpace({
  entryStatus = DIRECT_ACCEPTANCE,
  tournamentRecord,
  drawDefinition,
  stageSequence,
  event,
  stage,
}: GetStageSpaceArgs): {
  positionsAvailable?: number;
  success?: boolean;
  error?: ErrorType;
} {
  const { constraints } = getDrawCompositionConstraints({ tournamentRecord, event });

  if (entryStatus === ALTERNATE) {
    // Unsanctioned: alternates always allowed
    if (!constraints) return { positionsAvailable: Infinity, ...SUCCESS };
    // Sanctioned: check maxAlternates
    if (constraints.maxAlternates === undefined) return { positionsAvailable: Infinity, ...SUCCESS };

    const alternateCount = getStageEntryTypeCount({ entryStatus: ALTERNATE, drawDefinition, stage });
    if (alternateCount < constraints.maxAlternates) return { positionsAvailable: constraints.maxAlternates - alternateCount, ...SUCCESS };
    return { error: ENTRY_STATUS_NOT_ALLOWED_IN_STAGE };
  }

  // No structures for this stage — unconstrained
  const hasStructures = drawDefinition?.structures?.some((s: any) => s.stage === stage);
  if (!hasStructures) {
    return { positionsAvailable: Infinity, ...SUCCESS };
  }

  const stageDrawPositionsAvailable = getStageDrawPositionsAvailable({
    drawDefinition,
    stageSequence,
    stage,
  });

  const wildcardEntriesCount = getStageEntryTypeCount({ entryStatus: WILDCARD, drawDefinition, stage });
  const directEntriesCount = getStageEntryTypeCount({ entryStatus: DIRECT_ACCEPTANCE, drawDefinition, stage });
  const totalEntriesCount = wildcardEntriesCount + directEntriesCount;
  const stageFull = stageDrawPositionsAvailable > 0 && totalEntriesCount >= stageDrawPositionsAvailable;
  const positionsAvailable = stageDrawPositionsAvailable - totalEntriesCount;

  if (stage !== VOLUNTARY_CONSOLATION && stageFull) {
    return { error: NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS };
  }

  if (entryStatus === WILDCARD) {
    // Unsanctioned: wildcards limited only by available positions
    if (!constraints) {
      if (totalEntriesCount < stageDrawPositionsAvailable) return { ...SUCCESS };
      return { error: NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS };
    }
    // Sanctioned: check maxWildcards
    const maxWildcards = constraints.maxWildcards ?? stageDrawPositionsAvailable;
    if (wildcardEntriesCount < maxWildcards) return { ...SUCCESS };
    return { error: NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS };
  }

  return { positionsAvailable, ...SUCCESS };
}
