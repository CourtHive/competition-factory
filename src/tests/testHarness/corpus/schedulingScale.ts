import { SCHEDULING_REPORT_PROPERTIES } from '../scheduling/schedulingReportProperties';
import { CorpusWriteError, writeScenario, type Directive } from './writeScenario';
import { SCHEDULING_STEP_PROPERTIES } from '../scheduling/schedulingProperties';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setRandomSource } from '@Tools/prng';
import { RECORD_CLOCK } from './recordClock';
import { setClock } from '@Tools/clock';
import path from 'path';
import fs from 'fs';

// constants and types
import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';
import {
  FIRST_MATCH_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  SINGLE_ELIMINATION,
  ROUND_ROBIN,
} from '@Constants/drawDefinitionConstants';

/**
 * Golden corpus § 5, the scale source (SCHEDULING_PIPELINE_VNEXT.md): a matrix of generated configurations run through
 * the profile scheduler and then the grid, every scenario claiming every scheduling property, so the writer refuses
 * (and this source reports) any configuration whose scheduler breaks one. The census pattern applied to scheduling.
 *
 * Axes: draw type × draw size × BYEs × venues × daily limits × days. Each cell is generated on the corpus clock from its
 * own seed, so a cell reproduces by its id alone.
 */
const CLOCK = '2026-10-01T12:00:00.000Z';
const DAYS = ['2026-10-01', '2026-10-02'];

export type ScaleCell = {
  drawType: string;
  drawSize: number;
  byes: boolean;
  venues: 1 | 2;
  limits: boolean;
  days: 1 | 2;
  seed: number;
};

export const SCALE_AXES = {
  drawType: [SINGLE_ELIMINATION, FEED_IN_CHAMPIONSHIP, FIRST_MATCH_LOSER_CONSOLATION, ROUND_ROBIN],
  drawSize: [8, 16, 32],
  byes: [false, true],
  venues: [1, 2] as const,
  limits: [false, true],
  days: [1, 2] as const,
};

export function scaleCells(): ScaleCell[] {
  const cells: ScaleCell[] = [];
  let seed = 7000;
  for (const drawType of SCALE_AXES.drawType)
    for (const drawSize of SCALE_AXES.drawSize)
      for (const byes of SCALE_AXES.byes)
        for (const venues of SCALE_AXES.venues)
          for (const limits of SCALE_AXES.limits)
            for (const days of SCALE_AXES.days)
              cells.push({ drawType, drawSize, byes, venues, limits, days, seed: seed++ });
  return cells;
}

export const cellId = (cell: ScaleCell) =>
  [
    'scale/scheduling',
    cell.drawType.toLowerCase().replaceAll('_', '-'),
    `${cell.drawSize}${cell.byes ? '-byes' : ''}`,
    `v${cell.venues}-${cell.limits ? 'limits' : 'nolimits'}-d${cell.days}`,
  ].join('/');

/** the record and directives of one cell: every structure's rounds profiled, split across the days, then both runs */
export function scaleScenario(cell: ScaleCell) {
  setClock(RECORD_CLOCK);
  setRandomSource(cell.seed);
  const venueProfiles = Array.from({ length: cell.venues }, (_, index) => ({
    venueId: `venue-${index + 1}`,
    courtsCount: cell.venues === 1 ? 4 : 6,
    startTime: '08:00',
    endTime: '20:00',
  }));
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        participantsCount: cell.byes ? cell.drawSize - cell.drawSize / 4 : cell.drawSize,
        drawType: cell.drawType,
        drawSize: cell.drawSize,
      },
    ],
    ...(cell.limits ? { policyDefinitions: POLICY_SCHEDULING_DEFAULT } : {}),
    startDate: DAYS[0],
    endDate: DAYS[cell.days - 1],
    venueProfiles,
  });
  setClock();
  setRandomSource();
  tournamentEngine.reset();
  tournamentEngine.setState(tournamentRecord);

  const { tournamentId } = tournamentRecord;
  const event = tournamentRecord.events[0];
  const drawDefinition = event.drawDefinitions[0];
  const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const directives: Directive[] = [];
  // each top-level structure's rounds, the earlier half of them on day 1 when there are two days
  for (const [index, structure] of drawDefinition.structures.entries()) {
    const roundNumbers = [
      ...new Set(
        matchUps
          .filter(
            (m: any) => m.structureId === structure.structureId || m.containerStructureId === structure.structureId,
          )
          .map((m: any) => m.roundNumber),
      ),
    ].sort((a: any, b: any) => a - b) as number[];
    const split = cell.days === 2 ? Math.ceil(roundNumbers.length / 2) : roundNumbers.length;
    for (const [position, roundNumber] of roundNumbers.entries())
      directives.push({
        method: 'addSchedulingProfileRound',
        params: {
          round: {
            tournamentId,
            eventId: event.eventId,
            drawId: drawDefinition.drawId,
            structureId: structure.structureId,
            roundNumber,
          },
          scheduleDate: DAYS[position < split ? 0 : 1],
          venueId: venueProfiles[index % venueProfiles.length].venueId,
        },
      });
  }
  const scheduleDates = DAYS.slice(0, cell.days);
  directives.push(
    { method: 'scheduleProfileRounds', params: { scheduleDates } },
    { method: 'scheduleProfileGrid', params: { scheduleDates } },
  );
  return { initialRecord: tournamentRecord, directives };
}

