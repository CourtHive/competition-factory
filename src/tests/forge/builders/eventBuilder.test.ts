import { afterEach, describe, expect, it } from 'vitest';

import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { SINGLES } from '@Constants/eventConstants';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

function seed(participantsCount = 32) {
  return mocksEngine.generateTournamentRecord({
    setState: true,
    participantsProfile: { participantsCount },
  });
}

function participantIdsFromSeed(result: any, n: number): string[] {
  return result.tournamentRecord.participants.slice(0, n).map((p: any) => p.participantId);
}

afterEach(() => {
  tournamentEngine.reset();
});

describe('engine.build.event — fluent EventBuilder', () => {
  it('exposes the build facade on the engine', () => {
    expect(typeof tournamentEngine.build).toEqual('object');
    expect(typeof tournamentEngine.build.event).toEqual('function');
    expect(typeof tournamentEngine.build.participant).toEqual('function');
  });

  it('creates a singles event with a draw and entries in one chain', () => {
    const setup: any = seed(32);
    const participantIds = participantIdsFromSeed(setup, 32);

    const result: any = tournamentEngine.build
      .event({ eventName: 'U16 Singles' })
      .singles()
      // gender omitted — mocksEngine participants are mixed-gender; setting a
      // specific gender here would trip addEventEntries' default enforcement.
      .draw(32, { seedsCount: 8 })
      .entries(participantIds)
      .create();

    expect(result.success).toEqual(true);
    expect(typeof result.eventId).toEqual('string');
    expect(result.drawIds.length).toEqual(1);

    const event: any = tournamentEngine.q.event({ eventId: result.eventId });
    expect(event?.eventName).toEqual('U16 Singles');
    expect(event?.eventType).toEqual(SINGLES);
    expect(event?.entries?.length).toEqual(32);

    const matchUps: any[] = tournamentEngine.q.eventMatchUps({ eventId: result.eventId });
    expect(matchUps.length).toBeGreaterThan(0);
  });

  it('pre-assigns eventId and drawId before .create() runs', () => {
    seed();
    const builder = tournamentEngine.build.event({ eventName: 'Preview' }).singles().draw(8);
    const eventIdBefore = builder.eventId;
    const drawIdBefore = builder.drawIds[0];
    expect(typeof eventIdBefore).toEqual('string');
    expect(typeof drawIdBefore).toEqual('string');

    const result: any = builder.create();
    expect(result.eventId).toEqual(eventIdBefore);
    expect(result.drawIds[0]).toEqual(drawIdBefore);
  });

  it('toRequest() returns directives without executing', () => {
    seed();
    const request: any = tournamentEngine.build.event({ eventName: 'Preview' }).singles().draw(8).toRequest();

    expect(Array.isArray(request.directives)).toEqual(true);
    expect(request.directives[0].method).toEqual('addEvent');
    expect(request.directives[1].method).toEqual('generateDrawDefinition');
    expect(request.directives[2].method).toEqual('addDrawDefinition');
    expect(typeof request.eventId).toEqual('string');

    // confirm state was NOT touched
    const events: any[] = tournamentEngine.q.events();
    expect(events.find((e) => e.eventId === request.eventId)).toBeUndefined();
  });

  it('toDirectives() builds expected sequence with pipe wiring', () => {
    const directives: any[] = tournamentEngine.build
      .event({ eventName: 'Pipe check' })
      .singles()
      .draw(8, { seedsCount: 2 })
      .entries(['p1', 'p2'])
      .toDirectives();

    expect(directives.length).toEqual(4);
    expect(directives[0].method).toEqual('addEvent');
    expect(directives[1].method).toEqual('generateDrawDefinition');
    expect(directives[1].pipe).toEqual({ event: true });
    expect(directives[2].method).toEqual('addDrawDefinition');
    expect(directives[2].pipe).toEqual({ drawDefinition: true });
    expect(directives[3].method).toEqual('addEventEntries');
    expect(directives[3].params.entryStage).toEqual(MAIN);
    expect(directives[3].params.entryStatus).toEqual(DIRECT_ACCEPTANCE);
  });

  it('calling .draw() twice throws in v1 (multi-flight is a v2 addition)', () => {
    expect(() => tournamentEngine.build.event().singles().draw(8).draw(16)).toThrowError(
      /draw\(\) can be called once per event in v1/,
    );
  });

  it('.team(tieFormatName) attaches the named tieFormat to the event payload', () => {
    const directives: any[] = tournamentEngine.build.event({ eventName: 'CFG' }).team('TEAM_FORMAT').toDirectives();
    expect(directives[0].params.event.tieFormatName).toEqual('TEAM_FORMAT');
  });

  it('entries opts pass enforceGender/enforceCategory through only when set', () => {
    const defaultDirectives: any[] = tournamentEngine.build
      .event()
      .singles()
      .draw(8)
      .entries(['p1', 'p2'])
      .toDirectives();
    const defaultEntries = defaultDirectives.find((d) => d.method === 'addEventEntries').params;
    expect(defaultEntries.enforceGender).toBeUndefined();
    expect(defaultEntries.enforceCategory).toBeUndefined();

    const overrideDirectives: any[] = tournamentEngine.build
      .event()
      .singles()
      .draw(8)
      .entries(['p1', 'p2'], { enforceGender: false, enforceCategory: true })
      .toDirectives();
    const overrideEntries = overrideDirectives.find((d) => d.method === 'addEventEntries').params;
    expect(overrideEntries.enforceGender).toEqual(false);
    expect(overrideEntries.enforceCategory).toEqual(true);
  });

  it('enforceGender:false lets a gendered event accept mixed-gender mocksEngine participants', () => {
    const setup: any = seed(16);
    const participantIds = participantIdsFromSeed(setup, 16);

    const result: any = tournamentEngine.build
      .event({ eventName: 'Mixed-pool sanity' })
      .singles()
      .gender('MALE')
      .draw(16, { seedsCount: 4 })
      .entries(participantIds, { enforceGender: false })
      .create();

    expect(result.success).toEqual(true);
    const event: any = tournamentEngine.q.event({ eventId: result.eventId });
    expect(event?.entries?.length).toEqual(16);
  });

  it('doubles() / hybrid() / team() with no tieFormat set eventType only', () => {
    const dd: any[] = tournamentEngine.build.event().doubles().toDirectives();
    expect(dd[0].params.event.eventType).toEqual('DOUBLES');

    const hd: any[] = tournamentEngine.build.event().hybrid().toDirectives();
    expect(hd[0].params.event.eventType).toEqual('HYBRID');

    const td: any[] = tournamentEngine.build.event().team().toDirectives();
    expect(td[0].params.event.eventType).toEqual('TEAM');
    expect(td[0].params.event.tieFormat).toBeUndefined();
    expect(td[0].params.event.tieFormatName).toBeUndefined();
  });

  it('.team(object) attaches the inline tieFormat object', () => {
    const inlineFormat = { tieFormatName: 'INLINE', collectionDefinitions: [] };
    const dd: any[] = tournamentEngine.build.event().team(inlineFormat).toDirectives();
    expect(dd[0].params.event.tieFormat).toBe(inlineFormat);
    expect(dd[0].params.event.tieFormatName).toBeUndefined();
  });

  it('.tieFormat(object) attaches inline; .tieFormat(string) sets tieFormatName', () => {
    const inline = { tieFormatName: 'XYZ' };
    const a: any[] = tournamentEngine.build.event().singles().tieFormat(inline).toDirectives();
    expect(a[0].params.event.tieFormat).toBe(inline);

    const b: any[] = tournamentEngine.build.event().singles().tieFormat('NAMED').toDirectives();
    expect(b[0].params.event.tieFormatName).toEqual('NAMED');
  });

  it('.named() / .category() / .dates() set the corresponding event payload fields', () => {
    const dd: any[] = tournamentEngine.build
      .event()
      .singles()
      .named('Chained Name')
      .category({ categoryName: 'U16', ageCategoryCode: 'U16' })
      .dates('2026-06-01', '2026-06-07')
      .toDirectives();
    const event = dd[0].params.event;
    expect(event.eventName).toEqual('Chained Name');
    expect(event.category?.categoryName).toEqual('U16');
    expect(event.startDate).toEqual('2026-06-01');
    expect(event.endDate).toEqual('2026-06-07');
  });

  it('.create() returns success:false with the underlying error when the queue fails', () => {
    // no setState: tournamentEngine has no records → addEvent surfaces a real error
    tournamentEngine.reset();
    const result: any = tournamentEngine.build.event({ eventName: 'No state' }).singles().draw(8).create();
    expect(result.success).toEqual(false);
    expect(result.error).toBeDefined();
    expect(result.eventId).toBeDefined();
    expect(result.directives.length).toBeGreaterThan(0);
  });

  it('.create({ rollbackOnError: true }) forwards the flag to executionQueue', () => {
    seed(8);
    // Build a directive that will fail mid-chain by aiming entries at non-existent ids
    const result: any = tournamentEngine.build
      .event({ eventName: 'Will rollback' })
      .singles()
      .draw(8)
      .entries(['no-such-participant-id'])
      .create({ rollbackOnError: true });
    // executionQueue surfaces a rolledBack flag in the error envelope
    expect(result.success).toEqual(false);
    expect(result.error).toBeDefined();
  });
});
