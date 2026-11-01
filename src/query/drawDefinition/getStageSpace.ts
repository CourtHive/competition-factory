// Query
import { getDrawCompositionConstraints } from './getDrawCompositionConstraints';
import { getStageEntryTypeCount, getStagePlaceTakingEntriesCount } from './stageGetter';
import { getStageDrawPositionsBreakdown } from './getStageDrawPositions';

// constants
import { ALTERNATE, DIRECT_ACCEPTANCE, QUALIFIER, WILDCARD } from '@Constants/entryStatusConstants';
import { VOLUNTARY_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  ENTRY_STATUS_NOT_ALLOWED_IN_STAGE,
  ErrorType,
  NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS,
} from '@Constants/errorConditionConstants';

// types
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';

type GetStageSpaceArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  stageSequence?: number;
  entryStatus?: string;
  event?: Event;
  stage: string;
};

/**
 * Whether a stage has room for another entry of `entryStatus`, and how many places are left.
 *
 * The places left to direct entries are the stage's draw positions less its qualifier positions; every
 * entry with a status in PLACE_TAKING_ENTRY_STATUSES (direct entries and lucky losers) counts against
 * them, the same list `getEventEntrySpace` counts. QUALIFIER entries count against the qualifier
 * positions only. ALTERNATE entries are limited only by a sanctioned `maxAlternates`, WILDCARD entries
 * additionally by a sanctioned `maxWildcards`. The sanctioning constraints resolve only when both
 * `tournamentRecord` and `event` are passed; without them the stage is treated as unsanctioned.
 */
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
    if (alternateCount < constraints.maxAlternates)
      return { positionsAvailable: constraints.maxAlternates - alternateCount, ...SUCCESS };
    return { error: ENTRY_STATUS_NOT_ALLOWED_IN_STAGE };
  }

  // No structures for this stage — unconstrained
  const hasStructures = drawDefinition?.structures?.some((s) => s.stage === stage);
  if (!hasStructures) {
    return { positionsAvailable: Infinity, ...SUCCESS };
  }

  // positionsAvailable: the stage's draw positions less those held for qualifiers
  const { positionsAvailable: stageDrawPositionsAvailable, qualifierPositions } = getStageDrawPositionsBreakdown({
    drawDefinition,
    stageSequence,
    stage,
  });

  if (entryStatus === QUALIFIER) {
    // qualifiers fill the qualifier positions, never the places left to direct entries
    const qualifierEntriesCount = getStageEntryTypeCount({ entryStatus: QUALIFIER, drawDefinition, stage });
    const qualifierPositionsAvailable = qualifierPositions - qualifierEntriesCount;
    if (stage !== VOLUNTARY_CONSOLATION && qualifierPositionsAvailable <= 0) {
      return { error: NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS };
    }
    return { positionsAvailable: qualifierPositionsAvailable, ...SUCCESS };
  }

  // every entry taking a place left to direct entries: direct-entry statuses and lucky losers
  const wildcardEntriesCount = getStageEntryTypeCount({ entryStatus: WILDCARD, drawDefinition, stage });
  const totalEntriesCount = getStagePlaceTakingEntriesCount({ drawDefinition, stage });
  const stageFull = stageDrawPositionsAvailable > 0 && totalEntriesCount >= stageDrawPositionsAvailable;
  const positionsAvailable = stageDrawPositionsAvailable - totalEntriesCount;

  if (stage !== VOLUNTARY_CONSOLATION && stageFull) {
    return { error: NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS };
  }

  if (entryStatus === WILDCARD) {
    // Unsanctioned: wildcards limited only by available positions
    if (!constraints) {
      if (totalEntriesCount < stageDrawPositionsAvailable) return { positionsAvailable, ...SUCCESS };
      return { error: NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS };
    }
    // Sanctioned: check maxWildcards. positionsAvailable is the lesser of the open places and the wildcards
    // the sanction has left, so a caller adding several wildcards at once can check the whole batch
    const maxWildcards = constraints.maxWildcards ?? stageDrawPositionsAvailable;
    if (wildcardEntriesCount < maxWildcards)
      return { positionsAvailable: Math.min(positionsAvailable, maxWildcards - wildcardEntriesCount), ...SUCCESS };
    return { error: NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS };
  }

  return { positionsAvailable, ...SUCCESS };
}
