import intennseFormat from '@Fixtures/scoring/tieFormats/INTENNSE_2026.json';
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

it.each(['v1', 'v2', 'differential'] as const)(
  'withdraws the INTENNSE finalist after seven timed BOLTs and a whole-dual double default in %s',
  (mode) => {
    engine.reset();
    setOutcomePipeline('v1');
    const drawId = 'intennse-playoff';
    mocks.generateTournamentRecord({
      participantsProfile: { participantsCount: 0 },
      drawProfiles: [
        {
          drawId,
          drawSize: 4,
          eventType: 'TEAM',
          teamGenders: { MALE: 3, FEMALE: 3 },
          tieFormat: structuredClone(intennseFormat),
        },
      ],
      nonRandom: 2027,
      setState: true,
    });
    expect(engine.generateLineUps({ drawId, attach: true, useDefaultEventRanking: true }).success).toBe(true);
    const matches = () =>
      engine.getTournament().tournamentRecord!.events![0].drawDefinitions![0].structures[0].matchUps!;
    const [source] = matches();
    expect(source.tieMatchUps).toHaveLength(7);
    for (const line of source.tieMatchUps!) {
      const periods = line.matchUpType === 'SINGLES' ? 2 : 1;
      const sets = Array.from({ length: periods }, (_, i) => ({
        setNumber: i + 1,
        side1Score: 11,
        side2Score: 15,
        winningSide: 2 as const,
      }));
      const score = {
        sets,
        scoreStringSide1: Array(periods).fill('11-15').join(' '),
        scoreStringSide2: Array(periods).fill('15-11').join(' '),
      };
      expect(
        engine.setMatchUpStatus({ drawId, matchUpId: line.matchUpId, outcome: { winningSide: 2, score } }).success,
      ).toBe(true);
    }
    const [qualified, , final] = matches();
    expect(qualified.winningSide).toBe(2);
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
      expect(next.drawPositions).toEqual([]);
      expect(next.matchUpStatus).toBe('DEFAULTED');
    }
  },
);
