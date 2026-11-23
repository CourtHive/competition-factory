import { buildSchedulingView } from '@Mutate/matchUps/schedule/pipeline/view';
import { planSchedule } from '@Mutate/matchUps/schedule/pipeline/plan';
import { chunkArray, shuffleArray } from '@Tools/arrays';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setRandomSource } from '@Tools/prng';
import { appendFileSync } from 'node:fs';
import { it } from 'vitest';

// constants and types
import { COMPASS, CONSOLATION, FEED_IN_CHAMPIONSHIP, MAIN } from '@Constants/drawDefinitionConstants';
import { DOUBLES_EVENT, SINGLES_EVENT } from '@Constants/eventConstants';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { COMPETITOR } from '@Constants/participantRoles';

// Fixtures
import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';

/**
 * Opt-in: `SCHEDULING_BENCH=1 [SCHEDULING_BENCH_OUT=<file>] pnpm vitest run src/tests/bench/schedulingBench.test.ts`.
 *
 * Times v1's schedulers on one large fixture (SCHEDULING_PIPELINE_VNEXT.md § 7): a 128 feed-in championship (main and
 * consolation) and a 64 single elimination, two venues of 12 courts, profiled over three days. Each case runs from the
 * same starting record, `RUNS` times; the median is reported. "Mid" cases start from a record whose day-1 matchUps are
 * all played, which is where the played-order check and the already-timed recovery lookup do their work.
 */
const enabled = process.env.SCHEDULING_BENCH === '1';
const RUNS = Number(process.env.SCHEDULING_BENCH_RUNS ?? 3);
const DAYS = ['2026-10-01', '2026-10-02', '2026-10-03'];

const median = (values: number[]) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];

function timed(record: any, run: () => any) {
  const times: number[] = [];
  let result: any;
  for (let i = 0; i < RUNS; i += 1) {
    tournamentEngine.setState(structuredClone(record));
    const start = performance.now();
    result = run();
    times.push(performance.now() - start);
  }
  return {
    ms: Math.round(median(times)),
    success: !!result?.success,
    error: result?.error?.code,
    ...(result?.placed === undefined ? {} : { placed: result.placed }),
  };
}

function fixture() {
  const venueProfiles = [1, 2].map((n) => ({
    venueId: `venue-${n}`,
    courtsCount: 12,
    startTime: '08:00',
    endTime: '22:00',
  }));
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 128, drawType: FEED_IN_CHAMPIONSHIP }, { drawSize: 64 }],
    policyDefinitions: POLICY_SCHEDULING_DEFAULT,
    startDate: DAYS[0],
    endDate: DAYS[2],
    venueProfiles,
  });
  tournamentEngine.setState(tournamentRecord);
  const { tournamentId } = tournamentRecord;
  const add = (scheduleDate: string, event: any, stage: string, roundNumber: number, venueId: string) => {
    const drawDefinition = event.drawDefinitions[0];
    const structure = drawDefinition.structures.find((s: any) => s.stage === stage);
    if (!structure) return;
    tournamentEngine.addSchedulingProfileRound({
      round: {
        tournamentId,
        eventId: event.eventId,
        drawId: drawDefinition.drawId,
        structureId: structure.structureId,
        roundNumber,
      },
      scheduleDate,
      venueId,
    });
  };
  const [fic, se] = tournamentRecord.events;
  const plan: [string, any, string, number[], string][] = [
    [DAYS[0], fic, MAIN, [1, 2], 'venue-1'],
    [DAYS[0], fic, CONSOLATION, [1, 2], 'venue-1'],
    [DAYS[0], se, MAIN, [1, 2], 'venue-2'],
    [DAYS[1], fic, MAIN, [3, 4], 'venue-1'],
    [DAYS[1], fic, CONSOLATION, [3, 4, 5], 'venue-1'],
    [DAYS[1], se, MAIN, [3, 4], 'venue-2'],
    [DAYS[2], fic, MAIN, [5, 6, 7], 'venue-1'],
    [DAYS[2], fic, CONSOLATION, [6, 7, 8, 9, 10, 11, 12], 'venue-1'],
    [DAYS[2], se, MAIN, [5, 6], 'venue-2'],
  ];
  for (const [day, event, stage, rounds, venueId] of plan)
    for (const roundNumber of rounds) add(day, event, stage, roundNumber, venueId);
  return tournamentEngine.getTournament().tournamentRecord;
}

/** every day-1 matchUp with two participants played, side 1 winning, until none is left */
function playDayOne() {
  let played = 1;
  while (played) {
    played = 0;
    for (const m of tournamentEngine.allTournamentMatchUps().matchUps) {
      const occupants = (m.sides ?? []).filter((side: any) => side?.participantId);
      if (m.schedule?.scheduledDate !== DAYS[0] || m.winningSide || occupants.length !== 2) continue;
      const outcome = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome;
      if (tournamentEngine.setMatchUpStatus({ matchUpId: m.matchUpId, drawId: m.drawId, outcome }).success) played += 1;
    }
  }
}

