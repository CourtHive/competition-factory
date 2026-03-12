import { setMatchUpStatus } from '../matchUps/matchUpStatus/setMatchUpStatus';
import { findEvent } from '@Acquire/findEvent';

import { MISSING_TOURNAMENT_RECORD, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

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
        outcomes: tournamentOutcomes,
        tournamentRecord,
      });
      if (result.error) return result;
    }
  }

  return { ...SUCCESS };
}

function bulkUpdate(params) {
  const { tournamentRecords, tournamentRecord, outcomes, policyDefinitions } = params;
  const events = {};

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
        const { matchUpFormat, matchUpId } = outcome;
        const result = setMatchUpStatus({
          schedule: outcome?.schedule,
          tournamentRecords,
          policyDefinitions,
          tournamentRecord,
          drawDefinition,
          matchUpFormat,
          matchUpId,
          outcome,
          drawId,
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
