import { checkArrivalsTrue, emptyCoverage } from '@Tests/testHarness/exitPropagation/properties';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { clearOutcome } from '@Tests/testHarness/exitPropagation/transitions';
import { setSubscriptions } from '@Global/state/globalState';
import { afterEach, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';

// constants
import { BYE, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

/**
 * CENSUS REPLAY EXECUTES THE ROUND TRIPS IT CLAIMS, AND POLICES EVERY WRITE THEY MAKE (assessment 2026-10-17,
 * findings 1 and 2).
 *
 * `replay` ran monotonicity, idempotence and do/undo back to back on one draw. Monotonicity applied the probe's
 * outcome and kept it, so idempotence and do/undo saw `mutated: false` on their first call and returned: no second
 * apply and no clear ran anywhere in census replay. And every relational property returned `[]` on a refused forward
 * call or a refused clear, without asking whether the refusal wrote.
 *
 * Each case below plants a fault the census must catch, and drives it through `replay` itself, not through a direct
 * property call (which always ran the round trip from a fresh draw). Both faults pass undetected through the shared
 * draw and the early returns.
 */

const config = {
  drawType: SINGLE_ELIMINATION,
  propagateExitStatus: true,
  participantsCount: 8,
  drawSize: 8,
  seed: 42,
};

const isClear = (params: any) => params?.outcome === clearOutcome;

afterEach(() => {
  vi.restoreAllMocks();
});

it('every probe runs its second apply and its clear', () => {
  setSubscriptions({});
  const coverage = emptyCoverage();
  expect(replay(config, [], 'relational-coverage', undefined, coverage)).toBeNull();

  // three probes, three properties each, each forward call starting from the setup state
  expect(coverage.forward).toEqual(9);
  expect(coverage.forwardMutated).toEqual(9);
  expect(coverage.secondApply).toEqual(3);
  expect(coverage.clear).toEqual(3);
  expect(coverage.clearRefused).toEqual(0);
  expect(coverage.codesInconsistentDraws).toEqual(0);
});

it('a code that disagrees with its provenance is counted in the ledger, and fails nothing', () => {
  setSubscriptions({});
  const setMatchUpStatus = tournamentEngine.setMatchUpStatus;
  vi.spyOn(tournamentEngine, 'setMatchUpStatus').mockImplementation((params: any) => {
    const result = setMatchUpStatus(params);
    // the planted defect: a writer that blanks the legacy array, as some forward writers do
    const { tournamentRecord } = tournamentEngine.getTournament();
    for (const structure of tournamentRecord.events[0].drawDefinitions[0].structures) {
      for (const matchUp of structure.matchUps) delete matchUp.matchUpStatusCodes;
    }
    tournamentEngine.setState(tournamentRecord);
    return result;
  });

  const coverage = emptyCoverage();
  const steps = [
    { structureName: 'Main', roundNumber: 1, roundPosition: 1, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
  ];
  expect(replay(config, steps as any, 'relational-codes-ledger', undefined, coverage)).toBeNull();
  expect(coverage.codesInconsistentDraws).toEqual(1);
  expect(coverage.codesInconsistentMatchUps).toBeGreaterThan(0);
});

it('a clear that silently does nothing is caught through replay', () => {
  setSubscriptions({});
  const setMatchUpStatus = tournamentEngine.setMatchUpStatus;
  vi.spyOn(tournamentEngine, 'setMatchUpStatus').mockImplementation((params: any) =>
    isClear(params) ? { success: true } : setMatchUpStatus(params),
  );

  const failure = replay(config, [], 'relational-planted-undo');
  expect(failure?.property).toEqual('DO_UNDO_IDENTITY');
});

it('a forward call that writes and then refuses is caught through replay', () => {
  setSubscriptions({});
  const setMatchUpStatus = tournamentEngine.setMatchUpStatus;
  vi.spyOn(tournamentEngine, 'setMatchUpStatus').mockImplementation((params: any) => {
    const result = setMatchUpStatus(params);
    return isClear(params) ? result : { error: INVALID_VALUES };
  });

  const failure = replay(config, [], 'relational-planted-write');
  expect(failure?.property).toEqual('ERROR_IMPLIES_NO_MUTATION');
});

it('a clear that writes and then refuses is caught through replay', () => {
  setSubscriptions({});
  const setMatchUpStatus = tournamentEngine.setMatchUpStatus;
  vi.spyOn(tournamentEngine, 'setMatchUpStatus').mockImplementation((params: any) => {
    const result = setMatchUpStatus(params);
    return isClear(params) ? { error: INVALID_VALUES } : result;
  });

  const failure = replay(config, [], 'relational-planted-clear');
  expect(failure?.property).toEqual('ERROR_IMPLIES_NO_MUTATION');
});

it('a BYE origin the round trip leaves out is still policed for truth', () => {
  setSubscriptions({});
  const drawId = 'relational-bye-origin-truth';
  expect(prepareDraw(config, drawId)).toEqual(true);
  expect(checkArrivalsTrue(drawId)).toEqual([]);

  // the planted defect: a BYE origin naming a matchUp that is no BYE, opposite no exit
  const { tournamentRecord } = tournamentEngine.getTournament();
  const [structure] = tournamentRecord.events[0].drawDefinitions[0].structures;
  const [feeder, , , , target] = structure.matchUps;
  target.sideExitProvenance = {
    1: { matchUpStatus: BYE, previousMatchUpStatus: BYE, sourceMatchUpId: feeder.matchUpId },
  };
  tournamentEngine.setState(tournamentRecord);

  const [failure] = checkArrivalsTrue(drawId);
  expect(failure?.property).toEqual('ARRIVAL_TRUE');
  expect(failure?.detail).toContain('a BYE origin');
});
