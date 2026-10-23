import { SCHEDULING_REPORT_PROPERTIES } from '../scheduling/schedulingReportProperties';
import { cellId, pinnedScaleCells, pinnedScaleScenario } from './schedulingScale';
import { CorpusWriteError, writeScenario, type Directive } from './writeScenario';
import { SCHEDULING_STEP_PROPERTIES } from '../scheduling/schedulingProperties';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setRandomSource } from '@Tools/prng';
import { setClock } from '@Tools/clock';
import path from 'path';
import fs from 'fs';

// constants and fixtures
import { CONSOLATION, FEED_IN_CHAMPIONSHIP_TO_QF, MAIN } from '@Constants/drawDefinitionConstants';
import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';
import { NO_VALID_DATES } from '@Constants/errorConditionConstants';
import { BYE } from '@Constants/matchUpStatusConstants';
import { TOTAL } from '@Constants/scheduleConstants';
import { SINGLES } from '@Constants/matchUpTypes';

/**
 * Golden corpus § 5 of `Mentat/planning/SCHEDULING_PIPELINE_VNEXT.md`: authored scheduling scenarios, one per rule the
 * scheduling spec will state. Each is a generated record (on the corpus clock and its own seed, so it reproduces), the
 * directives that build a scheduling profile and run a scheduler, and the claims the record the patches rebuild must
 * satisfy. Every scenario claims the scheduling step properties (INVARIANTS.md), so the writer refuses one whose
 * scheduler breaks them; a scenario that pins a defect instead names it in `knownFailure` and is not graded.
 *
 * The deferral report each scheduling step records as its `value` is part of the pin: what the scheduler left
 * unscheduled, and why, moves the manifest's results hash.
 */
const CLOCK = '2026-10-01T12:00:00.000Z';
const SEED = 5000;
const VENUE_ID = 'venue-1';
const DAY_1 = '2026-10-01';
const DAY_2 = '2026-10-02';

type Authored = {
  scenarioId: string;
  ref: string;
  initialRecord: any;
  directives: Directive[];
  knownFailure?: string;
  /** the steps expected to be refused, by index, with their error code; every other step must succeed */
  expectedErrors?: { [stepIndex: number]: string };
  /** returns the claims that FAIL, as sentences, asked of the final record and every step's value */
  finalState?: (record: any, values: any[]) => string[];
};

const claim = (ok: boolean, sentence: string) => (ok ? [] : [sentence]);

function generate({ drawProfile, policyDefinitions, courtsCount = 8 }: any) {
  setClock(CLOCK);
  setRandomSource(SEED);
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    venueProfiles: [{ startTime: '08:00', endTime: '20:00', courtsCount, venueId: VENUE_ID }],
    drawProfiles: [drawProfile],
    policyDefinitions,
    startDate: DAY_1,
    endDate: DAY_2,
  });
  setClock();
  setRandomSource();
  tournamentEngine.reset();
  tournamentEngine.setState(tournamentRecord);

  const { tournamentId } = tournamentRecord;
  const { eventId, drawDefinitions } = tournamentRecord.events[0];
  const { drawId, structures } = drawDefinitions[0];
  const structureId = (stage: string) => structures.find((structure: any) => structure.stage === stage).structureId;
  const round = (scheduleDate: string, stage: string, roundNumber: number): Directive => ({
    method: 'addSchedulingProfileRound',
    params: {
      round: { tournamentId, eventId, drawId, structureId: structureId(stage), roundNumber },
      venueId: VENUE_ID,
      scheduleDate,
    },
  });
  const matchUpsOf = (stage: string, roundNumber: number) =>
    tournamentEngine
      .allTournamentMatchUps()
      .matchUps.filter((m: any) => m.stage === stage && m.roundNumber === roundNumber);
  return { tournamentRecord, round, matchUpsOf, drawId };
}

const profileRun = (scheduleDates: string[]): Directive => ({
  method: 'scheduleProfileRounds',
  params: { scheduleDates },
});

/** the raw matchUps of a record at a stage and round, with their stored schedule */
function rawRound(record: any, stage: string, roundNumber: number): any[] {
  const structures = record.events[0].drawDefinitions[0].structures;
  return structures
    .filter((structure: any) => structure.stage === stage)
    .flatMap((structure: any) => structure.matchUps ?? [])
    .filter((matchUp: any) => matchUp.roundNumber === roundNumber);
}

