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
import { ANY } from '@Constants/genderConstants';
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
