import { matchUpsOf, positionAssignmentsOf } from '@Helpers/drawTopology/structureMembers';
import { getTournamentRecords, setOutcomePipeline } from '@Global/state/globalState';
import { COMPLETED, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { INTENNSE_2026 } from '@Constants/tieFormatConstants';
import { CANNOT_CHANGE_WINNING_SIDE } from '@Constants/errorConditionConstants';
import type { MatchUp, Tournament } from '@Types/tournamentTypes';
import mocks from '@Assemblies/engines/mock';
import engine from '@Engines/syncEngine';
import { setClock } from '@Tools/clock';
import { afterEach, expect, it } from 'vitest';

const drawId = 'intennse-playoff';

function timedScore(matchUp: MatchUp) {
  const periods = matchUp.matchUpType === 'SINGLES' ? 2 : 1;
  return {
    winningSide: 2,
    score: {
      sets: Array.from({ length: periods }, (_, i) => ({
        setNumber: i + 1,
        side1Score: 11,
        side2Score: 15,
        winningSide: 2,
      })),
      scoreStringSide1: Array(periods).fill('11-15').join(' '),
      scoreStringSide2: Array(periods).fill('15-11').join(' '),
    },
  };
}

afterEach(() => {
  setOutcomePipeline();
  setClock();
});

it.each(['v1', 'v2', 'differential'] as const)(
  '%s preserves the played INTENNSE final when the seventh timed BOLT would reverse its semifinal winner',
  (mode) => {
    setOutcomePipeline('v1');
    setClock('2026-11-01T12:00:00Z');
    mocks.generateTournamentRecord({
      participantsProfile: { participantsCount: 0 },
      drawProfiles: [
        { drawId, drawSize: 4, eventType: 'TEAM', teamGenders: { MALE: 3, FEMALE: 3 }, tieFormatName: INTENNSE_2026 },
      ],
      nonRandom: 2027,
      setState: true,
    });
    expect(engine.generateLineUps({ drawId, attach: true, useDefaultEventRanking: true }).success).toBe(true);
    const record = Object.values(getTournamentRecords())[0] as Tournament;
    const main = record.events![0].drawDefinitions![0].structures![0];
    const [semi, other, final] = matchUpsOf(main)!;
    const occupied = positionAssignmentsOf(main)!.filter((seat) => semi.drawPositions?.includes(seat.drawPosition));
    expect(new Set(occupied.map((seat) => seat.participantId).filter(Boolean)).size).toBe(2);

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
      drawPositions: [1, 4],
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
