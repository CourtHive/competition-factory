import { setStateProvider } from '@Global/state/globalState';
import { getOutcomePipeline, setOutcomePipeline } from '@Global/state/globalState';
import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import syncGlobalState from '@Global/state/syncGlobalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import * as governors from '@Assemblies/governors';
import asyncEngine from '@Engines/asyncEngine';
import * as tools from '@Assemblies/tools';
import { describe, expect, it } from 'vitest';

// constants
import { METHOD_REMOVED } from '@Constants/errorConditionConstants';

/**
 * A NAME REMOVED IN 8.0.0 IS TOLD SO. The outcome pipeline selector (one pipeline in 8.0.0) and `setMatchUpState` (a
 * public route that could refuse after writing) stay callable by name, and every call returns an error result,
 * METHOD_REMOVED, naming what was removed and linking the migration guide. None of them throws.
 */
const removal = (method: string, option?: string) => ({
  error: METHOD_REMOVED,
  context: expect.objectContaining({
    method,
    ...(option ? { option } : {}),
    migration: expect.stringContaining('migration-8.0.0'),
  }),
});

function loaded() {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }], nonRandom: 1 });
  tournamentEngine.setState(tournamentRecord);
  const before = JSON.stringify(tournamentEngine.getTournament().tournamentRecord);
  const matchUpId = tournamentEngine.allDrawMatchUps({ drawId }).matchUps[0].matchUpId;
  return {
    drawId,
    matchUpId,
    before,
    unchanged: () => JSON.stringify(tournamentEngine.getTournament().tournamentRecord) === before,
  };
}

describe('the sync engine', () => {
  it.each([
    ['outcomePipeline', ['v1']],
    ['outcomePipeline', []],
    ['getOutcomePipeline', []],
  ])('%s(%j) returns METHOD_REMOVED', (method, args) => {
    const { unchanged } = loaded();
    let result: any;
    expect(() => (result = (tournamentEngine as any)[method](...args))).not.toThrow();
    expect(result).toMatchObject(removal(method));
    expect(unchanged()).toBe(true);
  });

  it('setMatchUpState returns METHOD_REMOVED and writes nothing', () => {
    const { drawId, matchUpId, unchanged } = loaded();
    const result: any = (tournamentEngine as any).setMatchUpState({ drawId, matchUpId, winningSide: 1 });
    expect(result).toMatchObject(removal('setMatchUpState'));
    expect(result.context.migration).toContain('#engine-and-governor-routes');
    expect(unchanged()).toBe(true);
    expect((governors.matchUpGovernor as any).setMatchUpState).toBeUndefined();
  });

  it.each(['outcomePipeline', 'getOutcomePipeline', 'setMatchUpState'])(
    'a %s directive returns METHOD_REMOVED',
    (method) => {
      const { drawId, matchUpId, unchanged } = loaded();
      const queued: any = tournamentEngine.executionQueue([{ method, params: { drawId, matchUpId, winningSide: 1 } }]);
      expect(queued).toMatchObject(removal(method));
      const invoked: any = tournamentEngine.execute({ method, params: { drawId, matchUpId } });
      expect(invoked).toMatchObject(removal(method));
      expect(unchanged()).toBe(true);
    },
  );
});

describe('the async engine', () => {
  it.each(['outcomePipeline', 'getOutcomePipeline', 'setMatchUpState'])('%s returns METHOD_REMOVED', async (method) => {
    setStateProvider(asyncGlobalState);
    try {
      await asyncGlobalState.runWithInstanceState(async () => {
        asyncEngine.importMethods(governors, true, 1);
        const direct: any = await (asyncEngine as any)[method]('v2');
        expect(direct).toMatchObject(removal(method));
        const queued: any = await asyncEngine.executionQueue([{ method, params: {} }]);
        expect(queued).toMatchObject(removal(method));
      });
    } finally {
      setStateProvider(syncGlobalState);
    }
  });
});

describe('globalState and tools', () => {
  it('setOutcomePipeline and getOutcomePipeline return METHOD_REMOVED', () => {
    expect(setOutcomePipeline()).toMatchObject(removal('setOutcomePipeline'));
    expect((setOutcomePipeline as any)('v1')).toMatchObject(removal('setOutcomePipeline'));
    expect(getOutcomePipeline()).toMatchObject(removal('getOutcomePipeline'));
  });

  it('the footprint refuses its outcomePipeline option, and without it answers for the one pipeline', () => {
    const methods = [{ method: 'setMatchUpStatus', params: { drawId: 'D1', matchUpId: 'M1' } }];
    expect(tools.getMutationFootprint({ methods, outcomePipeline: 'v2' })).toMatchObject(
      removal('getMutationFootprint', 'outcomePipeline'),
    );
    expect(tools.getMutationFootprint({ methods, outcomePipeline: undefined } as any).shards).toEqual([
      'shell',
      'draw',
      'drawParticipants',
    ]);
    expect(tools.getMutationFootprint({ methods }).shards).toEqual(['shell', 'draw', 'drawParticipants']);
  });
});
