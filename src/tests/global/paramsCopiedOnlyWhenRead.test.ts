import { setDevContext, setGlobalLog, setInvokeObserver } from '@Global/state/globalState';
import { engineLogging, paramsMayBeLogged } from '@Global/state/engineLogging';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it } from 'vitest';

// The engine copies a call's params so the dev log and the invoke observer see them as the caller
// passed them. Copied on every call, that copy was most of the cost of a query handed the
// tournament's hydrated matchUps. These pin that it is taken exactly when something will read it.

afterEach(() => {
  setInvokeObserver();
  setDevContext(false);
  setGlobalLog();
});

// A nested param the method never reads. Nested, because the engine spreads its params (which
// reads every top-level value); only a deep copy descends into one.
function probedCall() {
  let reads = 0;
  const nested: any = {};
  const params: any = { matchUpId: 'whatever', nested };
  Object.defineProperty(nested, 'probe', {
    get: () => {
      reads += 1;
      return 1;
    },
    enumerable: true,
  });
  tournamentEngine.getMatchUpReadiness(params);
  return reads;
}

function setup() {
  mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }], setState: true });
}

it('does not copy params when nothing will read them', () => {
  setup();
  expect(probedCall()).toEqual(0);

  // logging that never prints params: timing only, or results only
  setDevContext({ perf: 0, result: true });
  expect(probedCall()).toEqual(0);
});

it('copies params when the dev log may print them', () => {
  setup();
  setDevContext({ params: true });
  expect(probedCall()).toEqual(1);

  setDevContext({ params: ['getMatchUpReadiness'] });
  expect(probedCall()).toEqual(1);

  // errors are logged with their params, and the copy has to precede the call
  setDevContext({ errors: true });
  expect(probedCall()).toEqual(1);
});

it('copies params for the invoke observer', () => {
  setup();
  setInvokeObserver(() => undefined);
  expect(probedCall()).toEqual(1);
});

it('decides per method', () => {
  setDevContext({ params: ['getParticipantRest'], errors: ['allTournamentMatchUps'] });
  expect(paramsMayBeLogged('getParticipantRest')).toEqual(true);
  expect(paramsMayBeLogged('allTournamentMatchUps')).toEqual(true);
  expect(paramsMayBeLogged('getMatchUpReadiness')).toEqual(false);

  setDevContext({ params: true, exclude: ['getMatchUpReadiness'] });
  expect(paramsMayBeLogged('getMatchUpReadiness')).toEqual(false);
  expect(paramsMayBeLogged('getParticipantRest')).toEqual(true);

  setDevContext(true);
  expect(paramsMayBeLogged('getParticipantRest')).toEqual(false);
});

/**
 * The two functions ask the same rules (shared helpers in `engineLogging.ts`), and this pins that they agree across
 * every shape of dev context: for a call that errs, params are printed exactly when `paramsMayBeLogged` said they might
 * be; for a call that succeeds, printing them implies it did. Either half failing means a call can print params that
 * were never copied, or copies them for nothing.
 */
it('agrees with what engineLogging prints, across dev contexts', () => {
  const methods = ['getMatchUpReadiness', 'getParticipantRest'];
  const choices = [undefined, false, true, ['getMatchUpReadiness']];
  const contexts: any[] = [true, false];
  for (const params of choices)
    for (const errors of choices)
      for (const result of choices)
        for (const exclude of [undefined, ['getMatchUpReadiness']])
          contexts.push({ params, errors, result, exclude, perf: 0 });

  const printed: any[] = [];
  setGlobalLog(({ log }) => printed.push(log));
  const paramsPrinted = (methodName: string, erred: boolean) => {
    printed.length = 0;
    const result: any = erred ? { error: { code: 'ERR' } } : { success: true };
    engineLogging({ engineType: 'sync', methodName, elapsed: 1, params: { sentinel: true }, result });
    return printed.some((log) => log.params?.sentinel);
  };

  let checked = 0;
  for (const devContext of contexts) {
    setDevContext(devContext);
    for (const methodName of methods) {
      const mayBe = paramsMayBeLogged(methodName);
      expect(paramsPrinted(methodName, true), JSON.stringify({ devContext, methodName })).toEqual(mayBe);
      if (paramsPrinted(methodName, false)) expect(mayBe, JSON.stringify({ devContext, methodName })).toEqual(true);
      checked += 1;
    }
  }
  expect(checked).toEqual(contexts.length * methods.length);
});
