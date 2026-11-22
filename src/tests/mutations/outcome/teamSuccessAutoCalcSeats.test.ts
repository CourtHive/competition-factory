import { getTournamentRecords, setOutcomePipeline } from '@Global/state/globalState';
import engine from '@Engines/syncEngine';
import mocks from '@Assemblies/engines/mock';
import { afterEach, expect, it } from 'vitest';
afterEach(() => setOutcomePipeline('v1'));
it.each(['v1', 'v2', 'differential'] as const)(
  'a calculated dual winner needs two occupied team seats in %s',
  (mode) => {
    const drawId = 'team-seats';
    for (const shape of ['empty', 'one-team', 'vacant-assignment', 'bye-assignment', 'two-teams'])
      for (const route of ['direct', 'queue-off', 'queue-on']) {
        const arrivals = shape === 'empty' ? 0 : shape === 'one-team' ? 1 : 2;
        engine.reset();
        setOutcomePipeline(mode);
        mocks.generateTournamentRecord({
          drawProfiles: [{ drawId, drawSize: 4, eventType: 'TEAM', tieFormatName: 'DOMINANT_DUO' }],
          nonRandom: 1,
          setState: true,
        });
        const matches = () => engine.getEvent({ drawId }).drawDefinition!.structures[0].matchUps!;
        for (const semi of matches()
          .filter((m) => m.roundNumber === 1)
          .slice(0, arrivals)) {
          expect(
            engine.setMatchUpStatus({ drawId, matchUpId: semi.matchUpId, outcome: { winningSide: 1 } }).success,
          ).toBe(true);
        }
        const record = structuredClone(engine.getTournament().tournamentRecord!);
        const final = record.events![0].drawDefinitions![0].structures[0].matchUps!.find((m) => m.roundNumber === 2)!;
        expect(final.drawPositions).toHaveLength(arrivals);
        if (shape === 'vacant-assignment' || shape === 'bye-assignment') {
          const assigned = record.events![0].drawDefinitions![0].structures[0].positionAssignments!.find(
            (a) => a.drawPosition === final.drawPositions![1],
          )!;
          delete assigned.participantId;
          if (shape === 'bye-assignment') assigned.bye = true;
        }
        for (const line of final.tieMatchUps!.slice(1))
          Object.assign(line, { matchUpStatus: 'COMPLETED', winningSide: 1 });
        expect(engine.setState(record).success).toBe(true);
        const before = JSON.stringify(getTournamentRecords());
        const params = { drawId, matchUpId: final.matchUpId, enableAutoCalc: true, outcome: {} };
        const result =
          route === 'direct'
            ? engine.setMatchUpStatus(params)
            : engine.executionQueue([{ method: 'setMatchUpStatus', params }], route === 'queue-on');
        if (shape === 'two-teams') {
          expect(result.success).toBe(true);
          expect(matches().find((m) => m.matchUpId === final.matchUpId)).toMatchObject({
            matchUpStatus: 'COMPLETED',
            winningSide: 1,
          });
        } else {
          expect(result.error?.code).toBe('ERR_MISSING_ASSIGNMENTS');
          expect(JSON.stringify(getTournamentRecords())).toBe(before);
        }
      }
  },
);
