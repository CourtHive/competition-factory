import { quarantineFor, unusedQuarantineKeys } from '@Tests/testHarness/exitPropagation/knownFailures';
import { clearOutcome, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { playForward } from '@Tests/testHarness/exitPropagation/driver';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import tournamentEngine from '@Engines/syncEngine';
import { afterAll, expect, test } from 'vitest';

// constants
import {
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  DOUBLE_ELIMINATION,
  SINGLE_ELIMINATION,
  CURTIS_CONSOLATION,
  COMPASS,
  OLYMPIC,
} from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, DOUBLE_DEFAULT, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { CLEAR_SCORE } from '@Constants/matchUpActionConstants';

/**
 * Agreement oracles: two derivations of the same question must not disagree.
 *
 * These need no reference implementation, because the codebase already contains several
 * implementations of each concept — they simply disagree, and each disagreement is a free
 * oracle. That is the direct lesson of #4778: `isActiveDownstream` used `feedRound` as a proxy
 * for "this exit is pending" while `isActiveMatchUp` answered the same question with a plain
 * winner-assigned check, and nothing asserted that the two agreed.
 *
 * ACTION_MUTATION_AGREEMENT is the one that pays off today. Whatever the UI offers, the engine
 * must accept — otherwise a scorer is shown a control that fails when used.
 *
 * This oracle originally probed SCORE, on the theory that offering SCORE implied the clear would
 * be accepted. Measurement refuted the premise rather than the property: SCORING a decided matchUp
 * SUCCEEDS everywhere (0 refusals across 96 cells) and only the CLEAR is refused. SCORE was never
 * the removability signal, so asserting on it was asserting the wrong pairing.
 *
 * CLEAR_SCORE is that signal — emitted by `matchUpActions` only when the clear will succeed,
 * gated on the same `hasPropagatedExitDownstream` that `setMatchUpState` applies on its
 * isClearScore branch. The property is unchanged and now points at the action that carries it:
 * if CLEAR_SCORE is offered, clearing must not be refused downstream.
 */

const DRAW_TYPES = [
  SINGLE_ELIMINATION,
  DOUBLE_ELIMINATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  CURTIS_CONSOLATION,
  COMPASS,
  OLYMPIC,
];
const EXIT_STATUSES = [WALKOVER, DOUBLE_WALKOVER, DOUBLE_DEFAULT];

// Refusals that mean "something downstream forbids this". A refusal for any OTHER reason is not
// this property's business — the engine may decline for reasons the action list does not model.
const DOWNSTREAM_REFUSALS = ['ERR_PROPAGATED_EXITS_DOWNSTREAM', 'ERR_UNCHANGED_CANNOT_CHANGE_WINNING_SIDE'];

const exitOutcome = (exitStatus: string) =>
  exitStatus === WALKOVER ? { matchUpStatus: WALKOVER, winningSide: 1 } : { matchUpStatus: exitStatus };

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
  `agreement ${cell.drawType} ${cell.drawSize}/${cell.participantsCount} ${cell.exitStatus}`;

const observedKeys = new Set<string>();

const snapshotRecord = (): any => {
  const records: any = tournamentEngine.getState().tournamentRecords;
  // makeDeepCopy rather than a JSON round trip: it carries factory extension semantics, and the
  // repo bans the JSON idiom for tournamentRecords for exactly that reason.
  return makeDeepCopy(Object.values(records ?? {})[0], false, true);
};

test.for(MATRIX)('agreement: $drawType $drawSize/$participantsCount $exitStatus', (cell) => {
  setSubscriptions({});
  const key = label(cell);
  observedKeys.add(key);

  const drawId = `agree-${key.replace(/[^\w]+/g, '-')}`;
  const { drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawId, drawType: cell.drawType, drawSize: cell.drawSize, participantsCount: cell.participantsCount },
    ],
    nonRandom: cell.seed,
    setState: true,
  });
  expect(drawIds).toContain(drawId);

  // reach a state where exits have cascaded — the disagreement only exists downstream of one
  playForward({ propagateExitStatus: true, exitOutcome: exitOutcome(cell.exitStatus), maxSteps: 6, drawId });

  // Every candidate is probed against the SAME state, restored between attempts, so the probes
  // cannot contaminate each other the way the relational properties initially did.
  const baseline = snapshotRecord();
  // Candidates are DECIDED matchUps, and the probe is a CLEAR rather than a score.
  // `PROPAGATED_EXITS_DOWNSTREAM` is raised only on the `isClearScore` branch
  // (setMatchUpState.ts:186-193), so probing with a scored outcome cannot reach the divergence —
  // a first version of this test did exactly that and passed vacuously across all 96 cells.
  const candidates = getDrawMatchUps(drawId).filter(
    (matchUp: any) => matchUp.winningSide || (matchUp.matchUpStatus && matchUp.matchUpStatus !== TO_BE_PLAYED),
  );

  const failures: any[] = [];
  for (const candidate of candidates) {
    tournamentEngine.setState(baseline);

    const { validActions }: any = tournamentEngine.matchUpActions({ matchUpId: candidate.matchUpId, drawId });
    const offersClear = (validActions ?? []).some((action: any) => action.type === CLEAR_SCORE);
    if (!offersClear) continue;

    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: candidate.matchUpId,
      outcome: clearOutcome,
      drawId,
    });
    if (result?.error?.code && DOWNSTREAM_REFUSALS.includes(result.error.code)) {
      failures.push({
        property: 'ACTION_MUTATION_AGREEMENT',
        matchUpId: candidate.matchUpId,
        detail: `matchUpActions offered CLEAR_SCORE but clearing was refused with ${result.error.code}`,
      });
    }
  }
  tournamentEngine.setState(baseline);

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
  expect(unusedQuarantineKeys(observedKeys, 'agreement ')).toEqual([]);
});
