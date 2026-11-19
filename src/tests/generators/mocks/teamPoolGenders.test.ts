import { processTieFormat } from '@Assemblies/generators/mocks/processTieFormat';
import { tieFormats } from '@Fixtures/scoring/tieFormats';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { FEMALE, MALE } from '@Constants/genderConstants';
import { TEAM } from '@Constants/eventConstants';

// With the default participantsProfile a TEAM draw takes its teams from the tournament pool, which dealt individuals in
// order, blind to gender: a team could lack the men or women its tieFormat's gendered collections need. Every team
// must hold at least the per-gender minimum processTieFormat computes for the format.
it.each([1, 2, 3, 4, 5, 6, 7, 8])('every pooled team meets its tieFormat gender minimum (seed %s)', (nonRandom) => {
  const tieFormat = tieFormats.INTENNSE_2026;
  const { genders } = processTieFormat({ tieFormat: structuredClone(tieFormat), drawSize: 8 });

  const result = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: TEAM, tieFormat, drawSize: 8 }],
    setState: true,
    nonRandom,
  });
  expect(result.success).toEqual(true);

  const entered = new Set(tournamentEngine.getEvents().events[0].entries.map((entry) => entry.participantId));
  const teams = tournamentEngine
    .getParticipants({ withIndividualParticipants: true })
    .participants.filter((participant) => entered.has(participant.participantId));
  expect(teams.length).toEqual(8);
  for (const team of teams) {
    const sexes = team.individualParticipants.map((individual) => individual.person?.sex);
    expect(sexes.filter((sex) => sex === MALE).length).toBeGreaterThanOrEqual(genders[MALE]);
    expect(sexes.filter((sex) => sex === FEMALE).length).toBeGreaterThanOrEqual(genders[FEMALE]);
  }
});

// 3 men's singles and 2 mixed doubles need 3 men and 2 women per team: 5, though the format's largest line asks only 4.
// Teams of 4 could never field a valid line-up; dealt by gender without that floor, teams came out 5 and 3.
it('sizes pooled teams to their gendered minimum, every team alike', () => {
  const tieFormat = {
    winCriteria: { valueGoal: 3 },
    collectionDefinitions: [
      { collectionId: 'S', matchUpType: 'SINGLES', matchUpCount: 3, matchUpValue: 1, gender: MALE },
      { collectionId: 'X', matchUpType: 'DOUBLES', matchUpCount: 2, matchUpValue: 1, gender: 'MIXED' },
    ],
  };
  const result = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: TEAM, tieFormat, drawSize: 4 }],
    setState: true,
  });
  expect(result.success).toEqual(true);

  const entered = new Set(tournamentEngine.getEvents().events[0].entries.map((entry) => entry.participantId));
  const teams = tournamentEngine
    .getParticipants({ withIndividualParticipants: true })
    .participants.filter((participant) => entered.has(participant.participantId));
  expect(teams.length).toEqual(4);
  for (const team of teams) {
    const sexes = team.individualParticipants.map((individual) => individual.person?.sex);
    expect(sexes.length).toEqual(5);
    expect(sexes.filter((sex) => sex === MALE).length).toBeGreaterThanOrEqual(3);
    expect(sexes.filter((sex) => sex === FEMALE).length).toBeGreaterThanOrEqual(2);
  }
});
