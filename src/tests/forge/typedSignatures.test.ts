/**
 * Type-level tests for #1 (typed method signatures v1).
 *
 * These assertions exist to verify the typed engine surface at COMPILE time.
 * The file is also picked up by vitest and runs at runtime — the runtime body
 * just exercises the same calls so the test count is non-zero and the
 * tournamentEngine is initialised, but the real value is `pnpm check-types`
 * failing if signatures regress.
 */

import { describe, expect, it } from 'vitest';

import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

import type { Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import type { FactoryEngineTyped } from '@Types/factoryTypes';

const engine = tournamentEngine as unknown as FactoryEngineTyped;

function seed() {
  const result = mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles: [{ participantsCount: 8, drawSize: 8 }],
  });
  return { eventId: result.eventIds[0], drawId: result.drawIds[0] };
}

describe('FactoryEngineTyped — typed method signatures', () => {
  it('getEvents returns a typed result envelope with Event[] on .events', () => {
    seed();
    const result = engine.getEvents({ tournamentRecord: engine.getTournament()?.tournamentRecord as Tournament });
    // type-level: result.events is Event[] | undefined; the assignment fails if not
    const events: Event[] | undefined = result.events;
    expect(Array.isArray(events)).toEqual(true);
  });

  it('getEvent returns a typed result with Event on .event', () => {
    const { eventId } = seed();
    const tournament = engine.getTournament()?.tournamentRecord as Tournament;
    const eventFromList = tournament.events?.find((e) => e.eventId === eventId);
    if (!eventFromList) throw new Error('seed produced no event');
    const result = engine.getEvent({
      tournamentRecord: tournament,
      event: eventFromList,
      context: {},
      drawDefinition: eventFromList.drawDefinitions?.[0] as any,
    });
    // type-level: result.event is Event (when no error)
    expect((result as any).event ?? (result as any).error).toBeDefined();
  });

  it('engine.q returns typed values without casts', () => {
    seed();
    // type-level: each assignment fails if QueryFacade.return type doesn't line up
    const events: Event[] = engine.q.events();
    const event: Event | undefined = engine.q.event();
    const tournament: Tournament | undefined = engine.q.tournament();
    const matchUps: MatchUp[] = engine.q.matchUps();
    expect(Array.isArray(events)).toEqual(true);
    expect(event === undefined || typeof event === 'object').toEqual(true);
    expect(tournament === undefined || typeof tournament === 'object').toEqual(true);
    expect(Array.isArray(matchUps)).toEqual(true);
  });

  it('rejects access to methods that are not on the registered method list', () => {
    // @ts-expect-error — `notARealMethod` is not in FactoryEngineMethod
    const accessor = engine.notARealMethod;
    // We don't invoke (would crash at runtime); the @ts-expect-error is the point.
    expect(typeof accessor).toEqual('undefined');
  });

  it('unknown engine methods (not in MethodSignatures) fall back to the open shape', () => {
    // type-level: methods that aren't in MethodSignatures yet still accept any args
    // (they fall through to the Record<..., (...args:any[]) => any> half).
    // Pick one that exists at runtime but isn't yet in MethodSignatures.
    const result = engine.getEventTimeItem({ tournamentRecord: undefined as any, eventId: 'x' });
    expect(typeof result).toEqual('object');
  });
});
