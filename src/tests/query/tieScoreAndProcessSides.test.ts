import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { TEAM_EVENT, DOUBLES_EVENT } from '@Constants/eventConstants';
import { COLLEGE_DEFAULT } from '@Constants/tieFormatConstants';

test('TEAM tournament with completed tieMatchUps exercises evaluateCollectionResult', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 4,
        eventType: TEAM_EVENT,
        tieFormatName: COLLEGE_DEFAULT,
      },
    ],
    completeAllMatchUps: true,
    setState: true,
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps();

  // There should be TEAM matchUps with tieMatchUps
  const teamMatchUps = matchUps.filter((m) => m.tieMatchUps?.length);
  expect(teamMatchUps.length).toBeGreaterThan(0);

  // Verify team matchUps have scores from collection evaluation
  teamMatchUps.forEach((matchUp) => {
    expect(matchUp.score).toBeDefined();
  });
});

test('DOUBLES tournament exercises processSides with individual participants', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 8,
        eventType: DOUBLES_EVENT,
      },
    ],
    completeAllMatchUps: true,
    setState: true,
  });

  // Get matchUps with participant details (inContext)
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true });

  // DOUBLES matchUps should have sides with participant info
  const doublesMatchUps = matchUps.filter((m) => m.sides?.length === 2);
  expect(doublesMatchUps.length).toBeGreaterThan(0);

  // Verify sides have participant data
  doublesMatchUps.forEach((matchUp) => {
    matchUp.sides?.forEach((side) => {
      if (side.participant) {
        expect(side.participant.participantId).toBeDefined();
      }
    });
  });
});

test('TEAM tournament with partial completion exercises tie format scoring', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 4,
        eventType: TEAM_EVENT,
        tieFormatName: COLLEGE_DEFAULT,
        completionGoal: 5,
      },
    ],
    setState: true,
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const completedMatchUps = matchUps.filter((m) => m.winningSide);
  expect(completedMatchUps.length).toBeGreaterThan(0);
});
