import INTENNSE_2026_FORMAT from '@Fixtures/scoring/tieFormats/INTENNSE_2026.json';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { COMPLETED, IN_PROGRESS, RETIRED } from '@Constants/matchUpStatusConstants';
import { ROUND_ROBIN, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { INVALID_SCORE } from '@Constants/errorConditionConstants';
import { INTENNSE_2026 } from '@Constants/tieFormatConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';

/**
 * A winner on a level TEAM tie records how it was decided (CA ruling 2026-11-07, TEAM results item 3), as a single
 * matchUp's does: `score.overtime` with `decidedIn: 'EXTERNAL'` and `decidedBy`. INTENNSE 2026 decides a tie by
 * `aggregateValue`; every segment is scored level, so the tie stands 140-140. Each case starts from a fresh record and
 * asserts the stored tie, not only the result.
 */
const decision = { decidedIn: 'EXTERNAL', decidedBy: { method: 'OFFICIAL_DECISION' } };

function playTie(drawType: string, { level }: { level: boolean }) {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, drawType, eventType: TEAM_EVENT, tieFormatName: INTENNSE_2026 }],
    setState: true,
  });
  // a line with a winner needs its players: lineups attached for both teams
  expect(tournamentEngine.generateLineUps({ drawId, attach: true, useDefaultEventRanking: true }).success).toEqual(
    true,
  );
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true });
  const tie = matchUps.find(
    (matchUp) =>
      matchUp.matchUpType === TEAM_MATCHUP && matchUp.roundNumber === 1 && matchUp.sides.every((s) => s.participantId),
  );
  const segments = matchUps.filter(({ matchUpTieId }) => matchUpTieId === tie.matchUpId);
  segments.forEach((segment, index) => {
    const twoSets = segment.matchUpFormat.startsWith('SET2');
    // not level: the first segment goes 21-20, so side 1 leads the aggregate by one
    const lead = !level && index === 0 ? 1 : 0;
    const sets = twoSets
      ? [
          { setNumber: 1, side1Score: 10 + lead, side2Score: 10 },
          { setNumber: 2, side1Score: 10, side2Score: 10 },
        ]
      : [{ setNumber: 1, side1Score: 20 + lead, side2Score: 20 }];
    const result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: COMPLETED, score: { sets }, ...(lead ? { winningSide: 1 } : {}) },
      matchUpId: segment.matchUpId,
      drawId: segment.drawId,
    });
    expect(result.success).toEqual(true);
  });
  return tie;
}

function readTie({ drawId, matchUpId }) {
  return tournamentEngine.findMatchUp({ drawId, matchUpId, inContext: true }).matchUp;
}

function expectUnchanged(tie, drawType: string) {
  const after = readTie(tie);
  expect(after.matchUpStatus).toEqual(drawType === ROUND_ROBIN ? COMPLETED : IN_PROGRESS);
  expect(after.winningSide).toBeUndefined();
  expect(after.score.scoreStringSide1).toEqual('140-140');
  expect(after.score.overtime).toBeUndefined();
}

