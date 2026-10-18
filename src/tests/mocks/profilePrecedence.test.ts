import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { INDIVIDUAL } from '@Constants/participantConstants';
import { RANKING } from '@Constants/scaleConstants';

/**
 * Where an option can be set at more than one level, the most specific setting wins and the next
 * level is the fallback: a draw or event profile, then its participantsProfile, then the top-level
 * option (M16 of the mocksEngine hardening plan). Before, `uuids` from participantsProfile was lost
 * on the draw path and won on the event path, and participantsProfile `rankingRange` was always
 * replaced by the draw's or event's own, undefined or not.
 */

const UUIDS = ['u-1', 'u-2', 'u-3', 'u-4', 'u-5', 'u-6', 'u-7', 'u-8'];
const UUID_SET = new Set(UUIDS);
const CATEGORY = { categoryName: 'U18' };

const individualIds = () =>
  tournamentEngine
    .getParticipants({ participantFilters: { participantTypes: [INDIVIDUAL] } })
    .participants.map(({ participantId }) => participantId);

const rankings = () =>
  tournamentEngine
    .getParticipants({ participantFilters: { participantTypes: [INDIVIDUAL] } })
    .participants.flatMap(({ timeItems }) => timeItems ?? [])
    .filter(({ itemType }) => itemType?.startsWith(`SCALE.${RANKING}`))
    .map(({ itemValue }) => itemValue);

describe('uuids', () => {
  it('drawProfiles: participantsProfile.uuids are used when the drawProfile has none', () => {
    tournamentEngine.reset();
    mocksEngine.generateTournamentRecord({
      participantsProfile: { uuids: [...UUIDS] },
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });
    expect(individualIds().filter((id) => UUID_SET.has(id)).length).toEqual(4);
  });

  it('drawProfiles: participantsProfile.uuids reach a draw that generates its own participants', () => {
    tournamentEngine.reset();
    mocksEngine.generateTournamentRecord({
      participantsProfile: { uuids: [...UUIDS] },
      drawProfiles: [{ drawSize: 4, uniqueParticipants: true }],
      setState: true,
    });
    expect(individualIds().filter((id) => UUID_SET.has(id)).length).toEqual(4);
  });

  it('drawProfiles: the drawProfile own uuids win over participantsProfile', () => {
    tournamentEngine.reset();
    mocksEngine.generateTournamentRecord({
      participantsProfile: { uuids: ['x-1', 'x-2', 'x-3', 'x-4'] },
      drawProfiles: [{ drawSize: 4, uniqueParticipants: true, uuids: [...UUIDS] }],
      setState: true,
    });
    const ids = individualIds();
    expect(ids.filter((id) => UUID_SET.has(id)).length).toEqual(4);
    expect(ids.some((id) => id.startsWith('x-'))).toEqual(false);
  });

  it('eventProfiles: the eventProfile own uuids win over participantsProfile', () => {
    tournamentEngine.reset();
    mocksEngine.generateTournamentRecord({
      participantsProfile: { uuids: ['x-1', 'x-2', 'x-3', 'x-4'] },
      eventProfiles: [{ eventName: 'E', category: CATEGORY, uuids: [...UUIDS], drawProfiles: [{ drawSize: 4 }] }],
      setState: true,
    });
    const ids = individualIds();
    expect(ids.filter((id) => UUID_SET.has(id)).length).toEqual(4);
    expect(ids.some((id) => id.startsWith('x-'))).toEqual(false);
  });
});

