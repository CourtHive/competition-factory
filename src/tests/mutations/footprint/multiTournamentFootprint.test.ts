import { reduceRecordToFootprint } from '@Query/footprint/reduceRecordToFootprint';
import { getMutationFootprint, type MutationFootprint } from '@Query/footprint/getMutationFootprint';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { setRandomSource } from '@Tools/prng';
import { expect, it, describe } from 'vitest';
import { setClock } from '@Tools/clock';

// constants
import { OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2 } from '@Constants/outcomePipelineConstants';
import { FOOTPRINT_NOT_LOADED } from '@Constants/errorConditionConstants';

/**
 * A queue that reaches more than one tournament: `bulkMatchUpStatusUpdate` with outcomes in two linked tournaments.
 * Asked once per tournament (`tournamentId`), the footprint is that tournament's part, and the records reduced to their
 * parts give the same draws as the whole records. The partial-record guard checks every marked record, not only the
 * one the method runs against.
 */

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

function tournament() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    // random ids: two tournaments, two sets of draws
    drawProfiles: [{ drawSize: 8 }, { drawSize: 4 }],
  });
  tournamentEngine.setState(tournamentRecord);
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true });
  const { matchUpId, eventId, drawId } = matchUps.find((m: any) => m.roundNumber === 1 && m.sides?.[0]?.participantId);
  return {
    tournamentRecord,
    outcome: { ...outcome, tournamentId: tournamentRecord.tournamentId, matchUpId, eventId, drawId },
  };
}

const drawsOf = (records: any) =>
  Object.fromEntries(
    Object.values(records).flatMap((record: any) =>
      (record.events ?? []).flatMap((event: any) => (event.drawDefinitions ?? []).map((d: any) => [d.drawId, d])),
    ),
  );

// a draw without the stamps a run writes from the clock, and without keys whose value is undefined
const strip = (value: any): any => {
  if (Array.isArray(value)) return value.map(strip);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, v]) => key !== 'factory' && v !== undefined)
      .map(([key, v]) => [key, strip(v)]),
  );
};

function run(records: any[], methods: any[], mark?: (engine: any) => void) {
  setClock('2026-06-02T10:00:00.000Z');
  setRandomSource(7);
  tournamentEngine.reset();
  tournamentEngine.outcomePipeline(OUTCOME_PIPELINE_V2);
  tournamentEngine.setState(records.map((record) => structuredClone(record)));
  tournamentEngine.setTournamentId(records[0].tournamentId);
  mark?.(tournamentEngine);
  const result: any = tournamentEngine.executionQueue(methods);
  const after = tournamentEngine.getState().tournamentRecords;
  tournamentEngine.outcomePipeline(OUTCOME_PIPELINE_V1);
  setRandomSource();
  setClock();
  return { result, after };
}

describe('footprints across tournaments', () => {
  const one = tournament();
  const two = tournament();
  const records = [one.tournamentRecord, two.tournamentRecord];
  const methods = [{ method: 'bulkMatchUpStatusUpdate', params: { outcomes: [one.outcome, two.outcome] } }];
  const footprintOf = (tournamentId: string) =>
    getMutationFootprint({ methods, outcomePipeline: OUTCOME_PIPELINE_V2, tournamentId });

  it("each tournament's footprint is the draws of its own outcomes", () => {
    expect(getMutationFootprint({ methods, outcomePipeline: OUTCOME_PIPELINE_V2 }).tournament).toEqual(true);
    for (const { tournamentRecord, outcome } of [one, two]) {
      const footprint = footprintOf(tournamentRecord.tournamentId);
      expect(footprint.tournament).toEqual(false);
      expect(footprint.drawIds).toEqual([outcome.drawId]);
    }
    expect(footprintOf('elsewhere').shards).toEqual(['shell']);
  });

  it('the records reduced to their footprints give the same draws as the whole records', () => {
    const whole = run(records, methods);
    expect(whole.result.success).toEqual(true);

    const partialRecords = records.map((tournamentRecord) =>
      reduceRecordToFootprint({ tournamentRecord, footprint: footprintOf(tournamentRecord.tournamentId) }),
    );
    const partial = run(partialRecords, methods, (engine) => {
      for (const { tournamentId } of records) {
        const result: any = engine.loadedFootprint(footprintOf(tournamentId), tournamentId);
        expect(result.success).toEqual(true);
      }
    });
    expect(partial.result.success).toEqual(true);

    const wholeDraws = drawsOf(whole.after);
    const partialDraws = drawsOf(partial.after);
    expect(Object.keys(partialDraws).sort()).toEqual([one.outcome.drawId, two.outcome.drawId].sort());
    for (const drawId of Object.keys(partialDraws))
      expect(strip(partialDraws[drawId])).toEqual(strip(wholeDraws[drawId]));
  });

  it('refuses when a tournament the method reaches was loaded without its draw, not only the active one', () => {
    // the active tournament whole; the second as its shell alone
    const shellOnly: MutationFootprint = {
      tournament: false,
      shards: ['shell'],
      drawIds: [],
      eventIds: [],
      wholeRecordMethods: [],
    };
    const partialTwo = reduceRecordToFootprint({ tournamentRecord: two.tournamentRecord, footprint: shellOnly });
    const { result } = run([one.tournamentRecord, partialTwo], methods, (engine) => {
      expect(engine.loadedFootprint(shellOnly, two.tournamentRecord.tournamentId).success).toEqual(true);
    });
    expect(result.error).toEqual(FOOTPRINT_NOT_LOADED);
    expect(result.context?.tournamentId).toEqual(two.tournamentRecord.tournamentId);
  });
});
