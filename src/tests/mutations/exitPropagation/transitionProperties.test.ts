import {
  checkDoUndoIdentity,
  checkIdempotence,
  checkMonotonicity,
} from '@Tests/testHarness/exitPropagation/properties';
import { quarantineFor, unusedQuarantineKeys } from '@Tests/testHarness/exitPropagation/knownFailures';
import { nextPlayable, playForward } from '@Tests/testHarness/exitPropagation/driver';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import { afterAll, expect, test } from 'vitest';

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
import { DOUBLE_WALKOVER, DOUBLE_DEFAULT, DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * Relational properties of the mutation boundary.
 *
 * These carry no bracket semantics at all — they are statements about a mutation and its inverse
 * — so unlike the structural invariants they cannot inherit a misconception from the code they
 * check. That independence is the point: the two shipped bugs were both cases where the
 * pipeline's own model of the draw was wrong, and an oracle built from that same model would
 * have agreed with it.
 *
 * Each cell plays the draw partway forward first, because these properties are uninteresting on
 * a fresh draw: the states that break are the ones where an exit has already cascaded.
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
const EXIT_STATUSES = [WALKOVER, DEFAULTED, DOUBLE_WALKOVER, DOUBLE_DEFAULT];

const exitOutcome = (exitStatus: string) =>
  [DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(exitStatus)
    ? { matchUpStatus: exitStatus }
    : { matchUpStatus: exitStatus, winningSide: 1 };

const MATRIX = DRAW_TYPES.flatMap((drawType) =>
  [8, 16].flatMap((drawSize) =>
    [0, 1].flatMap((reduction) =>
      EXIT_STATUSES.map((exitStatus) => ({
        participantsCount: drawSize - reduction,
        exitStatus,
        drawSize,
        drawType,
      })),
    ),
  ),
).map((cell, index) => ({ ...cell, seed: index + 1 }));

const label = (cell: (typeof MATRIX)[number]) =>
  `properties ${cell.drawType} ${cell.drawSize}/${cell.participantsCount} ${cell.exitStatus}`;

const observedKeys = new Set<string>();

test.for(MATRIX)('properties: $drawType $drawSize/$participantsCount $exitStatus', (cell) => {
  setSubscriptions({});
  const key = label(cell);
  observedKeys.add(key);

  const drawId = `props-${key.replace(/[^\w]+/g, '-')}`;
  const outcome = exitOutcome(cell.exitStatus);

  /**
   * Each property gets a FRESHLY generated draw.
   *
   * They all mutate, so running them in sequence against one draw makes each property's
   * precondition the previous property's post-state — which produced 14 confident, entirely
   * bogus failures on the first run of this file: do/undo snapshotted a "before" in which the
   * target had already been set by the property ahead of it, then correctly reported that
   * clearing did not restore it. Regenerating costs a few milliseconds and removes the confound.
   */
  const onFreshDraw = (check: (params: any) => any[]): any[] => {
    const { drawIds } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        { drawId, drawType: cell.drawType, drawSize: cell.drawSize, participantsCount: cell.participantsCount },
      ],
      nonRandom: cell.seed,
      setState: true,
    });
    expect(drawIds).toContain(drawId);

    // get the draw into a partially played state with at least one exit already cascaded
    playForward({ propagateExitStatus: true, exitOutcome: outcome, maxSteps: 5, drawId });

    const target = nextPlayable(drawId);
    // a draw with nothing left to play is a valid outcome of the warm-up, not a failure
    if (!target) return [];
    return check({ propagateExitStatus: true, matchUpId: target.matchUpId, drawId, outcome });
  };

  const failures = [
    ...onFreshDraw(checkMonotonicity),
    ...onFreshDraw(checkIdempotence),
    ...onFreshDraw(checkDoUndoIdentity),
  ];

  const quarantined = quarantineFor(key);
  const unexpected = failures.filter((failure) => !quarantined.includes(failure.property));
  if (unexpected.length) {
    const report = unexpected.map((f) => `${f.property} @ ${f.matchUpId.slice(0, 8)}\n  ${f.detail}`).join('\n');
    expect(`${key}\n${report}`).toEqual(key);
  }

  const stillFailing = new Set(failures.map((failure) => failure.property));
  expect(quarantined.filter((property) => !stillFailing.has(property))).toEqual([]);
});

afterAll(() => {
  expect(unusedQuarantineKeys(observedKeys, 'properties ')).toEqual([]);
});
