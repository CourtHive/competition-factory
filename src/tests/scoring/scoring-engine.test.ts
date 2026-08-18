import { competitionFormat, PointMultiplier } from '@Assemblies/governors/scoreGovernor';
import { ScoringEngine } from '@Assemblies/governors/scoreGovernor';
import { describe, it, expect } from 'vitest';

const INTENNSE_STANDARD: competitionFormat = {
  competitionFormatName: 'INTENNSE_STANDARD',
  matchUpFormat: 'SET7XA-S:T10P',
  sport: 'INTENNSE',
  timerProfile: {
    shotClockSeconds: 14,
    segmentTimers: [{ segmentType: 'set', minutes: 10, direction: 'down' }],
    changeoverSeconds: 0,
    setBreakSeconds: 120,
  },
  timeoutRules: { count: 5, per: 'MATCHUP', durationSeconds: 60 },
  substitutionRules: {
    allowed: true,
    allowedMatchUpTypes: ['SINGLES', 'DOUBLES'],
    timing: 'BETWEEN_POINTS',
  },
  playerRules: {
    maxMinutesPerSegment: 6,
    matchUpTypes: ['SINGLES'],
  },
  penaltyProfile: {
    sport: 'INTENNSE',
    penaltyTypes: [
      { penaltyType: 'UNSPORTSMANLIKE_CONDUCT', label: 'Unsportsmanlike', category: 'conduct' },
      { penaltyType: 'BALL_ABUSE', label: 'Ball Abuse', category: 'conduct' },
      { penaltyType: 'RACKET_ABUSE', label: 'Racket Abuse', category: 'conduct' },
    ],
    escalation: [
      { step: 1, consequence: 'warning' },
      { step: 2, consequence: 'point' },
      { step: 3, consequence: 'game' },
      { step: 4, consequence: 'default' },
    ],
  },
  pointProfile: {
    sport: 'INTENNSE',
    pointResults: [
      { result: 'Ace', label: 'Ace', isServe: true },
      { result: 'Winner', label: 'Winner' },
      { result: 'Serve Winner', label: 'Serve Winner', isServe: true },
      { result: 'Forced Error', label: 'Forced Error', isError: true },
      { result: 'Unforced Error', label: 'Unforced Error', isError: true },
      { result: 'Double Fault', label: 'Double Fault', isServe: true, isError: true },
      { result: 'Touch', label: 'Touch' },
      { result: 'Penalty', label: 'Penalty' },
    ],
  },
  pointMultipliers: [
    { condition: { results: ['Ace'] }, value: 2 },
    { condition: { results: ['Winner'] }, value: 2 },
  ],
};