/**
 * The scale cells whose outcome the manifest pins: the matrix itself is checked only against the scheduling
 * properties, so these are what hold a placement still. Every seventh cell: the three innermost axes (venues, limits,
 * days) repeat every 8 cells, so a stride of 8 would pin one combination of them; 7 is coprime to 8 and visits all.
 * Each runs the profile as a dry run, for real, again over what it wrote, and again with its dates cleared, before
 * the grid.
 */
export const pinnedScaleCells = () => scaleCells().filter((_, index) => index % 7 === 3);

/**
 * Cells larger than the matrix, every draw type at 64 and 128, with and without BYEs, over two venues and two days:
 * the only cells whose grid sorts 64 matchUps or more at once, where a sort runs as merged runs rather than one
 * insertion sort. The order of matchUps a comparator leaves equal is the sort's own, so these pin it. Written as the
 * matrix writes a cell (profile, then grid), into the pinned sample.
 */
export function largeScaleCells(): ScaleCell[] {
  const cells: ScaleCell[] = [];
  let seed = 7900;
  for (const drawType of SCALE_AXES.drawType)
    for (const drawSize of [64, 128])
      for (const byes of [false, true])
        cells.push({ drawType, drawSize, byes, venues: 2, limits: false, days: 2, seed: seed++ });
  return cells;
}

export function pinnedScaleScenario(cell: ScaleCell) {
  const { initialRecord, directives } = scaleScenario(cell);
  const profileIndex = directives.findIndex(({ method }) => method === 'scheduleProfileRounds');
  const { params } = directives[profileIndex];
  directives.splice(
    profileIndex,
    1,
    { method: 'scheduleProfileRounds', params: { ...params, dryRun: true } },
    { method: 'scheduleProfileRounds', params },
    { method: 'scheduleProfileRounds', params },
    { method: 'scheduleProfileRounds', params: { ...params, clearScheduleDates: params.scheduleDates } },
  );
  return { initialRecord, directives };
}

export function recordSchedulingScale({ outDir, cells = scaleCells() }: { outDir: string; cells?: ScaleCell[] }) {
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'scheduling-scale.jsonl');
  fs.writeFileSync(outPath, '');
  const written: any[] = [];
  const failed: { scenarioId: string; reason: string }[] = [];
  for (const cell of cells) {
    const scenarioId = cellId(cell);
    try {
      const { initialRecord, directives } = scaleScenario(cell);
      const scenario = writeScenario({
        properties: [...SCHEDULING_STEP_PROPERTIES, ...SCHEDULING_REPORT_PROPERTIES],
        source: { kind: 'matrix', ref: `${scenarioId} seed=${cell.seed}` },
        tags: ['scale', 'scheduling-pipeline'],
        seed: cell.seed,
        initialRecord,
        clock: CLOCK,
        directives,
        scenarioId,
      });
      fs.appendFileSync(outPath, JSON.stringify(scenario) + '\n');
      written.push(scenario);
    } catch (err: any) {
      if (!(err instanceof CorpusWriteError)) throw err;
      failed.push({ scenarioId, reason: err.message.slice(0, 400) });
    }
  }
  return { written, failed };
}
