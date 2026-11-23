import { getStagePlaceTakingEntriesCount, getStageWildcardEntriesCount } from '@Query/drawDefinition/stageGetter';
import { getStageDrawPositionsBreakdown } from '@Query/drawDefinition/getStageDrawPositions';

// constants
import { ErrorType, MISSING_EVENT } from '@Constants/errorConditionConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// types
import type { DrawPositionsBasis, QualifierPositionsBasis } from '@Query/drawDefinition/getStageDrawPositions';
import type { DrawDefinition, Entry, Event, Tournament } from '@Types/tournamentTypes';

type GetEventEntrySpaceArgs = {
  drawDefinition?: DrawDefinition;
  tournamentRecord?: Tournament;
  eventId?: string;
  drawId?: string;
  event?: Event;
};

export type EventEntrySpace = {
  /** where `drawPositions` came from; NONE when nothing states a MAIN draw size */
  basis: DrawPositionsBasis;
  /** MAIN draw positions: from the structure(s), else `entryProfile.targetDrawSize`, else sanctioning constraints */
  drawPositions: number;
  /** MAIN positions held for qualifiers */
  qualifierPositions: number;
  qualifierPositionsBasis: QualifierPositionsBasis;
  /** MAIN places held for wildcards: `entryProfile.wildcardCount`, or the wildcards accepted if more */
  wildcardPositions: number;
  wildcardsAccepted: number;
  /** MAIN entries taking a direct-acceptance place, wildcards excluded (PLACE_TAKING_ENTRY_STATUSES: direct entries and lucky losers) */
  directAcceptedCount: number;
  /** directAcceptedCount + wildcardsAccepted */
  acceptedCount: number;
  /** drawPositions - qualifierPositions - wildcardPositions; undefined when basis is NONE */
  directAcceptancePlaces?: number;
  /** directAcceptancePlaces - directAcceptedCount, never below 0; undefined when basis is NONE */
  openPlaces?: number;
};

/**
 * How many MAIN places an event (or one of its draws) has for entries accepted directly — neither
 * qualifiers nor wildcards — and how many of them are still open.
 *
 * Positions come from the generated MAIN structure, and qualifier positions from the links into it,
 * exactly as entry into a draw counts them (`getStageDrawPositionsBreakdown`, shared with
 * `getStageSpace`). Before a draw exists they come from the event's `entryProfile` — `targetDrawSize`,
 * and `qualifiersCount` or `qualifyingProfiles` — and, failing a `targetDrawSize`, the sanctioning
 * constraints extension.
 *
 * With `drawId`, that draw's positions and entries. Without it, the event's entries against the summed
 * positions of every draw that has a MAIN structure, or the entry profile when none has.
 */
export function getEventEntrySpace({
  tournamentRecord,
  drawDefinition,
  event,
}: GetEventEntrySpaceArgs): EventEntrySpace & { success?: boolean; error?: ErrorType } {
  if (!event) return { error: MISSING_EVENT } as EventEntrySpace & { error: ErrorType };

  const drawDefinitions = drawDefinition
    ? [drawDefinition]
    : (event.drawDefinitions ?? []).filter((dd) => dd.structures?.some((s) => s.stage === MAIN));

  const breakdowns = (drawDefinitions.length ? drawDefinitions : [undefined]).map((dd) =>
    getStageDrawPositionsBreakdown({ drawDefinition: dd, stage: MAIN, tournamentRecord, event }),
  );
  const drawPositions = sum(breakdowns.map((b) => b.drawPositions));
  const qualifierPositions = sum(breakdowns.map((b) => b.qualifierPositions));
  const positionsAvailable = sum(breakdowns.map((b) => b.positionsAvailable));
  const basis = breakdowns[0].drawPositionsBasis;
  const qualifierPositionsBasis =
    breakdowns.find((b) => b.qualifierPositionsBasis !== 'NONE')?.qualifierPositionsBasis ?? 'NONE';

  // entries with no entryStage are MAIN entries
  const entries: Entry[] = ((drawDefinition ? drawDefinition.entries : event.entries) ?? []).map((entry) =>
    entry.entryStage ? entry : { ...entry, entryStage: MAIN },
  );
  const wildcardsAccepted = getStageWildcardEntriesCount({ stage: MAIN, entries });
  const directAcceptedCount = getStagePlaceTakingEntriesCount({ stage: MAIN, entries }) - wildcardsAccepted;
  const acceptedCount = directAcceptedCount + wildcardsAccepted;

  const wildcardCount = event.entryProfile?.wildcardCount;
  const wildcardPositions = Math.max(
    Number.isSafeInteger(wildcardCount) ? (wildcardCount as number) : 0,
    wildcardsAccepted,
  );

  const bounded = basis !== 'NONE';
  const directAcceptancePlaces = bounded ? Math.max(0, positionsAvailable - wildcardPositions) : undefined;
  const openPlaces =
    directAcceptancePlaces === undefined ? undefined : Math.max(0, directAcceptancePlaces - directAcceptedCount);

  return {
    ...SUCCESS,
    basis,
    drawPositions,
    qualifierPositions,
    qualifierPositionsBasis,
    wildcardPositions,
    wildcardsAccepted,
    directAcceptedCount,
    acceptedCount,
    directAcceptancePlaces,
    openPlaces,
  };
}

const sum = (values: number[]) => values.reduce((total, value) => total + (value || 0), 0);
