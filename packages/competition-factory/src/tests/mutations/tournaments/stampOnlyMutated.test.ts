import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, test } from 'vitest';
import { setClock } from '@Tools/clock';

const LATER = '2030-01-01T00:00:00.000Z';
const STAMPED = new Date(LATER).getTime();

/**
 * A record takes the factory stamp only when a call modified it (CA 2026-10-30), and a write made with
 * suppressNotifications is stamped as an announced one is (building-a-tournament.md § 1.1, § 8).
 */
function twoRecords() {
  const first = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, participantsCount: 6 }],
  }).tournamentRecord;
  const second = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] }).tournamentRecord;
  tournamentEngine.reset();
  tournamentEngine.setState([first, second]);
  tournamentEngine.setTournamentId(first.tournamentId);
  return { firstId: first.tournamentId, secondId: second.tournamentId };
}

const stampOf = (tournamentId: string) =>
  tournamentEngine.getTournament({ tournamentId }).tournamentRecord.factory?.timeStamp;

function under<T>(write: () => T): T {
  setClock(LATER);
  try {
    return write();
  } finally {
    setClock();
  }
}

describe('the factory stamp goes only to the records a call modified', () => {
  test('a write to one loaded record leaves the other unstamped', () => {
    const { firstId, secondId } = twoRecords();
    const secondBefore = stampOf(secondId);
    const result: any = under(() => tournamentEngine.addEvent({ event: { eventName: 'E' } }));
    expect(result.success).toEqual(true);
    expect(stampOf(firstId)).toEqual(STAMPED);
    expect(stampOf(secondId)).toEqual(secondBefore);
  });

  test('a notice that names no tournament stamps every loaded record', () => {
    const { firstId, secondId } = twoRecords();
    const result: any = under(() => tournamentEngine.addVenue({ venue: { venueName: 'V' } }));
    expect(result.success).toEqual(true);
    expect(stampOf(firstId)).toEqual(STAMPED);
    expect(stampOf(secondId)).toEqual(STAMPED);
  });

  test('a call that only reports a data issue stamps nothing', () => {
    const { firstId } = twoRecords();
    const before = stampOf(firstId);
    const { drawId } = tournamentEngine.getEvent({ eventId: tournamentEngine.getEvents().events[0].eventId }).event
      .drawDefinitions[0];
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const entered = drawDefinition.entries[0].participantId;
    const result: any = under(() => tournamentEngine.addDrawEntries({ drawId, participantIds: [entered] }));
    expect(result.success).toEqual(true);
    expect(tournamentEngine.getEvent({ drawId }).drawDefinition.entries.length).toEqual(drawDefinition.entries.length);
    expect(stampOf(firstId)).toEqual(before);
  });
});

describe('a write made with suppressNotifications is stamped', () => {
  test('addDrawDefinition stamps the draw, its matchUps and the record, unannounced', () => {
    const {
      eventIds: [eventId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ participantsProfile: { participantsCount: 8 } }],
      setState: true,
    });
    const { drawDefinition } = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 8 });
    const result: any = under(() =>
      tournamentEngine.addDrawDefinition({ drawDefinition, eventId, suppressNotifications: true }),
    );
    expect(result.success).toEqual(true);
    const stored = tournamentEngine.getEvent({ drawId: drawDefinition.drawId }).drawDefinition;
    const matchUps = tournamentEngine.allDrawMatchUps({ drawId: drawDefinition.drawId, inContext: false }).matchUps;
    expect(stored.updatedAt).toBeDefined();
    expect(matchUps.every(({ updatedAt }) => updatedAt)).toEqual(true);
    expect(stampOf(tournamentRecord.tournamentId)).toEqual(STAMPED);
  });
});
