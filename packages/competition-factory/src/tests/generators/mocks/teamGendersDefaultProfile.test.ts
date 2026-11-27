import { tieFormats } from '@courthive/competition-catalogue';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { FEMALE, MALE } from '@Constants/genderConstants';
import { TEAM } from '@Constants/eventConstants';

// teamGenders and teamNames shape a TEAM draw's teams, but only buildTeamParticipants reads them, and it ran only when
// the draw generated its own participants. With the default participantsProfile the draw reused the tournament pool,
// whose teams are dealt in order, gender-blind and named `Team N`: both options were silently ignored. The existing
// tests passed `participantsProfile: { participantsCount: 0 }`, which forces per-draw generation, so none caught it.
it('honours teamGenders and teamNames with the default participantsProfile', () => {
  const result = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        teamGenders: { [MALE]: 4, [FEMALE]: 4 },
        teamNames: ['Team Alpha', 'Team Beta'],
        tieFormat: tieFormats.INTENNSE_2026,
        eventType: TEAM,
        drawSize: 2,
      },
    ],
    setState: true,
  });
  expect(result.success).toEqual(true);

  const entered = new Set(tournamentEngine.getEvents().events[0].entries.map((entry) => entry.participantId));
  const teams = tournamentEngine
    .getParticipants({ withIndividualParticipants: true })
    .participants.filter((participant) => entered.has(participant.participantId));

  expect(teams.map((team) => team.participantName).sort()).toEqual(['Team Alpha', 'Team Beta']);
  for (const team of teams) {
    const sexes = team.individualParticipants.map((individual) => individual.person?.sex);
    expect(sexes.filter((sex) => sex === MALE).length).toBeGreaterThanOrEqual(4);
    expect(sexes.filter((sex) => sex === FEMALE).length).toBeGreaterThanOrEqual(4);
  }
});

it('runs the documented Team Gender Composition Override example', () => {
  const result = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 2,
        eventType: TEAM,
        teamNames: ['Team Alpha', 'Team Beta'],
        teamGenders: { [MALE]: 3, [FEMALE]: 3 },
        tieFormat: tieFormats.INTENNSE_2026,
      },
    ],
    completeAllMatchUps: true,
    setState: true,
  });
  expect(result.success).toEqual(true);

  const entered = new Set(tournamentEngine.getEvents().events[0].entries.map((entry) => entry.participantId));
  const teams = tournamentEngine
    .getParticipants({ withIndividualParticipants: true })
    .participants.filter((participant) => entered.has(participant.participantId));
  for (const team of teams) {
    const sexes = team.individualParticipants.map((individual) => individual.person?.sex);
    expect(sexes.filter((sex) => sex === MALE).length).toBeGreaterThanOrEqual(3);
    expect(sexes.filter((sex) => sex === FEMALE).length).toBeGreaterThanOrEqual(3);
  }
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { matchUpTypes: [TEAM] } });
  expect(matchUps.every((matchUp) => matchUp.winningSide)).toEqual(true);
});
