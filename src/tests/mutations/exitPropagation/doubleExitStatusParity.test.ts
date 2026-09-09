import {
  clearOutcome,
  getDrawDefinition,
  getDrawMatchUps,
  projectDraw,
} from '@Tests/testHarness/exitPropagation/transitions';
import { playForward } from '@Tests/testHarness/exitPropagation/driver';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import {
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  DOUBLE_ELIMINATION,
  SINGLE_ELIMINATION,
  CURTIS_CONSOLATION,
  COMPASS,
  OLYMPIC,
} from '@Constants/drawDefinitionConstants';
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { OUTCOME_DEFAULT, OUTCOME_WALKOVER } from '@Helpers/keyValueScore/constants';

/**
 * DOUBLE_WALKOVER and DOUBLE_DEFAULT must behave as one class to the propagation pipeline.
 *
 * They differ only in the status they PRODUCE downstream — `producedMatchUpStatus` maps
 * DOUBLE_WALKOVER to WALKOVER and DOUBLE_DEFAULT to DEFAULTED — and in the status code carried
 * (`WO` vs `DEF`). Every structural decision should be identical: the same participants advance
 * to the same drawPositions, the same BYEs are placed, the same matchUps are skipped, and the
 * same mutations are refused.
 *
 * So: run the identical draw and the identical schedule twice, once per status, rename the status
 * pair and the code pair in the DOUBLE_DEFAULT run, and the two must be equal. This is an
 * agreement oracle — nobody has to compute what the right bracket is.
 *
 * WHY IT EXISTS. Three sites in the pipeline test `=== DOUBLE_WALKOVER` where sibling sites test
 * `[DOUBLE_WALKOVER, DOUBLE_DEFAULT]`, and a reading of the code says they are bugs:
 *
 *   - doubleExitAdvancement.ts    — a DOUBLE_DEFAULT loserMatchUp is not skipped
 *   - hasPropagatedExitDownstream — a DOUBLE_DEFAULT downstream does not block clearing
 *   - removeDirectedParticipants  — a DOUBLE_DEFAULT source clears its codes to []
 *
 * This oracle was built to prove them, and it does NOT. Measured across all 54 cells below, under
 * forward, forward-then-clear, and converging-pairs schedules: the suite is green with the narrow
 * checks in place, and equally green with any one of them widened. They are behaviourally inert
 * on everything reachable here.
 *
 * The likely reason is that a PRODUCED double exit is not always DOUBLE_DEFAULT even when its
 * source was: `progressExitStatus` RULE 4 hardcodes DOUBLE_WALKOVER, while
 * `doubleExitAdvancement` preserves DOUBLE_DEFAULT. Two producers, two conventions — so the
 * narrow checks may be correct for the statuses that actually reach them.
 *
 * They were therefore left alone. If someone later widens them on the strength of reading the
 * code, this test is what should catch the consequence; if it stays green, the change is inert
 * rather than correct, and needs a scenario this oracle does not reach before it can be justified.
 */

const DRAW_TYPES = [
  SINGLE_ELIMINATION,
  DOUBLE_ELIMINATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  FEED_IN_CHAMPIONSHIP,
  CURTIS_CONSOLATION,
  COMPASS,
  OLYMPIC,
];

const MATRIX = DRAW_TYPES.flatMap((drawType) =>
  [8, 16].flatMap((drawSize) =>
    [0, 1, 3].map((reduction) => ({
      participantsCount: drawSize - reduction,
      drawSize,
      drawType,
    })),
  ),
).map((cell, index) => ({ ...cell, seed: index + 1 }));

/**
 * Strip identity, keep substance.
 *
 * `nonRandom` seeds participant generation — participantIds are identical across the pair — but
 * structureIds and matchUpIds are freshly minted UUIDs per draw, and the structureId here also
 * embeds the drawId, which names the status. Structure and matchUp ORDER is deterministic for a
 * given seed, so positional index is a sound stand-in for identity and the comparison then rests
 * entirely on status, winningSide, drawPositions, codes and positionAssignments.
 */