const timedOn = (matchUps: any[], date: string) =>
  matchUps.filter((matchUp) => matchUp.schedule?.scheduledDate === date && matchUp.schedule?.scheduledTime).length;

export function schedulingScenarios(): Authored[] {
  const out: Authored[] = [];

  {
    // the profile's rounds on one day: every R1 and R2 matchUp of a 16 draw is placed
    const { tournamentRecord, round } = generate({
      policyDefinitions: POLICY_SCHEDULING_DEFAULT,
      drawProfile: { drawSize: 16 },
    });
    out.push({
      scenarioId: 'authored/scheduling/profile-one-day',
      ref: 'scheduling § timed pipeline: a profiled round is placed on its date, its dependents after it',
      initialRecord: tournamentRecord,
      // the run twice: the repeat places nothing (SCHEDULE_RERUN_STABLE)
      directives: [round(DAY_1, MAIN, 1), round(DAY_1, MAIN, 2), profileRun([DAY_1]), profileRun([DAY_1])],
      finalState: (record) => [
        ...claim(timedOn(rawRound(record, MAIN, 1), DAY_1) === 8, 'all 8 R1 matchUps timed on day 1'),
        ...claim(timedOn(rawRound(record, MAIN, 2), DAY_1) === 4, 'all 4 R2 matchUps timed on day 1'),
      ],
    });
  }

  {
    // R3, R4 and the final of a 32 draw on one day would be three singles for a finalist: the default limit is two
    const { tournamentRecord, round, matchUpsOf } = generate({
      policyDefinitions: POLICY_SCHEDULING_DEFAULT,
      drawProfile: { drawSize: 32 },
    });
    const [final] = matchUpsOf(MAIN, 5);
    out.push({
      scenarioId: 'authored/scheduling/daily-limit-holds-the-final',
      ref: 'scheduling § daily limits: a matchUp that would take a participant over the day limit is left unscheduled',
      initialRecord: tournamentRecord,
      directives: [
        ...[1, 2].map((roundNumber) => round(DAY_1, MAIN, roundNumber)),
        ...[3, 4, 5].map((roundNumber) => round(DAY_2, MAIN, roundNumber)),
        profileRun([DAY_1, DAY_2]),
      ],
      finalState: (record, values) => [
        ...claim(timedOn(rawRound(record, MAIN, 5), DAY_2) === 0, 'the final is not timed'),
        ...claim(
          JSON.stringify(values.at(-1)?.overLimitMatchUpIds?.[DAY_2]) === JSON.stringify([final.matchUpId]),
          'the final is reported over the limit on day 2',
        ),
      ],
    });
  }

  {
    // CA 2026-10-16 (plan § 8.1): a feeder's winner path and loser path are alternatives, not a sum. R1 plus EITHER main
    // R2 OR consolation R1 is two singles, inside the limit, so all four consolation R1 matchUps are placed beside R2
    const { tournamentRecord, round } = generate({
      policyDefinitions: POLICY_SCHEDULING_DEFAULT,
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP_TO_QF },
      courtsCount: 17,
    });
    out.push({
      scenarioId: 'authored/scheduling/exclusive-paths-share-a-day',
      ref: 'scheduling § reachability: exclusive winner and loser paths count once against a daily limit',
      initialRecord: tournamentRecord,
      directives: [round(DAY_1, MAIN, 1), round(DAY_1, MAIN, 2), round(DAY_1, CONSOLATION, 1), profileRun([DAY_1])],
      finalState: (record) => [
        ...claim(timedOn(rawRound(record, MAIN, 2), DAY_1) === 4, 'all 4 main R2 matchUps timed'),
        ...claim(timedOn(rawRound(record, CONSOLATION, 1), DAY_1) === 4, 'all 4 consolation R1 matchUps timed'),
      ],
    });
  }

  {
    // plan § 3 P6: a feeder scheduled on an earlier date still counts. R1 on day 1 unscored, R2 to R4 on day 2 under a
    // limit of two: a finalist would play three on day 2, so R4 stays unscheduled
    const { tournamentRecord, round } = generate({ drawProfile: { drawSize: 16 } });
    out.push({
      scenarioId: 'authored/scheduling/prior-date-feeder-counts',
      ref: 'scheduling § daily limits: a participant reachable from an earlier date counts against today',
      initialRecord: tournamentRecord,
      directives: [
        { method: 'setMatchUpDailyLimits', params: { dailyLimits: { [SINGLES]: 2, [TOTAL]: 2 } } },
        round(DAY_1, MAIN, 1),
        profileRun([DAY_1]),
        ...[2, 3, 4].map((roundNumber) => round(DAY_2, MAIN, roundNumber)),
        profileRun([DAY_2]),
      ],
      finalState: (record) => [
        ...claim(timedOn(rawRound(record, MAIN, 2), DAY_2) === 4, 'all 4 R2 matchUps timed on day 2'),
        ...claim(timedOn(rawRound(record, MAIN, 3), DAY_2) === 2, 'both R3 matchUps timed on day 2'),
        ...claim(timedOn(rawRound(record, MAIN, 4), DAY_2) === 0, 'the final is not timed on day 2'),
      ],
    });
  }

  {
    // a draw with BYEs: the BYE matchUps of a profiled round are never timed
    const { tournamentRecord, round } = generate({
      policyDefinitions: POLICY_SCHEDULING_DEFAULT,
      drawProfile: { drawSize: 16, participantsCount: 12 },
    });
    out.push({
      scenarioId: 'authored/scheduling/byes-are-not-timed',
      ref: 'scheduling § what is scheduled: a BYE is never placed',
      initialRecord: tournamentRecord,
      directives: [round(DAY_1, MAIN, 1), round(DAY_1, MAIN, 2), profileRun([DAY_1])],
      finalState: (record) => {
        const r1 = rawRound(record, MAIN, 1);
        const byes = r1.filter((matchUp) => matchUp.matchUpStatus === BYE);
        return [
          ...claim(byes.length === 4, 'four R1 BYEs'),
          ...claim(timedOn(byes, DAY_1) === 0, 'no BYE timed'),
          ...claim(timedOn(r1, DAY_1) === 4, 'the four R1 matchUps with two participants are timed'),
        ];
      },
    });
  }

  {
    // spec § 2: a profile with no date left once `scheduleDates` narrows it is refused, and writes nothing
    const { tournamentRecord, round } = generate({ drawProfile: { drawSize: 8 } });
    out.push({
      scenarioId: 'authored/scheduling/profile-no-valid-dates',
      ref: 'scheduling § 2: NO_VALID_DATES when scheduleDates leaves no profile date',
      initialRecord: tournamentRecord,
      directives: [round(DAY_1, MAIN, 1), profileRun([DAY_2])],
      expectedErrors: { 1: NO_VALID_DATES.code },
    });
  }

  {
    // spec § 2: an empty profile is not refused; the call succeeds and places nothing
    const { tournamentRecord } = generate({ drawProfile: { drawSize: 8 } });
    out.push({
      scenarioId: 'authored/scheduling/empty-profile-places-nothing',
      ref: 'scheduling § 2: an empty profile succeeds and places nothing',
      initialRecord: tournamentRecord,
      directives: [profileRun([DAY_1])],
      finalState: (record) => claim(timedOn(rawRound(record, MAIN, 1), DAY_1) === 0, 'nothing timed'),
    });
  }

  {
    // spec § 2 and § 4: a profile that orders R2 before R1 is neither refused nor reported by the scheduler (the query
    // getSchedulingProfileIssues reports it), and the gate's dependency rule still places R1 first
    const { tournamentRecord, round } = generate({
      policyDefinitions: POLICY_SCHEDULING_DEFAULT,
      drawProfile: { drawSize: 8 },
    });
    out.push({
      scenarioId: 'authored/scheduling/profile-out-of-order',
      ref: 'scheduling § 2, § 4: rounds profiled out of order are placed in dependency order',
      initialRecord: tournamentRecord,
      directives: [round(DAY_1, MAIN, 2), round(DAY_1, MAIN, 1), profileRun([DAY_1])],
      finalState: (record) => {
        const latestR1 =
          rawRound(record, MAIN, 1)
            .map((m) => m.schedule?.scheduledTime ?? '')
            .toSorted((a: string, b: string) => a.localeCompare(b))
            .at(-1) ?? '';
        const earliestR2 =
          rawRound(record, MAIN, 2)
            .map((m) => m.schedule?.scheduledTime ?? '')
            .toSorted((a: string, b: string) => a.localeCompare(b))[0] ?? '';
        return [
          ...claim(timedOn(rawRound(record, MAIN, 1), DAY_1) === 4, 'all of R1 timed'),
          ...claim(!!earliestR2 && earliestR2 > latestR1, `R2 (${earliestR2}) after R1 (${latestR1})`),
        ];
      },
    });
  }

  {
    // C1 (found building this corpus, 2026-10-22; CA: recovery is calculated): a COMPLETED matchUp still holds its
    // participants. Main R1 at 08:00 is completed, and a second profile run places consolation R1, whose players are
    // R1's losers, only once R1's 90 minutes and 60 of recovery are over
    const { tournamentRecord, round, matchUpsOf, drawId } = generate({
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP_TO_QF },
      courtsCount: 17,
    });
    const outcome = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome;
    out.push({
      scenarioId: 'authored/scheduling/completed-feeder-recovery',
      ref: 'scheduling § recovery: a completed matchUp earlier the same day still holds its participants',
      initialRecord: tournamentRecord,
      directives: [
        { method: 'setMatchUpDailyLimits', params: { dailyLimits: { [SINGLES]: 2, [TOTAL]: 3 } } },
        round(DAY_1, MAIN, 1),
        round(DAY_1, MAIN, 2),
        profileRun([DAY_1]),
        ...matchUpsOf(MAIN, 1).map((matchUp: any) => ({
          method: 'setMatchUpStatus',
          params: { drawId, matchUpId: matchUp.matchUpId, outcome },
        })),
        round(DAY_1, CONSOLATION, 1),
        profileRun([DAY_1]),
      ],
      finalState: (record) => {
        const latestR1 = rawRound(record, MAIN, 1)
          .map((matchUp) => matchUp.schedule?.scheduledTime ?? '')
          .toSorted((a: string, b: string) => a.localeCompare(b))
          .at(-1);
        const earliestConsolation = rawRound(record, CONSOLATION, 1)
          .map((matchUp) => matchUp.schedule?.scheduledTime ?? '')
          .toSorted((a: string, b: string) => a.localeCompare(b))[0];
        // 90 minutes of R1 and 60 of recovery under the default policy the format timing falls back to
        return claim(
          !!latestR1 && earliestConsolation >= '10:30',
          `consolation R1 (${earliestConsolation}) starts once R1 (${latestR1}) and its recovery are over`,
        );
      },
    });
  }

  {
    // C2 (found building this corpus, 2026-10-22): `scheduleMatchUps` timed a final at 08:00 and both semifinals at
    // 09:00 on a plain 8 draw; it waited for no source because the set of sources it waits for defaulted to empty
    const { tournamentRecord } = generate({ drawProfile: { drawSize: 8 }, courtsCount: 4 });
    const matchUpIds = tournamentEngine
      .allTournamentMatchUps()
      .matchUps.toSorted((a: any, b: any) => a.roundNumber - b.roundNumber || a.roundPosition - b.roundPosition)
      .map((m: any) => m.matchUpId);
    out.push({
      scenarioId: 'authored/scheduling/schedule-matchups-final-before-semifinals',
      ref: 'scheduling § direct scheduling: a matchUp is never timed before the matchUps that feed it',
      initialRecord: tournamentRecord,
      directives: [{ method: 'scheduleMatchUps', params: { scheduleDate: DAY_1, matchUpIds } }],
      finalState: (record) => {
        const at = (stage: string, roundNumber: number) =>
          rawRound(record, stage, roundNumber).map((matchUp) => matchUp.schedule?.scheduledTime ?? '');
        const latestSemifinal =
          at(MAIN, 2)
            .toSorted((a: string, b: string) => a.localeCompare(b))
            .at(-1) ?? '';
        const [final] = at(MAIN, 3);
        return claim(
          final > latestSemifinal,
          `the final (${final}) is timed after both semifinals (${latestSemifinal})`,
        );
      },
    });
  }

  {
    // C2 (CA 2026-10-22): R1 played on day 2, with scores, and R2 profiled on day 1, where its sources are not yet
    // played. Today the plan places R2 and the writer refuses each placement, reporting it as unscheduled
    const { tournamentRecord, round, matchUpsOf, drawId } = generate({ drawProfile: { drawSize: 8 }, courtsCount: 4 });
    const outcome = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome;
    out.push({
      scenarioId: 'authored/scheduling/placement-before-a-played-source',
      ref: 'scheduling § played order: a matchUp is never placed before a source already played',
      initialRecord: tournamentRecord,
      directives: [
        ...matchUpsOf(MAIN, 1).flatMap((matchUp: any) => [
          {
            method: 'addMatchUpScheduleItems',
            params: {
              drawId,
              matchUpId: matchUp.matchUpId,
              schedule: { scheduledDate: DAY_2, scheduledTime: '09:00' },
            },
          },
          { method: 'setMatchUpStatus', params: { drawId, matchUpId: matchUp.matchUpId, outcome } },
        ]),
        round(DAY_1, MAIN, 2),
        profileRun([DAY_1]),
      ],
      finalState: (record) =>
        claim(timedOn(rawRound(record, MAIN, 2), DAY_1) === 0, 'no R2 matchUp is timed before its played sources'),
    });
  }

  {
    // a profiled round none of whose matchUps has a format: nothing of it is placed, and (CA 2026-10-23) it is
    // reported, under noFormatMatchUpIds
    const { tournamentRecord, round } = generate({ drawProfile: { drawSize: 8 }, courtsCount: 4 });
    // strip every format a matchUp could inherit: tournament, event, draw, structures, matchUps
    const strip = (item: any) => delete item.matchUpFormat;
    strip(tournamentRecord);
    for (const event of tournamentRecord.events) {
      strip(event);
      for (const drawDefinition of event.drawDefinitions) {
        strip(drawDefinition);
        for (const structure of drawDefinition.structures) {
          strip(structure);
          structure.matchUps?.forEach(strip);
        }
      }
    }
    out.push({
      scenarioId: 'authored/scheduling/format-less-round',
      ref: 'scheduling § 2: a round with no matchUpFormat is not placed',
      initialRecord: tournamentRecord,
      directives: [round(DAY_1, MAIN, 1), profileRun([DAY_1])],
      finalState: (record, values) => {
        const report = JSON.stringify(values.at(-1) ?? {});
        const roundOne = rawRound(record, MAIN, 1);
        return [
          ...claim(timedOn(roundOne, DAY_1) === 0, 'no R1 matchUp is timed'),
          ...claim(
            roundOne.every(({ matchUpId }) => report.includes(matchUpId)),
            'every R1 matchUp is reported as unplaced',
          ),
        ];
      },
    });
  }

  return out;
}

