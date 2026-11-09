import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { writeModeMatrix } from '@Tests/testHarness/writeModeMatrix';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants and types
import { INVALID_MATCHUP_STATUS, INVALID_SCORE } from '@Constants/errorConditionConstants';
import { COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';
import { AD_HOC } from '@Constants/drawDefinitionConstants';
import type { Score } from '@Types/tournamentTypes';
import { DOUBLES } from '@Constants/eventConstants';

// Preflight before timed rotating profiles are admitted: exercise the ordinary doubles AD_HOC
// outcome paths that activation will reuse, without widening the public profile or saved-round schema.
function setup(matchUpFormat: string) {
  const generated = mocksEngine.generateTournamentRecord({
    nonRandom: 1,
    eventProfiles: [
      {
        eventType: DOUBLES,
        drawProfiles: [{ drawSize: 4, drawType: AD_HOC, automated: true, roundsCount: 1, matchUpFormat }],
      },
    ],
    setState: true,
  });
  expect(generated.success).toBe(true);
  const matches = tournamentEngine.allTournamentMatchUps().matchUps;
  const target = matches.find((matchUp) => matchUp.sides?.every((side) => side.participantId));
  expect(target).toBeDefined();
  return { drawId: target.drawId, matchUpId: target.matchUpId };
}

function score(a: number, b: number): Score {
  return { sets: [{ setNumber: 1, side1Score: a, side2Score: b, ...(a === b ? {} : { winningSide: a > b ? 1 : 2 }) }] };
}

function read(matchUpId: string) {
  return tournamentEngine.allTournamentMatchUps().matchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
}

writeModeMatrix(() => {
  for (const entry of ['setMatchUpStatus', 'setMatchUpState'] as const) {
    describe(entry, () => {
      function write(
        target: { drawId: string; matchUpId: string },
        values: { score: Score; matchUpStatus: string; winningSide?: number },
      ) {
        return entry === 'setMatchUpStatus'
          ? tournamentEngine.setMatchUpStatus({ ...target, outcome: values })
          : tournamentEngine.setMatchUpState({ ...target, ...values });
      }

      it.each(['SET1-S:T15P', 'SET1-S:T15P/TB1'])('retains explicit live and completed scores under %s', (format) => {
        const target = setup(format);
        const live = score(11, 8);
        delete live.sets![0].winningSide;
        expect(write(target, { matchUpStatus: IN_PROGRESS, score: live }).success).toBe(true);
        expect(read(target.matchUpId).matchUpStatus).toBe(IN_PROGRESS);
        expect(write(target, { matchUpStatus: COMPLETED, winningSide: 1, score: score(11, 8) }).success).toBe(true);
        expect(read(target.matchUpId)).toMatchObject({
          matchUpStatus: COMPLETED,
          winningSide: 1,
          score: { sets: [{ side1Score: 11, side2Score: 8 }] },
        });
        // A correction after completion remains a sporting result with the new winner.
        expect(write(target, { matchUpStatus: COMPLETED, winningSide: 2, score: score(8, 11) }).success).toBe(true);
        expect(read(target.matchUpId)).toMatchObject({ matchUpStatus: COMPLETED, winningSide: 2 });
      });

      it('retains a completed ALLOW tie without naming a winner', () => {
        const target = setup('SET1-S:T15P');
        expect(write(target, { matchUpStatus: COMPLETED, score: score(9, 9) }).success).toBe(true);
        expect(read(target.matchUpId).matchUpStatus).toBe(COMPLETED);
        expect(read(target.matchUpId).winningSide).toBeUndefined();
        expect(read(target.matchUpId).score.sets[0]).toMatchObject({ side1Score: 9, side2Score: 9 });
      });

      it.each(['SET1-S:T15P', 'SET1-S:T15P/TB1'])('refuses a completed 0–0 atomically under %s', (format) => {
        const target = setup(format);
        const before = structuredClone(tournamentEngine.getTournament().tournamentRecord);
        expect([INVALID_SCORE, INVALID_MATCHUP_STATUS]).toContain(
          write(target, { matchUpStatus: COMPLETED, score: score(0, 0) }).error,
        );
        expect(tournamentEngine.getTournament().tournamentRecord).toEqual(before);
      });

      it('refuses a tied completed DECIDING_POINT result without changing the record', () => {
        const target = setup('SET1-S:T15P/TB1');
        const before = structuredClone(tournamentEngine.getTournament().tournamentRecord);
        expect(write(target, { matchUpStatus: COMPLETED, score: score(9, 9) }).error).toBeDefined();
        expect(tournamentEngine.getTournament().tournamentRecord).toEqual(before);
      });

      it('refuses a completed winner that contradicts the score without changing the record', () => {
        const target = setup('SET1-S:T15P');
        const before = structuredClone(tournamentEngine.getTournament().tournamentRecord);
        expect(write(target, { matchUpStatus: COMPLETED, winningSide: 2, score: score(11, 8) }).error).toBeDefined();
        expect(tournamentEngine.getTournament().tournamentRecord).toEqual(before);
      });

      it('accepts equivalent manual and scorer-produced deciding-point results', () => {
        const matchUpFormat = 'SET1-S:T15P/TB1';
        const scorer = new ScoringEngine({ matchUpFormat });
        for (let index = 0; index < 10; index++) {
          scorer.addPoint({ winner: 0 });
          scorer.addPoint({ winner: 1 });
        }
        scorer.endSegment();
        expect(scorer.getState().matchUpStatus).toBe(IN_PROGRESS);
        scorer.addPoint({ winner: 0 });
        const state = scorer.getState();
        expect(state.matchUpStatus).toBe(COMPLETED);
        for (const result of [score(11, 10), state.score]) {
          const target = setup(matchUpFormat);
          expect(write(target, { matchUpStatus: COMPLETED, winningSide: 1, score: result }).success).toBe(true);
          const stored = read(target.matchUpId);
          expect(stored).toMatchObject({ matchUpStatus: COMPLETED, winningSide: 1 });
          expect(stored.score.sets[0]).toMatchObject({ side1Score: 11, side2Score: 10 });
          expect(stored.score.overtime).toBeUndefined();
          // A real persistence round trip must retain the scores activation will tally.
          const wire = JSON.stringify(tournamentEngine.getTournament().tournamentRecord);
          const restored = JSON.parse(wire);
          expect(tournamentEngine.setState(restored).success).toBe(true);
          expect(read(target.matchUpId).score.sets[0]).toMatchObject({ side1Score: 11, side2Score: 10 });
        }
      });
    });
  }
});
