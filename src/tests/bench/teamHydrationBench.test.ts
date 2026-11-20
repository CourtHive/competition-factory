import { buildStructuralIndex } from '@Query/matchUps/structuralIndex';
import { getDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { performance } from 'node:perf_hooks';
import { expect, it, vi } from 'vitest';

// constants and types
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { IN_PROGRESS } from '@Constants/matchUpStatusConstants';
import { SINGLES, TEAM } from '@Constants/eventConstants';

/**
 * THE COST OF FINDING PARTICIPANTS IN A TEAM DRAW: one `setMatchUpStatus` on a line, one in-context read of the draw
 * and one structural index build, each with the per-read participant lookup (participantLookup.ts) and with it
 * switched off, which is every find scanning the whole participant list as it did before the lookup existed.
 * Generated TEAM draws (mocksEngine, lineUps attached), ten matchUps per dual. Inert by default:
 *
 *   TEAM_HYDRATION_BENCH=1 OUTCOME_PIPELINE=v1 TZ=UTC npx vitest run --silent=false \
 *     src/tests/bench/teamHydrationBench.test.ts
 *
 * `TEAM_HYDRATION_SIZES=16,64` overrides the draw sizes. Run it under each OUTCOME_PIPELINE: v2 and differential
 * build the structural index as well as hydrating.
 */
const lookup = vi.hoisted(() => ({ enabled: true }));
vi.mock('@Query/participants/participantLookup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@Query/participants/participantLookup')>();
  return {
    ...actual,
    buildParticipantLookup: (participants: unknown) =>
      lookup.enabled ? actual.buildParticipantLookup(participants) : undefined,
  };
});

const SIZES = (process.env.TEAM_HYDRATION_SIZES ?? '16,64,256').split(',').map(Number);
const SAMPLES = 9;

const median = (values: number[]) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
const elapsed = (fn: () => unknown) => {
  const start = performance.now();
  fn();
  return performance.now() - start;
};
/** the median time of `fn` scanning and looking up, the two alternated so that drift lands on both */
function compare(fn: (sample: number) => unknown) {
  const scanned: number[] = [];
  const lookedUp: number[] = [];
  for (let sample = 0; sample < SAMPLES + 2; sample++) {
    lookup.enabled = false;
    const scan = elapsed(() => fn(2 * sample));
    lookup.enabled = true;
    const look = elapsed(() => fn(2 * sample + 1));
    // the first two rounds warm the code up
    if (sample > 1) {
      scanned.push(scan);
      lookedUp.push(look);
    }
  }
  const before = median(scanned);
  const after = median(lookedUp);
  return `${before.toFixed(1)} ms | ${after.toFixed(1)} ms | ${(before / after).toFixed(2)}x`;
}

it.skipIf(!process.env.TEAM_HYDRATION_BENCH)('TEAM hydration: participant scans vs lookup', { timeout: 900000 }, () => {
  const rows: string[] = [];
  for (const drawSize of SIZES) {
    const drawId = `teamDraw${drawSize}`;
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, eventType: TEAM, drawSize, drawId }],
      nonRandom: 1,
      setState: true,
    } as any);
    let result: any = tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId });
    expect(result.success).toEqual(true);

    const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
    const lines = matchUps.filter((matchUp: any) => matchUp.readyToScore && matchUp.matchUpType === SINGLES);
    expect(lines.length).toBeGreaterThanOrEqual(2 * (SAMPLES + 2));

    // a different line each call, so every call is the same write: a line of a first-round dual going IN_PROGRESS
    const status = compare((sample) => {
      result = tournamentEngine.setMatchUpStatus({
        outcome: { matchUpStatus: IN_PROGRESS },
        matchUpId: lines[sample].matchUpId,
        drawId,
      });
      expect(result.success).toEqual(true);
    });

    const { tournamentRecord } = tournamentEngine.getTournament();
    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions[0];
    const read = compare(() => getDrawMatchUps({ tournamentRecord, drawDefinition, event, inContext: true }));
    const index = compare(() => buildStructuralIndex({ tournamentRecord, drawDefinition, event, team: true }));

    const shape = `| ${drawSize} | ${matchUps.length} | ${tournamentRecord.participants.length} |`;
    rows.push(
      `${shape} setMatchUpStatus | ${status} |`,
      `${shape} in-context read | ${read} |`,
      `${shape} index | ${index} |`,
    );
  }
  console.log(
    [
      `OUTCOME_PIPELINE=${process.env.OUTCOME_PIPELINE ?? '(default)'}, median of ${SAMPLES}`,
      '| teams | matchUps | participants | operation | scans | lookup | speed-up |',
      '|---:|---:|---:|---|---:|---:|---:|',
      ...rows,
    ].join('\n'),
  );
});
