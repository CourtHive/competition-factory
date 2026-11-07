import { getMutationFootprint } from '@Query/footprint/getMutationFootprint';
import { expect, it, describe } from 'vitest';

// constants
import { OUTCOME_PIPELINE_V2 } from '@Constants/outcomePipelineConstants';
import { ALTERNATE } from '@Constants/entryStatusConstants';

const score = { method: 'setMatchUpStatus', params: { drawId: 'D1', matchUpId: 'M1' } };

describe('getMutationFootprint', () => {
  it('needs the whole record for an empty queue, an unknown method, or a draw it cannot name', () => {
    let result: any = getMutationFootprint({ methods: [] });
    expect(result).toEqual({
      tournament: true,
      shards: ['tournament'],
      drawIds: [],
      eventIds: [],
      wholeRecordMethods: [],
    });

    result = getMutationFootprint({ methods: [score, { method: 'addEvent', params: {} }] });
    expect(result.tournament).toEqual(true);
    expect(result.shards).toEqual(['tournament']);
    expect(result.wholeRecordMethods).toEqual(['addEvent']);

    result = getMutationFootprint({ methods: [{ method: 'setMatchUpStatus', params: { matchUpId: 'M1' } }] });
    expect(result.tournament).toEqual(true);
    expect(result.wholeRecordMethods).toEqual(['setMatchUpStatus']);

    result = getMutationFootprint({ methods: undefined as any });
    expect(result.tournament).toEqual(true);
  });

  it('loads participants for score entry unless v2 decides', () => {
    let result: any = getMutationFootprint({ methods: [score] });
    expect(result).toEqual({
      shards: ['shell', 'draw', 'participants'],
      wholeRecordMethods: [],
      tournament: false,
      drawIds: ['D1'],
      eventIds: [],
    });

    result = getMutationFootprint({ methods: [score], outcomePipeline: OUTCOME_PIPELINE_V2 });
    expect(result.shards).toEqual(['shell', 'draw']);
  });

  it('takes the union of a queue, and widens with the params', () => {
    let result: any = getMutationFootprint({
      outcomePipeline: OUTCOME_PIPELINE_V2,
      methods: [
        score,
        { method: 'addMatchUpCourtOrder', params: { drawId: 'D2', matchUpId: 'M2', courtOrder: 1 } },
        { method: 'checkInParticipant', params: { drawId: 'D2', matchUpId: 'M2', participantId: 'P1' } },
      ],
    });
    expect(result.shards).toEqual(['shell', 'draw', 'drawParticipants']);
    expect(result.drawIds).toEqual(['D1', 'D2']);

    result = getMutationFootprint({
      methods: [{ method: 'addMatchUpScheduleItems', params: { drawId: 'D1', proConflictDetection: true } }],
    });
    expect(result.tournament).toEqual(true);

    result = getMutationFootprint({
      methods: [{ method: 'setMatchUpStatus', params: { drawId: 'D1', schedule: {}, proConflictDetection: true } }],
    });
    expect(result.tournament).toEqual(true);

    result = getMutationFootprint({
      methods: [
        { method: 'removeDrawPositionAssignment', params: { drawId: 'D1', eventId: 'E1', entryStatus: ALTERNATE } },
      ],
    });
    expect(result.shards).toEqual(['shell', 'draw', 'eventDraws', 'participants']);
    expect(result.eventIds).toEqual(['E1']);

    result = getMutationFootprint({
      methods: [{ method: 'removeDrawPositionAssignment', params: { drawId: 'D1', entryStatus: ALTERNATE } }],
    });
    expect(result.tournament).toEqual(true);
  });

  it('scopes a matchUpFormat change by what it names', () => {
    const format = (params: any) => getMutationFootprint({ methods: [{ method: 'setMatchUpFormat', params }] });
    expect(format({ drawIds: ['D1', 'D2'] }).drawIds).toEqual(['D1', 'D2']);
    expect(format({ eventId: 'E1' }).shards).toEqual(['shell']);
    expect(format({ eventIds: ['E1'], stages: [] }).shards).toEqual(['shell', 'eventDraws']);
    expect(format({ eventId: 'E1', structureId: 'S1' }).eventIds).toEqual(['E1']);
    expect(format({}).tournament).toEqual(true);
  });

  it('scopes bulk scores to the draws their outcomes name, in one tournament', () => {
    const bulk = (outcomes: any, outcomePipeline?: any) =>
      getMutationFootprint({ methods: [{ method: 'bulkMatchUpStatusUpdate', params: { outcomes } }], outcomePipeline });
    const T1D1 = { tournamentId: 'T1', eventId: 'E1', drawId: 'D1', matchUpId: 'M1' };
    const T1D2 = { tournamentId: 'T1', eventId: 'E2', drawId: 'D2', matchUpId: 'M2' };

    let result: any = bulk([T1D1, T1D2, { ...T1D1, matchUpId: 'M3' }]);
    expect(result.shards).toEqual(['shell', 'draw', 'participants']);
    expect(result.drawIds).toEqual(['D1', 'D2']);
    expect(bulk([T1D1], OUTCOME_PIPELINE_V2).shards).toEqual(['shell', 'draw']);

    // a draw it cannot name, outcomes across tournaments, or nothing to scope by
    result = bulk([T1D1, { ...T1D2, drawId: undefined }]);
    expect(result.tournament).toEqual(true);
    expect(bulk([T1D1, { ...T1D2, tournamentId: 'T2' }]).tournament).toEqual(true);
    expect(bulk([]).tournament).toEqual(true);
    expect(bulk(undefined).tournament).toEqual(true);
  });

  it("asked for one tournament, answers for that tournament's part of the queue", () => {
    const forTournament = (methods: any[], tournamentId: string, activeTournamentId?: string) =>
      getMutationFootprint({ methods, tournamentId, activeTournamentId, outcomePipeline: OUTCOME_PIPELINE_V2 });
    const outcome = (tournamentId?: string, drawId = 'D1') => ({ tournamentId, eventId: 'E1', drawId, matchUpId: 'M' });
    const bulk = (outcomes: any[]) => ({ method: 'bulkMatchUpStatusUpdate', params: { outcomes } });

    // bulk: each tournament its own outcomes' draws; a tournament with none, its shell
    const queue = [bulk([outcome('T1', 'D1'), outcome('T2', 'D2')])];
    expect(forTournament(queue, 'T1').drawIds).toEqual(['D1']);
    expect(forTournament(queue, 'T2').drawIds).toEqual(['D2']);
    expect(forTournament(queue, 'T3').shards).toEqual(['shell']);
    // an outcome that names no tournament could be any of them
    expect(forTournament([bulk([outcome('T1'), outcome(undefined)])], 'T1').tournament).toEqual(true);

    // a single-tournament method: its own tournament, else the active one; another tournament needs only its shell
    const scoreIn = (tournamentId?: string) => ({ ...score, params: { ...score.params, tournamentId } });
    expect(forTournament([scoreIn('T2')], 'T1').shards).toEqual(['shell']);
    expect(forTournament([scoreIn('T2')], 'T2').drawIds).toEqual(['D1']);
    expect(forTournament([scoreIn()], 'T1', 'T2').shards).toEqual(['shell']);
    expect(forTournament([scoreIn()], 'T2', 'T2').drawIds).toEqual(['D1']);
    // no tournament to name: answered as if it ran against this one
    expect(forTournament([scoreIn()], 'T1').drawIds).toEqual(['D1']);
    // an undeclared method needs every record whole
    expect(forTournament([{ method: 'addEvent', params: { tournamentId: 'T2' } }], 'T1').tournament).toEqual(true);
  });
});