describe('rankingRange', () => {
  const inRange = ([low, high]: number[]) => {
    const values = rankings();
    expect(values.length).toBeGreaterThan(0);
    expect(values.every((value) => value >= low && value <= high)).toEqual(true);
  };

  it('drawProfiles: participantsProfile.rankingRange applies when the drawProfile has none', () => {
    tournamentEngine.reset();
    mocksEngine.generateTournamentRecord({
      participantsProfile: { rankingRange: [100, 120], scaledParticipantsCount: 8 },
      drawProfiles: [{ drawSize: 8, category: CATEGORY }],
      setState: true,
    });
    inRange([100, 120]);
  });

  it('eventProfiles: participantsProfile.rankingRange applies when the eventProfile has none', () => {
    tournamentEngine.reset();
    mocksEngine.generateTournamentRecord({
      participantsProfile: { rankingRange: [100, 120], scaledParticipantsCount: 8 },
      eventProfiles: [{ eventName: 'E', category: CATEGORY, drawProfiles: [{ drawSize: 8 }] }],
      setState: true,
    });
    inRange([100, 120]);
  });

  it('control: a drawProfile rankingRange wins over participantsProfile', () => {
    tournamentEngine.reset();
    mocksEngine.generateTournamentRecord({
      participantsProfile: { rankingRange: [100, 120], scaledParticipantsCount: 8 },
      drawProfiles: [{ drawSize: 8, category: CATEGORY, rankingRange: [1, 10] }],
      setState: true,
    });
    inRange([1, 10]);
  });
});

describe('modifyTournamentRecord: an existing event', () => {
  const existing = () => {
    tournamentEngine.reset();
    mocksEngine.generateTournamentRecord({ eventProfiles: [{ eventName: 'E', eventId: 'e1' }], setState: true });
  };
  const drawsOf = (eventId: string) => tournamentEngine.getEvent({ eventId }).event.drawDefinitions ?? [];

  it('receives its own drawProfiles, not the call top-level drawProfiles', () => {
    existing();
    const result: any = tournamentEngine.modifyTournamentRecord({
      eventProfiles: [{ eventId: 'e1', drawProfiles: [{ drawSize: 4, drawId: 'own' }] }],
      drawProfiles: [{ drawSize: 8, drawId: 'top' }],
    });
    expect(result.success).toEqual(true);
    expect(drawsOf('e1').map(({ drawId }) => drawId)).toEqual(['own']);
  });

  it('falls back to a top-level option it does not set, and its own setting wins', () => {
    existing();
    const first: any = tournamentEngine.modifyTournamentRecord({
      eventProfiles: [{ eventId: 'e1', drawProfiles: [{ drawSize: 4, drawId: 'd1' }] }],
      completeAllMatchUps: true,
    });
    expect(first.success).toEqual(true);
    const completed = (drawId: string) =>
      tournamentEngine.allDrawMatchUps({ drawId }).matchUps.filter(({ winningSide }) => winningSide).length;
    expect(completed('d1')).toEqual(3);

    const second: any = tournamentEngine.modifyTournamentRecord({
      eventProfiles: [{ eventId: 'e1', completeAllMatchUps: false, drawProfiles: [{ drawSize: 4, drawId: 'd2' }] }],
      completeAllMatchUps: true,
    });
    expect(second.success).toEqual(true);
    expect(second.drawIds).toEqual(['d2']);
    expect(drawsOf('e1').map(({ drawId }) => drawId)).toEqual(['d1', 'd2']);
    expect(completed('d2')).toEqual(0);
  });
});

/**
 * A draw added to an event that already has one is generated (M20). The event's flights pair with the
 * call's drawProfiles; the flight already drawn came first, so the new profile was matched to it, its
 * seeding re-applied there, and the loop stopped before the new flight: success, and no new draw.
 */
it('modifyTournamentRecord adds a second draw to an event that has one', () => {
  tournamentEngine.reset();
  mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventId: 'e1', drawProfiles: [{ drawSize: 4, drawId: 'd1' }] }],
    setState: true,
  });
  const result: any = tournamentEngine.modifyTournamentRecord({
    eventProfiles: [{ eventId: 'e1', drawProfiles: [{ drawSize: 8, drawId: 'd2', drawName: 'Second' }] }],
  });
  expect(result.success).toEqual(true);
  expect(result.drawIds).toEqual(['d2']);
  const { drawDefinitions } = tournamentEngine.getEvent({ eventId: 'e1' }).event;
  expect(drawDefinitions.map(({ drawId }) => drawId)).toEqual(['d1', 'd2']);
  expect(tournamentEngine.allDrawMatchUps({ drawId: 'd2' }).matchUps.length).toEqual(7);
});
