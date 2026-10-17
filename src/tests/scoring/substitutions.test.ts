import { ScoringEngine } from '@Assemblies/governors/scoreGovernor';
import { describe, it, expect } from 'vitest';

describe('Substitutions', () => {
  describe('SINGLES substitution', () => {
    it('tracks activePlayers on points after setLineUp', () => {
      const engine = new ScoringEngine({
        matchUpFormat: 'SET7XA-S:T10P',
      });

      // 3-player roster per side (SINGLES: first participant is active)
      engine.setLineUp(1, [{ participantId: 'A1' }, { participantId: 'A2' }, { participantId: 'A3' }]);
      engine.setLineUp(2, [{ participantId: 'B1' }, { participantId: 'B2' }, { participantId: 'B3' }]);

      // Play a point — activePlayers should reflect current lineUp
      engine.addPoint({ winner: 0 });
      const points = engine.getState().history!.points;
      expect(points[0].activePlayers).toBeDefined();
      // SINGLES mode: [string, string] - first participant from each side
      expect(points[0].activePlayers![0]).toBe('A1');
      expect(points[0].activePlayers![1]).toBe('B1');
    });

    it('substitutes a player and activePlayers reflect change', () => {
      const engine = new ScoringEngine({
        matchUpFormat: 'SET7XA-S:T10P',
      });

      engine.setLineUp(1, [{ participantId: 'A1' }]);
      engine.setLineUp(2, [{ participantId: 'B1' }]);

      // Point before substitution
      engine.addPoint({ winner: 0 });

      // Substitute A1 -> A2
      engine.substitute({
        sideNumber: 1,
        outParticipantId: 'A1',
        inParticipantId: 'A2',
      });

      // Point after substitution
      engine.addPoint({ winner: 1 });

      const points = engine.getState().history!.points;
      // Before sub: A1
      expect(points[0].activePlayers![0]).toBe('A1');
      // After sub: A2
      expect(points[1].activePlayers![0]).toBe('A2');
    });

    it('records substitution event in history', () => {
      const engine = new ScoringEngine({
        matchUpFormat: 'SET7XA-S:T10P',
      });

      engine.setLineUp(1, [{ participantId: 'A1' }]);
      engine.setLineUp(2, [{ participantId: 'B1' }]);

      engine.addPoint({ winner: 0 });
      engine.substitute({
        sideNumber: 1,
        outParticipantId: 'A1',
        inParticipantId: 'A2',
      });

      const history = engine.getState().history!;
      expect(history.substitutions).toBeDefined();
      expect(history.substitutions!.length).toBe(1);
      expect(history.substitutions![0].outParticipantId).toBe('A1');
      expect(history.substitutions![0].inParticipantId).toBe('A2');
      expect(history.substitutions![0].sideNumber).toBe(1);
      expect(history.substitutions![0].beforePointIndex).toBe(1); // Before point index 1
    });

    it('records substitution entry in timeline', () => {
      const engine = new ScoringEngine({
        matchUpFormat: 'SET7XA-S:T10P',
      });

      engine.setLineUp(1, [{ participantId: 'A1' }]);
      engine.setLineUp(2, [{ participantId: 'B1' }]);

      engine.addPoint({ winner: 0 });
      engine.substitute({
        sideNumber: 1,
        outParticipantId: 'A1',
        inParticipantId: 'A2',
      });

      const entries = engine.getState().history!.entries!;
      expect(entries.length).toBe(2); // point + substitution
      expect(entries[1].type).toBe('substitution');
    });
  });

  describe('DOUBLES substitution', () => {
    it('tracks activePlayers for doubles', () => {
      const engine = new ScoringEngine({
        matchUpFormat: 'SET7XA-S:T10P',
        isDoubles: true,
      });

      engine.setLineUp(1, [{ participantId: 'A1' }, { participantId: 'A2' }]);
      engine.setLineUp(2, [{ participantId: 'B1' }, { participantId: 'B2' }]);

      engine.addPoint({ winner: 0 });
      const points = engine.getState().history!.points;
      // Doubles mode: returns arrays per side
      expect(points[0].activePlayers).toEqual([
        ['A1', 'A2'],
        ['B1', 'B2'],
      ]);
    });

    it('substitute one doubles player', () => {
      const engine = new ScoringEngine({
        matchUpFormat: 'SET7XA-S:T10P',
        isDoubles: true,
      });

      // the lineUp is the players on court; A3, the reserve, comes on from the bench
      engine.setLineUp(1, [{ participantId: 'A1' }, { participantId: 'A2' }]);
      engine.setLineUp(2, [{ participantId: 'B1' }, { participantId: 'B2' }]);

      engine.addPoint({ winner: 0 });

      // Sub A2 -> A3
      engine.substitute({
        sideNumber: 1,
        outParticipantId: 'A2',
        inParticipantId: 'A3',
      });

      engine.addPoint({ winner: 1 });
      const points = engine.getState().history!.points;
      // After sub: A1, A3 (A2 replaced by A3)
      expect(points[1].activePlayers).toEqual([
        ['A1', 'A3'],
        ['B1', 'B2'],
      ]);
    });
  });

  describe('Undo substitution', () => {
    it('undo reverses lineUp change', () => {
      const engine = new ScoringEngine({
        matchUpFormat: 'SET7XA-S:T10P',
      });

      engine.setLineUp(1, [{ participantId: 'A1' }]);
      engine.setLineUp(2, [{ participantId: 'B1' }]);

      engine.addPoint({ winner: 0 });
      engine.substitute({
        sideNumber: 1,
        outParticipantId: 'A1',
        inParticipantId: 'A2',
      });

      // Before undo: lineUp has A2
      expect(engine.getActivePlayers().side1).toEqual(['A2']);

      // Undo the substitution
      engine.undo();

      // After undo: lineUp restored to A1
      expect(engine.getActivePlayers().side1).toEqual(['A1']);
    });

    it('undo multiple actions including substitution', () => {
      const engine = new ScoringEngine({
        matchUpFormat: 'SET7XA-S:T10P',
      });

      engine.setLineUp(1, [{ participantId: 'A1' }]);
      engine.setLineUp(2, [{ participantId: 'B1' }]);

      engine.addPoint({ winner: 0 }); // entry 1
      engine.substitute({
        // entry 2
        sideNumber: 1,
        outParticipantId: 'A1',
        inParticipantId: 'A2',
      });
      engine.addPoint({ winner: 1 }); // entry 3

      // Undo all 3
      engine.undo(3);

      expect(engine.getActivePlayers().side1).toEqual(['A1']);
      expect(engine.getScore().sets.length).toBe(0);
    });
  });

  describe('Without lineUp', () => {
    it('no activePlayers when lineUp not set', () => {
      const engine = new ScoringEngine({
        matchUpFormat: 'SET7XA-S:T10P',
      });

      engine.addPoint({ winner: 0 });
      const points = engine.getState().history!.points;
      expect(points[0].activePlayers).toBeUndefined();
    });

    it('substitute is no-op without lineUp', () => {
      const engine = new ScoringEngine({
        matchUpFormat: 'SET7XA-S:T10P',
      });

      // Should not throw, just no-op
      engine.substitute({
        sideNumber: 1,
        outParticipantId: 'A1',
        inParticipantId: 'A2',
      });

      // No substitution recorded
      expect(engine.getState().history?.substitutions).toBeUndefined();
    });
  });

  describe('getActivePlayers', () => {
    it('returns empty arrays when no lineUp', () => {
      const engine = new ScoringEngine({
        matchUpFormat: 'SET7XA-S:T10P',
      });

      const active = engine.getActivePlayers();
      expect(active.side1).toEqual([]);
      expect(active.side2).toEqual([]);
    });

    it('returns current lineUp participant IDs', () => {
      const engine = new ScoringEngine({
        matchUpFormat: 'SET7XA-S:T10P',
      });

      engine.setLineUp(1, [{ participantId: 'A1' }, { participantId: 'A2' }]);

      const active = engine.getActivePlayers();
      expect(active.side1).toEqual(['A1', 'A2']);
      expect(active.side2).toEqual([]);
    });
  });
});
