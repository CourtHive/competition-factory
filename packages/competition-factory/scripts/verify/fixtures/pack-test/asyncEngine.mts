import { asyncEngine, competitionEngineAsync, tournamentEngineAsync } from 'tods-competition-factory';
import type { AsyncFactoryEngine, AsyncEngineFactory } from 'tods-competition-factory';

const factory: AsyncEngineFactory = asyncEngine;
const engine: AsyncFactoryEngine = tournamentEngineAsync;
const query: Promise<unknown> = engine.getEvents();
const mutation: Promise<unknown> = competitionEngineAsync.addEvent({ event: { eventName: 'Example' } });
const fallback = engine.calculateCapacityStats({});
const state = engine.getState().tournamentRecords;
const version: string = engine.version();
async function mutationResult() {
  const result = await engine.addEvent({ event: { eventName: 'Example' } });
  const success: boolean | undefined = result.success;
  return { success, event: result.event };
}
// @ts-expect-error Queries are Promises before awaiting.
engine.getEvents().events;
// @ts-expect-error Mutations also require awaiting before reading result flags.
competitionEngineAsync.addEvent({ event: { eventName: 'Example' } }).success;
// @ts-expect-error Unknown method names cannot escape through an index signature.
engine.notAFactoryMethod();
// @ts-expect-error An unresolved signature must not return bare any.
fallback.success;
void [factory, engine, query, mutation, fallback, state, version, mutationResult];
