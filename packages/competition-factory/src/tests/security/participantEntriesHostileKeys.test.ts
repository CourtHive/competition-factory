import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, describe, expect, it } from 'vitest';

// Keys that read as present on a plain object: "__proto__" reads Object.prototype, the others read built-in functions.
// getParticipants looked event types and scale formats up in plain objects, so such a key from a record read a
// function or Object.prototype where an array was expected, and threw.
const RESERVED = ['__proto__', 'constructor', 'toString', 'hasOwnProperty'];

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

const seededDraw = () =>
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, seedsCount: 2 }],
    setState: false,
  } as any).tournamentRecord;

/** A record whose event type is replaced. */
const withEventType = (eventType: string) => {
  const record = structuredClone(seededDraw());
  record.events[0].eventType = eventType;
  return record;
};

const own = (map: any, key: string) => Object.getOwnPropertyDescriptor(map, key)?.value;

describe('an event type that reads as present on a plain object', () => {
  for (const reserved of RESERVED) {
    it(`"${reserved}" is not mistaken for a participant's rankings`, () => {
      tournamentEngine.setState(withEventType(reserved));
      const result: any = tournamentEngine.getParticipants({ withEvents: true, withDraws: true });
      expect(pollution()).toEqual([]);
      expect(result.error).toBeUndefined();
      const entered = result.participants.filter((participant: any) => participant.events?.length);
      expect(entered.length).toEqual(8);
    });

    it(`"${reserved}" holds each seeded participant's seedings as an own key`, () => {
      tournamentEngine.setState(withEventType(reserved));
      for (const withScaleValues of [false, true]) {
        const result: any = tournamentEngine.getParticipants({
          withSeeding: true,
          withDraws: true,
          withEvents: true,
          withScaleValues,
        });
        expect(pollution()).toEqual([]);
        expect(result.error).toBeUndefined();

        const seeded = result.participants.filter((participant: any) => own(participant.seedings, reserved));
        expect(seeded.length).toEqual(2);
        for (const { seedings } of seeded) {
          expect(Object.getPrototypeOf(seedings)).toBe(Object.prototype);
          // with scale values, the record's own SINGLES seeding scale items come first
          expect(Object.keys(seedings)).toEqual(withScaleValues ? ['SINGLES', reserved] : [reserved]);
        }
        const seedValues = seeded.flatMap(({ seedings }: any) => own(seedings, reserved).map((s: any) => s.seedValue));
        expect(seedValues.sort()).toEqual([1, 2]);
      }
    });
  }
});

describe('a scale format that reads as present on a plain object', () => {
  for (const reserved of RESERVED)
    it(`"${reserved}" is grouped as an own key`, () => {
      const participant = {
        participantId: 'p1',
        timeItems: [
          { itemType: `SCALE.RANKING.${reserved}.WTN`, itemValue: 12, createdAt: '2026-01-01T00:00:00Z' },
          { itemType: 'SCALE.RANKING.SINGLES.WTN', itemValue: 3, createdAt: '2026-01-01T00:00:00Z' },
          { itemType: `SCALE.RATING.${reserved}.WTN`, itemValue: 20, createdAt: '2026-01-01T00:00:00Z' },
          { itemType: `SCALE.SEEDING.${reserved}.draw`, itemValue: 1, createdAt: '2026-01-01T00:00:00Z' },
        ],
      };
      const result: any = tournamentEngine.getScaleValues({ participant });
      expect(pollution()).toEqual([]);
      expect(result.success).toBe(true);
      for (const map of [result.rankings, result.ratings, result.seedings])
        expect(Object.getPrototypeOf(map)).toBe(Object.prototype);
      expect(Object.keys(result.rankings)).toEqual([reserved, 'SINGLES']);
      expect(own(result.rankings, reserved)).toEqual([{ scaleValue: 12, scaleDate: undefined, scaleName: 'WTN' }]);
      expect(own(result.ratings, reserved)?.[0].scaleValue).toEqual(20);
      expect(own(result.seedings, reserved)?.[0].scaleValue).toEqual(1);
    });

  for (const reserved of RESERVED)
    it(`"${reserved}" on a participant in a record`, () => {
      const record = structuredClone(seededDraw());
      record.participants[0].timeItems = [{ itemType: `SCALE.RANKING.${reserved}.WTN`, itemValue: 12 }];
      tournamentEngine.setState(record);
      const result: any = tournamentEngine.getParticipants({ withScaleValues: true, withEvents: true });
      expect(pollution()).toEqual([]);
      const { participantId } = record.participants[0];
      const participant = result.participants.find((p: any) => p.participantId === participantId);
      expect(own(participant.rankings, reserved)?.[0].scaleValue).toEqual(12);
    });
});

// Schedule items take their date through extractDate, which turns anything that is not a calendar date into '', so a
// reserved date never reaches the per-date map. These guard that map should a raw date ever reach it.
describe('a scheduled date that reads as present on a plain object', () => {
  for (const reserved of RESERVED)
    it(`"${reserved}"`, () => {
      const record = structuredClone(seededDraw());
      const matchUps = record.events[0].drawDefinitions[0].structures[0].matchUps.slice(0, 2);
      matchUps.forEach((matchUp: any) => {
        matchUp.timeItems = [
          { itemType: 'SCHEDULE.DATE', itemValue: reserved },
          { itemType: 'SCHEDULE.TIME.SCHEDULED', itemValue: '09:00' },
        ];
      });
      tournamentEngine.setState(record);
      const result: any = tournamentEngine.getParticipants({
        scheduleAnalysis: { scheduledMinutesDifference: 60 },
        withScheduleItems: true,
        withMatchUps: true,
      });
      expect(pollution()).toEqual([]);
      expect(result.error).toBeUndefined();
      expect(result.participants.length).toEqual(8);
    });
});
