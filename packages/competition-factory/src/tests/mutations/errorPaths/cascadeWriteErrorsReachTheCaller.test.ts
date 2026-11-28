import { setSubscriptions } from '@Global/state/globalState';
import { getOutcomePipeline, setOutcomePipeline } from '@Tests/testHarness/outcomeModes';
import { deepCorrectionScenario } from '@Tests/testHarness/exitPropagation/correctionDivergence';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants
import { COMPLETED, DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { OUTCOME_PIPELINE_V1 } from '@Tests/testHarness/outcomeModes';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { FIRST_MATCH_LOSER_CONSOLATION, DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * EVERY WRITE THE CASCADE MAKES, IF IT FAILS, FAILS THE CALL — assessment gap G9.
 *
 * `setMatchUpStatus` reaches the draw through `modifyMatchUpScore` from a dozen sites: the result
 * itself, the exits a double exit produces downstream, the BYEs and exits a correction withdraws,
 * the decider a final reconciles, the lines and dual of a TEAM matchUp. Each site is named by the
 * `context` it passes. This file forces the FIRST write at each named site to fail and asserts that
 * the error is what `setMatchUpStatus` returns (and, where it is the call's first write, that nothing changed). A caller told "success" over a write that did
 * not happen is the defect class `reconcileDeciderReturnsItsError.test.ts` pinned for one site; this
 * pins it for all of them.
 *
 * ## This is FAULT INJECTION, and that is all it is
 *
 * Nothing in ordinary play makes these writes fail — the matchUp is handed to `modifyMatchUpScore`
 * directly. Over the 1,000 matrix cells and the 1,600 deep-correction cells the engine returns no
 * error from any of these sites. So this file says nothing about what the engine does in play.
 *
 * ## What it pins, and what it does not
 *
 * The rule: a method that returns an error leaves the record
 * unchanged on a DIRECT call, and the cascade must deliver that by itself. It builds in no snapshot
 * or restore, and `rollbackOnError` is never the answer to it. So each case is one of two kinds:
 *
 * - **the call's first write** (`firstWrite: true`): nothing was written before the forced failure,
 *   and the case asserts the record is exactly as it was. That is the rule, held.
 * - **a KNOWN V1 RESIDUAL**: the forced write comes after earlier writes of the same call, so v1 leaves those writes
 *   behind. That is a refusal-after-write the rule forbids, NOT the design. Each such site is on the outcome v2
 *   executor plan's "v1 errors handed to v2" list: it can arise only from a cascade write whose failure depends on the
 *   draw the cascade has left, so v1 cannot ask it before its first write, and v2 must plan it as a refusal. These
 *   cases do not assert the record, because v1 cannot yet provide it; they pin only that the error is never swallowed
 *   behind a success. When v2 plans a site, its case gains the record assertion.
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

/**
 * THE SITES ARE v1's WRITERS, so the play runs under `v1` whatever the suite's mode. A call the outcome pipeline v2 owns
 * (`OUTCOME_PIPELINE=v2`) is written by v2's apply and never reaches `modifyMatchUpScore`: since S5 a single exit is
 * owned, so the matrix's first step no longer reaches `attemptToModifyScore` there. v2 plans its refusals before its
 * first op (`outcome/decide.ts`), and has no cascade write to fail part-way.
 */
let pipeline: ReturnType<typeof getOutcomePipeline>;
beforeEach(() => {
  pipeline = getOutcomePipeline();
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
});

afterEach(() => {
  setOutcomePipeline(pipeline);
  forced.context = undefined;
  forced.hits = 0;
});

const matchUps = (drawId: string): any[] =>
  tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];

const recordNow = () => structuredClone(tournamentEngine.getTournament().tournamentRecord);
const residual = (firstWrite: boolean) => (firstWrite ? 'leaves the record unchanged' : 'is returned (v1 residual)');

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
  // the main write of the correcting outcome itself
  {
    context: 'sms',
    firstWrite: true,
    config: {
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      drawSize: 8,
      participantsCount: 8,
      seed: 7000103,
      propagateExitStatus: true,
    },
    cellExit: { matchUpStatus: DEFAULTED, winningSide: 2 },
  },
  // v1 residual, handed to v2: an exit withdrawn back along a chain of BYE-held matchUps, policy off
  {
    context: 'withdrawExitFromByeChain',
    firstWrite: false,
    config: {
      drawType: DOUBLE_ELIMINATION,
      drawSize: 8,
      participantsCount: 5,
      seed: 7000545,
      propagateExitStatus: true,
      doubleExitPropagateBye: false,
    },
    cellExit: { matchUpStatus: DOUBLE_WALKOVER },
  },
];

it.each(CORRECTION_SITES.map((site) => ({ ...site, kind: residual(site.firstWrite) })))(
  'a failed write at $context fails the correction and $kind (deep seed $config.seed)',
  ({ context, config, cellExit, firstWrite }) => {
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
    const before = recordNow();
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
    // as above: asserted only where the forced write is the call's first
    if (firstWrite) expect(recordNow(), 'a failed first write changes nothing').toEqual(before);
  },
);
