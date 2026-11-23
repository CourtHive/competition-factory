import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { MAIN, VOLUNTARY_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';

test('can return participants eligible for voluntary consolation', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32 }],
    completeAllMatchUps: true,
  });

  tournamentEngine.setState(tournamentRecord);

  let { eligibleParticipants, losingParticipantIds } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
    drawId,
  });
  expect(losingParticipantIds.length).toEqual(31);
  expect(eligibleParticipants.length).toEqual(31);

  ({ eligibleParticipants, losingParticipantIds } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
    winsLimit: 1,
    drawId,
  }));

  expect(losingParticipantIds.length).toEqual(31);
  expect(eligibleParticipants.length).toEqual(24);

  ({ eligibleParticipants } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
    winsLimit: 2,
    drawId,
  }));

  expect(eligibleParticipants.length).toEqual(28);

  ({ eligibleParticipants } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
    winsLimit: 3,
    drawId,
  }));

  expect(eligibleParticipants.length).toEqual(30);

  ({ eligibleParticipants, losingParticipantIds } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
    requireLoss: false,
    drawId,
  }));

  expect(losingParticipantIds.length).toEqual(31);
  expect(eligibleParticipants.length).toEqual(32);
});

test('can return participants eligible for voluntary consolation when play is not required', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32 }],
  });

  tournamentEngine.setState(tournamentRecord);

  let { eligibleParticipants, losingParticipantIds } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
    drawId,
  });
  expect(losingParticipantIds.length).toEqual(0);
  expect(eligibleParticipants.length).toEqual(0);

  ({ eligibleParticipants, losingParticipantIds } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
    requirePlay: false,
    requireLoss: false,
    drawId,
  }));

  expect(losingParticipantIds.length).toEqual(0);
  expect(eligibleParticipants.length).toEqual(32);
});

test('can consider event.entries as eligible for voluntary consolation', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [
      {
        drawProfiles: [{ drawSize: 4 }, { drawSize: 32 }],
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.entries.length).toEqual(4);
  expect(event.entries.length).toEqual(32);

  let { eligibleParticipants } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
    includeEventParticipants: true,
    requireLoss: false,
    requirePlay: false,
    drawId,
  });

  expect(eligibleParticipants.length).toEqual(32);

  ({ eligibleParticipants } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
    includeEventParticipants: true,
    drawId,
  }));

  expect(eligibleParticipants.length).toEqual(0);
});

test('can consider participants from other event draws as eligible for voluntary consolation', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [
      {
        drawProfiles: [{ drawSize: 4 }, { drawSize: 32, completionGoal: 31 }],
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.entries.length).toEqual(4);
  expect(event.entries.length).toEqual(32);

  let { eligibleParticipants } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
    includeEventParticipants: true,
    requireLoss: false,
    requirePlay: false,
    drawId, // first draw with drawSize; 4
  });

  expect(eligibleParticipants.length).toEqual(32);

  // if loss is not required the all participants which have played in the 2nd draw are eligible
  ({ eligibleParticipants } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
    includeEventParticipants: true,
    requireLoss: false,
    drawId, // first draw with draawSize; 4
  }));

  expect(eligibleParticipants.length).toEqual(32);

  // if includeEventParticipants, participants losing in 2nd draw are eligible
  ({ eligibleParticipants } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
    includeEventParticipants: true,
    drawId, // first draw with drawSize; 4
  }));

  expect(eligibleParticipants.length).toEqual(31);
});

test('DOUBLE_WALKOVER produceds participants eligible for voluntary consolation when play is not required', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32 }],
  });

  tournamentEngine.setState(tournamentRecord);

  let result = tournamentEngine.generateVoluntaryConsolation({
    automated: true,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.links.length).toEqual(0);
  expect(result.structures.length).toEqual(1);

  let { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: { stages: [VOLUNTARY_CONSOLATION] },
  });
  expect(matchUps.length).toEqual(0);

  result = tournamentEngine.attachStructures({
    structures: result.structures,
    links: result.links,
    drawId,
  });
  expect(result.success).toEqual(true);

  matchUps = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { roundNumbers: [1] },
    constextFilters: { stages: [MAIN] },
  }).matchUps;

  let { outcome } = mocksEngine.generateOutcomeFromScoreString({
    matchUpStatus: DOUBLE_WALKOVER,
  });
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: matchUps[0].matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  let { eligibleParticipants, losingParticipantIds } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
    drawId,
  });
  expect(losingParticipantIds.length).toEqual(0);
  expect(eligibleParticipants.length).toEqual(0);

  ({ eligibleParticipants, losingParticipantIds } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
    requirePlay: false,
    matchUpsLimit: 1,
    drawId,
  }));

  expect(losingParticipantIds.length).toEqual(2);
  expect(eligibleParticipants.length).toEqual(2);

  ({ outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '6-1 6-2',
    winningSide: 1,
  }));
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: matchUps[1].matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  ({ eligibleParticipants, losingParticipantIds } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
    requirePlay: false,
    matchUpsLimit: 1,
    drawId,
  }));

  expect(losingParticipantIds.length).toEqual(3);
  expect(eligibleParticipants.length).toEqual(3);
});

// The limits as specified in 2022: winsLimit 0 is "no wins"; roundNumberLimit N considers rounds 1..N; finishingRoundLimit
// N considers matchUps N rounds before the final and earlier ("3 doesn't consider past QF"). A completed 32 draw has
// 16 round-1 (R32) losers, 8 R16, 4 QF, 2 SF and 1 final loser: 31 in all.
test('eligibility limits bound wins and the considered rounds as specified', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32 }],
    completeAllMatchUps: true,
  });
  tournamentEngine.setState(tournamentRecord);

  const eligibleCount = (params) =>
    tournamentEngine.getEligibleVoluntaryConsolationParticipants({ drawId, ...params }).eligibleParticipants.length;

  expect(eligibleCount({ winsLimit: 0 })).toEqual(16); // no wins: round-1 losers
  expect(eligibleCount({ roundNumberLimit: 1 })).toEqual(16); // only round 1 considered
  expect(eligibleCount({ roundNumberLimit: 2 })).toEqual(24);
  expect(eligibleCount({ finishingRoundLimit: 5 })).toEqual(16); // finishingRound 5 is round 1 of 32
  expect(eligibleCount({ finishingRoundLimit: 3 })).toEqual(28); // QF and earlier (16 + 8 + 4): SF and final losers excluded

  // the same limits read from an attached policy
  tournamentEngine.attachPolicies({
    policyDefinitions: { voluntaryConsolation: { winsLimit: 0 } },
    drawId,
  });
  expect(eligibleCount({})).toEqual(16);
});
