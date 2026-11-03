import { asyncEngine, competitionEngineAsync, tournamentEngineAsync } from '../../index';

import type { AsyncEngineSetup, AsyncEngineUnsupportedFacade, AsyncFactoryEngine } from '../../types/asyncEngineTypes';
import type { AsyncEngineDirectMethod } from '../../types/asyncEngineDirectMethods';
import type { FactoryEngineMethod } from '../../types/factoryEngineMethods';

type Assert<T extends true> = T;
type IsAny<T> = 0 extends 1 & T ? true : false;
type GovernorNames = Exclude<FactoryEngineMethod, AsyncEngineDirectMethod | 'execute' | 'executionQueue'>;
type NonPromiseGovernor = {
  [Name in GovernorNames]: ReturnType<AsyncFactoryEngine[Name]> extends Promise<unknown> ? never : Name;
}[GovernorNames];
type UnclassifiedDirect = Exclude<AsyncEngineDirectMethod, keyof AsyncEngineSetup | AsyncEngineUnsupportedFacade>;

const allGovernorsArePromises: Assert<[NonPromiseGovernor] extends [never] ? true : false> = true;
const everyDirectMountIsClassified: Assert<[UnclassifiedDirect] extends [never] ? true : false> = true;
const noAnyEngine: Assert<IsAny<typeof competitionEngineAsync> extends false ? true : false> = true;
const noAnyFallback: Assert<
  IsAny<ReturnType<typeof tournamentEngineAsync.calculateCapacityStats>> extends false ? true : false
> = true;
void [allGovernorsArePromises, everyDirectMountIsClassified, noAnyEngine, noAnyFallback];

// Compile-time consumer regressions; intentionally not invoked at runtime.
export function asyncEngineConsumerContract(engine: AsyncFactoryEngine): void {
  const events: Promise<unknown> = engine.getEvents();
  // @ts-expect-error A query result cannot be read before awaiting it.
  events.events;
  // @ts-expect-error The mutation result is also a Promise.
  engine.addEvent({ event: { eventName: 'Singles' } }).success;
  // @ts-expect-error The async surface has no permissive string index.
  engine.notAFactoryMethod();
  // @ts-expect-error Known argument shapes are retained.
  engine.getCompetitionFormat({ notAFormatParameter: true });
  // @ts-expect-error The unresolved-signature fallback is Promise<unknown>, not any.
  engine.calculateCapacityStats({}).success;
  // @ts-expect-error The existing query facade is synchronous and not async-safe.
  engine.q.events();
  // @ts-expect-error Synchronous mutation preview cannot wrap async dispatch safely.
  engine.dryRun([]);
  // @ts-expect-error The synchronous builder terminal does not await async queues.
  engine.build.event().create();

  const state = engine.getState();
  const records = state.tournamentRecords;
  const version: string = engine.version();
  const chained: AsyncFactoryEngine = engine.setState(records).devContext(false);
  const alias: AsyncFactoryEngine = tournamentEngineAsync;
  const bare = asyncEngine();
  // @ts-expect-error Initialization can refuse: check before using the instance.
  bare.importMethods({});
  if ('importMethods' in bare) bare.importMethods({});
  const testInstance: AsyncFactoryEngine = asyncEngine(true);
  const stop = engine.on('addMatchUps', (payload) => {
    void payload.matchUps;
    // @ts-expect-error Event-bus payload generics remain intact.
    payload.notAPayloadField;
  });
  stop();
  void [version, chained, alias, testInstance];
}

export async function asyncMutationResultContract(engine: AsyncFactoryEngine): Promise<void> {
  const result = await engine.addEvent({ event: { eventName: 'Singles' } });
  const success: boolean | undefined = result.success;
  const eventName: string | undefined = result.event?.eventName;
  void [success, eventName];
}
