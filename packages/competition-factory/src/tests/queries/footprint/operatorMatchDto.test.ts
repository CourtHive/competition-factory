import * as participants from '@Query/participants/getEventScopedRecord';
import { matchUpActions } from '@Query/drawDefinition/matchUpActions/matchUpActions';
import { reduceRecordToFootprint } from '@Query/footprint/reduceRecordToFootprint';
import { getQueryFootprint } from '@Query/footprint/getQueryFootprint';
import { FOOTPRINT_NOT_LOADED, NOT_IMPLEMENTED } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_MATCHUP_ACTIONS } from '@Constants/policyConstants';
import { SCORE } from '@Constants/matchUpActionConstants';
import askEngine from '@Assemblies/engines/ask';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, vi } from 'vitest';

function fixture(eventType = 'SINGLES') {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    nonRandom: 501,
    startDate: '2026-11-20',
    endDate: '2026-11-22',
    setState: true,
    eventProfiles: [{ eventType, drawProfiles: [{ drawSize: 4 }] }],
  });
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const match = matchUps.find((m) => m.roundNumber === 1);
  return {
    ids: {
      tournamentId: tournamentRecord.tournamentId,
      eventId: match.eventId,
      drawId: match.drawId,
      matchUpId: match.matchUpId,
    },
    record: tournamentRecord,
  };
}
it.each(['recorder', 'director'])(
  'returns only declared score fields to %s from the guarded action query',
  (audience) => {
    const { ids, record } = fixture();
    for (const p of record.participants)
      p.person = { ...p.person, birthDate: 'protected-date', emailAddress: 'protected-contact' };
    tournamentEngine.setState(record);
    const canonical = tournamentEngine.matchUpActions(ids);
    const result = tournamentEngine.matchUpActions({ ...ids, operatorAudience: audience });
    expect(canonical.validActions.some((a) => a.type === 'SCORE')).toBe(true);
    expect(Object.keys(result)).toEqual(['operatorMatch']);
    const wire = JSON.stringify(result.operatorMatch);
    const serialized = JSON.parse(wire);
    expect(Object.keys(serialized).sort()).toEqual(
      [
        'audience',
        'clearable',
        'disabledMatchUpStatuses',
        'matchUpFormat',
        'matchUpId',
        'matchUpStatus',
        'resultIntent',
        'sets',
        'sideStatusCodes',
        'sides',
      ].sort(),
    );
    for (const side of serialized.sides) expect(Object.keys(side).sort()).toEqual(['sideNumber', 'name'].sort());
    expect(wire).not.toContain('protected-');
    expect(serialized).toMatchObject({ audience, resultIntent: 'record-initial-result', matchUpId: ids.matchUpId });
    const score = { sets: [1, 2].map((setNumber) => ({ setNumber, winningSide: 1, side1Score: 6, side2Score: 2 })) };
    expect(
      tournamentEngine.setMatchUpStatus({ ...ids, outcome: { score, winningSide: 1, matchUpStatus: 'COMPLETED' } })
        .success,
    ).toBe(true);
    const revised = tournamentEngine.matchUpActions({ ...ids, operatorAudience: audience }).operatorMatch;
    expect(revised.resultIntent).toBe('correct-result');
    expect(Object.keys(revised.advancement).sort()).toEqual(['matchUpId', 'roundName', 'roundNumber']);
    expect(revised.advancement.roundName).toBe('Final');
    const updatedWire = JSON.stringify(revised);
    expect(Object.keys(JSON.parse(updatedWire).sets[0]).sort()).toEqual(
      ['setNumber', 'side1Score', 'side2Score', 'winningSide'].sort(),
    );
    expect(revised.sets[0]).toMatchObject(score.sets[0]);
  },
);
it('refuses an undeclared audience and a mismatched event', () => {
  const { ids } = fixture();
  for (const extras of [{ operatorAudience: 'public' }, { operatorAudience: 'director', eventId: 'wrong' }]) {
    const result = tournamentEngine.matchUpActions({ ...ids, ...extras });
    expect(result.error).toBeTruthy();
    expect(result.operatorMatch).toBeUndefined();
  }
});

it('formats doubles and refuses a TEAM draw', () => {
  const doubles = fixture('DOUBLES');
  const match = tournamentEngine.matchUpActions({ ...doubles.ids, operatorAudience: 'recorder' });
  expect(match.operatorMatch?.sides).toHaveLength(2);
  expect(match.operatorMatch?.resultIntent).toBe('record-initial-result');
  const team = fixture('TEAM');
  expect(tournamentEngine.matchUpActions({ ...team.ids, operatorAudience: 'director' })).toEqual({
    error: NOT_IMPLEMENTED,
  });
});