const anonymize = (projection: any[]): any => {
  // participantIds are relabelled by order of first appearance rather than compared directly.
  // `nonRandom` does not guarantee an identical participant set across two separate
  // generateTournamentRecord calls — measured: SINGLE_ELIMINATION 16/15 generates different
  // participantIds for the two runs of the pair. Relabelling keeps the assertion meaningful
  // (the participant occupying a given slot must still occupy the corresponding slot in the
  // other run) without depending on identity the generator does not promise.
  const labels = new Map<string, number>();
  const label = (participantId: string) => {
    if (!labels.has(participantId)) labels.set(participantId, labels.size);
    return `p${labels.get(participantId)}`;
  };

  return projection.map((structure: any, structureIndex: number) => ({
    structureIndex,
    positionAssignments: (structure.positionAssignments ?? []).map((assignment: any) => ({
      ...assignment,
      participantId: assignment.participantId ? label(assignment.participantId) : undefined,
    })),
    matchUps: structure.matchUps.map(([, ...rest]: any[]) => rest),
  }));
};

/** Rename DOUBLE_DEFAULT's vocabulary to DOUBLE_WALKOVER's so the two runs are comparable. */
const asWalkoverVocabulary = (run: any): string =>
  JSON.stringify({ outcomes: run.outcomes, draw: anonymize(run.draw) })
    .split(`"${DOUBLE_DEFAULT}"`)
    .join(`"${DOUBLE_WALKOVER}"`)
    .split(`"${DEFAULTED}"`)
    .join(`"${WALKOVER}"`)
    .split(`"${OUTCOME_DEFAULT}"`)
    .join(`"${OUTCOME_WALKOVER}"`);

/** Stable across runs: never keys on a freshly generated id. */
const structuralOrder = (a: any, b: any): number =>
  String(a.stage).localeCompare(String(b.stage)) ||
  String(a.structureName).localeCompare(String(b.structureName)) ||
  (a.roundNumber ?? 0) - (b.roundNumber ?? 0) ||
  (a.roundPosition ?? 0) - (b.roundPosition ?? 0);

/**
 * Play forward, then CLEAR every other decided matchUp.
 *
 * The removal half is not optional. Two of the three drifted sites are only reachable through it
 * — `removeDirectedParticipants` runs on removal, and `hasPropagatedExitDownstream` gates only
 * the clear branch — and a forward-only schedule left all three fixes unverified: reverting each
 * one individually still passed. The refusal codes are compared too, because "DOUBLE_DEFAULT was
 * allowed to clear where DOUBLE_WALKOVER was refused" is exactly the divergence at that site and
 * it shows up as a difference in outcomes, not in final state.
 */
function runSchedule(cell: (typeof MATRIX)[number], exitStatus: string): string {
  setSubscriptions({});
  const drawId = `parity-${exitStatus}-${cell.drawType}-${cell.drawSize}-${cell.participantsCount}`;
  const { drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawId, drawType: cell.drawType, drawSize: cell.drawSize, participantsCount: cell.participantsCount },
    ],
    nonRandom: cell.seed,
    setState: true,
  });
  expect(drawIds).toContain(drawId);

  playForward({ propagateExitStatus: true, exitOutcome: { matchUpStatus: exitStatus }, drawId });

  const decided = getDrawMatchUps(drawId)
    .filter((matchUp: any) => matchUp.winningSide || (matchUp.matchUpStatus && matchUp.matchUpStatus !== TO_BE_PLAYED))
    .sort(structuralOrder);

  const outcomes = decided
    .filter((_: any, index: number) => index % 2 === 0)
    .map((matchUp: any) => {
      const result: any = tournamentEngine.setMatchUpStatus({
        matchUpId: matchUp.matchUpId,
        outcome: clearOutcome,
        drawId,
      });
      return result?.error?.code ?? 'OK';
    });

  return asWalkoverVocabulary({ outcomes, draw: projectDraw(getDrawDefinition(drawId)) });
}

