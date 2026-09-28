import { resolveFirstRoundStructure, runPath } from '@Tests/testHarness/exitPropagation/correctionDivergence';
import { UNCOLLAPSED_CONVERGENCE } from '@Query/drawDefinition/getStructureInconsistencies';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import {
  FIRST_MATCH_LOSER_CONSOLATION,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  FIRST_ROUND_LOSER_CONSOLATION,
  SINGLE_ELIMINATION,
  DOUBLE_ELIMINATION,
  CURTIS_CONSOLATION,
  COMPASS,
  OLYMPIC,
} from '@Constants/drawDefinitionConstants';
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * THE UNCOLLAPSED-CONVERGENCE BUDGET — punch-list **P42**, and the sweep that SIZED it.
 *
 * `UNCOLLAPSED_CONVERGENCE` reports a matchUp whose `sideExitProvenance` records an exit DELIVERED into
 * BOTH sides while its own `matchUpStatus` is a single exit carrying a `winningSide`. Two exits that meet
 * are a double exit nobody wins, and `deriveExitStateFromProvenance` on that same record says so — the
 * record and the status contradict each other, and the status is wrong.
 *
 * ## The defect is PRE-EXISTING; only its visibility is new
 *
 * `projectExitStatusCodes` used to overwrite `matchUpStatusCodes` with provenance-shaped OBJECTS, and
 * `codeString` reads only strings and `{ code }`, so no rule could see this state. It surfaced instead as
 * `EXIT_CODE_ON_WINNER_SIDE` at severity `error` — the wrong name, because on such a matchUp the winning
 * side genuinely DOES carry a delivered exit. Evicting the exit tenant (P37) unmasked it.
 *
 * ## The SEQUENCE matters, and this is the finding
 *
 * | oracle | cells | population |
 * |---|---|---|
 * | the 600-cell census matrix (`MATRIX_CELLS`) | 600 | **0** |
 * | `correctionDivergence`'s sweep — correct a DOUBLE exit DOWN to a single | 192 | **0** |
 * | **the UPGRADE direction — re-score a SINGLE exit UP to a double** | 192 | **52** |
 *
 * So it is not reachable by ordinary play at all, and it is not reachable by the correction the existing
 * sweep performs. It needs a single exit RE-SCORED to a double, with a double already standing beside it.
 *
 * **That was a gap in `correctionDivergence`, not only a fact about P42**, and it is now closed: that
 * file has an UPGRADE arm sweeping this direction, measured at **52 severe divergences** — the same 52
 * cells. The two files measure the same population from different angles and neither is redundant:
 *
 *  - `correctionDivergence`'s upgrade arm asserts the INVARIANT — the re-scored draw must match the one
 *    that reached the same outcomes directly. That is the stronger claim, and it shows the divergence is
 *    USER-VISIBLE: provenance is identical on both paths, but the re-scored `Consolation|1|1` reads
 *    `WALKOVER ws=1` where the direct path reads `DOUBLE_WALKOVER ws=-`, so a matchUp nobody played
 *    shows a winner and the exit that should propagate onward does not.
 *  - this file asserts the RULE — that `UNCOLLAPSED_CONVERGENCE` actually reports that population, at
 *    severity `warning`, without flipping `valid`.
 *
 * Fix one and both fall together. Lower both baselines.
 *
 * ## Why a ceiling rather than an exact expectation
 *
 * Same discipline as `stalledPositionBudget`: the number may only ever be LOWERED. Raising one to make a
 * run pass converts a regression into a recorded fact. And it fails at ZERO too — a budget with no
 * population is a gate asserting nothing, so reaching zero is the signal to promote
 * `UNCOLLAPSED_CONVERGENCE` from `warning` to `error` and delete this file.
 *
 * ## Do not "fix" it from here
 *
 * Two candidate fixes were built and measured on 2026-09-27, and both are recorded at their sites:
 * asking provenance in `doubleExitAdvancement`'s `existingExit` gate (took the suite from 4 failures to
 * 21), and having `deriveStatusCodes` skip the side equal to `matchUp.winningSide` (no movement —
 * `winningSide` is not settled at derivation time). The repair is the convergence-collapse work, which
 * P41 says wants its own PR and a census arm. This is the census arm.
 */

const DRAW_TYPES = [
  SINGLE_ELIMINATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  CURTIS_CONSOLATION,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  COMPASS,
  OLYMPIC,
  DOUBLE_ELIMINATION,
];

const FLAVOURS: [string, string][] = [
  [DOUBLE_WALKOVER, WALKOVER],
  [DOUBLE_DEFAULT, DEFAULTED],
];

