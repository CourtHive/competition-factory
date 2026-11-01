import { POLICY_ROUND_ROBIN_TALLY_DEFAULT } from '@Fixtures/policies/POLICY_ROUND_ROBIN_TALLY_DEFAULT';
import { tallyParticipantResults } from '@Query/matchUps/roundRobinTally/tallyParticipantResults';
import { buildMatchUps, type CorpusResult } from './standingsFixtures';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { appendFileSync } from 'node:fs';
import { it } from 'vitest';

// constants
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';

/**
 * The standings performance baseline (Mentat `planning/STANDINGS_ENGINE_SPEC.md` § 6). Skipped unless
 * STANDINGS_BENCH names an output file: `STANDINGS_BENCH=/tmp/bench.out pnpm vitest run src/tests/standings/tallyBench`.
 * Compare implementations from paired runs on one machine, never absolute milliseconds across machines.
 */
const OUT = process.env.STANDINGS_BENCH;

function median(fn: () => void, runs: number) {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  return times.sort((a, b) => a - b)[Math.floor(runs / 2)];
}

const letters = (n: number) => Array.from({ length: n }, (_, i) => String.fromCodePoint(65 + i));

/** every pair once; a "cycle" makes each player beat the next half of the circle with identical scores */
function groupResults(n: number, shape: 'spread' | 'cycle'): CorpusResult[] {
  const players = letters(n);
  const results: CorpusResult[] = [];
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const side1Wins = shape === 'spread' ? true : (b - a) % n <= (n - 1) / 2;
      results.push({
        sides: [players[a], players[b]],
        score: side1Wins ? '6-0 6-0' : '0-6 0-6',
        winningSide: side1Wins ? 1 : 2,
      });
    }
  }
  return results;
}

it.skipIf(!OUT)(
  'tally cost by group size and shape (pure tally)',
  () => {
    // letters run out past 26: the pure-tally rows stop at 25
    for (const n of [4, 8, 16, 25]) {
      for (const shape of ['spread', 'cycle'] as const) {
        const size = shape === 'cycle' && n % 2 === 0 ? n + 1 : n;
        if (size > 25) continue;
        const matchUps = buildMatchUps({ results: groupResults(size, shape) });
        const ms = median(
          () => tallyParticipantResults({ matchUps, policyDefinitions: POLICY_ROUND_ROBIN_TALLY_DEFAULT }),
          size > 16 ? 9 : 31,
        );
        appendFileSync(OUT as string, `tally ${shape} n=${size} matchUps=${matchUps.length} ${ms.toFixed(3)}ms\n`);
      }
    }
  },
  600_000,
);

it.skipIf(!OUT)(
  'score change end to end (setMatchUpStatus re-scoring one group matchUp)',
  () => {
    for (const n of [4, 8, 16, 32]) {
      const {
        tournamentRecord,
        drawIds: [drawId],
      } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: n, drawType: ROUND_ROBIN, structureOptions: { groupSize: n } }],
        completeAllMatchUps: true,
        setState: false,
      });
      tournamentEngine.setState(tournamentRecord);
      const { matchUpId } = tournamentEngine.allDrawMatchUps({ drawId }).matchUps[0];
      let winningSide = 1;
      const ms = median(
        () => {
          winningSide = 3 - winningSide;
          const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1', winningSide });
          tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome: { ...outcome, matchUpStatus: COMPLETED } });
        },
        n >= 32 ? 5 : 21,
      );
      appendFileSync(OUT as string, `setMatchUpStatus n=${n} ${ms.toFixed(3)}ms\n`);
    }
  },
  600_000,
);