/**
 * Drive two double exits into the SAME loser matchUp, then clear.
 *
 * All three drifted sites need a loserMatchUp that is ALREADY a double exit when another exit
 * arrives — `doubleExitAdvancement` skips on it, `hasPropagatedExitDownstream` reports on it, and
 * `removeDirectedParticipants` restores its codes. A periodic exit schedule does not reliably
 * produce that convergence: with only the forward-and-clear schedule above, reverting each of the
 * three fixes individually still passed. Pairing sources by shared `loserMatchUpId` constructs it
 * on purpose.
 */
function runConvergingSchedule(cell: (typeof MATRIX)[number], exitStatus: string): string {
  setSubscriptions({});
  const drawId = `converge-${exitStatus}-${cell.drawType}-${cell.drawSize}-${cell.participantsCount}`;
  const { drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawId, drawType: cell.drawType, drawSize: cell.drawSize, participantsCount: cell.participantsCount },
    ],
    nonRandom: cell.seed,
    setState: true,
  });
  expect(drawIds).toContain(drawId);

  const byLoserTarget = new Map<string, any[]>();
  for (const matchUp of getDrawMatchUps(drawId)) {
    const populated = (matchUp.sides ?? []).filter((side: any) => side?.participantId).length === 2;
    if (!matchUp.loserMatchUpId || !populated) continue;
    byLoserTarget.set(matchUp.loserMatchUpId, [...(byLoserTarget.get(matchUp.loserMatchUpId) ?? []), matchUp]);
  }

  const outcomes: string[] = [];
  // Ordered by the SOURCES' structural coordinates, never by loserMatchUpId. Those are freshly
  // minted UUIDs, so sorting on them applies the pairs in a different order in each run of the
  // pair — which makes the whole comparison nondeterministic and silently invalidates any
  // conclusion drawn from it. (It did: a first version of this test produced per-site results
  // that were pure noise.)
  const converging = [...byLoserTarget.values()]
    .filter((sources) => sources.length === 2)
    .map((sources) => sources.sort(structuralOrder))
    .sort((a, b) => structuralOrder(a[0], b[0]));

  for (const sources of converging) {
    for (const source of sources) {
      const result: any = tournamentEngine.setMatchUpStatus({
        outcome: { matchUpStatus: exitStatus },
        matchUpId: source.matchUpId,
        drawId,
      });
      outcomes.push(result?.error?.code ?? 'OK');
    }
  }

  // now unwind, which is where removeDirectedParticipants restores the code pair
  for (const sources of converging) {
    for (const source of sources) {
      const result: any = tournamentEngine.setMatchUpStatus({
        matchUpId: source.matchUpId,
        outcome: clearOutcome,
        drawId,
      });
      outcomes.push(result?.error?.code ?? 'OK');
    }
  }

  return asWalkoverVocabulary({ outcomes, draw: projectDraw(getDrawDefinition(drawId)) });
}

test.for(MATRIX)('double-exit parity, converging pairs: $drawType $drawSize/$participantsCount', (cell) => {
  expect(runConvergingSchedule(cell, DOUBLE_DEFAULT)).toEqual(runConvergingSchedule(cell, DOUBLE_WALKOVER));
});

test.for(MATRIX)('double-exit parity: $drawType $drawSize/$participantsCount', (cell) => {
  // drawIds differ between the two runs by construction, and structureIds/matchUpIds are freshly
  // generated per draw — but both runs use the SAME mocksEngine seed, so those ids are identical
  // across the pair and the projections are directly comparable.
  const walkover = runSchedule(cell, DOUBLE_WALKOVER);
  const defaulted = runSchedule(cell, DOUBLE_DEFAULT);

  expect(defaulted).toEqual(walkover);
});
