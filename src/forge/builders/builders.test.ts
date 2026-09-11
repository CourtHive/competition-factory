/**
 * Unit tests for the fluent builders facade (developer-JOY #6).
 *
 * Covers EventBuilder, ParticipantBuilder, and the `engine.build` mount.
 * Exercises every chainable verb + all three terminals (`toDirectives`,
 * `toRequest`, `create`) on the happy path AND the error path.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { EventBuilder, ParticipantBuilder } from './index';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

import { DOUBLES, HYBRID, SINGLES, TEAM as TEAM_EVENT } from '@Constants/eventConstants';
import { INDIVIDUAL, PAIR, TEAM } from '@Constants/participantConstants';
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { COMPETITOR, COACH } from '@Constants/participantRoles';

describe('EventBuilder', () => {
  beforeEach(() => {
    mocksEngine.generateTournamentRecord({ setState: true });
  });

  it('event-type sugars: singles / doubles / team / hybrid set eventType', () => {
    expect(tournamentEngine.build.event().singles().toDirectives()[0].params.event.eventType).toBe(SINGLES);
    expect(tournamentEngine.build.event().doubles().toDirectives()[0].params.event.eventType).toBe(DOUBLES);
    expect(tournamentEngine.build.event().team().toDirectives()[0].params.event.eventType).toBe(TEAM_EVENT);
    expect(tournamentEngine.build.event().hybrid().toDirectives()[0].params.event.eventType).toBe(HYBRID);
  });

  it('team() accepts a string name (tieFormatName) and an object (tieFormat)', () => {
    const fromString: any = tournamentEngine.build.event().team('ITA_DUAL').toDirectives()[0].params.event;
    expect(fromString.eventType).toBe(TEAM_EVENT);
    expect(fromString.tieFormatName).toBe('ITA_DUAL');
    expect(fromString.tieFormat).toBeUndefined();

    const fmt = { collectionDefinitions: [{ collectionId: 'x' }] };
    const fromObject: any = tournamentEngine.build.event().team(fmt).toDirectives()[0].params.event;
    expect(fromObject.tieFormat).toEqual(fmt);
    expect(fromObject.tieFormatName).toBeUndefined();
  });

  it('chained metadata setters compose onto the event payload', () => {
    const directives = tournamentEngine.build
      .event()
      .singles()
      .named('Senior Open')
      .gender('FEMALE')
      .category({ categoryName: 'U18', ageCategoryCode: 'U18' })
      .dates('2026-06-01', '2026-06-07')
      .toDirectives();

    const event = directives[0].params.event;
    expect(event.eventName).toBe('Senior Open');
    expect(event.gender).toBe('FEMALE');
    expect(event.category).toEqual({ categoryName: 'U18', ageCategoryCode: 'U18' });
    expect(event.startDate).toBe('2026-06-01');
    expect(event.endDate).toBe('2026-06-07');
  });

  it('tieFormat() accepts both string and object', () => {
    const stringForm: any = tournamentEngine.build.event().team().tieFormat('USTA_DUAL').toDirectives()[0].params.event;
    expect(stringForm.tieFormatName).toBe('USTA_DUAL');

    const fmt = { collectionDefinitions: [] };
    const objectForm: any = tournamentEngine.build.event().team().tieFormat(fmt).toDirectives()[0].params.event;
    expect(objectForm.tieFormat).toEqual(fmt);
  });

  it('seed in the constructor pre-fills eventName / category / dates', () => {
    const seeded = tournamentEngine.build.event({
      eventName: 'Seeded',
      category: { categoryName: 'OPEN' },
      startDate: '2026-07-01',
      endDate: '2026-07-08',
    });
    const event = seeded.singles().toDirectives()[0].params.event;
    expect(event.eventName).toBe('Seeded');
    expect(event.category).toEqual({ categoryName: 'OPEN' });
    expect(event.startDate).toBe('2026-07-01');
    expect(event.endDate).toBe('2026-07-08');
  });

  it('eventId is pre-assigned and stable across chain calls; drawIds reflects draw spec', () => {
    const b = tournamentEngine.build.event().singles();
    expect(b.eventId).toMatch(/[a-z0-9-]/i);
    expect(b.drawIds).toEqual([]);

    const sameId = b.eventId;
    b.draw(8);
    expect(b.eventId).toBe(sameId);
    expect(b.drawIds).toHaveLength(1);
  });

  it('draw() appends generateDrawDefinition + addDrawDefinition with pipe semantics', () => {
    const directives = tournamentEngine.build.event().singles().draw(16, { drawName: 'Main' }).toDirectives();
    expect(directives.map((d: any) => d.method)).toEqual(['addEvent', 'generateDrawDefinition', 'addDrawDefinition']);
    expect(directives[1].params.drawSize).toBe(16);
    expect(directives[1].params.drawName).toBe('Main');
    expect(directives[1].pipe).toEqual({ event: true });
    expect(directives[2].pipe).toEqual({ drawDefinition: true });
  });

  it('draw() throws when called twice on the same builder', () => {
    const b = tournamentEngine.build.event().singles().draw(8);
    expect(() => b.draw(16)).toThrow(/once per event in v1/);
  });

  it('entries() with defaults uses MAIN + DIRECT_ACCEPTANCE and skips enforce flags', () => {
    const directives = tournamentEngine.build.event().singles().entries(['p1', 'p2']).toDirectives();
    const entriesDirective = directives.find((d: any) => d.method === 'addEventEntries')!;
    expect(entriesDirective.params.entryStage).toBe(MAIN);
    expect(entriesDirective.params.entryStatus).toBe(DIRECT_ACCEPTANCE);
    expect('enforceGender' in entriesDirective.params).toBe(false);
    expect('enforceCategory' in entriesDirective.params).toBe(false);
  });

  it('entries() with full opts overrides defaults and passes enforce flags through', () => {
    const directives = tournamentEngine.build
      .event()
      .singles()
      .entries(['p1', 'p2'], { entryStage: QUALIFYING, enforceGender: false, enforceCategory: true })
      .toDirectives();
    const entriesDirective = directives.find((d: any) => d.method === 'addEventEntries')!;
    expect(entriesDirective.params.entryStage).toBe(QUALIFYING);
    expect(entriesDirective.params.enforceGender).toBe(false);
    expect(entriesDirective.params.enforceCategory).toBe(true);
  });

  it('toRequest() bundles directives + eventId + drawIds', () => {
    const built = tournamentEngine.build.event().singles().draw(4);
    const req = built.toRequest();
    expect(req.directives).toEqual(built.toDirectives());
    expect(req.eventId).toBe(built.eventId);
    expect(req.drawIds).toEqual(built.drawIds);
  });

  it('create() runs the executionQueue and returns success + ids', () => {
    const built = tournamentEngine.build.event().singles().draw(4);
    const result = built.create();
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.eventId).toBe(built.eventId);
    expect(result.drawIds).toEqual(built.drawIds);

    const events: any = tournamentEngine.getEvents();
    expect(events.events.some((e: any) => e.eventId === built.eventId)).toBe(true);
  });

  it('create() surfaces an error result when an underlying directive fails', () => {
    // drawSize 0 is rejected by generateDrawDefinition; the builder pipes the
    // failure into a BuildResult instead of throwing.
    const built = tournamentEngine.build.event().singles().draw(0);
    const result = built.create();
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('ParticipantBuilder', () => {
  beforeEach(() => {
    mocksEngine.generateTournamentRecord({ setState: true });
  });

  it('individual() with a full person populates standard fields + INDIVIDUAL type', () => {
    const directives = tournamentEngine.build
      .participant()
      .individual({ givenName: 'Ada', familyName: 'Lovelace', sex: 'F', nationalityCode: 'GBR' })
      .toDirectives();
    const participant = directives[0].params.participant;
    expect(participant.participantType).toBe(INDIVIDUAL);
    expect(participant.participantRole).toBe(COMPETITOR);
    expect(participant.person.standardGivenName).toBe('Ada');
    expect(participant.person.standardFamilyName).toBe('Lovelace');
    expect(participant.person.sex).toBe('F');
    expect(participant.person.nationalityCode).toBe('GBR');
    expect(participant.person.personId).toBeDefined();
  });

  it('individual() honors a supplied personId', () => {
    const directives = tournamentEngine.build
      .participant()
      .individual({ givenName: 'Bo', familyName: 'Burnham', personId: 'P-12345' })
      .toDirectives();
    expect(directives[0].params.participant.person.personId).toBe('P-12345');
  });

  it('pair() builds a PAIR participant with individualParticipantIds + optional name', () => {
    const named = tournamentEngine.build.participant().pair(['i1', 'i2'], 'Doubles A').toDirectives();
    expect(named[0].params.participant.participantType).toBe(PAIR);
    expect(named[0].params.participant.individualParticipantIds).toEqual(['i1', 'i2']);
    expect(named[0].params.participant.participantName).toBe('Doubles A');

    const unnamed = tournamentEngine.build.participant().pair(['i1', 'i2']).toDirectives();
    expect(unnamed[0].params.participant.participantName).toBeUndefined();
  });

  it('team() supports name-only and name+ids variants', () => {
    const justName = tournamentEngine.build.participant().team('Vanguard').toDirectives();
    expect(justName[0].params.participant.participantType).toBe(TEAM);
    expect(justName[0].params.participant.participantName).toBe('Vanguard');
    expect(justName[0].params.participant.individualParticipantIds).toEqual([]);

    const withIds = tournamentEngine.build.participant().team('Vanguard', ['i1', 'i2', 'i3']).toDirectives();
    expect(withIds[0].params.participant.individualParticipantIds).toEqual(['i1', 'i2', 'i3']);
  });

  it('role() overrides the default COMPETITOR role', () => {
    const directives = tournamentEngine.build
      .participant()
      .individual({ givenName: 'X', familyName: 'Y' })
      .role(COACH)
      .toDirectives();
    expect(directives[0].params.participant.participantRole).toBe(COACH);
  });

  it('terminating without choosing a shape throws a descriptive error', () => {
    expect(() => tournamentEngine.build.participant().toDirectives()).toThrow(
      /\.individual\(\)\/\.pair\(\)\/\.team\(\)/,
    );
  });

  it('toRequest() bundles directives + participantId', () => {
    // personId fixed so structural comparison stays stable across two
    // buildParticipant() calls (UUID() runs per call otherwise).
    const b = tournamentEngine.build
      .participant()
      .individual({ givenName: 'C', familyName: 'D', personId: 'P-stable' });
    const req = b.toRequest();
    expect(req.directives).toEqual(b.toDirectives());
    expect(req.participantId).toBe(b.participantId);
  });

  it('create() runs the addParticipant directive and persists to state', () => {
    const b = tournamentEngine.build.participant().individual({ givenName: 'Grace', familyName: 'Hopper' });
    const result = b.create();
    expect(result.success).toBe(true);
    expect(result.participantId).toBe(b.participantId);

    const fetched: any = tournamentEngine.getParticipants();
    expect(fetched.participants.some((p: any) => p.participantId === b.participantId)).toBe(true);
  });

  it('create() surfaces an error result for a malformed participant (missing names)', () => {
    const b = tournamentEngine.build.participant().individual({} as any);
    const result = b.create();
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('engine.build (BuildFacade)', () => {
  beforeEach(() => {
    mocksEngine.generateTournamentRecord({ setState: true });
  });

  it('engine.build.event() returns an EventBuilder bound to the engine', () => {
    expect(tournamentEngine.build.event()).toBeInstanceOf(EventBuilder);
  });

  it('engine.build.participant() returns a ParticipantBuilder bound to the engine', () => {
    expect(tournamentEngine.build.participant()).toBeInstanceOf(ParticipantBuilder);
  });

  it('seed argument to engine.build.event() flows through to toDirectives()', () => {
    const directives = tournamentEngine.build.event({ eventName: 'From Seed' }).singles().toDirectives();
    expect(directives[0].params.event.eventName).toBe('From Seed');
  });
});