describe('ScoringEngine with competitionFormat', () => {
  describe('Construction', () => {
    it('extracts matchUpFormat from competitionFormat', () => {
      const engine = new ScoringEngine({
        competitionFormat: INTENNSE_STANDARD,
      });

      expect(engine.getFormat()).toBe('SET7XA-S:T10P');
    });

    it('matchUpFormat option overrides competitionFormat.matchUpFormat', () => {
      const engine = new ScoringEngine({
        competitionFormat: INTENNSE_STANDARD,
        matchUpFormat: 'SET3-S:TB11',
      });

      expect(engine.getFormat()).toBe('SET3-S:TB11');
    });

    it('extracts pointMultipliers from competitionFormat', () => {
      const engine = new ScoringEngine({
        competitionFormat: INTENNSE_STANDARD,
      });

      expect(engine.getPointMultipliers()).toEqual(INTENNSE_STANDARD.pointMultipliers);
    });

    it('standalone pointMultipliers override competitionFormat multipliers', () => {
      const overrideMultipliers: PointMultiplier[] = [{ condition: { results: ['Ace'] }, value: 5 }];

      const engine = new ScoringEngine({
        competitionFormat: INTENNSE_STANDARD,
        pointMultipliers: overrideMultipliers,
      });

      expect(engine.getPointMultipliers()).toEqual(overrideMultipliers);
    });
  });

  describe('Profile getters', () => {
    it('returns penalty profile', () => {
      const engine = new ScoringEngine({
        competitionFormat: INTENNSE_STANDARD,
      });

      const profile = engine.getPenaltyProfile();
      expect(profile).toBeDefined();
      expect(profile!.sport).toBe('INTENNSE');
      expect(profile!.penaltyTypes.length).toBe(3);
      expect(profile!.escalation!.length).toBe(4);
    });

    it('returns point profile', () => {
      const engine = new ScoringEngine({
        competitionFormat: INTENNSE_STANDARD,
      });

      const profile = engine.getPointProfile();
      expect(profile).toBeDefined();
      expect(profile!.pointResults.length).toBe(8);
      expect(profile!.pointResults.find((p) => p.result === 'Ace')?.isServe).toBe(true);
    });

    it('returns timer profile', () => {
      const engine = new ScoringEngine({
        competitionFormat: INTENNSE_STANDARD,
      });

      const profile = engine.getTimerProfile();
      expect(profile).toBeDefined();
      expect(profile!.shotClockSeconds).toBe(14);
      expect(profile!.segmentTimers![0].minutes).toBe(10);
    });

    it('returns timeout rules', () => {
      const engine = new ScoringEngine({
        competitionFormat: INTENNSE_STANDARD,
      });

      const rules = engine.getTimeoutRules();
      expect(rules).toBeDefined();
      expect(rules!.count).toBe(5);
      expect(rules!.per).toBe('MATCHUP');
    });

    it('returns substitution rules', () => {
      const engine = new ScoringEngine({
        competitionFormat: INTENNSE_STANDARD,
      });

      const rules = engine.getSubstitutionRules();
      expect(rules).toBeDefined();
      expect(rules!.allowed).toBe(true);
      expect(rules!.maxPerMatchUp).toBeUndefined(); // Omitted = unlimited
      expect(rules!.timing).toBe('BETWEEN_POINTS');
    });

    it('returns player rules', () => {
      const engine = new ScoringEngine({
        competitionFormat: INTENNSE_STANDARD,
      });

      const rules = engine.getPlayerRules();
      expect(rules).toBeDefined();
      expect(rules!.maxMinutesPerSegment).toBe(6);
      expect(rules!.matchUpTypes).toEqual(['SINGLES']);
    });

    it('returns undefined for profiles without competitionFormat', () => {
      const engine = new ScoringEngine({
        matchUpFormat: 'SET3-S:6/TB7',
      });

      expect(engine.getPenaltyProfile()).toBeUndefined();
      expect(engine.getPointProfile()).toBeUndefined();
      expect(engine.getTimerProfile()).toBeUndefined();
      expect(engine.getTimeoutRules()).toBeUndefined();
      expect(engine.getSubstitutionRules()).toBeUndefined();
      expect(engine.getPlayerRules()).toBeUndefined();
    });
  });

  describe('Point multipliers from competitionFormat', () => {
    it('Ace scores 2 in INTENNSE', () => {
      const engine = new ScoringEngine({
        competitionFormat: INTENNSE_STANDARD,
      });

      engine.addPoint({ winner: 0, result: 'Ace' });
      expect(engine.getScore().sets[0].side1Score).toBe(2);
    });

    it('normal point scores 1 in INTENNSE', () => {
      const engine = new ScoringEngine({
        competitionFormat: INTENNSE_STANDARD,
      });

      engine.addPoint({ winner: 0, result: 'Unforced Error' });
      expect(engine.getScore().sets[0].side1Score).toBe(1);
    });
  });

  describe('AddPointOptions extensions', () => {
    it('addPoint with result stores it on the point', () => {
      const engine = new ScoringEngine({
        competitionFormat: INTENNSE_STANDARD,
      });

      engine.addPoint({ winner: 0, result: 'Ace' });
      const point = engine.getState().history!.points[0];
      expect(point.result).toBe('Ace');
    });

    it('addPoint with penaltyType stores it on the point', () => {
      const engine = new ScoringEngine({
        competitionFormat: INTENNSE_STANDARD,
      });

      engine.addPoint({
        winner: 1,
        result: 'Penalty',
        penaltyType: 'SHOT_CLOCK_VIOLATION',
        penaltyPoint: true,
      });

      const point = engine.getState().history!.points[0];
      expect((point as any).penaltyType).toBe('SHOT_CLOCK_VIOLATION');
      expect(point.penaltyPoint).toBe(true);
    });
  });

  describe('Backward compatibility', () => {
    it('ScoringEngine without competitionFormat works as before', () => {
      const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
      engine.addPoint({ winner: 0 });
      engine.addPoint({ winner: 0 });
      engine.addPoint({ winner: 0 });
      engine.addPoint({ winner: 0 }); // Game won
      expect(engine.getScore().sets[0].side1Score).toBe(1);
    });

    it('getInputMode still works', () => {
      const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
      expect(engine.getInputMode()).toBe('none');
      engine.addPoint({ winner: 0 });
      expect(engine.getInputMode()).toBe('points');
    });
  });

  describe('INTENNSE end-to-end', () => {
    it('plays a short INTENNSE segment with multipliers and substitution', () => {
      const engine = new ScoringEngine({
        competitionFormat: INTENNSE_STANDARD,
      });

      // Set lineUps
      engine.setLineUp(1, [{ participantId: 'P1' }, { participantId: 'P2' }, { participantId: 'P3' }]);
      engine.setLineUp(2, [{ participantId: 'Q1' }, { participantId: 'Q2' }, { participantId: 'Q3' }]);

      // Play some points in segment 1
      engine.addPoint({ winner: 0, result: 'Ace' }); // +2
      engine.addPoint({ winner: 1 }); // +1
      engine.addPoint({ winner: 0, result: 'Winner' }); // +2
      engine.addPoint({ winner: 1, result: 'Ace' }); // +2

      let score = engine.getScore();
      expect(score.sets[0].side1Score).toBe(4); // 2+2
      expect(score.sets[0].side2Score).toBe(3); // 1+2

      // Substitute P1 -> P3
      engine.substitute({
        sideNumber: 1,
        outParticipantId: 'P1',
        inParticipantId: 'P3',
      });

      // Verify lineUp changed
      expect(engine.getActivePlayers().side1).toContain('P3');
      expect(engine.getActivePlayers().side1).not.toContain('P1');

      // Play more points
      engine.addPoint({ winner: 0 }); // +1
      score = engine.getScore();
      expect(score.sets[0].side1Score).toBe(5);

      // End segment
      engine.endSegment();
      score = engine.getScore();
      expect(score.sets[0].winningSide).toBe(1); // Side 1 won (5-3)

      // Profile getters work
      expect(engine.getPenaltyProfile()!.penaltyTypes.length).toBe(3);
      expect(engine.getPointProfile()!.pointResults.length).toBe(8);
      expect(engine.getTimerProfile()!.shotClockSeconds).toBe(14);
      expect(engine.getPlayerRules()!.maxMinutesPerSegment).toBe(6);
    });
  });
});