const MATRIX = DRAW_TYPES.flatMap((drawType) =>
  [8, 16].flatMap((drawSize) =>
    [0, 1, 3].flatMap((reduction) =>
      FLAVOURS.flatMap(([doubleExitStatus, singleExitStatus]) =>
        [true, false].map((propagateExitStatus) => ({
          participantsCount: drawSize - reduction,
          propagateExitStatus,
          singleExitStatus,
          doubleExitStatus,
          drawType,
          drawSize,
          seed: 9000230,
        })),
      ),
    ),
  ),
);

/**
 * MEASURED 2026-09-27 on `fix/p37-write-eviction`. Both numbers are CEILINGS.
 *
 *   cells    52 of 192   one cell is (drawType, size, participants, exitFlavour, propagate)
 *   findings 52          exactly one uncollapsed convergence per affected cell
 *
 * The distribution is systematic rather than seed-luck, which is why this is a defect and not a curiosity:
 * **8 cells in each of 6 draw types** (FIRST_MATCH_LOSER_CONSOLATION, FIRST_ROUND_LOSER_CONSOLATION,
 * MODIFIED_FEED_IN_CHAMPIONSHIP, COMPASS, OLYMPIC, DOUBLE_ELIMINATION) and 4 in CURTIS_CONSOLATION, i.e.
 * every combination of size × flavour × propagate for each. SINGLE_ELIMINATION contributes **0** — it has
 * no second structure for two exits to converge in, which is the control that the rule is measuring what
 * it claims to.
 *
 * Every affected cell has `participantsCount === drawSize`. A reduced draw places BYEs, and a BYE-held
 * seat takes the other path — CA's rule that a BYE remains a BYE.
 */
const BUDGET_CELLS = 52;
const BUDGET_FINDINGS = 52;

it('the uncollapsed-convergence population is within budget, and the budget only ever falls', () => {
  let cellsRun = 0;
  let findings = 0;
  const affected: string[] = [];
  const byDrawType: Record<string, number> = {};

  for (const cell of MATRIX) {
    const { doubleExitStatus, singleExitStatus, ...config } = cell;
    const structureName = resolveFirstRoundStructure(config as any);
    if (!structureName) continue;
    cellsRun += 1;

    const at = (roundPosition: number, outcome: any) => ({
      structureName,
      roundNumber: 1,
      roundPosition,
      outcome,
    });

    // THE UPGRADE: a single exit, a double beside it, then the single RE-SCORED to a double. The
    // existing correction sweep runs the opposite direction and reports nothing.
    const steps = [
      at(2, { matchUpStatus: singleExitStatus, winningSide: 1 }),
      at(1, { matchUpStatus: doubleExitStatus }),
      at(2, { matchUpStatus: doubleExitStatus }),
    ];

    setSubscriptions({});
    const drawId = `uncollapsed-${cellsRun}`;
    runPath(config as any, steps as any, drawId);

    const { drawDefinition }: any = tournamentEngine.getEvent({ drawId });
    const integrity: any = getDrawInconsistencies({ drawDefinition, drawId });
    const hits = (integrity?.inconsistencies ?? []).filter((issue: any) => issue.issueType === UNCOLLAPSED_CONVERGENCE);
    if (!hits.length) continue;

    const label = `${config.drawType} ${config.drawSize}/${config.participantsCount} ${doubleExitStatus} propagate=${config.propagateExitStatus}`;
    findings += hits.length;
    affected.push(label);
    byDrawType[config.drawType] = (byDrawType[config.drawType] ?? 0) + 1;

    // advisory by design — this must never assert the stored draw is invalid
    expect(
      hits.every((issue: any) => issue.severity === 'warning'),
      label,
    ).toEqual(true);
    expect(integrity?.valid, label).toEqual(true);
  }

  process.stdout.write(
    `\nuncollapsed convergence: cells=${affected.length}/${BUDGET_CELLS} findings=${findings}/${BUDGET_FINDINGS} ` +
      `(cellsRun=${cellsRun}) byDrawType=${JSON.stringify(byDrawType)}\n`,
  );

  // CONTROLS FIRST. A sweep that built no draws reports zero findings and satisfies every ceiling
  // below, and an empty input is indistinguishable from a clean result.
  expect(cellsRun).toBeGreaterThanOrEqual(180);
  expect(byDrawType[SINGLE_ELIMINATION] ?? 0, 'SINGLE_ELIMINATION has no structure to converge in').toEqual(0);

  // THE RATCHET. Lower these when the population shrinks; never raise them.
  expect(affected.length, `cells (was ${BUDGET_CELLS})`).toBeLessThanOrEqual(BUDGET_CELLS);
  expect(findings, `findings (was ${BUDGET_FINDINGS})`).toBeLessThanOrEqual(BUDGET_FINDINGS);

  // AND IT MUST STILL BITE.
  expect(
    affected.length,
    'the population reached ZERO — promote UNCOLLAPSED_CONVERGENCE to severity error and delete this budget',
  ).toBeGreaterThan(0);
}, 600_000);