export function recordScheduling({ outDir }: { outDir: string }) {
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'scheduling.jsonl');
  fs.writeFileSync(outPath, '');
  const written: {
    expectedErrors?: Authored['expectedErrors'];
    finalState?: Authored['finalState'];
    knownFailure?: string;
    scenario: any;
  }[] = [];
  const failed: { scenarioId: string; reason: string }[] = [];
  for (const authored of schedulingScenarios()) {
    try {
      const scenario = writeScenario({
        scenarioId: authored.scenarioId,
        source: { kind: 'authored', ref: authored.ref },
        tags: ['authored', 'scheduling-pipeline'],
        properties: [...SCHEDULING_STEP_PROPERTIES, ...SCHEDULING_REPORT_PROPERTIES],
        knownFailure: authored.knownFailure,
        initialRecord: authored.initialRecord,
        directives: authored.directives,
        seed: SEED,
        clock: CLOCK,
      });
      fs.appendFileSync(outPath, JSON.stringify(scenario) + '\n');
      written.push({
        expectedErrors: authored.expectedErrors,
        knownFailure: authored.knownFailure,
        finalState: authored.finalState,
        scenario,
      });
    } catch (err: any) {
      if (!(err instanceof CorpusWriteError)) throw err;
      failed.push({ scenarioId: authored.scenarioId, reason: err.message.slice(0, 300) });
    }
  }

  // the pinned scale sample, in its own file of the same source, so the manifest holds its outcomes
  const samplePath = path.join(outDir, 'scheduling-scale-sample.jsonl');
  fs.writeFileSync(samplePath, '');
  for (const cell of pinnedScaleCells()) {
    const scenarioId = cellId(cell);
    try {
      const { initialRecord, directives } = pinnedScaleScenario(cell);
      const scenario = writeScenario({
        properties: [...SCHEDULING_STEP_PROPERTIES, ...SCHEDULING_REPORT_PROPERTIES],
        source: { kind: 'matrix', ref: `${scenarioId} seed=${cell.seed}` },
        tags: ['scale', 'scheduling-pipeline', 'pinned'],
        seed: cell.seed,
        initialRecord,
        clock: CLOCK,
        directives,
        scenarioId,
      });
      fs.appendFileSync(samplePath, JSON.stringify(scenario) + '\n');
      written.push({ scenario });
    } catch (err: any) {
      if (!(err instanceof CorpusWriteError)) throw err;
      failed.push({ scenarioId, reason: err.message.slice(0, 300) });
    }
  }
  return { written, failed };
}
