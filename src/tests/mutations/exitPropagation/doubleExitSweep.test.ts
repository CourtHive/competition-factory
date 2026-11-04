import { OUTCOME_PIPELINE_DIFFERENTIAL, OUTCOME_PIPELINE_V1 } from '@Constants/outcomePipelineConstants';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterAll, expect, test } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import {
  FIRST_ROUND_LOSER_CONSOLATION,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  DOUBLE_ELIMINATION,
  CURTIS_CONSOLATION,
  COMPASS,
  OLYMPIC,
} from '@Constants/drawDefinitionConstants';

/**
 * THE DOUBLE-EXIT SWEEP (outcome v2, S7, 2026-11-04). Under `differential`, every first-round matchUp of the entry
 * structure of each draw is entered as a double exit, then the matchUp paired with it as one too, then the first is given
 * a winner, then cleared: the double exit's BYEs or carries, their convergence, the unwind that releases an award or a
 * carry, and the clear, each compared with v1 by the shadow apply. A divergence throws; this collects them.
 *
 * Why it exists: the suites hold these shapes only where a matrix cell happens to reach them. On 2026-11-04 this sweep
 * found three divergences the full suite, the TEAM arms and CI all passed: a released award's loser on through a chain of
 * BYEs (#6139, on dev), and a double BYE's release beside a feed round's fed seat and in a plain round (#6138). Each run
 * is about 4,900 calls per policy, a few minutes.
 *
 * Gated (`DOUBLE_EXIT_SWEEP=1`), as `routeDifferential.test.ts` is, and run per outcome slice (`pnpm
 * verify:double-exit-sweep`, Mentat `scripts/outcome-v2-suites.sh`). The seed is the exit matrix's.
 */

const enabled = process.env.DOUBLE_EXIT_SWEEP === '1';

afterAll(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({});
});
const SEED = 9000230;
const DRAW_TYPES = [
  COMPASS,
  OLYMPIC,
  FIRST_ROUND_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  DOUBLE_ELIMINATION,
  CURTIS_CONSOLATION,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
];
const DRAW_SIZES: [number, number][] = [
  [8, 7],
  [8, 6],
  [8, 5],
  [16, 15],
  [16, 13],
  [16, 11],
  [16, 9],
  [32, 27],
  [32, 21],
];
const CLEARED = { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } };

type Divergence = { drawType: string; drawSize: number; participantsCount: number; steps: string; message: string };

function sweepDraw(drawType: string, drawSize: number, participantsCount: number, policy: Record<string, unknown>) {
  const divergences: Divergence[] = [];
  let calls = 0;
  for (const doubleExit of [DOUBLE_WALKOVER, DOUBLE_DEFAULT]) {
    const single = doubleExit === DOUBLE_WALKOVER ? WALKOVER : DEFAULTED;
    for (let roundPosition = 1; roundPosition <= drawSize / 2; roundPosition += 1) {
      setSubscriptions({});
      setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
      mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawType, drawSize, participantsCount, drawId: 'sweep' }],
        // the default is no progression policy at all (an empty one is refused)
        ...(Object.keys(policy).length ? { policyDefinitions: { [POLICY_TYPE_PROGRESSION]: policy } } : {}),
        nonRandom: SEED,
        setState: true,
      });
      const matchUps = () => tournamentEngine.allTournamentMatchUps().matchUps;
      const entry = matchUps().find((matchUp: any) => matchUp.roundNumber === 1)?.structureName;
      const at = (position: number) =>
        matchUps().find(
          (matchUp: any) =>
            matchUp.structureName === entry && matchUp.roundNumber === 1 && matchUp.roundPosition === position,
        );
      const paired = roundPosition % 2 ? roundPosition + 1 : roundPosition - 1;
      const steps: [number, Record<string, unknown>][] = [
        [roundPosition, { matchUpStatus: doubleExit }],
        [paired, { matchUpStatus: doubleExit }],
        [roundPosition, { matchUpStatus: single, winningSide: 1 }],
        [roundPosition, CLEARED],
      ];
      for (const [index, [position, outcome]] of steps.entries()) {
        const target = at(position);
        if (!target) break;
        calls += 1;
        try {
          tournamentEngine.setMatchUpStatus({ drawId: 'sweep', matchUpId: target.matchUpId, outcome });
        } catch (error: any) {
          const played = steps.slice(0, index + 1).map(([p, o]) => `R1/${p} ${o.matchUpStatus ?? ''}`);
          divergences.push({ drawType, drawSize, participantsCount, steps: played.join(', '), message: error.message });
          break;
        }
      }
    }
  }
  return { divergences, calls };
}

test.skipIf(!enabled).each([
  ['a double exit produces a BYE (the default)', {}],
  ['a double exit produces an EXIT', { doubleExitPropagateBye: false }],
])('double-exit sweep under differential: %s', { timeout: 3_600_000 }, (_label, policy) => {
  const divergences: Divergence[] = [];
  let calls = 0;
  for (const drawType of DRAW_TYPES)
    for (const [drawSize, participantsCount] of DRAW_SIZES) {
      const swept = sweepDraw(drawType, drawSize, participantsCount, policy);
      divergences.push(...swept.divergences);
      calls += swept.calls;
    }
  // CONTROL: the sweep reached its shapes
  expect(calls).toBeGreaterThan(4_000);
  expect(divergences).toEqual([]);
});
