import { afterEach, expect, it } from 'vitest';
import engine from '@Engines/syncEngine';
import mocks from '@Assemblies/engines/mock';
import { setOutcomePipeline, getTournamentRecords } from '@Global/state/globalState';
import { matchUpsOf } from '@Helpers/drawTopology/structureMembers';
import type { Tournament, MatchUpStatusUnion } from '@Types/tournamentTypes';

const drawId = 'retally';
const draw = () => (Object.values(getTournamentRecords())[0] as Tournament).events![0].drawDefinitions![0];
const matches = () => matchUpsOf(draw().structures![0])!;
afterEach(() => setOutcomePipeline('v1'));

for (const prior of [
  'double exit',
  'opposite winner',
  'decided line',
  'occupied destination',
  'missing source positions',
] as const) {
  it.each(['v1', 'v2', 'differential'] as const)(
    '%s seats the retallied dual winner after a line update over ' + prior,
    (mode) => {
      setOutcomePipeline('v1');
      mocks.generateTournamentRecord({
        drawProfiles: [{ drawId, drawSize: 4, eventType: 'TEAM', tieFormatName: 'DOMINANT_DUO' }],
        nonRandom: 1,
        setState: true,
      });
      expect(engine.generateLineUps({ drawId, attach: true, useDefaultEventRanking: true }).success).toBe(true);
      const [semi, other] = matches();
      const [fresh, ...singles] = semi.tieMatchUps!;
      const award = (matchUpId: string, matchUpStatus: MatchUpStatusUnion, winningSide?: number) =>
        engine.setMatchUpStatus({
          drawId,
          matchUpId,
          outcome: { matchUpStatus, winningSide },
          allowChangePropagation: true,
        });
      if (prior === 'decided line') expect(award(fresh.matchUpId, 'WALKOVER', 2).success).toBe(true);
      for (const line of singles) expect(award(line.matchUpId, 'WALKOVER', 1).success).toBe(true);
      if (prior !== 'double exit') expect(award(other.matchUpId, 'COMPLETED', 2).success).toBe(true);
      expect(award(semi.matchUpId, 'DOUBLE_WALKOVER').success).toBe(true);
      if (prior !== 'double exit') expect(award(semi.matchUpId, 'COMPLETED', 2).success).toBe(true);
      if (prior === 'occupied destination') matches()[2].drawPositions = [3, 4];
      if (prior === 'missing source positions') delete semi.drawPositions;
      const initial = structuredClone(Object.values(getTournamentRecords())[0] as Tournament);
      for (const route of ['direct', 'queueOff', 'queueOn']) {
        engine.setState(structuredClone(initial));
        setOutcomePipeline(mode);
        const params = {
          drawId,
          matchUpId: fresh.matchUpId,
          outcome: {
            matchUpStatus:
              prior !== 'double exit' && prior !== 'decided line'
                ? ('DOUBLE_DEFAULT' as const)
                : ('TO_BE_PLAYED' as const),
          },
        };
        const before = JSON.stringify(getTournamentRecords());
        const result =
          route === 'direct'
            ? engine.setMatchUpStatus(params)
            : engine.executionQueue([{ method: 'setMatchUpStatus', params }], route === 'queueOn');
        if (prior === 'occupied destination' || prior === 'missing source positions') {
          expect(result.error?.code).toBe(
            prior === 'occupied destination' ? 'ERR_EXISTING_POSITION_ASSIGNMENT' : 'ERR_MISSING_DRAW_POSITIONS',
          );
          expect(JSON.stringify(getTournamentRecords())).toBe(before);
          continue;
        }
        expect(result.success).toBe(true);
        const [updated, , final] = matches();
        expect(updated.winningSide).toBe(1);
        expect(final.drawPositions).toEqual(prior !== 'double exit' ? [1, 4] : [1]);
        expect(engine.getDrawInconsistencies({ drawId }).inconsistencies).toEqual([]);
      }
    },
  );
}
