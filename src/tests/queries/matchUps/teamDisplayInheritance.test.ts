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

it('rejects malformed presentation at the write boundary and leaves the stored value untouched', () => {
  mocksEngine.generateTournamentRecord({
    setState: true,
    nonRandom: 1,
    drawProfiles: [{ drawSize: 4, eventType: 'TEAM' }],
  });
  const valid = { roles: { 'score.text': '#ffffff' } };
  let result: any = tournamentEngine.addTournamentExtension({
    extension: { name: DISPLAY, value: { teamPresentation: valid } },
  });
  expect(result.success).toBe(true);
  for (const teamPresentation of [
    { roles: { nope: '#112233' } },
    { roles: { 'team.text': 'red' } },
    { roles: { 'team.text': 'paletteId' } },
    { teams: { a: { roles: { 'team.text': { theme: false } } } } },
    { teams: { a: { colors: {} } } },
    { extra: true },
    [],
  ]) {
    result = tournamentEngine.addTournamentExtension({ extension: { name: DISPLAY, value: { teamPresentation } } });
    expect(result.error).toBeDefined();
  }
  // The element writer (engine `addExtension`) refuses the same way.
  const { tournamentRecord } = tournamentEngine.getTournament();
  result = tournamentEngine.addExtension({
    extension: { name: DISPLAY, value: { teamPresentation: { roles: { nope: '#112233' } } } },
    element: tournamentRecord,
  });
  expect(result.error).toBeDefined();
  expect(tournamentEngine.findExtension({ name: DISPLAY, discover: true }).extension.value.teamPresentation).toEqual(
    valid,
  );
});

it('inherits through empty team exceptions and drops only the malformed entries of an unvalidated record', () => {
  mocksEngine.generateTournamentRecord({
    setState: true,
    nonRandom: 1,
    drawProfiles: [{ drawSize: 4, eventType: 'TEAM' }],
  });
  const [first, second] = tournamentEngine
    .getParticipants()
    .participants.filter((p: any) => p.participantType === 'TEAM')
    .map((team: any) => team.participantId);
  let result: any = tournamentEngine.addTournamentExtension({
    extension: {
      name: DISPLAY,
      value: { teamPresentation: { roles: { 'score.text': '#FFFFFF' }, teams: { [first]: {} } } },
    },
  });
  expect(result.success).toBe(true);

  // A record assembled outside the API is read tolerantly: one bad exception does not cost every scoreboard.
  const { tournamentRecord } = tournamentEngine.getTournament();
  tournamentRecord.extensions.find((entry: any) => entry.name === DISPLAY).value.teamPresentation = {
    roles: { 'score.text': '#FFFFFF', bogus: '#000000' },
    teams: { [first]: {}, [second]: { roles: { 'team.text': 42 } } },
  };
  tournamentEngine.setState(tournamentRecord);
  const matchUp = tournamentEngine
    .allTournamentMatchUps({ inContext: true })
    .matchUps.find(
      (m: any) =>
        m.matchUpType === 'TEAM' &&
        m.sides?.some((side: any) => side.participant?.participantId === first) &&
        m.sides?.some((side: any) => side.participant?.participantId === second),
    );
  expect(matchUp.teamPresentation).toEqual({
    roles: { 'score.text': '#FFFFFF' },
    teams: { [first]: { roles: {} }, [second]: { roles: {} } },
  });
});

it('carries no presentation on matchUps that expose no TEAM identity', () => {
  mocksEngine.generateTournamentRecord({ setState: true, nonRandom: 1, drawProfiles: [{ drawSize: 4 }] });
  let result: any = tournamentEngine.addTournamentExtension({
    extension: { name: DISPLAY, value: { teamPresentation: { roles: { 'score.text': '#FFFFFF' } } } },
  });
  expect(result.success).toBe(true);
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true });
  expect(matchUps.length).toBeGreaterThan(0);
  expect(matchUps.filter((m: any) => m.teamPresentation)).toEqual([]);
});
