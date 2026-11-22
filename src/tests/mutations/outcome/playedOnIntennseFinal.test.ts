import { getTournamentRecords, setOutcomePipeline } from '@Global/state/globalState';
import { drawTypes, setupTimedPlayoff, timedScore } from './timedTeamPlayoff';
import { afterEach, describe, expect, it } from 'vitest';
import engine from '@Engines/syncEngine';
import { setClock } from '@Tools/clock';

// constants and types
import { COMPLETED, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { CANNOT_CHANGE_WINNING_SIDE } from '@Constants/errorConditionConstants';
import type { MatchUp } from '@Types/tournamentTypes';

afterEach(() => {
  setOutcomePipeline();
  setClock();
});

describe.each(drawTypes)('%s', (drawType) => {
  it.each(['v1', 'v2', 'differential'] as const)(
    '%s preserves the played INTENNSE final when the seventh timed BOLT would reverse its semifinal winner',
    (mode) => {
      setClock('2026-11-01T12:00:00Z');
      const { drawId, matches } = setupTimedPlayoff(drawType);
      const [semi, other, final] = matches();
      const set = (matchUp: MatchUp, outcome: Pick<MatchUp, 'winningSide' | 'matchUpStatus' | 'score'>) =>
        engine.setMatchUpStatus({ drawId, matchUpId: matchUp.matchUpId, outcome });
      expect(set(semi, { matchUpStatus: WALKOVER, winningSide: 1 }).success).toBe(true);
      expect(set(other, { winningSide: 2 }).success).toBe(true);
      expect(set(final, { ...timedScore(final), matchUpStatus: RETIRED }).success).toBe(true);
      const lines = semi.tieMatchUps!;
      expect(lines).toHaveLength(7);
      for (const line of lines.slice(0, 6)) {
        expect(set(line, timedScore(line)).success).toBe(true);
        expect(line).toMatchObject({ matchUpStatus: COMPLETED, winningSide: 2 });
      }
      expect(semi.winningSide).toBe(1);
      expect(lines[6].winningSide).toBeUndefined();
      expect(final).toMatchObject({
        matchUpStatus: RETIRED,
        winningSide: 2,
        drawPositions: [semi.drawPositions![0], other.drawPositions![1]],
        score: { scoreStringSide1: '11-15' },
      });

      setClock('2026-11-01T12:01:00Z');
      setOutcomePipeline(mode);
      const before = JSON.stringify(getTournamentRecords());
      const result = set(lines[6], timedScore(lines[6]));
      expect.soft(result.error?.code).toBe(CANNOT_CHANGE_WINNING_SIDE.code);
      expect(JSON.stringify(getTournamentRecords()) === before, 'exact tournament record after refusal').toBe(true);
    },
  );
});