describe.each([ROUND_ROBIN, SINGLE_ELIMINATION])('%s: a winner on a level TEAM tie', (drawType) => {
  it.each([true, false])('refuses an unrecorded winner (disableAutoCalc: %s)', (disableAutoCalc) => {
    const tie = playTie(drawType, { level: true });
    const result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: COMPLETED, winningSide: 1 },
      matchUpId: tie.matchUpId,
      drawId: tie.drawId,
      disableAutoCalc,
    });
    expect(result.error).toEqual(INVALID_SCORE);
    expectUnchanged(tie, drawType);
  });

  it('refuses an unrecorded winner with no matchUpStatus', () => {
    const tie = playTie(drawType, { level: true });
    const result = tournamentEngine.setMatchUpStatus({
      outcome: { winningSide: 2 },
      matchUpId: tie.matchUpId,
      drawId: tie.drawId,
    });
    expect(result.error).toEqual(INVALID_SCORE);
    expectUnchanged(tie, drawType);
  });

  it.each([true, false])(
    'accepts a recorded winner and keeps the aggregate (disableAutoCalc: %s)',
    (disableAutoCalc) => {
      const tie = playTie(drawType, { level: true });
      const result = tournamentEngine.setMatchUpStatus({
        outcome: { matchUpStatus: COMPLETED, winningSide: 2, score: { overtime: decision } },
        matchUpId: tie.matchUpId,
        drawId: tie.drawId,
        disableAutoCalc,
      });
      expect(result.success).toEqual(true);
      const after = readTie(tie);
      expect(after.matchUpStatus).toEqual(COMPLETED);
      expect(after.winningSide).toEqual(2);
      expect(after.score.scoreStringSide1).toEqual('140-140');
      expect(after.score.overtime.decidedBy).toEqual(decision.decidedBy);
    },
  );

  // the scorecard's Override: a typed team score, always with its sets, under disableAutoCalc
  it('refuses a typed level team score with an unrecorded winner', () => {
    const tie = playTie(drawType, { level: true });
    const result = tournamentEngine.setMatchUpStatus({
      outcome: {
        score: { sets: [{ setNumber: 1, side1Score: 2, side2Score: 2, winningSide: 1 }] },
        matchUpStatus: COMPLETED,
        winningSide: 1,
      },
      matchUpId: tie.matchUpId,
      drawId: tie.drawId,
      disableAutoCalc: true,
    });
    expect(result.error).toEqual(INVALID_SCORE);
    expectUnchanged(tie, drawType);
  });

  it('accepts a typed level team score with its decision', () => {
    const tie = playTie(drawType, { level: true });
    const result = tournamentEngine.setMatchUpStatus({
      outcome: {
        score: { sets: [{ setNumber: 1, side1Score: 2, side2Score: 2, winningSide: 1 }], overtime: decision },
        matchUpStatus: COMPLETED,
        winningSide: 1,
      },
      matchUpId: tie.matchUpId,
      drawId: tie.drawId,
      disableAutoCalc: true,
    });
    expect(result.success).toEqual(true);
    const after = readTie(tie);
    expect(after.winningSide).toEqual(1);
    expect(after.score.sets[0]).toMatchObject({ side1Score: 2, side2Score: 2 });
    expect(after.score.overtime.decidedIn).toEqual('EXTERNAL');
  });

  it.each([
    { reason: 'no decidedBy', overtime: { decidedIn: 'EXTERNAL' } },
    { reason: 'an unknown method', overtime: { decidedIn: 'EXTERNAL', decidedBy: { method: 'COIN' } } },
  ])('refuses a record with $reason', ({ overtime }) => {
    const tie = playTie(drawType, { level: true });
    const result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: COMPLETED, winningSide: 1, score: { overtime } },
      matchUpId: tie.matchUpId,
      drawId: tie.drawId,
    });
    expect(result.error).toEqual(INVALID_SCORE);
    expectUnchanged(tie, drawType);
  });

  it('refuses a record without a winner', () => {
    const tie = playTie(drawType, { level: true });
    const result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: COMPLETED, score: { overtime: decision } },
      matchUpId: tie.matchUpId,
      drawId: tie.drawId,
    });
    expect(result.error).toEqual(INVALID_SCORE);
    expectUnchanged(tie, drawType);
  });

  it('keeps an exit naming its winner', () => {
    const tie = playTie(drawType, { level: true });
    const result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: RETIRED, winningSide: 1 },
      matchUpId: tie.matchUpId,
      drawId: tie.drawId,
      disableAutoCalc: true,
    });
    expect(result.success).toEqual(true);
    expect(readTie(tie)).toMatchObject({ matchUpStatus: RETIRED, winningSide: 1 });
  });
});

describe.each([ROUND_ROBIN, SINGLE_ELIMINATION])('%s: a TEAM tie that is not level', (drawType) => {
  it('is decided by its lines', () => {
    const tie = playTie(drawType, { level: false });
    expect(readTie(tie)).toMatchObject({ matchUpStatus: COMPLETED, winningSide: 1 });
    expect(readTie(tie).score.scoreStringSide1).toEqual('141-140');
  });

  // a manual winner on a tie that is not level is unaffected: disableAutoCalc stays an override there
  it('takes a manual winner without a record', () => {
    const tie = playTie(drawType, { level: false });
    const result = tournamentEngine.setMatchUpStatus({
      outcome: {
        score: { sets: [{ setNumber: 1, side1Score: 1, side2Score: 3, winningSide: 2 }] },
        matchUpStatus: COMPLETED,
        winningSide: 2,
      },
      matchUpId: tie.matchUpId,
      drawId: tie.drawId,
      disableAutoCalc: true,
    });
    expect(result.success).toEqual(true);
    expect(readTie(tie)).toMatchObject({ matchUpStatus: COMPLETED, winningSide: 2 });
  });

  it('refuses a decision record: only a level tie is decided outside its score', () => {
    const tie = playTie(drawType, { level: false });
    const result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: COMPLETED, winningSide: 1, score: { overtime: decision } },
      matchUpId: tie.matchUpId,
      drawId: tie.drawId,
      disableAutoCalc: true,
    });
    expect(result.error).toEqual(INVALID_SCORE);
    const after = readTie(tie);
    expect(after.score.overtime).toBeUndefined();
    expect(after.score.scoreStringSide1).toEqual('141-140');
  });
});