function currentRecords() {
  const { tournamentRecord } = tournamentEngine.getTournament();
  return { [tournamentRecord.tournamentId]: tournamentRecord };
}
const vNextView = (params: any): any => buildSchedulingView({ tournamentRecords: currentRecords(), ...params });
function vNext(params: any) {
  const plan = planSchedule({ view: vNextView(params), ...params });
  return { success: !!plan };
}
/** the plan alone, from a view built outside the timing */
function timedPlan(record: any, params: any) {
  const times: number[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    tournamentEngine.setState(structuredClone(record));
    const view = vNextView(params);
    const start = performance.now();
    planSchedule({ view, ...params });
    times.push(performance.now() - start);
  }
  return { ms: Math.round(median(times)), success: true };
}

/**
 * Direct scheduling on a COMPASS 128 SINGLES (312 matchUps, one venue of 16 courts), and in a second pass with a
 * COMPASS 64 DOUBLES beside it whose pairs are the same 128 players: `scheduleMatchUps` called day by day with every
 * matchUp not yet timed, until none is left. COMPASS multiplies the participants who can reach each potential matchUp,
 * which the 128 feed-in fixture does not, and the doubles pass puts every player in two draws, so their day loads,
 * recovery and daily limits (SINGLES, DOUBLES and TOTAL) run across both (SCHEDULING_PIPELINE_VNEXT.md § 7.0, the
 * direct-scheduling regression). Generated under a seeded random source: the players, the draws and the pairings are
 * the same in every run.
 */
const COMPASS_SEED = 12_802;
const COMPASS_DAYS = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];

function compassFixture({ doubles }: { doubles: boolean }) {
  setRandomSource(COMPASS_SEED);
  try {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueId: 'venue-c', courtsCount: 16, startTime: '08:00', endTime: '22:00' }],
      drawProfiles: [{ drawSize: 128, drawType: COMPASS, eventType: SINGLES_EVENT }],
      participantsProfile: { participantsCount: 128 },
      policyDefinitions: POLICY_SCHEDULING_DEFAULT,
      startDate: COMPASS_DAYS[0],
      endDate: COMPASS_DAYS.at(-1),
    });
    if (!doubles) return tournamentRecord;

    // the singles players, paired by a seeded shuffle, entered in a COMPASS 64 DOUBLES
    tournamentEngine.setState(tournamentRecord);
    const individualIds = tournamentRecord.participants
      .filter(({ participantType }) => participantType === INDIVIDUAL)
      .map(({ participantId }) => participantId);
    const shuffled = shuffleArray(individualIds);
    const pairs = chunkArray(shuffled, 2).map((individualParticipantIds) => ({
      participantRole: COMPETITOR,
      participantType: PAIR,
      individualParticipantIds,
    }));
    const added: any = tournamentEngine.addParticipants({ participants: pairs, returnParticipants: true });
    if (!added.success) throw new Error('pairs');
    const pairIds = added.participants.map(({ participantId }) => participantId);
    const event: any = tournamentEngine.addEvent({ event: { eventName: 'Doubles', eventType: DOUBLES_EVENT } });
    const { eventId } = event.event;
    tournamentEngine.addEventEntries({ eventId, participantIds: pairIds });
    const { drawDefinition } = tournamentEngine.generateDrawDefinition({ eventId, drawType: COMPASS, drawSize: 64 });
    if (!tournamentEngine.addDrawDefinition({ eventId, drawDefinition }).success) throw new Error('doubles draw');
    return tournamentEngine.getTournament().tournamentRecord;
  } finally {
    setRandomSource();
  }
}

/** what must not vary between runs: the pairs, each draw's positions, and every matchUp's id */
function compassShape(record: any) {
  const pairs = record.participants
    .filter(({ participantType }) => participantType === PAIR)
    .map(({ participantId, individualParticipantIds }) => [participantId, ...individualParticipantIds]);
  const draws = record.events.flatMap((event: any) =>
    event.drawDefinitions.flatMap((drawDefinition: any) =>
      drawDefinition.structures.map((structure: any) => ({
        positions: structure.positionAssignments?.map(({ drawPosition, participantId, bye }) => [
          drawPosition,
          participantId ?? (bye ? 'BYE' : ''),
        ]),
        matchUpIds: structure.matchUps?.map(({ matchUpId }) => matchUpId),
      })),
    ),
  );
  return JSON.stringify({ pairs, draws });
}

function directDayByDay() {
  let placed = 0;
  for (const scheduleDate of COMPASS_DAYS) {
    const matchUpIds = tournamentEngine
      .allTournamentMatchUps({ inContext: true })
      .matchUps.filter((m: any) => !m.schedule?.scheduledTime && m.matchUpStatus !== 'BYE')
      .map((m: any) => m.matchUpId);
    if (!matchUpIds.length) break;
    const result = tournamentEngine.scheduleMatchUps({ scheduleDate, matchUpIds, venueIds: ['venue-c'] });
    placed += result.scheduledMatchUpIds?.length ?? 0;
  }
  return { success: placed > 0, placed };
}

