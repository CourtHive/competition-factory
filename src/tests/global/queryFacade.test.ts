import { describe, expect, it } from 'vitest';

import { buildQueryFacade, queryRegistry } from '@Forge/index';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

function seedTournament() {
  const result = mocksEngine.generateTournamentRecord({
    inContext: true,
    setState: true,
    drawProfiles: [{ participantsCount: 8, drawSize: 8 }],
  });
  return {
    drawId: result.drawIds[0],
    eventId: result.eventIds[0],
    tournamentRecord: result.tournamentRecord,
  };
}

describe('engine.q — unwrap query facade', () => {
  it('exposes a typed facade object on the engine', () => {
    expect(typeof tournamentEngine.q).toEqual('object');
    expect(typeof tournamentEngine.q.events).toEqual('function');
    expect(typeof tournamentEngine.q.event).toEqual('function');
    expect(typeof tournamentEngine.q.tournament).toEqual('function');
  });

  it('q.events() returns the array directly with [] fallback', () => {
    seedTournament();
    const events = tournamentEngine.q.events();
    expect(Array.isArray(events)).toEqual(true);
    expect(events.length).toEqual(1);
  });

  it('q.events() returns [] when no state is loaded', () => {
    tournamentEngine.reset();
    const events = tournamentEngine.q.events();
    expect(events).toEqual([]);
  });

  it('q.event({ eventId }) returns the event directly, undefined when missing', () => {
    const { eventId } = seedTournament();
    const event = tournamentEngine.q.event({ eventId });
    expect(event?.eventId).toEqual(eventId);
    expect(tournamentEngine.q.event({ eventId: 'no-such-event' })).toBeUndefined();
  });

  it('q.tournament() returns the loaded tournamentRecord, undefined when none', () => {
    tournamentEngine.reset();
    expect(tournamentEngine.q.tournament()).toBeUndefined();
    const { tournamentRecord } = seedTournament();
    const record = tournamentEngine.q.tournament();
    expect(record?.tournamentId).toEqual(tournamentRecord.tournamentId);
  });

  it('q.participants() returns the array directly with [] fallback', () => {
    seedTournament();
    const participants = tournamentEngine.q.participants();
    expect(Array.isArray(participants)).toEqual(true);
    expect(participants.length).toBeGreaterThan(0);
  });

  it('q.matchUps() returns the array directly with [] fallback', () => {
    seedTournament();
    const matchUps = tournamentEngine.q.matchUps();
    expect(Array.isArray(matchUps)).toEqual(true);
    expect(matchUps.length).toBeGreaterThan(0);
  });

  it('q.drawMatchUps({ drawId }) returns the array directly', () => {
    const { drawId } = seedTournament();
    const matchUps = tournamentEngine.q.drawMatchUps({ drawId });
    expect(Array.isArray(matchUps)).toEqual(true);
    expect(matchUps.length).toBeGreaterThan(0);
  });

  it('q.drawDefinition({ drawId }) returns the drawDefinition directly', () => {
    const { drawId } = seedTournament();
    const dd = tournamentEngine.q.drawDefinition({ drawId });
    expect(dd?.drawId).toEqual(drawId);
  });

  it('returns the fallback when a method is missing on the engine', () => {
    // simulate a method that doesn't exist by calling against a facade built
    // on a stub engine
    const stubFacade = buildQueryFacade({});
    expect(stubFacade.events()).toEqual([]);
    expect(stubFacade.event({ eventId: 'x' })).toBeUndefined();
    expect(stubFacade.participants()).toEqual([]);
  });

  it('returns the fallback when the underlying method returns an error envelope', () => {
    const stubEngine: any = {
      getEvents: () => ({ error: { code: 'BOOM' } }),
      getEvent: () => ({ error: { code: 'NOT_FOUND' } }),
    };
    const stubFacade = buildQueryFacade(stubEngine);
    expect(stubFacade.events()).toEqual([]);
    expect(stubFacade.event({ eventId: 'x' })).toBeUndefined();
  });

  it('every QueryFacade method has a queryRegistry entry (invariant)', () => {
    // The TypeScript QueryFacade interface and the runtime registry must
    // agree. Iterate the facade and assert every key resolves to a function.
    const facade: any = tournamentEngine.q;
    const facadeKeys = Object.keys(facade);
    for (const key of facadeKeys) {
      expect(typeof facade[key]).toEqual('function');
      expect(queryRegistry[key]).toBeDefined();
    }
    // Sanity floor — we ship at least 25 unwrap helpers in the prototype.
    expect(facadeKeys.length).toBeGreaterThanOrEqual(25);
  });
});
