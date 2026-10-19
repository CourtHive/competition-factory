import { setMatchUpStatus } from '@Mutate/matchUps/matchUpStatus/setMatchUpStatus';
import { decorateResult } from '@Functions/global/decorateResult';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { findEvent } from '@Acquire/findEvent';

// constants
import { SUCCESS } from '@Constants/resultConstants';
import {
  DRAW_DEFINITION_NOT_FOUND,
  ErrorType,
  EVENT_NOT_FOUND,
  MATCHUP_NOT_FOUND,
  MISSING_DRAW_ID,
  MISSING_EVENT,
  MISSING_MATCHUP_ID,
  MISSING_TOURNAMENT_RECORD,
  MISSING_VALUE,
} from '@Constants/errorConditionConstants';

// types
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import type { ResultType } from '@Types/factoryTypes';

// The per-call options of setMatchUpStatus that a bulk entry carries, each settable on the call (every outcome) or
// on one outcome (that outcome only). Forwarding none of them made a result entered in bulk propagate differently
// from the same result entered singly. setMatchUpStatus still applies `policy ?? param ?? default` to the three
// propagation flags, so an applied scoring policy that speaks on a flag wins over either.
const FORWARDED_OPTIONS = [
  'propagateRetirementAsExit',
  'disableScoreValidation',
  'allowChangePropagation',
  'propagateExitStatus',
  'disableAutoCalc',
  'enableAutoCalc',
  'setTBlast',
] as const;

type ForwardedOptions = { [K in (typeof FORWARDED_OPTIONS)[number]]?: boolean };
type BulkOutcome = ForwardedOptions & {
  matchUpFormat?: string;
  tournamentId: string;
  matchUpId: string;
  eventId: string;
  drawId: string;
  notes?: string;
  schedule?: object;
};

export function bulkMatchUpStatusUpdate(params) {
  if (!params?.outcomes) return { error: MISSING_VALUE };
  if (!Array.isArray(params.outcomes)) return { error: MISSING_VALUE, info: { outcomes: params.outcomes } };

  const tournamentRecords =
    params.tournamentRecords ||
    (params.tournamentRecord && {
      [params.tournamentRecord.tournamentId]: params.tournamentRecord,
    }) ||
    {};

  // EVERY OUTCOME IS LOCATED BEFORE ANY IS APPLIED. An error changes nothing (CA, 2026-10-18): an outcome naming a
  // tournament, event, draw or matchUp that is not there is refused here, before the outcomes ahead of it are written.
  // It used to be skipped while the call reported SUCCESS, so a caller could not tell a typo from a write.
  const located = locateOutcomes(tournamentRecords, params.outcomes);
  if (located.error || !located.targets) return located;

  for (const { outcome, tournamentRecord, event, drawDefinition } of located.targets) {
    const { matchUpFormat, matchUpId, drawId, notes } = outcome;
    const result = setMatchUpStatus({
      ...forwardedOptions(params, outcome),
      policyDefinitions: params.policyDefinitions,
      schedule: outcome?.schedule,
      tournamentRecords,
      tournamentRecord,
      drawDefinition,
      matchUpFormat,
      matchUpId,
      outcome,
      drawId,
      notes,
      event,
    });
    if (result.error) return result;
  }

  return { ...SUCCESS };
}

function forwardedOptions(params: ForwardedOptions, outcome: BulkOutcome): ForwardedOptions {
  return Object.fromEntries(FORWARDED_OPTIONS.map((key) => [key, outcome[key] ?? params[key]]));
}

type Target = { outcome: BulkOutcome; tournamentRecord: Tournament; event: Event; drawDefinition: DrawDefinition };

/** each outcome's tournament, event, draw and matchUp, in the order given; the first that is not there refuses all */
function locateOutcomes(
  tournamentRecords: { [key: string]: Tournament },
  outcomes: BulkOutcome[],
): ResultType & { targets?: Target[] } {
  const matchUpIds = new Map<DrawDefinition, Set<string>>();
  const targets: Target[] = [];

  for (const [outcomeIndex, outcome] of outcomes.entries()) {
    const { tournamentId, eventId, drawId, matchUpId } = outcome ?? {};
    const refuse = (error: ErrorType) =>
      decorateResult({ result: { error }, context: { outcomeIndex, tournamentId, eventId, drawId, matchUpId } });

    const tournamentRecord = tournamentRecords[tournamentId];
    if (!tournamentRecord) return refuse(MISSING_TOURNAMENT_RECORD);
    if (!eventId) return refuse(MISSING_EVENT);
    const { event } = findEvent({ tournamentRecord, eventId });
    if (!event) return refuse(EVENT_NOT_FOUND);
    if (!drawId) return refuse(MISSING_DRAW_ID);
    const drawDefinition = event.drawDefinitions?.find((drawDefinition) => drawDefinition.drawId === drawId);
    if (!drawDefinition) return refuse(DRAW_DEFINITION_NOT_FOUND);
    if (!matchUpId) return refuse(MISSING_MATCHUP_ID);
    if (!matchUpIds.has(drawDefinition))
      matchUpIds.set(
        drawDefinition,
        new Set(getMatchUpsMap({ drawDefinition }).drawMatchUps.map((matchUp) => matchUp.matchUpId)),
      );
    if (!matchUpIds.get(drawDefinition)?.has(matchUpId)) return refuse(MATCHUP_NOT_FOUND);

    targets.push({ outcome, tournamentRecord, event, drawDefinition });
  }

  return { targets };
}
