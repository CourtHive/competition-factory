import { reduceRecordToFootprint } from '@Query/footprint/reduceRecordToFootprint';
import { getMutationFootprint } from '@Query/footprint/getMutationFootprint';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { FOOTPRINT_NOT_LOADED, INVALID_VALUES, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { WITHDRAWN } from '@Constants/entryStatusConstants';
import {
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
  type OutcomePipelineMode,
} from '@Constants/outcomePipelineConstants';

const outcome = {
  score: {
    sets: [
      { side1Score: 6, side2Score: 1, winningSide: 1 },
      { side1Score: 6, side2Score: 2, winningSide: 1 },
    ],
  },
  matchUpStatus: 'COMPLETED',
  winningSide: 1,
};

function fixture() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    eventProfiles: [
      {
        eventId: 'E1',
        drawProfiles: [
          { drawId: 'D1', drawSize: 8 },
          { drawId: 'D2', drawSize: 8 },
        ],
      },
    ],
    participantsProfile: { participantsCount: 32 },
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord);
  const matchUpIds = Object.fromEntries(
    ['D1', 'D2'].map((drawId) => {
      const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { drawIds: [drawId] } });
      return [drawId, matchUps.find((m: any) => m.roundNumber === 1).matchUpId];
    }),
  );
  return { tournamentRecord, matchUpIds };
}

const score = (drawId: string, matchUpId: string) => ({
  method: 'setMatchUpStatus',
  params: { drawId, matchUpId, outcome },
});

function loadPartial(
  tournamentRecord: any,
  methods: any[],
  outcomePipeline: OutcomePipelineMode = OUTCOME_PIPELINE_V2,
) {
  const footprint = getMutationFootprint({ methods, outcomePipeline });
  tournamentEngine.setState(reduceRecordToFootprint({ tournamentRecord, footprint }));
  let result: any = tournamentEngine.loadedFootprint(footprint);
  expect(result.success).toEqual(true);
  result = tournamentEngine.outcomePipeline(outcomePipeline);
  expect(result.success).toEqual(true);
  return footprint;
}

describe('partial-record mode', () => {
  const { tournamentRecord, matchUpIds } = fixture();

  it('is off unless a record is marked: an unmarked partial record runs anything, as before', () => {
    const footprint = getMutationFootprint({
      methods: [score('D1', matchUpIds.D1)],
      outcomePipeline: OUTCOME_PIPELINE_V2,
    });
    tournamentEngine.setState(reduceRecordToFootprint({ tournamentRecord, footprint }));
    expect(tournamentEngine.getLoadedFootprint()).toBeUndefined();
    let result: any = tournamentEngine.addEvent({ event: { eventName: 'Added' } });
    expect(result.success).toEqual(true);
    result = tournamentEngine.setMatchUpStatus(score('D1', matchUpIds.D1).params);
    expect(result.success).toEqual(true);
  });

  it('runs a method its loaded footprint covers', () => {
    const methods = [score('D1', matchUpIds.D1)];
    const footprint = loadPartial(tournamentRecord, methods);
    expect(tournamentEngine.getLoadedFootprint()).toEqual(footprint);
    const result: any = tournamentEngine.executionQueue(methods);
    expect(result.success).toEqual(true);
    tournamentEngine.outcomePipeline(OUTCOME_PIPELINE_V1);
  });

  it('refuses, before writing, a method that needs more than was loaded', () => {
    loadPartial(tournamentRecord, [score('D1', matchUpIds.D1)]);
    const before = structuredClone(tournamentEngine.getTournament().tournamentRecord);

    // a draw not loaded
    let result: any = tournamentEngine.setMatchUpStatus(score('D2', matchUpIds.D2).params);
    expect(result.error).toEqual(FOOTPRINT_NOT_LOADED);

    // a method with no declared footprint needs the whole record
    result = tournamentEngine.addEvent({ event: { eventName: 'Added' } });
    expect(result.error).toEqual(FOOTPRINT_NOT_LOADED);

    // a query too: on a partial record it would read what is not there
    result = tournamentEngine.getParticipants();
    expect(result.error).toEqual(FOOTPRINT_NOT_LOADED);

    // the event's draws and the participants, which the record cannot show missing, are checked against the mark
    result = tournamentEngine.removeDrawPositionAssignment({
      structureId: tournamentRecord.events[0].drawDefinitions[0].structures[0].structureId,
      entryStatus: WITHDRAWN,
      drawPosition: 1,
      drawId: 'D1',
      eventId: 'E1',
    });
    expect(result.error).toEqual(FOOTPRINT_NOT_LOADED);

    // a queue is refused whole, before its first directive runs: the covered first score is not written either
    result = tournamentEngine.executionQueue([score('D1', matchUpIds.D1), score('D2', matchUpIds.D2)]);
    expect(result.error).toEqual(FOOTPRINT_NOT_LOADED);
    expect(result.context.methodName).toEqual('setMatchUpStatus');
    expect(tournamentEngine.getTournament().tournamentRecord).toEqual(before);
    tournamentEngine.outcomePipeline(OUTCOME_PIPELINE_V1);
  });

  it('asks for the participants under v1, and refuses without them', () => {
    const methods = [score('D1', matchUpIds.D1)];
    // loaded for v2 (no participants), then run under v1
    loadPartial(tournamentRecord, methods);
    tournamentEngine.outcomePipeline(OUTCOME_PIPELINE_V1);
    let result: any = tournamentEngine.setMatchUpStatus(methods[0].params);
    expect(result.error).toEqual(FOOTPRINT_NOT_LOADED);
    expect(result.context.missing).toEqual(['participants']);

    loadPartial(tournamentRecord, methods, OUTCOME_PIPELINE_V1);
    result = tournamentEngine.setMatchUpStatus(methods[0].params);
    expect(result.success).toEqual(true);
  });

  it('accepts a whole-event load for a withdrawal', () => {
    const params = {
      structureId: tournamentRecord.events[0].drawDefinitions[0].structures[0].structureId,
      entryStatus: WITHDRAWN,
      drawPosition: 1,
      drawId: 'D1',
      eventId: 'E1',
    };
    loadPartial(tournamentRecord, [{ method: 'removeDrawPositionAssignment', params }]);
    const result: any = tournamentEngine.removeDrawPositionAssignment(params);
    expect(result.success).toEqual(true);
    tournamentEngine.outcomePipeline(OUTCOME_PIPELINE_V1);
  });

  it('drops the mark when cleared or when a record is installed again', () => {
    loadPartial(tournamentRecord, [score('D1', matchUpIds.D1)]);
    let result: any = tournamentEngine.loadedFootprint();
    expect(result.success).toEqual(true);
    expect(tournamentEngine.getLoadedFootprint()).toBeUndefined();

    loadPartial(tournamentRecord, [score('D1', matchUpIds.D1)]);
    tournamentEngine.setState(tournamentRecord);
    expect(tournamentEngine.getLoadedFootprint()).toBeUndefined();
    result = tournamentEngine.addEvent({ event: { eventName: 'Added' } });
    expect(result.success).toEqual(true);
    tournamentEngine.outcomePipeline(OUTCOME_PIPELINE_V1);
  });

  it('refuses a mark it cannot place', () => {
    tournamentEngine.reset();
    let result: any = tournamentEngine.loadedFootprint({ shards: ['shell'] });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
    tournamentEngine.setState(tournamentRecord);
    result = tournamentEngine.loadedFootprint({ shards: 'shell' });
    expect(result.error).toEqual(INVALID_VALUES);
  });
});
