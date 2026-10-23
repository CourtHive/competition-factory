import { cellId, scaleCells, scaleScenario } from '@Tests/testHarness/corpus/schedulingScale';
import { scheduleProfileVNext } from '@Mutate/matchUps/schedule/pipeline/scheduleProfile';
import { scheduleProfileRounds } from '@Mutate/matchUps/schedule/scheduleProfileRounds';
import { schedulingScenarios } from '@Tests/testHarness/corpus/schedulingSources';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';
import { setClock } from '@Tools/clock';

/**
 * The end-to-end differential (SCHEDULING_PIPELINE_VNEXT.md § 7): vNext's view → plan → write must leave the records
 * exactly as v1's `scheduleProfileRounds` leaves them, and return exactly what it returns, call for call. Each call runs
 * on two clones of the engine's record, on one clock, both as a dry run and for real, at every `scheduleProfileRounds`
 * step of every authored scheduling scenario and every scale cell. A scale cell is then run twice more over what its run
 * wrote: again as it stands (every matchUp already timed), and with its dates cleared first.
 *
 * The scale matrix runs a sample of its cells by default; `SCHEDULING_DIFFERENTIAL=all` runs every cell.
 */
const CLOCK = '2026-10-01T12:00:00.000Z';

function sameCall(params: any) {
  const { tournamentRecord } = tournamentEngine.getTournament();
  const clone = () => ({ [tournamentRecord.tournamentId]: structuredClone(tournamentRecord) });
  let placed = 0;
  for (const dryRun of [true, false]) {
    const v1Records = clone();
    const vNextRecords = clone();
    setClock(CLOCK);
    const expected: any = scheduleProfileRounds({ ...params, dryRun, tournamentRecords: v1Records });
    const actual: any = scheduleProfileVNext({ ...params, dryRun, tournamentRecords: vNextRecords });
    setClock();
    expect(actual).toEqual(expected);
    expect(JSON.stringify(vNextRecords)).toEqual(JSON.stringify(v1Records));
    placed += Object.values(expected.scheduledMatchUpIds ?? {}).flat().length;
  }
  return placed;
}

function differential(initialRecord: any, directives: any[], rerun?: boolean) {
  tournamentEngine.reset();
  tournamentEngine.setState(initialRecord, true);
  let placed = 0;
  let steps = 0;
  for (const { method, params = {} } of directives) {
    if (method === 'scheduleProfileRounds') {
      placed += sameCall(params);
      steps += 1;
    }
    tournamentEngine[method](params);
    if (method === 'scheduleProfileRounds' && rerun) {
      sameCall(params);
      sameCall({ ...params, clearScheduleDates: params.scheduleDates ?? true });
    }
  }
  return { placed, steps };
}

const all = process.env.SCHEDULING_DIFFERENTIAL === 'all';

describe('vNext writes and returns what v1 writes and returns', () => {
  const authored = schedulingScenarios().filter(({ directives }) =>
    directives.some(({ method }) => method === 'scheduleProfileRounds'),
  );

  it.each(authored.map((scenario) => [scenario.scenarioId, scenario]))('%s', (_, scenario: any) => {
    const { steps } = differential(scenario.initialRecord, scenario.directives);
    expect(steps).toBeGreaterThan(0);
  });

  it('a placement before a played source is refused, by both', () => {
    // round 1 played on day 2, with scores; round 2 profiled on day 1, where its sources have not yet been played
    const DAYS = ['2026-10-01', '2026-10-02'];
    mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueId: 'venue-1', courtsCount: 4, startTime: '08:00', endTime: '20:00' }],
      drawProfiles: [{ drawSize: 8 }],
      startDate: DAYS[0],
      endDate: DAYS[1],
      setState: true,
    });
    const { tournamentRecord } = tournamentEngine.getTournament();
    const { tournamentId } = tournamentRecord;
    const { eventId, drawDefinitions } = tournamentRecord.events[0];
    const { drawId, structures } = drawDefinitions[0];
    const roundOne = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } }).matchUps;
    for (const { matchUpId } of roundOne) {
      let result: any = tournamentEngine.addMatchUpScheduleItems({
        schedule: { scheduledDate: DAYS[1], scheduledTime: '09:00' },
        matchUpId,
        drawId,
      });
      expect(result.success).toEqual(true);
      const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
      result = tournamentEngine.setMatchUpStatus({ matchUpId, drawId, outcome });
      expect(result.success).toEqual(true);
    }
    tournamentEngine.addSchedulingProfileRound({
      round: { tournamentId, eventId, drawId, structureId: structures[0].structureId, roundNumber: 2 },
      scheduleDate: DAYS[0],
      venueId: 'venue-1',
    });
    const placed = sameCall({ scheduleDates: [DAYS[0]] });
    // planned in the dry run (2 matchUps), refused for real: nothing is written
    expect(placed).toEqual(2);
    const { tournamentRecord: after } = tournamentEngine.getTournament();
    const v1: any = scheduleProfileRounds({ tournamentRecords: { [tournamentId]: after }, scheduleDates: [DAYS[0]] });
    expect(v1.scheduledMatchUpIds[DAYS[0]]).toEqual([]);
    expect(v1.noTimeMatchUpIds[DAYS[0]].length).toEqual(2);
  });

  const cells = scaleCells().filter((_, index) => all || index % 8 === 3);
  it.each(cells.map((cell) => [cellId(cell), cell]))('%s', (_, cell: any) => {
    const { initialRecord, directives } = scaleScenario(cell);
    // the grid run is left out: only the timed run is vNext's
    const timed = directives.filter(({ method }) => method !== 'scheduleProfileGrid');
    const { placed, steps } = differential(initialRecord, timed, true);
    expect(steps).toEqual(1);
    expect(placed).toBeGreaterThan(0);
  });
});
