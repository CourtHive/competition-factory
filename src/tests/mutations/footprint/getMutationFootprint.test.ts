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
});
