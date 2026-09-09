import { quarantineFor, unusedQuarantineKeys } from '@Tests/testHarness/exitPropagation/knownFailures';
import { nextPlayable, playForward, step } from '@Tests/testHarness/exitPropagation/driver';
import { checkIntegrity } from '@Tests/testHarness/exitPropagation/transitions';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import { afterAll, expect, test } from 'vitest';

// constants
import {
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  FEED_IN_CHAMPIONSHIP,
  DOUBLE_ELIMINATION,
  SINGLE_ELIMINATION,
  CURTIS_CONSOLATION,
  COMPASS,
  OLYMPIC,
} from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, DOUBLE_DEFAULT, DEFAULTED, WALKOVER, RETIRED } from '@Constants/matchUpStatusConstants';

/**
 * Cross-product coverage of exit propagation.
 *
 * The two bugs fixed on this branch (#4778, #4779) both lived in cells no test occupied. The
 * gap they came from is a cross-product gap, not a creativity gap: the corpus is heavily
 * weighted to FIRST_MATCH_LOSER_CONSOLATION and SINGLE_ELIMINATION, and both bugs were in
 * COMPASS/OLYMPIC back draws and fed consolation finals respectively. So the matrix varies the
 * dimensions that actually interact — draw type, size, BYE count, exit status and
 * propagateExitStatus — rather than adding depth to cells that are already covered.
 *
 * drawSize 16 is not optional. `feedRound` matchUp count is zero at drawSize 8 for seven of the
 * draw types below, so the fed structure #4779 lived in barely exists at 8.
 *
 * Each cell plants one exit through the real mutation path (not at generation time, which
 * bypasses it), then drives the draw forward deterministically, asserting the transition
 * properties at every step.
 */

const DRAW_TYPES = [
  SINGLE_ELIMINATION,
  DOUBLE_ELIMINATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  FEED_IN_CHAMPIONSHIP,
  CURTIS_CONSOLATION,
  COMPASS,
  OLYMPIC,
];

const DRAW_SIZES = [8, 16];
// full field, then reductions that force BYEs into different placements. Both shipped bugs are
// BYE-adjacent, and the existing corpus never varies this — it is always a full draw.
const REDUCTIONS = [0, 1, 3];
const EXIT_STATUSES = [WALKOVER, DEFAULTED, RETIRED, DOUBLE_WALKOVER, DOUBLE_DEFAULT];

const exitOutcome = (exitStatus: string) => {
  if ([DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(exitStatus)) return { matchUpStatus: exitStatus };
  if (exitStatus === RETIRED) {
    return { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } };
  }
  return { matchUpStatus: exitStatus, winningSide: 1 };
};

const MATRIX = DRAW_TYPES.flatMap(
  (drawType) =>
    DRAW_SIZES.flatMap((drawSize) =>
      REDUCTIONS.flatMap((reduction) =>
        EXIT_STATUSES.flatMap((exitStatus) =>
          [true, false].map((propagateExitStatus) => ({
            participantsCount: drawSize - reduction,
            propagateExitStatus,
            exitStatus,
            drawSize,
            drawType,
          })),
        ),
      ),
    ),
  // The seed must live ON the cell: `test.for` hands the callback a copy, so deriving it from the
  // cell's index in MATRIX inside the test yields -1, and `nonRandom: 0` is falsy and silently
  // seeds nothing. That failure mode is invisible — the matrix still passes, just not reproducibly.
).map((cell, index) => ({ ...cell, seed: index + 1 }));

const label = (cell: (typeof MATRIX)[number]) =>
  `matrix ${cell.drawType} ${cell.drawSize}/${cell.participantsCount} ${cell.exitStatus} propagate=${cell.propagateExitStatus}`;

const observedKeys = new Set<string>();

test.for(MATRIX)('$drawType $drawSize/$participantsCount $exitStatus propagate=$propagateExitStatus', (cell) => {
  setSubscriptions({});
  const key = label(cell);
  observedKeys.add(key);

  const drawId = `matrix-${key.replace(/[^\w]+/g, '-')}`;
  const { drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawId, drawType: cell.drawType, drawSize: cell.drawSize, participantsCount: cell.participantsCount },
    ],
    // nonRandom seeds mocksEngine's PRNG. Without it participant placement varies per run and
    // the set of cells that trip a defect changes between runs — unusable as a gate. The seed is
    // derived from the cell so every cell still gets a different draw.
    nonRandom: cell.seed,
    setState: true,
  });
  // a cell that fails to generate is a test bug, not an engine defect — surface it loudly
  expect(drawIds).toContain(drawId);

  const target = nextPlayable(drawId);
  expect(target?.matchUpId).toBeDefined();

  const outcome = exitOutcome(cell.exitStatus);
  const failures = [
    ...step({ propagateExitStatus: cell.propagateExitStatus, matchUpId: target.matchUpId, drawId, outcome }),
  ];
  if (!failures.length) {
    const played = playForward({ propagateExitStatus: cell.propagateExitStatus, exitOutcome: outcome, drawId });
    failures.push(...played.failures);
  }
  if (!failures.length) failures.push(...checkIntegrity(drawId, target.matchUpId));

  const quarantined = quarantineFor(key);
  const unexpected = failures.filter((failure) => !quarantined.includes(failure.property));

  if (unexpected.length) {
    const report = unexpected.map((f) => `${f.property} @ ${f.matchUpId.slice(0, 8)}\n  ${f.detail}`).join('\n');
    expect(`${key}\n${report}`).toEqual(key);
  }

  // A quarantined cell that stops failing must be un-quarantined, so the list can only shrink.
  const stillFailing = new Set(failures.map((failure) => failure.property));
  const fixed = quarantined.filter((property) => !stillFailing.has(property));
  expect(fixed).toEqual([]);
});

afterAll(() => {
  // Guards against a quarantine entry outliving the cell it names — a typo'd or stale key would
  // otherwise silently excuse nothing forever.
  expect(unusedQuarantineKeys(observedKeys, 'matrix ')).toEqual([]);
});
