import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// Coverage for matchUpActions' matchUpParticipantIds accumulation. The side fallback
// read the misspelled s.participant?.participantid (always undefined); corrected to
// s.participant?.participantId. Behaviour-neutral today: in-context sides always carry a
// top-level s.participantId, so the || never falls through to the participant fallback.
// This exercises the accumulation line on a matchUp with assigned participants.
it('computes matchUpActions for a matchUp with assigned participants', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const matchUp = tournamentEngine
    .allTournamentMatchUps()
    .matchUps.find((m) => m.sides?.filter((s) => s.participantId).length === 2);
  expect(matchUp).toBeDefined();

  const result: any = tournamentEngine.matchUpActions({ matchUpId: matchUp.matchUpId, drawId });
  expect(Array.isArray(result.validActions)).toBe(true);
});
