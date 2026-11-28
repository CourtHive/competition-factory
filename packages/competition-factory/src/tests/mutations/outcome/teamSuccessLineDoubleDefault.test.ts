import { generateOutcomeFromScoreString } from '@Scoring/parse/outcomeFromScoreString';
import { resolveTieFormat } from '@courthive/competition-catalogue';
import { setOutcomePipeline } from '@Tests/testHarness/outcomeModes';
import { afterEach, describe, expect, it } from 'vitest';
import { mocksEngine } from '@Assemblies/engines/mock';
import engine from '@Engines/syncEngine';

afterEach(() => setOutcomePipeline('v1'));

describe.each(['DOUBLE_DEFAULT', 'DOUBLE_WALKOVER'] as const)('%s', (matchUpStatus) => {
  it.each(['v1', 'v2', 'differential'] as const)('a double-exit TEAM line has no stored winner (%s)', (mode) => {
    for (const route of ['direct', 'queue-off', 'queue-on']) {
      for (const lineIndex of [0, 1]) {
        engine.reset();
        const drawId = 'synthetic-team-draw';
        const {
          eventIds: [eventId],
        } = mocksEngine.generateTournamentRecord({
          drawProfiles: [
            {
              drawId,
              drawSize: 4,
              drawType: 'SINGLE_ELIMINATION',
              eventType: 'TEAM',
              tieFormat: resolveTieFormat('DOMINANT_DUO'),
            },
          ],
          nonRandom: 1,
          setState: true,
        });
        expect(engine.generateLineUps({ drawId, eventId, attach: true, useDefaultEventRanking: true }).success).toBe(
          true,
        );

        const firstDual = () =>
          engine
            .getEvent({ drawId })
            .drawDefinition!.structures![0].matchUps!.find((matchUp) => matchUp.roundNumber === 1)!;
        const dual = firstDual();
        const lineId = dual.tieMatchUps![lineIndex].matchUpId;
        const line = () => firstDual().tieMatchUps!.find((matchUp) => matchUp.matchUpId === lineId)!;

        const outcome =
          lineIndex === 0
            ? { winningSide: 2 as const }
            : generateOutcomeFromScoreString({ scoreString: '6-2 6-2', winningSide: 2 }).outcome;
        expect(engine.setMatchUpStatus({ drawId, matchUpId: lineId, outcome }).success).toBe(true);
        expect(
          engine.setMatchUpStatus({
            drawId,
            matchUpId: dual.matchUpId,
            outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 },
          }).success,
        ).toBe(true);
        expect(line()).toMatchObject({ matchUpStatus: 'COMPLETED', winningSide: 2 });
        expect(firstDual()).toMatchObject({ matchUpStatus: 'WALKOVER', winningSide: 2 });

        const originalScore = structuredClone(line().score);
        setOutcomePipeline(mode);
        const params = { drawId, matchUpId: lineId, outcome: { matchUpStatus } };
        const result =
          route === 'direct'
            ? engine.setMatchUpStatus(params)
            : engine.executionQueue([{ method: 'setMatchUpStatus', params }], route === 'queue-on');
        expect(result.success).toBe(true);
        expect(line().matchUpStatus).toBe(matchUpStatus);
        expect(line().winningSide).toBeUndefined();
        expect(line().score).toEqual(matchUpStatus === 'DOUBLE_DEFAULT' ? originalScore : {});
        expect(firstDual()).toMatchObject({ matchUpStatus: 'WALKOVER', winningSide: 2 });
      }
    }
  });
});
