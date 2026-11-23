import { getStageDrawPositionsCount } from '@Query/drawDefinition/getStageDrawPositions';

// constants and types
import { ENTRIES_NOT_PLACED, NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS } from '@Constants/errorConditionConstants';
import { EntriesNotPlacedWarning, EntryNotPlaced, ResultType } from '@Types/factoryTypes';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { DrawDefinition } from '@Types/tournamentTypes';

type EntryLike = { participantId?: string; entryStatus?: string; entryStage?: string };

/**
 * The entry draw generation leaves out when addDrawEntry could not attach it for want of a place, or undefined.
 * Generating from an event's entries ignores that error (the surplus stays on the event), so it is collected here
 * and reported as an ENTRIES_NOT_PLACED warning instead of being dropped silently.
 */
export function entryNotPlaced({
  entry,
  result,
}: {
  entry: EntryLike;
  result: ResultType;
}): EntryNotPlaced | undefined {
  const code = result.error?.code;
  if (code !== NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS.code || !entry.participantId) return undefined;
  return {
    entryStage: entry.entryStage ?? MAIN,
    participantId: entry.participantId,
    entryStatus: entry.entryStatus,
    reason: code,
  };
}

/**
 * One ENTRIES_NOT_PLACED warning per stage, in entry order. `drawSize` is the stage's draw positions in the generated
 * draw: the places the left-out entries did not fit into.
 */
export function entriesNotPlacedWarnings({
  entriesNotPlaced,
  drawDefinition,
}: {
  entriesNotPlaced?: EntryNotPlaced[];
  drawDefinition?: DrawDefinition;
}): EntriesNotPlacedWarning[] {
  const byStage = new Map<string, EntryNotPlaced[]>();
  for (const entry of entriesNotPlaced ?? []) {
    const stage = entry.entryStage ?? MAIN;
    if (!byStage.has(stage)) byStage.set(stage, []);
    byStage.get(stage)?.push(entry);
  }

  return [...byStage.entries()].map(([stage, entries]) => ({
    ...ENTRIES_NOT_PLACED,
    drawSize: getStageDrawPositionsCount({ drawDefinition, stage }),
    participantIds: entries.map(({ participantId }) => participantId),
    entries: entries.map(({ participantId, entryStatus, reason }) => ({ participantId, entryStatus, reason })),
    drawId: drawDefinition?.drawId,
    count: entries.length,
    stage,
  }));
}
