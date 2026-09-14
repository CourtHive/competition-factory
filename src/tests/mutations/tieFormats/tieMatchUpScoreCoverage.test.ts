import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { DOUBLES, SINGLES, TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';

const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };

describe('generateTieMatchUpScore coverage', () => {
  it('handles matchUpValue scoring', () => {
    const tieFormat = {
      winCriteria: { valueGoal: 3 },
      collectionDefinitions: [
        {
          collectionId: 'singles',
          collectionName: 'Singles',
          matchUpFormat: 'SET1-S:6/TB7',
          matchUpType: SINGLES,
          matchUpCount: 5,
          matchUpValue: 1,
        },
      ],
    };
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM_EVENT, tieFormat }],
      policyDefinitions,
    });
    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const singlesMatchUps = matchUps.filter(({ matchUpType }) => matchUpType === SINGLES);

    // Score 3 singles for side 1
    for (let i = 0; i < 3; i++) {
      tournamentEngine.setMatchUpStatus({
        matchUpId: singlesMatchUps[i].matchUpId,
        drawId: singlesMatchUps[i].drawId,
        outcome: {
          winningSide: 1,
          score: {
            sets: [{ setNumber: 1, side1Score: 6, side2Score: 2, winningSide: 1 }],
          },
        },
      });
    }

    const updatedMatchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const teamMatchUp = updatedMatchUps.find(({ matchUpType }) => matchUpType === TEAM_MATCHUP);
    expect(teamMatchUp.winningSide).toEqual(1);
    expect(teamMatchUp.score.scoreStringSide1).toEqual('3-0');
  });

  it('handles setValue scoring', () => {
    const tieFormat = {
      winCriteria: { aggregateValue: true },
      collectionDefinitions: [
        {
          collectionId: 'singles',
          collectionName: 'Singles',
          matchUpFormat: 'SET3-S:6/TB7',
          matchUpType: SINGLES,
          matchUpCount: 3,
          setValue: 1,
        },
      ],
    };
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM_EVENT, tieFormat }],
      policyDefinitions,
    });
    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const singlesMatchUp = matchUps.find(({ matchUpType }) => matchUpType === SINGLES);

    // Score a 3-set match
    tournamentEngine.setMatchUpStatus({
      matchUpId: singlesMatchUp.matchUpId,
      drawId: singlesMatchUp.drawId,
      outcome: {
        winningSide: 1,
        score: {
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 },
            { setNumber: 2, side1Score: 3, side2Score: 6, winningSide: 2 },
            { setNumber: 3, side1Score: 6, side2Score: 4, winningSide: 1 },
          ],
        },
      },
    });

    const updatedMatchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const teamMatchUp = updatedMatchUps.find(({ matchUpType }) => matchUpType === TEAM_MATCHUP);
    // 2 sets won by side 1, 1 set won by side 2
    expect(teamMatchUp.score.scoreStringSide1).toEqual('2-1');
  });

  it('handles collectionValue with default majority winCriteria', () => {
    // collectionValue without explicit winCriteria uses default majority (matchUpCount / 2 + 1)
    const tieFormat = {
      winCriteria: { valueGoal: 2 },
      collectionDefinitions: [
        {
          collectionId: 'singles',
          collectionName: 'Singles',
          matchUpFormat: 'SET1-S:6/TB7',
          matchUpType: SINGLES,
          matchUpCount: 3,
          collectionValue: 1,
          // no winCriteria → default majority = 2 wins needed
        },
        {
          collectionId: 'doubles',
          collectionName: 'Doubles',
          matchUpFormat: 'SET1-S:6/TB7',
          matchUpType: DOUBLES,
          matchUpCount: 1,
          collectionValue: 1,
        },
      ],
    };
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM_EVENT, tieFormat }],
      policyDefinitions,
    });
    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const singlesMatchUps = matchUps.filter(({ matchUpType }) => matchUpType === SINGLES);

    // Side 1 wins 2 of 3 singles — should win the collection (majority = 2)
    for (let i = 0; i < 2; i++) {
      tournamentEngine.setMatchUpStatus({
        matchUpId: singlesMatchUps[i].matchUpId,
        drawId: singlesMatchUps[i].drawId,
        outcome: {
          winningSide: 1,
          score: {
            sets: [{ setNumber: 1, side1Score: 6, side2Score: 2, winningSide: 1 }],
          },
        },
      });
    }

    const updatedMatchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const teamMatchUp = updatedMatchUps.find(({ matchUpType }) => matchUpType === TEAM_MATCHUP);
    // Singles collection won by side 1 (2 wins ≥ majority 2), worth 1 point
    expect(teamMatchUp.score.scoreStringSide1).toEqual('1-0');
  });

  it('handles collectionValueProfiles', () => {
    const tieFormat = {
      winCriteria: { aggregateValue: true },
      collectionDefinitions: [
        {
          collectionId: 'singles',
          collectionName: 'Singles',
          matchUpFormat: 'SET1-S:6/TB7',
          matchUpType: SINGLES,
          matchUpCount: 3,
          collectionValueProfiles: [
            { collectionPosition: 1, matchUpValue: 3 },
            { collectionPosition: 2, matchUpValue: 2 },
            { collectionPosition: 3, matchUpValue: 1 },
          ],
        },
      ],
    };
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM_EVENT, tieFormat }],
      policyDefinitions,
    });
    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const singlesMatchUps = matchUps
      .filter(({ matchUpType }) => matchUpType === SINGLES)
      .sort((a, b) => a.collectionPosition - b.collectionPosition);

    // Position 1 (worth 3) won by side 2, position 2 (worth 2) won by side 1
    tournamentEngine.setMatchUpStatus({
      matchUpId: singlesMatchUps[0].matchUpId,
      drawId: singlesMatchUps[0].drawId,
      outcome: {
        winningSide: 2,
        score: { sets: [{ setNumber: 1, side1Score: 2, side2Score: 6, winningSide: 2 }] },
      },
    });
    tournamentEngine.setMatchUpStatus({
      matchUpId: singlesMatchUps[1].matchUpId,
      drawId: singlesMatchUps[1].drawId,
      outcome: {
        winningSide: 1,
        score: { sets: [{ setNumber: 1, side1Score: 6, side2Score: 2, winningSide: 1 }] },
      },
    });

    const updatedMatchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const teamMatchUp = updatedMatchUps.find(({ matchUpType }) => matchUpType === TEAM_MATCHUP);
    // side1: 2 (position 2), side2: 3 (position 1)
    expect(teamMatchUp.score.scoreStringSide1).toEqual('2-3');
  });

  it('handles collectionGroupNumber (value groups)', () => {
    const tieFormat = {
      winCriteria: { valueGoal: 2 },
      collectionDefinitions: [
        {
          collectionId: 'singles',
          collectionGroupNumber: 1,
          collectionName: 'Singles',
          matchUpFormat: 'SET1-S:6/TB7',
          matchUpType: SINGLES,
          matchUpCount: 3,
          matchUpValue: 1,
        },
        {
          collectionId: 'doubles',
          collectionGroupNumber: 1,
          collectionName: 'Doubles',
          matchUpFormat: 'SET1-S:6/TB7',
          matchUpType: DOUBLES,
          matchUpCount: 2,
          matchUpValue: 1,
        },
      ],
      collectionGroups: [
        {
          groupNumber: 1,
          groupValue: 1,
          winCriteria: { aggregateValue: true },
        },
      ],
    };
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM_EVENT, tieFormat }],
      policyDefinitions,
    });
    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const singlesMatchUps = matchUps.filter(({ matchUpType }) => matchUpType === SINGLES);
    const doublesMatchUps = matchUps.filter(({ matchUpType }) => matchUpType === DOUBLES);

    // Side 1 wins all 3 singles and side 2 wins both doubles
    // Group aggregate: side1 = 3, side2 = 2, group won by side 1
    for (const m of singlesMatchUps) {
      tournamentEngine.setMatchUpStatus({
        matchUpId: m.matchUpId,
        drawId: m.drawId,
        outcome: {
          winningSide: 1,
          score: { sets: [{ setNumber: 1, side1Score: 6, side2Score: 1, winningSide: 1 }] },
        },
      });
    }
    for (const m of doublesMatchUps) {
      tournamentEngine.setMatchUpStatus({
        matchUpId: m.matchUpId,
        drawId: m.drawId,
        outcome: {
          winningSide: 2,
          score: { sets: [{ setNumber: 1, side1Score: 1, side2Score: 6, winningSide: 2 }] },
        },
      });
    }

    const updatedMatchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const teamMatchUp = updatedMatchUps.find(({ matchUpType }) => matchUpType === TEAM_MATCHUP);
    // Group won by side 1 (aggregate 3 > 2), group value = 1
    expect(teamMatchUp.score.scoreStringSide1).toEqual('1-0');
  });
});
