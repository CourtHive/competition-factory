import { deepCorrectionScenario } from '@Tests/testHarness/exitPropagation/correctionDivergence';
import { MATRIX_CELLS, cellExitOutcome } from '@Tests/testHarness/exitPropagation/matrixCells';
import { PRODUCED_EXIT_POLICY } from '@Tests/testHarness/exitPropagation/producedExitPolicy';
import { nextPlayable } from '@Tests/testHarness/exitPropagation/driver';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it, vi } from 'vitest';

// constants
import { COMPLETED, DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { TEAM } from '@Constants/eventConstants';

/**
 * EVERY WRITE THE CASCADE MAKES, IF IT FAILS, FAILS THE CALL — assessment gap G9.
 *
 * `setMatchUpStatus` reaches the draw through `modifyMatchUpScore` from a dozen sites: the result
 * itself, the exits a double exit produces downstream, the BYEs and exits a correction withdraws,
 * the decider a final reconciles, the lines and dual of a TEAM matchUp. Each site is named by the
 * `context` it passes. This file forces the FIRST write at each named site to fail and asserts one
 * thing: the error is what `setMatchUpStatus` returns. A caller told "success" over a write that did
 * not happen is the defect class `reconcileDeciderReturnsItsError.test.ts` pinned for one site; this
 * pins it for all of them.
 *
 * ## This is FAULT INJECTION, and that is all it is
 *
 * Nothing in ordinary play makes these writes fail — the matchUp is handed to `modifyMatchUpScore`
 * directly. Over the 1,000 matrix cells and the 1,600 deep-correction cells the engine returns no
 * error from any of these sites. So this file says nothing about what the engine does in play.
 *
 * It does NOT assert the draw is unchanged. CA's standing ruling (2026-09-30): nothing in this
 * cascade snapshots or restores; a consumer that needs atomicity passes `rollbackOnError`, which
 * `executionQueue` does. Asserting partial state here would assert the opposite of the design.
 *
 * ## How each site is reached
 *
 * The cells were found by instrumenting `modifyMatchUpScore` over the matrix (both BYE policies) and
 * the deep-correction oracle's corrected routes, recording which cell first reached each context.
 * The CONTROL in every case is `forced.hits`: a site the play never reached would pass vacuously,
 * so each case asserts the forced write happened exactly once (the first hit ends the call).
 */

const forced = vi.hoisted(() => ({ context: undefined as string | undefined, hits: 0 }));
const FORCED_ERROR = { code: 'ERR_FORCED', message: 'forced by the test' };

vi.mock('@Mutate/matchUps/score/modifyMatchUpScore', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    modifyMatchUpScore: (params: any) => {
      if (forced.context && params?.context === forced.context) {
        forced.hits += 1;
        return { error: FORCED_ERROR };
      }
      return actual.modifyMatchUpScore(params);
    },
  };
});

afterEach(() => {
  forced.context = undefined;
  forced.hits = 0;
});

const played = { winningSide: 1 };
const matchUps = (drawId: string): any[] =>
  tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];

/**
 * Drive a matrix cell as the matrix does — the exit on the first playable matchUp, then play forward
 * with the exit every third step — with the forced context armed from the start. Returns the first
 * result that carries an error, or undefined if the play ran to exhaustion without one.
 */
function driveUntilError(drawId: string, exitOutcome: any, propagateExitStatus: boolean): any {
  const skip = new Set<string>();
  for (let taken = 0; taken < 200; taken++) {
    const target = nextPlayable(drawId, skip);
    if (!target) return undefined;
    const outcome = taken === 0 || taken % 3 === 2 ? exitOutcome : played;
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: target.matchUpId,
      propagateExitStatus,
      outcome,
      drawId,
    });
    if (result.error) return result;
    if (!result.success) skip.add(target.matchUpId);
  }
  return undefined;
}

const FORWARD_SITES = [
  // the primary write of an ordinary result
  { context: 'attemptToModifyScore', seed: 1, policy: undefined },
  // a double exit's produced exit, written on the winner target
  { context: 'conditionallyAdvanceDrawPosition', seed: 7, policy: undefined },
  // the re-score path for a result that changes nothing downstream
  { context: 'scoreModification', seed: 7, policy: undefined },
  // the exit carried onward through a BYE-held target, policy off
  { context: 'doubleExitAdvancement', seed: 77, policy: PRODUCED_EXIT_POLICY },
  // the settle pass at the end of a call, policy off
  { context: 'settleHeldExits', seed: 77, policy: PRODUCED_EXIT_POLICY },
];

it.each(FORWARD_SITES)('a failed write at $context fails the call (matrix seed $seed)', ({ context, seed, policy }) => {
  const cell = MATRIX_CELLS.find((candidate) => candidate.seed === seed);
  expect(cell).toBeDefined();
  setSubscriptions({});
  const drawId = `fault-${context}`;
  mocksEngine.generateTournamentRecord({
    ...(policy ? { policyDefinitions: policy } : {}),
    drawProfiles: [
      { drawId, drawType: cell!.drawType, drawSize: cell!.drawSize, participantsCount: cell!.participantsCount },
    ],
    nonRandom: cell!.seed,
    setState: true,
  });

  forced.context = context;
  const result = driveUntilError(drawId, cellExitOutcome(cell!.exitStatus), cell!.propagateExitStatus);

  // CONTROL: the play reached the site, once — the first forced write ends the call
  expect(forced.hits, `${context} was reached`).toEqual(1);
  expect(result?.error?.code, "the error is the caller's result").toEqual(FORCED_ERROR.code);
});

