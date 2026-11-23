import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { FEED_IN_CHAMPIONSHIP, MAIN } from '@Constants/drawDefinitionConstants';
import { RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';

/**
 * A result entered in bulk propagates exactly as the same result entered singly.
 *
 * `bulkMatchUpStatusUpdate` forwarded only `schedule`, `matchUpFormat` and the outcome to each `setMatchUpStatus`,
 * and dropped even the `policyDefinitions` it was given. So `allowChangePropagation`, `propagateExitStatus` and
 * `propagateRetirementAsExit` never reached it: a walkover entered in bulk carried nowhere while the same walkover
 * entered singly carried into the consolation (TASKS, found 2026-10-15). No CourtHive app calls the bulk method;
 * the exposure is external integrators.
 *
 * Each case runs one tournament record three ways: singly, in bulk with the options on the call, and in bulk with
 * the options on the outcome. The downstream state of every matchUp must be identical. Each scenario also has a
 * control that the option changes the single-call result, so parity is never asserted about an option that does
 * nothing. The precedence is setMatchUpStatus's own, `policy ?? param ?? default`: an applied scoring policy that
 * speaks on a flag wins over the call in both paths.
 */

const DRAW_ID = 'bulk-parity';

const WALKOVER_OUTCOME = { matchUpStatus: WALKOVER, winningSide: 1 };
const RETIREMENT_OUTCOME = {
  matchUpStatus: RETIRED,
  winningSide: 1,
  score: { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' },
};
const scored = (winningSide: number) =>
  mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-3 6-3', winningSide }).outcome;

function generate(policyDefinitions?: any) {
  setSubscriptions({});
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount: 16, drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP, drawId: DRAW_ID }],
    policyDefinitions,
    nonRandom: 1,
  });
  return tournamentRecord;
}

function mainMatchUp(roundNumber: number, roundPosition: number) {
  return tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId: DRAW_ID })
    .matchUps.find(
      (matchUp: any) =>
        matchUp.stage === MAIN && matchUp.roundNumber === roundNumber && matchUp.roundPosition === roundPosition,
    );
}

/** Everything a propagation decides, per matchUp: status, winner, score, who is where. */
function projection() {
  return tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId: DRAW_ID })
    .matchUps.map((matchUp: any) => ({
      matchUpId: matchUp.matchUpId,
      matchUpStatus: matchUp.matchUpStatus,
      winningSide: matchUp.winningSide,
      score: matchUp.score?.scoreStringSide1,
      participantIds: (matchUp.sides ?? []).map((side: any) => side.participantId ?? null),
    }))
    .sort((a: any, b: any) => a.matchUpId.localeCompare(b.matchUpId));
}

type Step = { roundNumber: number; roundPosition: number; outcome: any };
type Mode = 'single' | 'bulk-call' | 'bulk-outcome';

/**
 * Run the setup steps singly (no options), then the final step in the given mode with the given options.
 * Returns the final step's result and the projection.
 */
function run({
  record,
  setup,
  final,
  options,
  mode,
}: {
  record: any;
  setup: Step[];
  final: Step;
  options: any;
  mode: Mode;
}) {
  tournamentEngine.setState(structuredClone(record));
  for (const step of setup) {
    const { matchUpId } = mainMatchUp(step.roundNumber, step.roundPosition);
    const result = tournamentEngine.setMatchUpStatus({ matchUpId, outcome: step.outcome, drawId: DRAW_ID });
    expect(result.error).toBeUndefined();
  }

  const { matchUpId, eventId } = mainMatchUp(final.roundNumber, final.roundPosition);
  let result: any;
  if (mode === 'single') {
    result = tournamentEngine.setMatchUpStatus({ ...options, matchUpId, outcome: final.outcome, drawId: DRAW_ID });
  } else {
    const item = { ...final.outcome, tournamentId: record.tournamentId, drawId: DRAW_ID, eventId, matchUpId };
    result =
      mode === 'bulk-call'
        ? tournamentEngine.bulkMatchUpStatusUpdate({ ...options, outcomes: [item] })
        : tournamentEngine.bulkMatchUpStatusUpdate({ outcomes: [{ ...item, ...options }] });
  }

  return { error: result.error, state: projection() };
}

function expectParity(args: { record: any; setup: Step[]; final: Step; options: any }) {
  const single = run({ ...args, mode: 'single' });
  expect(run({ ...args, mode: 'bulk-call' })).toEqual(single);
  expect(run({ ...args, mode: 'bulk-outcome' })).toEqual(single);
  return single;
}

const R1P1 = { roundNumber: 1, roundPosition: 1 };

