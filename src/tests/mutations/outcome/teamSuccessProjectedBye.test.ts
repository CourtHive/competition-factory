import { getTournamentRecords, setOutcomePipeline } from '@Global/state/globalState';
import engine from '@Engines/syncEngine';
import mocks from '@Assemblies/engines/mock';
import { afterEach, expect, it } from 'vitest';

afterEach(() => setOutcomePipeline('v1'));
it.each(['v1', 'v2', 'differential'] as const)('a collection line cannot clinch for a BYE in %s', (mode) => {
  const drawId = 'team-bye';
  for (const fillDestination of [false, true])
    for (const route of ['direct', 'queue-off', 'queue-on']) {
      engine.reset();
      setOutcomePipeline(mode);
      mocks.generateTournamentRecord({
        drawProfiles: [
          {
            drawId,
            drawSize: 8,
            participantsCount: 6,
            eventType: 'TEAM',
            tieFormatName: 'DOMINANT_DUO',
            drawType: 'FIRST_MATCH_LOSER_CONSOLATION',
          },
        ],
        nonRandom: 80,
        setState: true,
      });
      expect(engine.generateLineUps({ drawId, attach: true, useDefaultEventRanking: true }).success).toBe(true);
      const structure = () => engine.getEvent({ drawId }).drawDefinition!.structures.find((s) => s.stage === 'MAIN')!;
      const [parent, adjacent] = structure().matchUps!;
      const byePosition = parent.drawPositions![1];
      expect(structure().positionAssignments!.find((a) => a.drawPosition === byePosition)?.bye).toBe(true);
      const credit = (idx: number, winningSide: 1 | 2) => ({
        drawId,
        matchUpId: parent.tieMatchUps![idx].matchUpId,
        outcome: { matchUpStatus: 'DEFAULTED' as const, winningSide },
      });
      if (!fillDestination) {
        // Seed 289: the adjacent double exit already advanced the occupied team to the final.
        expect(
          engine.setMatchUpStatus({
            drawId,
            matchUpId: adjacent.matchUpId,
            outcome: { matchUpStatus: 'DOUBLE_WALKOVER' },
          }).success,
        ).toBe(true);
      }
      expect(engine.setMatchUpStatus(credit(1, 2)).success).toBe(true);
      if (fillDestination)
        expect(
          engine.setMatchUpStatus({ drawId, matchUpId: adjacent.matchUpId, outcome: { winningSide: 1 } }).success,
        ).toBe(true);
      const onward = structure().matchUps!.find((m) => m.matchUpId === parent.winnerMatchUpId)!;
      expect(onward.drawPositions).toHaveLength(fillDestination ? 2 : 1);
      if (!fillDestination) expect(structure().matchUps!.find((m) => m.roundNumber === 3)!.drawPositions).toEqual([1]);
      const before = JSON.stringify(getTournamentRecords());
      const params = credit(2, 2);
      const result =
        route === 'direct'
          ? engine.setMatchUpStatus(params)
          : engine.executionQueue([{ method: 'setMatchUpStatus', params }], route === 'queue-on');
      expect(result.error?.code).toBe('ERR_INVALID_MATCHUP_STATUS');
      expect(JSON.stringify(getTournamentRecords())).toBe(before);
      // A split tally leaves the BYE unadvanced. The occupied team can still clinch.
      expect(engine.setMatchUpStatus(credit(2, 1)).success).toBe(true);
      expect(engine.setMatchUpStatus(credit(0, 1)).success).toBe(true);
      expect(structure().matchUps![0].winningSide).toBe(1);
    }
});
