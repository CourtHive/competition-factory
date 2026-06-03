/**
 * Regression: `mocksEngine.generateTournamentRecord` used to silently produce
 * an empty draw when called with both `participantsProfile.personData` AND a
 * `drawProfile` with `gender: 'ANY'`.
 *
 * Root cause (fixed in this branch):
 *   - `getParticipantsCount` / `generateFlights` / `generateEventWithDraw`
 *     treated any truthy `gender` (including the `'ANY'` sentinel) as a
 *     gender constraint and synthesized an extra per-event participant pool,
 *     doubling the participant count.
 *   - The downstream `isEventGender` filter then did `participant.person?.sex
 *     === drawProfile.gender`, which is always false when `drawProfile.gender`
 *     is `'ANY'` — so zero participants survived the filter and the draw
 *     was left empty.
 *
 * The fix: treat `gender: ANY` as "no gender constraint" everywhere
 * upstream and pass-through in the filter.
 *
 * Symptom in the wild: courthive-components ladderChart cohort-series
 * Storybook story showed no data per player (discovered 2026-06-03).
 */
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { ANY, MIXED } from '@Constants/genderConstants';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

function makePersonData(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    personId: `utr-${String(i + 1).padStart(3, '0')}`,
    firstName: `Given${i}`,
    lastName: `Family${i}`,
    sex: i % 2 ? 'FEMALE' : 'MALE',
  }));
}