const alternative = (outcome: any): any => {
  switch (outcome?.matchUpStatus) {
    case DOUBLE_WALKOVER:
      return { matchUpStatus: WALKOVER, winningSide: 1 };
    case DOUBLE_DEFAULT:
      return { matchUpStatus: DEFAULTED, winningSide: 1 };
    case WALKOVER:
      return { matchUpStatus: DOUBLE_WALKOVER };
    case DEFAULTED:
      return {
        matchUpStatus: COMPLETED,
        winningSide: 2,
        score: {
          sets: [
            { side1Score: 3, side2Score: 6, winningSide: 2 },
            { side1Score: 3, side2Score: 6, winningSide: 2 },
          ],
        },
      };
    default:
      return undefined;
  }
};

/** The deep oracle's corrected route: a played prefix, the mistake, the correction. */
const CORRECTION_SITES = [
  // a correction withdrawing a double exit's advancement
  {
    context: 'conditionallyRemoveDrawPosition',
    config: {
      drawType: SINGLE_ELIMINATION,
      drawSize: 8,
      participantsCount: 7,
      seed: 7000009,
      propagateExitStatus: true,
    },
    cellExit: { matchUpStatus: DOUBLE_WALKOVER },
  },
  // the main write of the correcting outcome itself
  {
    context: 'sms',
    config: {
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      drawSize: 8,
      participantsCount: 8,
      seed: 7000103,
      propagateExitStatus: true,
    },
    cellExit: { matchUpStatus: DEFAULTED, winningSide: 2 },
  },
  // an exit withdrawn back along a chain of BYE-held matchUps, policy off
  {
    context: 'withdrawExitFromByeChain',
    config: {
      drawType: 'DOUBLE_ELIMINATION',
      drawSize: 8,
      participantsCount: 5,
      seed: 7000545,
      propagateExitStatus: true,
      doubleExitPropagateBye: false,
    },
    cellExit: { matchUpStatus: DOUBLE_WALKOVER },
  },
];

it.each(CORRECTION_SITES)(
  'a failed write at $context fails the correction (deep seed $config.seed)',
  ({ context, config, cellExit }) => {
    setSubscriptions({});
    const scenario = deepCorrectionScenario({ config: config as any, cellExit, alternative });
    expect(scenario, 'the scenario composes').toBeDefined();

    // replay the corrected route on a fresh draw, arming the fault only for the correction step
    const drawId = `fault-${context}`;
    const { doubleExitPropagateBye, propagateExitStatus } = config as any;
    mocksEngine.generateTournamentRecord({
      policyDefinitions: {
        [POLICY_TYPE_PROGRESSION]: {
          ...(doubleExitPropagateBye === undefined ? {} : { doubleExitPropagateBye }),
          propagateExitStatus,
        },
      },
      drawProfiles: [
        { drawId, drawType: config.drawType, drawSize: config.drawSize, participantsCount: config.participantsCount },
      ],
      nonRandom: config.seed,
      setState: true,
    });
    const steps = scenario!.corrected;
    const correction = steps.at(-1)!;
    for (const step of steps.slice(0, -1)) {
      const target = matchUps(drawId).find(
        (m) =>
          m.structureName === step.structureName &&
          m.roundNumber === step.roundNumber &&
          m.roundPosition === step.roundPosition,
      );
      const result: any = tournamentEngine.setMatchUpStatus({
        matchUpId: target.matchUpId,
        drawId,
        outcome: step.outcome,
      });
      expect(result.success).toEqual(true);
    }

    forced.context = context;
    const target = matchUps(drawId).find(
      (m) =>
        m.structureName === correction.structureName &&
        m.roundNumber === correction.roundNumber &&
        m.roundPosition === correction.roundPosition,
    );
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: target.matchUpId,
      drawId,
      outcome: correction.outcome,
    });

    expect(forced.hits, `${context} was reached by the correction`).toEqual(1);
    expect(result?.error?.code).toEqual(FORCED_ERROR.code);
  },
);

/**
 * THE DUAL'S OWN WRITE. `updateTieMatchUpScore` recomputed the dual and wrote it with
 * `modifyMatchUpScore`, and discarded the result: a failed write of the dual's status left the line
 * scored and the dual stale while the caller reported success. Found by this file (2026-10-01),
 * when the site turned out to have no context to inject on.
 */
it("a failed write of a TEAM dual's status fails the line score that caused it", () => {
  setSubscriptions({});
  const drawId = 'fault-dual';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawType: SINGLE_ELIMINATION, drawSize: 8, eventType: TEAM, tieFormatName: DOMINANT_DUO }],
    nonRandom: 300001,
    setState: true,
  });
  expect(tournamentEngine.generateLineUps({ drawId, useDefaultEventRanking: true, attach: true }).success).toEqual(
    true,
  );
  const dual = matchUps(drawId).find((m) => !m.collectionId && m.roundNumber === 1 && m.roundPosition === 1);
  const [line] = matchUps(drawId).filter((m) => m.matchUpTieId === dual.matchUpId);

  forced.context = 'updateTieMatchUpScore';
  const result: any = tournamentEngine.setMatchUpStatus({ matchUpId: line.matchUpId, drawId, outcome: played });

  expect(forced.hits).toEqual(1);
  expect(result?.error?.code).toEqual(FORCED_ERROR.code);
});
