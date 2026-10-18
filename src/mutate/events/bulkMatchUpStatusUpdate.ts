import { setMatchUpStatus } from '@Mutate/matchUps/matchUpStatus/setMatchUpStatus';
import { findEvent } from '@Acquire/findEvent';

// constants
import { MISSING_TOURNAMENT_RECORD, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// types
import type { PolicyDefinitions } from '@Types/factoryTypes';
import type { Tournament } from '@Types/tournamentTypes';

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
type BulkUpdateArgs = {
  tournamentRecords: { [key: string]: Tournament };
  policyDefinitions?: PolicyDefinitions;
  tournamentRecord: Tournament;
  params: ForwardedOptions;
  outcomes: BulkOutcome[];
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

  const outcomes = params.outcomes ?? [];

  const tournamentIds = outcomes.reduce(
    (tournamentIds, outcome) =>
      tournamentIds.includes(outcome.tournamentId) ? tournamentIds : tournamentIds.concat(outcome.tournamentId),
    [],
  );

  for (const tournamentId of tournamentIds) {
    const tournamentRecord = tournamentRecords[tournamentId];
    if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
    const tournamentOutcomes = outcomes.filter((outcome) => outcome.tournamentId === tournamentId);
    if (tournamentOutcomes.length) {
      const result = bulkUpdate({
        policyDefinitions: params.policyDefinitions,
        outcomes: tournamentOutcomes,
        tournamentRecords,
        tournamentRecord,
        params,
      });
      if (result.error) return result;
    }
  }

  return { ...SUCCESS };
}

function forwardedOptions(params: ForwardedOptions, outcome: BulkOutcome): ForwardedOptions {
  return Object.fromEntries(FORWARDED_OPTIONS.map((key) => [key, outcome[key] ?? params[key]]));
}

function bulkUpdate({ tournamentRecords, tournamentRecord, outcomes, policyDefinitions, params }: BulkUpdateArgs) {
  const events: { [eventId: string]: BulkOutcome[] } = {};

  // group outcomes by events to optimize
  outcomes.forEach((outcome) => {
    const { eventId } = outcome;
    if (!events[eventId]) events[eventId] = [];
    events[eventId].push(outcome);
  });

  for (const eventId of Object.keys(events)) {
    const { event } = findEvent({ tournamentRecord, eventId });

    for (const outcome of events[eventId]) {
      const { drawId } = outcome;
      const drawDefinition = event?.drawDefinitions?.find((drawDefinition) => drawDefinition.drawId === drawId);
      if (drawDefinition && drawId) {
        const { matchUpFormat, matchUpId, notes } = outcome;
        const result = setMatchUpStatus({
          ...forwardedOptions(params, outcome),
          schedule: outcome?.schedule,
          tournamentRecords,
          policyDefinitions,
          tournamentRecord,
          drawDefinition,
          matchUpFormat,
          matchUpId,
          outcome,
          drawId,
          notes,
          event,
        });
        if (result.error) {
          return result;
        }
      }
    }
  }

  return { ...SUCCESS };
}
