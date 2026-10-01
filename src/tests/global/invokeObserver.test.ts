import { getInvokeObserver, setInvokeObserver, type InvokeEvent } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it } from 'vitest';

// constants
import { INVALID_VALUES, MATCHUP_NOT_FOUND } from '@Constants/errorConditionConstants';

afterEach(() => setInvokeObserver());

function setup() {
  mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }], setState: true });
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  return matchUps[0];
}

it('sees before and after for a direct call, with the caller params and the result', () => {
  const { matchUpId, drawId } = setup();
  const events: InvokeEvent[] = [];
  setInvokeObserver((event) => events.push(event));
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
  expect(tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome }).success).toEqual(true);
  const mine = events.filter((e) => e.methodName === 'setMatchUpStatus');
  expect(mine.map((e) => e.phase)).toEqual(['before', 'after']);
  expect(mine[0].params).toMatchObject({ drawId, matchUpId });
  expect(mine[0].result).toBeUndefined();
  expect(mine[1].result).toMatchObject({ success: true });
  expect(mine[1].engineType).toEqual('sync');
});

it('sees a refusal as an after event carrying the error, and directives through executionQueue', () => {
  const { drawId } = setup();
  const events: InvokeEvent[] = [];
  setInvokeObserver((event) => events.push(event));
  tournamentEngine.executionQueue([
    { method: 'setMatchUpStatus', params: { drawId, matchUpId: 'nope', outcome: { winningSide: 1 } } },
  ]);
  const after = events.find((e) => e.methodName === 'setMatchUpStatus' && e.phase === 'after');
  expect(after?.result?.error).toEqual(MATCHUP_NOT_FOUND);
});

it('is removed with no argument and refuses a non-function', () => {
  setInvokeObserver(() => undefined);
  expect(getInvokeObserver()).toBeTypeOf('function');
  expect(setInvokeObserver('nope' as any).error).toEqual(INVALID_VALUES);
  expect(setInvokeObserver().success).toEqual(true);
  expect(getInvokeObserver()).toBeUndefined();
});
