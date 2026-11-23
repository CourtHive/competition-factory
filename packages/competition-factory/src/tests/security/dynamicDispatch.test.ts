import { METHOD_NOT_FOUND, UNRECOGNIZED_DRAW_TYPE } from '@Constants/errorConditionConstants';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import askEngine from '@Assemblies/engines/ask';
import asyncEngine from '@Assemblies/engines/async';
import { describe, expect, it } from 'vitest';

// CodeQL js/unvalidated-dynamic-method-call (#234, #235, #81), triaged 2026-11-23. Method names arrive from callers:
// executionQueue directives in CFS, invoke({ method }), a drawType. A plain lookup also finds what every object
// inherits: `constructor` dispatched to Object() and returned the augmented params, tournament records included.
const INHERITED = [
  'constructor',
  'toString',
  'valueOf',
  'hasOwnProperty',
  '__defineGetter__',
  '__proto__',
  'isPrototypeOf',
];

describe('a method name resolves only to a registered method', () => {
  it('executionQueue refuses inherited names as not found, without throwing or returning records', () => {
    mocksEngine.generateTournamentRecord({ setState: true });
    for (const method of INHERITED) {
      let result: any = tournamentEngine.executionQueue([{ method, params: {} }]);
      expect(result.error, method).toEqual(METHOD_NOT_FOUND);
      expect(JSON.stringify(result), method).not.toContain('tournamentRecords');
    }
    // control: a registered method still runs
    expect((tournamentEngine.executionQueue([{ method: 'getTournamentInfo', params: {} }]) as any).success).toBe(true);
  });

  it('execute({ method }) refuses inherited names on every engine that dispatches by name', async () => {
    mocksEngine.generateTournamentRecord({ setState: true });
    for (const method of INHERITED) {
      for (const engine of [tournamentEngine, askEngine, asyncEngine(true)] as any[]) {
        let result: any = await engine.execute({ method, params: {} });
        expect(result?.error, method).toEqual(METHOD_NOT_FOUND);
      }
    }
    expect((tournamentEngine.execute({ method: 'getTournamentInfo', params: {} }) as any).tournamentInfo).toBeDefined();
  });

  it('#81 an inherited drawType is an unrecognized draw type, not a TypeError', () => {
    mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 8 }, setState: true });
    const { tournamentRecord } = tournamentEngine.getTournament();
    tournamentEngine.addEvent({ event: { eventId: 'dispatch', eventName: 'Dispatch' } });
    tournamentEngine.addEventEntries({
      eventId: 'dispatch',
      participantIds: tournamentRecord.participants.map((p: any) => p.participantId),
    });
    for (const drawType of INHERITED) {
      let result: any = tournamentEngine.generateDrawDefinition({ eventId: 'dispatch', drawSize: 8, drawType } as any);
      expect(result.error, drawType).toEqual(UNRECOGNIZED_DRAW_TYPE);
    }
    let control: any = tournamentEngine.generateDrawDefinition({
      eventId: 'dispatch',
      drawSize: 8,
      drawType: SINGLE_ELIMINATION,
    });
    expect(control.drawDefinition).toBeDefined();
  });
});
