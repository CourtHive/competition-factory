import { drawTypes, setupTimedPlayoff, timedScore } from './timedTeamPlayoff';
import { resolveTieFormat } from '@courthive/competition-catalogue';
import { setOutcomePipeline } from '@Tests/testHarness/outcomeModes';
import { afterEach, describe, expect, it } from 'vitest';
import mocks from '@Assemblies/engines/mock';
import engine from '@Engines/syncEngine';

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
          drawProfiles: [{ drawId, drawSize: 4, eventType: 'TEAM', tieFormat: resolveTieFormat('DOMINANT_DUO') }],
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

describe.each(drawTypes)('%s', (drawType) => {
  it.each(['v1', 'v2', 'differential'] as const)(
    'withdraws the INTENNSE finalist after seven timed BOLTs and a whole-dual double default in %s',
    (mode) => {
      const { drawId, matches } = setupTimedPlayoff(drawType);
      const [source] = matches();
      expect(source.tieMatchUps).toHaveLength(7);
      for (const line of source.tieMatchUps!) {
        expect(engine.setMatchUpStatus({ drawId, matchUpId: line.matchUpId, outcome: timedScore(line) }).success).toBe(
          true,
        );
      }
      const [qualified, , final] = matches();
      expect(qualified).toMatchObject({ winningSide: 2, score: { scoreStringSide1: '121-165' } });
      const hydrated = engine.allTournamentMatchUps().matchUps.find((m) => m.matchUpId === qualified.matchUpId)!;
      const winner = hydrated.sides!.find((side) => side.sideNumber === qualified.winningSide)!;
      expect(winner.participantId).toBeTruthy();
      expect(final.drawPositions).toEqual([winner.drawPosition]);
      const record = structuredClone(engine.getTournament().tournamentRecord!);
      setOutcomePipeline(mode);
      for (const route of ['direct', 'queue-off', 'queue-on']) {
        expect(engine.setState(structuredClone(record)).success).toBe(true);
        const params = {
          drawId,
          matchUpId: source.matchUpId,
          enableAutoCalc: true,
          outcome: { matchUpStatus: 'DOUBLE_DEFAULT' as const },
        };
        const result =
          route === 'direct'
            ? engine.setMatchUpStatus(params)
            : engine.executionQueue([{ method: 'setMatchUpStatus', params }], route === 'queue-on');
        expect(result.success).toBe(true);
        const [semi, , next] = matches();
        expect(semi.matchUpStatus).toBe('DOUBLE_DEFAULT');
        expect(semi.winningSide).toBeUndefined();
        expect(semi.score?.scoreStringSide1).toBe('121-165');
        expect(next.drawPositions).toEqual([]);
        expect(next.matchUpStatus).toBe('DEFAULTED');
      }
    },
  );
});
