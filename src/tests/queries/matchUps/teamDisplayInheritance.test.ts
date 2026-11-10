import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants and types
import { DISPLAY } from '@Constants/extensionConstants';

it('carries tournament presentation on hydrated TEAM and tie lines with only exposed TEAM exceptions', () => {
  mocksEngine.generateTournamentRecord({
    setState: true,
    nonRandom: 1,
    drawProfiles: [{ drawSize: 4, eventType: 'TEAM' }],
  });
  const teams = tournamentEngine.getParticipants().participants.filter((p: any) => p.participantType === 'TEAM');
  const presentation = {
    roles: { 'score.surface': '#112233' },
    teams: Object.fromEntries(
      teams.map((team: any) => [team.participantId, { roles: { 'team.surface': { theme: true } } }]),
    ),
  };
  let result: any = tournamentEngine.addTournamentExtension({
    extension: { name: DISPLAY, value: { teamPresentation: presentation } },
  });
  expect(result.success).toBe(true);
  expect(
    tournamentEngine.getTournament().tournamentRecord.extensions.find((entry: any) => entry.name === DISPLAY).value
      .teamPresentation.teams[teams[0].participantId].roles['team.surface'],
  ).toEqual({ theme: true });
  const parents = tournamentEngine
    .allTournamentMatchUps({ inContext: true })
    .matchUps.filter((m: any) => m.matchUpType === 'TEAM' && m.sides?.every((side: any) => side.participant));
  expect(parents.length).toBeGreaterThan(0);
  for (const matchUp of parents.flatMap((parent: any) => [parent, ...(parent.tieMatchUps ?? [])])) {
    expect(matchUp.teamPresentation.roles).toEqual(presentation.roles);
    const ids = matchUp.sides.map((side: any) => (side.teamParticipant ?? side.participant).participantId);
    expect(Object.keys(matchUp.teamPresentation.teams).toSorted((a, b) => a.localeCompare(b))).toEqual(
      ids.toSorted((a: string, b: string) => a.localeCompare(b)),
    );
  }
  expect(
    Object.keys(
      tournamentEngine.findExtension({ name: DISPLAY, discover: true }).extension.value.teamPresentation.teams,
    ),
  ).toHaveLength(4);
});