describe('mocksEngine — gender:ANY + participantsProfile.personData', () => {
  it('honors personData AND assigns participants AND completes matchUps', () => {
    const personData = makePersonData(32);
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      tournamentAttributes: { tournamentName: 'Mixed cohort', endDate: '2026-01-15' },
      participantsProfile: { participantsCount: 32, participantType: 'INDIVIDUAL', personData },
      drawProfiles: [
        {
          drawSize: 32,
          drawType: SINGLE_ELIMINATION,
          eventType: 'SINGLES',
          eventName: 'Open Singles',
          gender: ANY,
        },
      ],
      completeAllMatchUps: true,
      randomWinningSide: true,
      nonRandom: 11,
    });

    // Participant pool was being doubled to 64 before the fix — confirm it's not.
    expect(tournamentRecord.participants?.length).toBe(32);

    // Supplied personIds should survive end-to-end.
    const personIds = tournamentRecord.participants?.map((p: any) => p.person?.personId) ?? [];
    expect(personIds.sort()).toEqual(personData.map((p) => p.personId).sort());

    // Draw positions should all be assigned.
    const structure = tournamentRecord.events?.[0]?.drawDefinitions?.[0]?.structures?.[0];
    const assignedCount = (structure?.positionAssignments ?? []).filter((pa: any) => pa.participantId).length;
    expect(assignedCount).toBe(32);

    // MatchUps should complete (this is the regression — was 0/31 before).
    tournamentEngine.setState(tournamentRecord);
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const completed = (matchUps ?? []).filter((m: any) => m.winningSide).length;
    expect(completed).toBe(31);
  });

  it('treats gender:MIXED on SINGLES as no constraint at the individual level', () => {
    // MIXED on a SINGLES event is semantically meaningless (an individual can't
    // be mixed-sex). The filter used to literal-compare person.sex === 'MIXED'
    // and reject everyone — same shape of bug as ANY, separate symptom.
    // MIXED on DOUBLES/TEAM (mixed pair / mixed team) has real meaning and is
    // enforced by a separate generator-level path; this fix is INDIVIDUAL-only.
    const personData = makePersonData(32);
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      tournamentAttributes: { tournamentName: 'Mixed singles', endDate: '2026-01-15' },
      participantsProfile: { participantsCount: 32, participantType: 'INDIVIDUAL', personData },
      drawProfiles: [
        {
          drawSize: 32,
          drawType: SINGLE_ELIMINATION,
          eventType: 'SINGLES',
          eventName: 'Open Singles',
          gender: MIXED,
        },
      ],
      completeAllMatchUps: true,
      randomWinningSide: true,
      nonRandom: 11,
    });

    const structure = tournamentRecord.events?.[0]?.drawDefinitions?.[0]?.structures?.[0];
    const assignedCount = (structure?.positionAssignments ?? []).filter((pa: any) => pa.participantId).length;
    expect(assignedCount).toBe(32);

    tournamentEngine.setState(tournamentRecord);
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const completed = (matchUps ?? []).filter((m: any) => m.winningSide).length;
    expect(completed).toBe(31);
  });

  it('generates valid M+F PAIRs for MIXED DOUBLES via drawProfiles', () => {
    // Pre-fix: ERR_INVALID_ENTRIES — generateParticipants pair-built sequentially
    // without gender awareness, so half the PAIRs were same-sex and
    // checkValidEntries rejected them.
    const personData = makePersonData(32);
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      tournamentAttributes: { tournamentName: 'Mixed doubles', endDate: '2026-01-15' },
      participantsProfile: { participantsCount: 32, participantType: 'INDIVIDUAL', personData },
      drawProfiles: [
        {
          drawSize: 16,
          drawType: SINGLE_ELIMINATION,
          eventType: 'DOUBLES',
          eventName: 'Mixed Doubles',
          gender: MIXED,
        },
      ],
      completeAllMatchUps: true,
      randomWinningSide: true,
      nonRandom: 11,
    });

    expect(tournamentRecord).toBeDefined();
    const pairs = (tournamentRecord.participants ?? []).filter((p: any) => p.participantType === 'PAIR');
    expect(pairs.length).toBe(16);

    const participantsById = new Map<string, any>(
      (tournamentRecord.participants ?? []).map((p: any) => [p.participantId, p] as [string, any]),
    );
    for (const pair of pairs) {
      const memberSexes = (pair.individualParticipantIds ?? [])
        .map((id: string) => participantsById.get(id)?.person?.sex)
        .filter(Boolean)
        .sort();
      expect(memberSexes).toEqual(['FEMALE', 'MALE']);
    }

    tournamentEngine.setState(tournamentRecord);
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    expect((matchUps ?? []).filter((m: any) => m.winningSide).length).toBe(15);
  });

  it('generates valid M+F PAIRs for MIXED DOUBLES via eventProfiles', () => {
    // Sibling path (eventProfiles → processExistingEvent → generateEventParticipants.ts)
    // also has the same bug; same fix applied to both.
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      tournamentAttributes: { tournamentName: 'Mixed via eventProfiles', endDate: '2026-01-15' },
      eventProfiles: [
        {
          eventName: 'Mixed Doubles',
          eventType: 'DOUBLES',
          gender: MIXED,
          drawProfiles: [{ drawSize: 16, drawType: SINGLE_ELIMINATION }],
        },
      ],
      completeAllMatchUps: true,
      randomWinningSide: true,
      nonRandom: 11,
    });

    expect(tournamentRecord).toBeDefined();
    const pairs = (tournamentRecord.participants ?? []).filter((p: any) => p.participantType === 'PAIR');
    expect(pairs.length).toBe(16);

    const participantsById = new Map<string, any>(
      (tournamentRecord.participants ?? []).map((p: any) => [p.participantId, p] as [string, any]),
    );
    for (const pair of pairs) {
      const memberSexes = (pair.individualParticipantIds ?? [])
        .map((id: string) => participantsById.get(id)?.person?.sex)
        .filter(Boolean)
        .sort();
      expect(memberSexes).toEqual(['FEMALE', 'MALE']);
    }
  });

  it('still constrains the pool when gender is a real sex (MALE)', () => {
    // Confirm the fix doesn't regress real gender filtering. With personData
    // of mixed sex (16 MALE, 16 FEMALE) and gender:MALE, the engine should
    // still synthesize extra male participants to fill the 32-slot draw.
    const personData = makePersonData(32);
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      tournamentAttributes: { tournamentName: 'Male only', endDate: '2026-01-15' },
      participantsProfile: { participantsCount: 32, participantType: 'INDIVIDUAL', personData },
      drawProfiles: [
        {
          drawSize: 32,
          drawType: SINGLE_ELIMINATION,
          eventType: 'SINGLES',
          eventName: 'Men Singles',
          gender: 'MALE',
        },
      ],
      completeAllMatchUps: true,
      randomWinningSide: true,
      nonRandom: 11,
    });

    const structure = tournamentRecord.events?.[0]?.drawDefinitions?.[0]?.structures?.[0];
    const assignedPids = (structure?.positionAssignments ?? []).map((pa: any) => pa.participantId).filter(Boolean);
    const participantsById = new Map<string, any>(
      (tournamentRecord.participants ?? []).map((p: any) => [p.participantId, p] as [string, any]),
    );
    const assignedSexes = assignedPids.map((pid: string) => participantsById.get(pid)?.person?.sex);
    expect(assignedSexes.every((s: string | undefined) => s === 'MALE')).toBe(true);
  });
});
