import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import {
  INVALID_VALUES,
  MATCHUP_NOT_FOUND,
  MISSING_MATCHUP,
  MISSING_MATCHUP_ID,
  MISSING_VALUE,
} from '@Constants/errorConditionConstants';

it('attached delegated outcomes to matchUps', () => {
  const drawSize = 8;
  const drawProfiles = [{ drawSize }];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({ drawProfiles });

  const {
    matchUps: [{ matchUpId }],
  } = tournamentEngine.setState(tournamentRecord).allDrawMatchUps({
    drawId,
  });

  const outcome = {
    score: {
      scoreStringSide1: '6-1 6-1',
      scoreStringSide2: '1-6 1-6',
    },
  };

  // first check all error messages
  let result = tournamentEngine.setDelegatedOutcome({
    outcome,
    drawId,
  });
  expect(result.error).toEqual(MISSING_MATCHUP);
  result = tournamentEngine.setDelegatedOutcome({
    matchUpId,
    drawId,
  });
  expect(result.error).toEqual(MISSING_VALUE);
  result = tournamentEngine.setDelegatedOutcome({
    outcome: 'outcome',
    matchUpId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_VALUES);
  result = tournamentEngine.setDelegatedOutcome({
    outcome: {},
    matchUpId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_VALUES);
  result = tournamentEngine.setDelegatedOutcome({
    outcome: { score: 'string' },
    matchUpId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_VALUES);
  result = tournamentEngine.setDelegatedOutcome({
    outcome: { score: { scoreStringSide1: 'string' } },
    matchUpId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_VALUES);
  result = tournamentEngine.setDelegatedOutcome({
    outcome: { score: { scoreStringSide2: 'string' } },
    matchUpId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_VALUES);
  result = tournamentEngine.setDelegatedOutcome({
    matchUpId: 'bogusId',
    outcome,
    drawId,
  });
  expect(result.error).toEqual(MATCHUP_NOT_FOUND);

  // then set a delegated outcome
  result = tournamentEngine.setDelegatedOutcome({
    matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  const {
    matchUps: [matchUp],
  } = tournamentEngine.allDrawMatchUps({
    inContext: true,
    drawId,
  });

  // delegatedOutcome is first-class in NATIVE, hydrated as `_delegatedOutcome` in LEGACY
  expect(matchUp.delegatedOutcome ?? matchUp._delegatedOutcome).toEqual(outcome);

  result = tournamentEngine.removeDelegatedOutcome({ drawId });
  expect(result.error).toEqual(MISSING_MATCHUP_ID);

  result = tournamentEngine.removeDelegatedOutcome({
    matchUpId: 'bogusId',
    drawId,
  });
  expect(result.error).toEqual(MATCHUP_NOT_FOUND);

  result = tournamentEngine.removeDelegatedOutcome({ drawId, matchUpId });
  expect(result.success).toEqual(true);

  // attempting to remove something already removed doesn't throw error
  result = tournamentEngine.removeDelegatedOutcome({ drawId, matchUpId });
  expect(result.success).toEqual(true);
});

it('accepts a canonical (sets-based) delegated outcome and derives side strings', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }] });

  const {
    matchUps: [{ matchUpId }],
  } = tournamentEngine.setState(tournamentRecord).allDrawMatchUps({ drawId });

  // Canonical outcome — sets only, no pre-derived score strings.
  const outcome = {
    winningSide: 1,
    score: {
      sets: [
        { setNumber: 1, side1Score: 6, side2Score: 1, winningSide: 1 },
        { setNumber: 2, side1Score: 6, side2Score: 1, winningSide: 1 },
      ],
    },
  };

  let result: any = tournamentEngine.setDelegatedOutcome({ matchUpId, outcome, drawId });
  expect(result.success).toEqual(true);

  const {
    matchUps: [matchUp],
  } = tournamentEngine.allDrawMatchUps({ inContext: true, drawId });

  // The factory derived the per-side strings from sets and stored them.
  // delegatedOutcome is first-class in NATIVE, hydrated as `_delegatedOutcome` in LEGACY
  const delegatedOutcome = matchUp.delegatedOutcome ?? matchUp._delegatedOutcome;
  expect(delegatedOutcome.score.scoreStringSide1).toEqual('6-1 6-1');
  expect(delegatedOutcome.score.scoreStringSide2).toEqual('1-6 1-6');
  // The canonical sets are preserved.
  expect(delegatedOutcome.score.sets).toHaveLength(2);
});
