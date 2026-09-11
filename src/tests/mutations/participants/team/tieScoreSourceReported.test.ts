import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants and types
import { TieScoreSourceEnum } from '@Types/tournamentTypes';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { SINGLES } from '@Constants/matchUpTypes';
import { TEAM } from '@Constants/eventConstants';

const AGGREGATE_REPORTED_TIE_FORMAT: any = {
  tieFormatName: 'REPORTED_SINGLES_3',
  winCriteria: { valueGoal: 2 },
  collectionDefinitions: [
    {
      collectionName: 'Singles',
      matchUpFormat: 'SET3-S:6/TB7',
      collectionId: 'singles',
      matchUpType: SINGLES,
      collectionOrder: 1,
      matchUpValue: 1,
      matchUpCount: 3,
    },
  ],
};

function generateTeamEvent({ scoreSource }: { scoreSource?: any }) {
  const tieFormat = { ...AGGREGATE_REPORTED_TIE_FORMAT, scoreSource };

  const { drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: TEAM, tieFormat, drawId: 'drawId' }],
    setState: true,
  });

  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId: drawIds[0] });
  const teamMatchUp = matchUps.find(({ matchUpType }) => matchUpType === TEAM);

  return { drawId: drawIds[0], teamMatchUp };
}

function getTeamMatchUp(matchUpId: string) {
  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId: 'drawId' });
  return matchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
}

describe('tieFormat scoreSource: REPORTED', () => {
  it('preserves a reported aggregate score rather than deriving one from empty lines', () => {
    const { teamMatchUp } = generateTeamEvent({ scoreSource: TieScoreSourceEnum.REPORTED });

    let result: any = tournamentEngine.setMatchUpStatus({
      outcome: {
        score: { scoreStringSide1: '3-2', scoreStringSide2: '2-3', sets: [{ side1Score: 3, side2Score: 2 }] },
        winningSide: 1,
        matchUpStatus: COMPLETED,
      },
      matchUpId: teamMatchUp.matchUpId,
      drawId: 'drawId',
    });
    expect(result.success).toEqual(true);

    // the tie carries the reported result and its lines remain unscored BY DESIGN
    const updated = getTeamMatchUp(teamMatchUp.matchUpId);
    expect(updated.winningSide).toEqual(1);
    expect(updated.score.scoreStringSide1).toEqual('3-2');
    expect(updated.matchUpStatus).toEqual(COMPLETED);
    expect(updated.tieMatchUps.every(({ winningSide }) => !winningSide)).toEqual(true);

    // an explicit recalculation must not wipe the reported result
    result = tournamentEngine.updateTieMatchUpScore({ matchUpId: teamMatchUp.matchUpId, drawId: 'drawId' });
    expect(result.success).toEqual(true);
    expect(getTeamMatchUp(teamMatchUp.matchUpId).score.scoreStringSide1).toEqual('3-2');
    expect(getTeamMatchUp(teamMatchUp.matchUpId).winningSide).toEqual(1);
  });

  // falsification: the SAME sequence against a DERIVED tieFormat loses the reported score,
  // which is the behavior every federation without line data was getting
  it('derives from lines when scoreSource is absent, discarding a directly reported score', () => {
    const { teamMatchUp } = generateTeamEvent({ scoreSource: undefined });

    tournamentEngine.setMatchUpStatus({
      outcome: {
        score: { scoreStringSide1: '3-2', scoreStringSide2: '2-3', sets: [{ side1Score: 3, side2Score: 2 }] },
        winningSide: 1,
        matchUpStatus: COMPLETED,
      },
      matchUpId: teamMatchUp.matchUpId,
      drawId: 'drawId',
    });

    let result: any = tournamentEngine.updateTieMatchUpScore({ matchUpId: teamMatchUp.matchUpId, drawId: 'drawId' });
    expect(result.success).toEqual(true);

    const updated = getTeamMatchUp(teamMatchUp.matchUpId);
    expect(updated.score?.scoreStringSide1).not.toEqual('3-2');
    expect(updated.winningSide).toBeUndefined();
  });

  it('resolves the score source hierarchically from the event tieFormat', () => {
    const { teamMatchUp } = generateTeamEvent({ scoreSource: TieScoreSourceEnum.REPORTED });
    const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId: 'drawId' });

    // every tie in the draw inherits the declaration — it is stated once, not per matchUp
    expect(matchUps.filter(({ matchUpType }) => matchUpType === TEAM).length).toBeGreaterThan(1);
    expect(teamMatchUp).toBeDefined();

    for (const tie of matchUps.filter(({ matchUpType }) => matchUpType === TEAM)) {
      let result: any = tournamentEngine.setMatchUpStatus({
        outcome: {
          score: { scoreStringSide1: '2-1', scoreStringSide2: '1-2', sets: [{ side1Score: 2, side2Score: 1 }] },
          winningSide: 1,
          matchUpStatus: COMPLETED,
        },
        matchUpId: tie.matchUpId,
        drawId: 'drawId',
      });
      expect(result.success).toEqual(true);
      expect(getTeamMatchUp(tie.matchUpId).score.scoreStringSide1).toEqual('2-1');
    }
  });
});

describe('REPORTED suppresses line materialization', () => {
  it('generates no tieMatchUps while the tieFormat still describes the collections', () => {
    const { teamMatchUp } = generateTeamEvent({ scoreSource: TieScoreSourceEnum.REPORTED });

    expect(teamMatchUp.tieMatchUps).toEqual([]);

    // the format still states WHAT was played — only the unfillable matchUps are absent
    const { event } = tournamentEngine.getEvent({ drawId: 'drawId' });
    expect(event.tieFormat.collectionDefinitions[0].matchUpCount).toEqual(3);
    expect(event.tieFormat.scoreSource).toEqual(TieScoreSourceEnum.REPORTED);
  });

  it('still generates tieMatchUps when the tieFormat does not declare REPORTED', () => {
    const { teamMatchUp } = generateTeamEvent({ scoreSource: undefined });
    expect(teamMatchUp.tieMatchUps.length).toEqual(3);
  });

  it('scores a reported tie that has no lines at all', () => {
    const { teamMatchUp } = generateTeamEvent({ scoreSource: TieScoreSourceEnum.REPORTED });

    let result: any = tournamentEngine.setMatchUpStatus({
      outcome: {
        score: { scoreStringSide1: '3-0', scoreStringSide2: '0-3', sets: [{ side1Score: 3, side2Score: 0 }] },
        winningSide: 1,
        matchUpStatus: COMPLETED,
      },
      matchUpId: teamMatchUp.matchUpId,
      drawId: 'drawId',
    });

    expect(result.success).toEqual(true);
    const updated = getTeamMatchUp(teamMatchUp.matchUpId);
    expect(updated.tieMatchUps).toEqual([]);
    expect(updated.winningSide).toEqual(1);
    expect(updated.score.scoreStringSide1).toEqual('3-0');
  });
});
