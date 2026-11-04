import { getSanctionedEntryAllowance, getSanctionedEntryLimit } from './getStageSpace';
import { getDrawCompositionConstraints } from './getDrawCompositionConstraints';
import { decorateResult } from '@Functions/global/decorateResult';

// constants and types
import { NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS } from '@Constants/errorConditionConstants';
import type { DrawDefinition, Entry, Event, Tournament } from '@Types/tournamentTypes';
import { ALTERNATE, WILDCARD } from '@Constants/entryStatusConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { ResultType } from '@Types/factoryTypes';

type CheckSanctionedEntryLimitsArgs = {
  tournamentRecord?: Tournament;
  // the draw the entries are added to, when it already holds entries; its entries count against the limits
  drawDefinition?: DrawDefinition;
  entries?: Entry[];
  event?: Event;
  stack?: string;
};

const LIMITED_ENTRY_STATUSES = [WILDCARD, ALTERNATE];

/**
 * Refuses a set of entries that would take a draw stage past the sanctioning constraints: more WILDCARD entries than
 * `maxWildcards`, or more ALTERNATE entries than `maxAlternates`, counting the entries the draw already holds. Called
 * before anything is written, so a draw is never generated or stored with only some of its entries.
 *
 * The allowance is `getSanctionedEntryAllowance`, the same count `getStageSpace` applies when entries are added to an
 * existing draw. Entries already in `drawDefinition` (same participant and stage) are not counted twice. Without a
 * sanction that matches the event, nothing is refused.
 *
 * The refusal names the status, the stage, the limit, the count the entries would reach, and the participantIds over
 * the limit (the entries beyond the allowance, in the order given).
 */
export function checkSanctionedEntryLimits({
  tournamentRecord,
  drawDefinition,
  entries,
  event,
  stack = 'checkSanctionedEntryLimits',
}: CheckSanctionedEntryLimitsArgs): ResultType {
  const { constraints } = getDrawCompositionConstraints({ tournamentRecord, event });
  if (!constraints || !entries?.length) return {};

  const existingEntries = drawDefinition?.entries ?? [];
  const isExisting = (entry: Entry, stage: string) =>
    existingEntries.some((e) => e.participantId === entry.participantId && (e.entryStage ?? MAIN) === stage);

  for (const entryStatus of LIMITED_ENTRY_STATUSES) {
    const candidatesByStage: Record<string, string[]> = {};
    for (const entry of entries) {
      if (entry.entryStatus !== entryStatus) continue;
      const stage = entry.entryStage ?? MAIN;
      if (isExisting(entry, stage)) continue;
      candidatesByStage[stage] ??= [];
      if (!candidatesByStage[stage].includes(entry.participantId)) candidatesByStage[stage].push(entry.participantId);
    }

    for (const [stage, participantIds] of Object.entries(candidatesByStage)) {
      const allowance = getSanctionedEntryAllowance({ constraints, drawDefinition, entryStatus, stage });
      if (allowance === undefined) continue;
      const admitted = Math.max(0, allowance);
      if (participantIds.length <= admitted) continue;

      const limit = getSanctionedEntryLimit({ constraints, entryStatus });
      const enteredCount = (limit ?? 0) - allowance;
      return decorateResult({
        result: { error: NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS },
        info: `${entryStatus} entries exceed the sanctioned limit`,
        context: {
          participantIds: participantIds.slice(admitted),
          count: enteredCount + participantIds.length,
          entryStatus,
          stage,
          limit,
        },
        stack,
      });
    }
  }

  return {};
}

type SanctionLimitedStatusArgs = {
  tournamentRecord?: Tournament;
  entryStatus?: string;
  event?: Event;
};

/**
 * Whether the sanctioning constraints matched to the event bound entries of `entryStatus` (a `maxWildcards` for
 * WILDCARD, a `maxAlternates` for ALTERNATE). A generator that fails to add such an entry would drop it under the
 * sanction, so it refuses instead.
 */
export function isSanctionLimitedStatus({ tournamentRecord, entryStatus, event }: SanctionLimitedStatusArgs): boolean {
  const { constraints } = getDrawCompositionConstraints({ tournamentRecord, event });
  return getSanctionedEntryLimit({ constraints, entryStatus }) !== undefined;
}
