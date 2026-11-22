import { positionActions } from '@Query/drawDefinition/positionActions/positionActions';
import { matchUpActions } from '@Query/drawDefinition/matchUpActions/matchUpActions';
import { reduceRecordToFootprint } from '@Query/footprint/reduceRecordToFootprint';
import { getQueryFootprint } from '@Query/footprint/getQueryFootprint';
import { afterEach, describe, expect, it } from 'vitest';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import askEngine from '@Assemblies/engines/ask';
import { setClock } from '@Tools/clock';

// constants and types
import { FOOTPRINT_NOT_LOADED } from '@Constants/errorConditionConstants';
import type { RecordFootprint } from '@Query/footprint/collectFootprints';
import type { Tournament } from '@Types/tournamentTypes';

afterEach(() => {
  setClock();
});

function fixture(eventType = 'SINGLES', completeAllMatchUps = false) {
  setClock('2026-11-21T10:00:00.000Z');
  let result: any = mocksEngine.generateTournamentRecord({
    nonRandom: 20261121,
    setState: true,
    completeAllMatchUps,
    startDate: '2026-11-21',
    endDate: '2026-11-23',
    participantsProfile: { participantsCount: 80 },
    eventProfiles: [
      {
        eventId: 'E1',
        eventType,
        drawProfiles: [
          { drawId: 'D1', drawSize: 8 },
          { drawId: 'D2', drawSize: 8 },
        ],
      },
      { eventId: 'E2', drawProfiles: [{ drawId: 'D3', drawSize: 8 }] },
    ],
  });
  expect(result.error).toBeUndefined();
  const tournamentRecord: Tournament = tournamentEngine.getTournament().tournamentRecord;
  const match = tournamentEngine
    .allTournamentMatchUps({ inContext: true })
    .matchUps.find((item) => item.drawId === 'D1' && item.roundNumber === 1)!;
  return { tournamentRecord, match };
}

function run(tournamentRecord: Tournament, method: string, params, footprint?: RecordFootprint) {
  tournamentEngine.setState(tournamentRecord);
  if (footprint) expect(tournamentEngine.loadedFootprint(footprint).success).toBe(true);
  const before = structuredClone(tournamentEngine.getTournament().tournamentRecord);
  let result: any = tournamentEngine[method](params);
  expect(tournamentEngine.getTournament().tournamentRecord).toEqual(before);
  return result;
}

