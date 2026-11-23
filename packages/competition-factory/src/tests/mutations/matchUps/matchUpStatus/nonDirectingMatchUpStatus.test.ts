import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { MATCHUP_STATUS_OUT_OF_SCOPE } from '@Constants/errorConditionConstants';
import {
  ABANDONED,
  CANCELLED,
  INCOMPLETE,
  SUSPENDED,
  IN_PROGRESS,
  NOT_PLAYED,
  DEAD_RUBBER,
  AWAITING_RESULT,
} from '@Constants/matchUpStatusConstants';

it('supports entering CANCELED matchUpStatus', () => {
  const drawProfiles = [{ drawSize: 8 }];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({ drawProfiles });

  const { upcomingMatchUps } = tournamentEngine.setState(tournamentRecord).drawMatchUps({ drawId });
  const matchUpId = upcomingMatchUps[0].matchUpId;

  const result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: CANCELLED },
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const { matchUp } = tournamentEngine.findMatchUp({ drawId, matchUpId });
  expect(matchUp.matchUpStatus).toEqual(CANCELLED);
});

it('supports entering ABANDONED matchUpStatus', () => {
  const drawProfiles = [{ drawSize: 8 }];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({ drawProfiles });

  const { upcomingMatchUps } = tournamentEngine.setState(tournamentRecord).drawMatchUps({ drawId });
  const matchUpId = upcomingMatchUps[0].matchUpId;

  const result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: ABANDONED },
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const { matchUp } = tournamentEngine.findMatchUp({ drawId, matchUpId });
  expect(matchUp.matchUpStatus).toEqual(ABANDONED);
});

it('supports entering INCOMPLETE matchUpStatus', () => {
  const drawProfiles = [{ drawSize: 8 }];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({ drawProfiles });

  const { upcomingMatchUps } = tournamentEngine.setState(tournamentRecord).drawMatchUps({ drawId });
  const matchUpId = upcomingMatchUps[0].matchUpId;

  const result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: INCOMPLETE },
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const { matchUp } = tournamentEngine.findMatchUp({ drawId, matchUpId });
  expect(matchUp.matchUpStatus).toEqual(INCOMPLETE);
});

it('supports entering INCOMPLETE matchUpStatus with incomplete score', () => {
  const drawProfiles = [{ drawSize: 8 }];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({ drawProfiles });

  const { upcomingMatchUps } = tournamentEngine.setState(tournamentRecord).drawMatchUps({ drawId });
  const matchUpId = upcomingMatchUps[0].matchUpId;

  const outcome = {
    score: {
      scoreStringSide1: '3-6 6-3',
      scoreStringSide2: '6-3 3-6',
      sets: [
        { setNumber: 1, side1Score: 3, side2Score: 6, winningSide: 2 },
        { setNumber: 2, side1Score: 6, side2Score: 3, winningSide: 1 },
      ],
    },
    matchUpStatus: INCOMPLETE,
  };
  const result = tournamentEngine.setMatchUpStatus({
    matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  const { matchUp } = tournamentEngine.findMatchUp({ drawId, matchUpId });
  expect(matchUp.matchUpStatus).toEqual(INCOMPLETE);
});

it('supports entering SUSPENDED matchUpStatus', () => {
  const drawProfiles = [{ drawSize: 8 }];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({ drawProfiles });

  const { upcomingMatchUps } = tournamentEngine.setState(tournamentRecord).drawMatchUps({ drawId });
  const matchUpId = upcomingMatchUps[0].matchUpId;

  const result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: SUSPENDED },
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const { matchUp } = tournamentEngine.findMatchUp({ drawId, matchUpId });
  expect(matchUp.matchUpStatus).toEqual(SUSPENDED);
});

it('supports entering SUSPENDED matchUpStatus with incomplete score', () => {
  const drawProfiles = [{ drawSize: 8 }];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({ drawProfiles });

  const { upcomingMatchUps } = tournamentEngine.setState(tournamentRecord).drawMatchUps({ drawId });
  const matchUpId = upcomingMatchUps[0].matchUpId;

  const outcome = {
    score: {
      scoreStringSide1: '3-6 6-3',
      scoreStringSide2: '6-3 3-6',
      sets: [
        { setNumber: 1, side1Score: 3, side2Score: 6, winningSide: 2 },
        { setNumber: 2, side1Score: 6, side2Score: 3, winningSide: 1 },
      ],
    },
    matchUpStatus: SUSPENDED,
  };
  const result = tournamentEngine.setMatchUpStatus({
    matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  const { matchUp } = tournamentEngine.findMatchUp({ drawId, matchUpId });
  expect(matchUp.matchUpStatus).toEqual(SUSPENDED);
});

// CA, 2026-10-13: DEAD_RUBBER belongs to a rubber of a team tie or a DOUBLE_ELIMINATION Decider (deadRubberScope.test.ts);
// on a singles elimination matchUp it is refused, where before this it was accepted
it('refuses DEAD_RUBBER matchUpStatus outside a tie or a Decider', () => {
  const drawProfiles = [{ drawSize: 8 }];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({ drawProfiles });

  const { upcomingMatchUps } = tournamentEngine.setState(tournamentRecord).drawMatchUps({ drawId });
  const matchUpId = upcomingMatchUps[0].matchUpId;

  const result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DEAD_RUBBER },
    matchUpId,
    drawId,
  });
  expect(result.error).toEqual(MATCHUP_STATUS_OUT_OF_SCOPE);

  const { matchUp } = tournamentEngine.findMatchUp({ drawId, matchUpId });
  expect(matchUp.matchUpStatus).not.toEqual(DEAD_RUBBER);
});

it('supports entering NOT_PLAYED matchUpStatus', () => {
  const drawProfiles = [{ drawSize: 8 }];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({ drawProfiles });

  const { upcomingMatchUps } = tournamentEngine.setState(tournamentRecord).drawMatchUps({ drawId });
  const matchUpId = upcomingMatchUps[0].matchUpId;

  const result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: NOT_PLAYED },
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const { matchUp } = tournamentEngine.findMatchUp({ drawId, matchUpId });
  expect(matchUp.matchUpStatus).toEqual(NOT_PLAYED);
});

it('supports entering IN_PROGRESS matchUpStatus', () => {
  const drawProfiles = [{ drawSize: 8 }];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({ drawProfiles });

  const { upcomingMatchUps } = tournamentEngine.setState(tournamentRecord).drawMatchUps({ drawId });
  const matchUpId = upcomingMatchUps[0].matchUpId;

  const result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: IN_PROGRESS },
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const { matchUp } = tournamentEngine.findMatchUp({ drawId, matchUpId });
  expect(matchUp.matchUpStatus).toEqual(IN_PROGRESS);
});

it('supports entering AWAITING_RESULT matchUpStatus', () => {
  const drawProfiles = [{ drawSize: 8 }];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({ drawProfiles });

  const { upcomingMatchUps } = tournamentEngine.setState(tournamentRecord).drawMatchUps({ drawId });
  const matchUpId = upcomingMatchUps[0].matchUpId;

  const result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: AWAITING_RESULT },
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const { matchUp } = tournamentEngine.findMatchUp({ drawId, matchUpId });
  expect(matchUp.matchUpStatus).toEqual(AWAITING_RESULT);
});