it.skipIf(!enabled)('scheduling bench', () => {
  const fresh = fixture();
  const matchUpCount = tournamentEngine.allTournamentMatchUps().matchUps.length;

  tournamentEngine.setState(structuredClone(fresh));
  tournamentEngine.scheduleProfileRounds({ scheduleDates: DAYS });
  playDayOne();
  const mid = tournamentEngine.getTournament().tournamentRecord;
  const playedCount = tournamentEngine.allTournamentMatchUps().matchUps.filter((m: any) => m.winningSide).length;

  const se = fresh.events[1];
  const seIds = (record: any) =>
    record.events[1].drawDefinitions[0].structures[0].matchUps.map((m: any) => m.matchUpId);

  // the doubles pass is the same players in pairs, and the seed makes it the same tournament every time
  const compassDoubles = compassFixture({ doubles: true });
  if (compassShape(compassDoubles) !== compassShape(compassFixture({ doubles: true })))
    throw new Error('the seeded COMPASS fixture differs between builds');
  const singlesIds = new Set(
    compassDoubles.participants
      .filter(({ participantType }) => participantType === INDIVIDUAL)
      .map((p) => p.participantId),
  );
  const pairs = compassDoubles.participants.filter(({ participantType }) => participantType === PAIR);
  if (pairs.length !== 64 || !pairs.every((pair) => pair.individualParticipantIds.every((id) => singlesIds.has(id))))
    throw new Error('the doubles pairs are not the singles players');

  // the grid as TMX renders it, after a grid run: the date's matchUps, then the conflicts over them
  tournamentEngine.setState(structuredClone(fresh));
  tournamentEngine.scheduleProfileGrid({ scheduleDates: DAYS });
  const gridded = tournamentEngine.getTournament().tournamentRecord;
  const dayMatchUps = () =>
    tournamentEngine.competitionScheduleMatchUps({ matchUpFilters: { scheduledDate: DAYS[0] } }).dateMatchUps ?? [];
  tournamentEngine.setState(structuredClone(gridded));
  const griddedMatchUps = dayMatchUps();
  if (!griddedMatchUps.some((m: any) => m.schedule?.courtOrder)) throw new Error('the grid run placed nothing');

  const results = {
    matchUpCount,
    playedCount,
    profileFresh: timed(fresh, () => tournamentEngine.scheduleProfileRounds({ scheduleDates: DAYS })),
    profileMid: timed(mid, () =>
      tournamentEngine.scheduleProfileRounds({ scheduleDates: DAYS.slice(1), clearScheduleDates: DAYS.slice(1) }),
    ),
    gridFresh: timed(fresh, () => tournamentEngine.scheduleProfileGrid({ scheduleDates: DAYS })),
    gridMid: timed(mid, () => tournamentEngine.scheduleProfileGrid({ scheduleDates: DAYS.slice(1) })),
    scheduleMatchUpsFresh: timed(fresh, () =>
      tournamentEngine.scheduleMatchUps({ scheduleDate: DAYS[0], matchUpIds: seIds(fresh), venueIds: ['venue-2'] }),
    ),
    scheduleMatchUpsMid: timed(mid, () =>
      tournamentEngine.scheduleMatchUps({ scheduleDate: DAYS[1], matchUpIds: seIds(mid), venueIds: ['venue-2'] }),
    ),
    compassDirect: timed(compassFixture({ doubles: false }), directDayByDay),
    compassDoublesDirect: timed(compassDoubles, directDayByDay),
    eventId: se.eventId ? 'ok' : 'missing',
    // vNext against v1's dry run of the same call: the view, the plan, and both together
    dryRunFresh: timed(fresh, () => tournamentEngine.scheduleProfileRounds({ scheduleDates: DAYS, dryRun: true })),
    viewFresh: timed(fresh, () => ({ success: !vNextView({ scheduleDates: DAYS }).error })),
    planFresh: timedPlan(fresh, { scheduleDates: DAYS }),
    vNextFresh: timed(fresh, () => vNext({ scheduleDates: DAYS })),
    dryRunMid: timed(mid, () =>
      tournamentEngine.scheduleProfileRounds({
        scheduleDates: DAYS.slice(1),
        clearScheduleDates: DAYS.slice(1),
        dryRun: true,
      }),
    ),
    vNextMid: timed(mid, () => vNext({ scheduleDates: DAYS.slice(1), clearScheduleDates: DAYS.slice(1) })),
    gridDayMatchUps: timed(gridded, () => ({ success: dayMatchUps().length > 0 })),
    proConflicts: timed(gridded, () => {
      const result: any = tournamentEngine.proConflicts({ matchUps: structuredClone(griddedMatchUps) });
      return { success: !!result?.rowIssues };
    }),
  };
  const line = JSON.stringify({ label: process.env.SCHEDULING_BENCH_LABEL ?? 'local', runs: RUNS, ...results });
  process.stderr.write(`\nSCHEDULING_BENCH ${line}\n`);
  if (process.env.SCHEDULING_BENCH_OUT) appendFileSync(process.env.SCHEDULING_BENCH_OUT, line + '\n');
});