// a tie format whose tally directives break a level total: its lines name the winner, and that winner needs no record
describe('a level total its tally directives decide', () => {
  function directedTie() {
    const tieFormat: any = structuredClone(INTENNSE_2026_FORMAT);
    tieFormat.winCriteria = {
      ...tieFormat.winCriteria,
      tallyDirectives: [{ attribute: 'matchUpsPct', idsFilter: false }],
    };
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, drawType: SINGLE_ELIMINATION, eventType: TEAM_EVENT, tieFormat }],
      setState: true,
    });
    expect(tournamentEngine.generateLineUps({ drawId, attach: true, useDefaultEventRanking: true }).success).toEqual(
      true,
    );
    const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true });
    const tie = matchUps.find(
      (matchUp) =>
        matchUp.matchUpType === TEAM_MATCHUP &&
        matchUp.roundNumber === 1 &&
        matchUp.sides.every((s) => s.participantId),
    );
    // side 1 wins two lines by a point, side 2 one by two: lines 2-1, the aggregate level at 142-142
    const deltas = [1, 1, -2];
    matchUps
      .filter(({ matchUpTieId }) => matchUpTieId === tie.matchUpId)
      .forEach((segment, index) => {
        const delta = deltas[index] ?? 0;
        const base = segment.matchUpFormat.startsWith('SET2') ? 10 : 20;
        const first = { setNumber: 1, side1Score: base + Math.max(delta, 0), side2Score: base + Math.max(-delta, 0) };
        const sets = segment.matchUpFormat.startsWith('SET2')
          ? [first, { setNumber: 2, side1Score: 10, side2Score: 10 }]
          : [first];
        const winningSide = delta ? (delta > 0 ? 1 : 2) : undefined;
        const outcome = { matchUpStatus: COMPLETED, score: { sets }, ...(winningSide ? { winningSide } : {}) };
        const result = tournamentEngine.setMatchUpStatus({ outcome, matchUpId: segment.matchUpId, drawId });
        expect(result.success).toEqual(true);
      });
    return tie;
  }

  it('is decided by its lines on a level aggregate', () => {
    const tie = directedTie();
    const after = readTie(tie);
    expect(after.score.sets[0]).toMatchObject({ side1Score: 142, side2Score: 142 });
    expect(after).toMatchObject({ matchUpStatus: COMPLETED, winningSide: 1 });
  });

  it('takes the winner its lines name without a record, and refuses the other side', () => {
    const tie = directedTie();
    const params = { matchUpId: tie.matchUpId, drawId: tie.drawId, disableAutoCalc: true };
    let result: any = tournamentEngine.setMatchUpStatus({
      ...params,
      outcome: { matchUpStatus: COMPLETED, winningSide: 2 },
    });
    expect(result.error).toEqual(INVALID_SCORE);
    result = tournamentEngine.setMatchUpStatus({ ...params, outcome: { matchUpStatus: COMPLETED, winningSide: 1 } });
    expect(result.success).toEqual(true);
    expect(readTie(tie).winningSide).toEqual(1);
  });
});

// setMatchUpState is public and runs v1 alone, without setMatchUpStatus's own check
describe('setMatchUpState', () => {
  it('refuses an unrecorded winner on a level tie', () => {
    const tie = playTie(SINGLE_ELIMINATION, { level: true });
    const result = tournamentEngine.setMatchUpState({
      matchUpId: tie.matchUpId,
      matchUpStatus: COMPLETED,
      disableAutoCalc: true,
      drawId: tie.drawId,
      winningSide: 1,
    });
    expect(result.error).toEqual(INVALID_SCORE);
    expectUnchanged(tie, SINGLE_ELIMINATION);
  });
});