describe('bulkMatchUpStatusUpdate: a result entered in bulk propagates as it does singly', () => {
  it('propagateExitStatus: a walkover carries into the consolation in both paths', () => {
    const record = generate();
    const final = { ...R1P1, outcome: WALKOVER_OUTCOME };

    // control: the flag changes the single-call result
    const off = run({ record, setup: [], final, options: {}, mode: 'single' });
    const on = expectParity({ record, setup: [], final, options: { propagateExitStatus: true } });
    expect(on.error).toBeUndefined();
    expect(on.state).not.toEqual(off.state);
    expect(on.state.filter((matchUp: any) => matchUp.matchUpStatus === WALKOVER).length).toBeGreaterThan(1);

    expectParity({ record, setup: [], final, options: {} });
  });

  it('propagateRetirementAsExit: a retirement carries only when asked, in both paths', () => {
    const record = generate();
    const final = { ...R1P1, outcome: RETIREMENT_OUTCOME };

    const carried = expectParity({
      options: { propagateExitStatus: true, propagateRetirementAsExit: true },
      setup: [],
      record,
      final,
    });
    const kept = expectParity({
      options: { propagateExitStatus: true, propagateRetirementAsExit: false },
      setup: [],
      record,
      final,
    });
    expect(carried.state).not.toEqual(kept.state);
    expect(carried.state.some((matchUp: any) => matchUp.matchUpStatus === WALKOVER)).toEqual(true);
    expect(kept.state.some((matchUp: any) => matchUp.matchUpStatus === WALKOVER)).toEqual(false);
  });

  it('allowChangePropagation: a winner swap past a played round succeeds or is refused alike', () => {
    const record = generate();
    const setup = [
      { ...R1P1, outcome: scored(1) },
      { roundNumber: 1, roundPosition: 2, outcome: scored(1) },
      { roundNumber: 2, roundPosition: 1, outcome: scored(1) },
    ];
    const final = { ...R1P1, outcome: scored(2) };

    const refused = expectParity({ record, setup, final, options: {} });
    expect(refused.error).toBeDefined();

    const swapped = expectParity({ record, setup, final, options: { allowChangePropagation: true } });
    expect(swapped.error).toBeUndefined();
    expect(swapped.state).not.toEqual(refused.state);
  });

  it('a scoring policy that speaks on a flag wins over the call in both paths', () => {
    const record = generate({ [POLICY_TYPE_SCORING]: { propagateExitStatus: false } });
    const final = { ...R1P1, outcome: WALKOVER_OUTCOME };

    const asked = expectParity({ record, setup: [], final, options: { propagateExitStatus: true } });
    const silent = run({ record, setup: [], final, options: {}, mode: 'single' });
    // the policy forbids, so asking changes nothing
    expect(asked.state).toEqual(silent.state);
    expect(asked.state.filter((matchUp: any) => matchUp.matchUpStatus === WALKOVER).length).toEqual(1);
  });

  it('disableScoreValidation: a score the format refuses is refused or accepted alike', () => {
    const record = generate();
    // one set of a best-of-three: refused unless validation is off
    const { score, winningSide } = RETIREMENT_OUTCOME;
    const final = { ...R1P1, outcome: { score, winningSide } };

    const refused = expectParity({ record, setup: [], final, options: {} });
    expect(refused.error).toBeDefined();
    const accepted = expectParity({ record, setup: [], final, options: { disableScoreValidation: true } });
    expect(accepted.error).toBeUndefined();
  });

  it('an option on the outcome wins over the same option on the call, either way', () => {
    const record = generate();
    const final = { ...R1P1, outcome: WALKOVER_OUTCOME };
    const off = run({ record, setup: [], final, options: {}, mode: 'single' });
    const on = run({ record, setup: [], final, options: { propagateExitStatus: true }, mode: 'single' });
    expect(on.state).not.toEqual(off.state);

    for (const [onOutcome, onCall, expected] of [
      [false, true, off],
      [true, false, on],
    ] as const) {
      tournamentEngine.setState(structuredClone(record));
      const { matchUpId, eventId } = mainMatchUp(1, 1);
      const item = { ...WALKOVER_OUTCOME, tournamentId: record.tournamentId, drawId: DRAW_ID, eventId, matchUpId };
      const result = tournamentEngine.bulkMatchUpStatusUpdate({
        outcomes: [{ ...item, propagateExitStatus: onOutcome }],
        propagateExitStatus: onCall,
      });
      expect(result.error).toBeUndefined();
      expect(projection()).toEqual(expected.state);
    }
  });
});
