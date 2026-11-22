import { setOutcomePipeline } from '@Global/state/globalState';
import engine from '@Engines/syncEngine';
import mocks from '@Assemblies/engines/mock';
import { afterEach, expect, it } from 'vitest';

afterEach(() => setOutcomePipeline('v1'));

it.each(['v1', 'v2', 'differential'] as const)(
  'an explicit TEAM double exit withdraws the line-projected winner in %s',
  (mode) => {
    for (const matchUpStatus of ['DOUBLE_DEFAULT', 'DOUBLE_WALKOVER'] as const) {
      for (const route of ['direct', 'queue-off', 'queue-on']) {
        engine.reset();
        setOutcomePipeline(mode);
        const drawId = 'team-double-exit';
        mocks.generateTournamentRecord({
          drawProfiles: [{ drawId, drawSize: 4, eventType: 'TEAM', tieFormatName: 'DOMINANT_DUO' }],
          nonRandom: 1,
          setState: true,
        });
        expect(engine.generateLineUps({ drawId, attach: true, useDefaultEventRanking: true }).success).toBe(true);
        const matches = () => engine.getEvent({ drawId }).drawDefinition!.structures[0].matchUps!;
        const parent = () => matches().find((m) => m.roundNumber === 1 && m.roundPosition === 2)!;
        const final = () => matches().find((m) => m.matchUpId === parent().winnerMatchUpId)!;
        for (const line of parent().tieMatchUps!.slice(1)) {
          expect(
            engine.setMatchUpStatus({ drawId, matchUpId: line.matchUpId, outcome: { winningSide: 2 } }).success,
          ).toBe(true);
        }
        expect(parent().winningSide).toBe(2);
        expect(final().drawPositions).toEqual([4]);
        const params = { drawId, matchUpId: parent().matchUpId, enableAutoCalc: true, outcome: { matchUpStatus } };
        const result =
          route === 'direct'
            ? engine.setMatchUpStatus(params)
            : engine.executionQueue([{ method: 'setMatchUpStatus', params }], route === 'queue-on');
        expect(result.success).toBe(true);
        expect(parent().matchUpStatus).toBe(matchUpStatus);
        expect(parent().winningSide).toBeUndefined();
        expect(final().drawPositions).toEqual([]);
        expect(final().matchUpStatus).toBe(matchUpStatus === 'DOUBLE_DEFAULT' ? 'DEFAULTED' : 'WALKOVER');
      }
    }
  },
);