describe('whole/partial canonical operator query parity', () => {
  it('enforces the same footprint through the ask engine used by CFS', () => {
    const { tournamentRecord, match } = fixture();
    askEngine.importMethods({ matchUpActions, positionActions }, undefined, undefined, true);
    const call = { method: 'matchUpActions', params: { drawId: 'D1', eventId: 'E1', matchUpId: match.matchUpId } };
    const footprint = getQueryFootprint({ methods: [call] });
    const expected = run(tournamentRecord, call.method, call.params);
    askEngine.setState(reduceRecordToFootprint({ tournamentRecord, footprint }));
    expect(askEngine.loadedFootprint(footprint).success).toBe(true);
    let result: any = askEngine.matchUpActions(call.params);
    expect(result).toEqual(expected);
    const insufficient = { ...footprint, shards: footprint.shards.filter((shard) => shard !== 'participants') };
    askEngine.setState(reduceRecordToFootprint({ tournamentRecord, footprint: insufficient }));
    askEngine.loadedFootprint(insufficient);
    result = askEngine.matchUpActions(call.params);
    expect(result.error).toEqual(FOOTPRINT_NOT_LOADED);
  });

  it('checks marked records against their own query scope when the target is another tournament', () => {
    const { tournamentRecord, match } = fixture();
    const other = structuredClone(tournamentRecord);
    other.tournamentId = 'OTHER';
    const params = { tournamentId: 'OTHER', drawId: 'D1', eventId: 'E1', matchUpId: match.matchUpId };
    const footprint = getQueryFootprint({ methods: [{ method: 'matchUpActions', params }], tournamentId: 'OTHER' });
    const insufficient = { ...footprint, shards: footprint.shards.filter((shard) => shard !== 'participants') };
    tournamentEngine.setState([
      tournamentRecord,
      reduceRecordToFootprint({ tournamentRecord: other, footprint: insufficient }),
    ]);
    tournamentEngine.loadedFootprint({ shards: ['shell'] }, tournamentRecord.tournamentId);
    tournamentEngine.loadedFootprint(insufficient, 'OTHER');
    let result: any = tournamentEngine.matchUpActions(params);
    expect(result.error).toEqual(FOOTPRINT_NOT_LOADED);
    expect(result.context.tournamentId).toBe('OTHER');
  });

  it('preflights a mixed query/mutation batch before its first write', () => {
    const { tournamentRecord, match } = fixture();
    const params = { drawId: 'D1', eventId: 'E1', matchUpId: match.matchUpId };
    const footprint = getQueryFootprint({ methods: [{ method: 'matchUpActions', params }] });
    const partial = reduceRecordToFootprint({ tournamentRecord, footprint });
    const result = run(
      partial,
      'executionQueue',
      [
        { method: 'addMatchUpCourtOrder', params: { ...params, courtOrder: 3 } },
        { method: 'matchUpActions', params: { ...params, drawId: 'D3', eventId: 'E2' } },
      ],
      footprint,
    );
    expect(result.error).toEqual(FOOTPRINT_NOT_LOADED);
  });
  it.each(['SINGLES', 'DOUBLES', 'TEAM'])('returns identical match and position actions for %s', (eventType) => {
    const { tournamentRecord, match } = fixture(eventType);
    const calls = [
      { method: 'matchUpActions', params: { drawId: 'D1', eventId: 'E1', matchUpId: match.matchUpId } },
      {
        method: 'matchUpActions',
        params: {
          drawId: 'D1',
          eventId: 'E1',
          matchUpId: match.matchUpId,
          sideNumber: 1,
          participantId: match.sides?.[0]?.participantId,
        },
      },
      {
        method: 'positionActions',
        params: { drawId: 'D1', eventId: 'E1', structureId: match.structureId, drawPosition: 1 },
      },
      {
        method: 'positionActions',
        params: {
          drawId: 'D1',
          eventId: 'E1',
          structureId: match.structureId,
          drawPosition: 1,
          returnParticipants: true,
        },
      },
    ];
    for (const call of calls) {
      const footprint = getQueryFootprint({ methods: [call] });
      const partial = reduceRecordToFootprint({ tournamentRecord, footprint });
      expect(partial.events?.flatMap((event) => event.drawDefinitions ?? []).map((draw) => draw.drawId)).toEqual([
        'D1',
        'D2',
      ]);
      expect(partial.participants).toHaveLength(tournamentRecord.participants!.length);
      const whole = run(tournamentRecord, call.method, call.params);
      expect(whole.error).toBeUndefined();
      expect(run(partial, call.method, call.params, footprint)).toEqual(whole);
    }
  });

  it('preserves rich alternates shared with another event, including other-flight offers', () => {
    const { match } = fixture();
    const initial = tournamentEngine.getTournament().tournamentRecord;
    const existing = new Set(
      initial.events!.find((event) => event.eventId === 'E1')!.entries!.map((entry) => entry.participantId),
    );
    const participantId = initial.participants!.find(
      (participant) => !existing.has(participant.participantId),
    )!.participantId;
    expect(
      tournamentEngine.addEventEntries({
        eventId: 'E2',
        drawId: 'D3',
        participantIds: [participantId],
        entryStatus: 'ALTERNATE',
      }).success,
    ).toBe(true);
    expect(
      tournamentEngine.addEventEntries({ eventId: 'E1', participantIds: [participantId], entryStatus: 'ALTERNATE' })
        .success,
    ).toBe(true);
    const tournamentRecord = tournamentEngine.getTournament().tournamentRecord;
    const call = {
      method: 'positionActions',
      params: {
        drawId: 'D1',
        eventId: 'E1',
        structureId: match.structureId,
        drawPosition: 1,
        returnParticipants: true,
        policyDefinitions: { positionActions: { otherFlightEntries: true } },
      },
    };
    const footprint = getQueryFootprint({ methods: [call] });
    const whole = run(tournamentRecord, call.method, call.params);
    expect(whole.error).toBeUndefined();
    const alternates = whole.validActions.find((action) => action.availableAlternates)?.availableAlternates;
    expect(alternates?.some((participant) => participant.participantId === participantId)).toBe(true);
    expect(run(reduceRecordToFootprint({ tournamentRecord, footprint }), call.method, call.params, footprint)).toEqual(
      whole,
    );
  });

  it('preserves completed result/correction/clear offers exactly', () => {
    const { tournamentRecord, match } = fixture('SINGLES', true);
    const call = { method: 'matchUpActions', params: { drawId: 'D1', eventId: 'E1', matchUpId: match.matchUpId } };
    const footprint = getQueryFootprint({ methods: [call] });
    const partial = reduceRecordToFootprint({ tournamentRecord, footprint });
    expect(run(partial, call.method, call.params, footprint)).toEqual(run(tournamentRecord, call.method, call.params));
  });

  it.each(['eventDraws', 'participants'] as const)(
    'refuses a load missing %s before either action query runs',
    (missing) => {
      const { tournamentRecord, match } = fixture();
      for (const call of [
        { method: 'matchUpActions', params: { drawId: 'D1', eventId: 'E1', matchUpId: match.matchUpId } },
        {
          method: 'positionActions',
          params: { drawId: 'D1', eventId: 'E1', structureId: match.structureId, drawPosition: 1 },
        },
      ]) {
        const fullPlan = getQueryFootprint({ methods: [call] });
        const footprint = { ...fullPlan, shards: fullPlan.shards.filter((shard) => shard !== missing) };
        const partial = reduceRecordToFootprint({ tournamentRecord, footprint });
        const result = run(partial, call.method, call.params, footprint);
        expect(result.error).toEqual(FOOTPRINT_NOT_LOADED);
        expect(result.context.missing).toContain(missing);
      }
    },
  );

  it('rejects a misleading event ID even when the requested draw and the other event are loaded', () => {
    const { tournamentRecord, match } = fixture();
    const call = { method: 'matchUpActions', params: { drawId: 'D1', eventId: 'E2', matchUpId: match.matchUpId } };
    const footprint = getQueryFootprint({ methods: [call] });
    const partial = reduceRecordToFootprint({ tournamentRecord, footprint });
    expect(partial.events?.flatMap((event) => event.drawDefinitions ?? []).map((draw) => draw.drawId)).toEqual([
      'D1',
      'D3',
    ]);
    const result = run(partial, call.method, call.params, footprint);
    expect(result.error).toEqual(FOOTPRINT_NOT_LOADED);
    expect(result.context.missing).toContain('eventDraws');
  });

  it('refuses unknown queries and target draws absent from a marked load', () => {
    const { tournamentRecord, match } = fixture();
    const call = { method: 'matchUpActions', params: { drawId: 'D1', eventId: 'E1', matchUpId: match.matchUpId } };
    const footprint = getQueryFootprint({ methods: [call] });
    const partial = reduceRecordToFootprint({ tournamentRecord, footprint });
    expect(run(partial, 'getParticipants', {}, footprint).error).toEqual(FOOTPRINT_NOT_LOADED);
    const result = run(partial, 'matchUpActions', { ...call.params, drawId: 'D3', eventId: 'E2' }, footprint);
    expect(result.error).toEqual(FOOTPRINT_NOT_LOADED);
    expect(result.context.missing).toContain('draw');
  });
});
