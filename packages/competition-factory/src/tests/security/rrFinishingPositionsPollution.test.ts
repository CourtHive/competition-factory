import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { defined } from '@Tests/helpers/defined';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, describe, expect, it } from 'vitest';

// Round robin finishing positions in getParticipantEntries were kept in plain objects keyed by drawId, then by
// participantId. A drawId of "__proto__" read Object.prototype as the draw's map, so every participant's range was
// written onto Object.prototype; "constructor", "toString" and "hasOwnProperty" wrote onto those built-ins.
const RESERVED = ['__proto__', 'constructor', 'toString', 'hasOwnProperty'];

// everything a reserved id can reach through an inherited read
const targets = (): any[] => [Object.prototype, Object, Object.prototype.toString, Object.prototype.hasOwnProperty];
const baselines = targets().map((target) => new Set(Object.getOwnPropertyNames(target)));
const pollution = () =>
  targets().flatMap((target, i) => Object.getOwnPropertyNames(target).filter((key) => !baselines[i].has(key)));

afterEach(() => {
  targets().forEach((target, i) =>
    Object.getOwnPropertyNames(target)
      .filter((key) => !baselines[i].has(key))
      .forEach((key) => delete target[key]),
  );
});

const roundRobin = () =>
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, drawType: ROUND_ROBIN }],
    completeAllMatchUps: true,
    setState: false,
  } as any).tournamentRecord;

/** A record as a server receives it: one id renamed throughout, then parsed from JSON. */
const renamed = (record: any, id: string, to: string) =>
  JSON.parse(JSON.stringify(record).split(`"${id}"`).join(`"${to}"`));

const ids = {
  drawId: (record: any) => record.events[0].drawDefinitions[0].drawId,
  eventId: (record: any) => record.events[0].eventId,
  participantId: (record: any) => record.participants[0].participantId,
  // the first round robin group
  structureId: (record: any) => record.events[0].drawDefinitions[0].structures[0].structures[0].structureId,
};

describe('round robin finishing positions cannot write onto a prototype or a built-in', () => {
  for (const [kind, idOf] of Object.entries(ids))
    for (const reserved of RESERVED)
      it(`a ${kind} of "${reserved}"`, () => {
        const record = roundRobin();
        const id = idOf(record);
        tournamentEngine.setState(renamed(record, id, reserved));
        const result: any = tournamentEngine.getParticipants({
          withRankingProfile: true,
          withStatistics: true,
          withMatchUps: true,
        });
        expect(pollution()).toEqual([]);
        for (const { participantId } of defined(record.participants, 'participants'))
          expect(({} as any)[participantId]).toBeUndefined();
        expect(result.participants.length).toBeGreaterThan(0);

        // the round robin still ranks every participant in the draw, the renamed one included
        const drawId = kind === 'drawId' ? reserved : ids.drawId(record);
        const ranges = result.participants.flatMap((participant: any) =>
          (participant.draws ?? [])
            .filter((draw: any) => draw.drawId === drawId)
            .map((draw: any) => draw.finishingPositionRange),
        );
        expect(ranges.length).toEqual(8);
        for (const range of ranges) expect(Array.isArray(range)).toBe(true);
      });
});

// Win/loss counters in processSides were read as counters[matchUpType] and incremented. A matchUpType of "__proto__"
// (it falls back to the event's eventType) counted wins and losses onto Object.prototype; "constructor" onto Object.
describe('win/loss counters cannot write onto a prototype or a built-in', () => {
  for (const reserved of RESERVED)
    it(`a matchUpType of "${reserved}"`, () => {
      const record = renamed(roundRobin(), 'SINGLES', reserved);
      tournamentEngine.setState(record);
      const result: any = tournamentEngine.getParticipants({ withStatistics: true, withMatchUps: true });
      expect(pollution()).toEqual([]);
      for (const key of ['wins', 'losses']) expect(({} as any)[key]).toBeUndefined();

      // every result is still counted in the totals
      const totals = Object.values(result.participantMap).map((entry: any) => entry.counters);
      expect(totals.reduce((sum: number, counters: any) => sum + counters.wins + counters.losses, 0)).toEqual(24);
    });
});