it('runs the guarded action computation once on a sufficient context and zero times on refusals', () => {
  const { ids, record } = fixture();
  const params = { ...ids, operatorAudience: 'recorder' };
  const footprint = getQueryFootprint({ methods: [{ method: 'matchUpActions', params }] });
  const compute = vi.fn(matchUpActions);
  // Also count inside the governor: a formatter re-running it directly would bypass the engine spy.
  const context = vi.spyOn(participants, 'getEventScopedRecord');
  askEngine.importMethods({ matchUpActions: compute }, undefined, undefined, true);
  try {
    askEngine.setState(record);
    const whole = askEngine.matchUpActions(params);
    expect(whole.operatorMatch?.matchUpId).toBe(ids.matchUpId);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(context).toHaveBeenCalledTimes(1);
    compute.mockClear();
    context.mockClear();

    const partial = reduceRecordToFootprint({ tournamentRecord: record, footprint });
    askEngine.setState(partial);
    expect(askEngine.loadedFootprint(footprint).success).toBe(true);
    expect(askEngine.matchUpActions(params)).toEqual(whole);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(context).toHaveBeenCalledTimes(1);
    compute.mockClear();
    context.mockClear();

    const insufficient = { ...footprint, shards: footprint.shards.filter((key) => key !== 'participants') };
    askEngine.setState(reduceRecordToFootprint({ tournamentRecord: record, footprint: insufficient }));
    askEngine.loadedFootprint(insufficient);
    expect(askEngine.matchUpActions(params).error).toEqual(FOOTPRINT_NOT_LOADED);
    expect(compute).not.toHaveBeenCalled();
    expect(context).not.toHaveBeenCalled();

    const other = { ...record, tournamentId: 'OTHER', events: [] };
    askEngine.setState({ [ids.tournamentId]: record, OTHER: other });
    for (const extras of [
      { tournamentId: 'OTHER' },
      { tournamentId: 'missing' },
      { drawId: '' },
      { eventId: 'unknown' },
      { operatorAudience: 'public' },
      { inContextDrawMatchUps: [] },
      { policyDefinitions: {} },
      { drawDefinition: record.events[0].drawDefinitions[0] },
    ]) {
      const result = askEngine.matchUpActions({ ...params, ...extras });
      expect(result.error).toBeDefined();
      expect(result.operatorMatch).toBeUndefined();
      expect(compute).not.toHaveBeenCalled();
      expect(context).not.toHaveBeenCalled();
    }
  } finally {
    context.mockRestore();
    askEngine.importMethods({ matchUpActions }, undefined, undefined, true);
  }
});

it('preserves the documented SCORE policy exception on the guarded operator route', () => {
  const { ids } = fixture();
  expect(
    tournamentEngine.attachPolicies({
      drawId: ids.drawId,
      policyDefinitions: {
        [POLICY_TYPE_MATCHUP_ACTIONS]: {
          enabledStructures: [{ stages: [], stageSequences: [], enabledActions: [], disabledActions: [SCORE] }],
        },
      },
    }).success,
  ).toBe(true);
  const result = tournamentEngine.matchUpActions({ ...ids, operatorAudience: 'recorder' });
  expect(result.operatorMatch?.resultIntent).toBe('record-initial-result');
});

it('returns only the scheduled venue zone from committed state on full and partial reads', () => {
  const { ids, record } = fixture();
  record.localTimeZone = 'Europe/London';
  record.venues = [
    { venueId: 'other', addresses: [{ timeZone: 'Europe/Paris' }] },
    { venueId: 'assigned', addresses: [{ timeZone: 'America/New_York', street: 'protected-address' }] },
  ];
  tournamentEngine.setState(record);
  const params = { ...ids, operatorAudience: 'director' };
  expect(tournamentEngine.matchUpActions(params).operatorMatch?.venueTimeZone).toBeUndefined();
  expect(
    tournamentEngine.addMatchUpScheduleItems({
      drawId: ids.drawId,
      matchUpId: ids.matchUpId,
      schedule: { venueId: 'assigned', scheduledDate: '2026-11-20', scheduledTime: '10:30' },
    }),
  ).toMatchObject({ success: true });
  const scheduled = tournamentEngine.getTournament().tournamentRecord;
  const full = tournamentEngine.matchUpActions(params);
  expect(full.operatorMatch?.venueTimeZone).toBe('America/New_York');
  expect(JSON.stringify(full)).not.toContain('protected-address');
  const footprint = getQueryFootprint({ methods: [{ method: 'matchUpActions', params }] });
  tournamentEngine.setState(reduceRecordToFootprint({ tournamentRecord: scheduled, footprint }));
  expect(tournamentEngine.loadedFootprint(footprint).success).toBe(true);
  expect(tournamentEngine.matchUpActions(params)).toEqual(full);
  scheduled.venues[1].addresses.push({ timeZone: 'America/Chicago' });
  tournamentEngine.setState(scheduled);
  expect(tournamentEngine.matchUpActions(params).operatorMatch.venueTimeZone).toBeUndefined();
});
