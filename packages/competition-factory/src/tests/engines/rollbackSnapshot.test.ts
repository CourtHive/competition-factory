import {
  cannotPartlyCommit,
  PARTIAL_COMMIT_METHODS,
  queueCannotPartlyCommit,
  WRITES_BEFORE_REFUSING,
} from '@Assemblies/engines/parts/rollbackSnapshot';
import { addNotice, getNoticeBuffer, getTournamentRecords, setOutcomePipeline } from '@Global/state/globalState';
import { setStateProvider } from '@Global/state/globalState';
import { deleteNotices, readMutationStatus, setSubscriptions } from '@Global/state/globalState';
import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setBuiltinPreviewMethods } from '@Forge/previewBindings';
import syncGlobalState from '@Global/state/syncGlobalState';
import { useEngineCatch } from '@Tests/testHarness/engineCatch';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import * as governors from '@Assemblies/governors';
import asyncEngine from '@Engines/asyncEngine';
import { join, relative } from 'node:path';

// constants
import { COURT_NOT_FOUND, MATCHUP_NOT_FOUND } from '@Constants/errorConditionConstants';
import { MODIFY_MATCHUP, MODIFY_VENUE } from '@Constants/topicConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

/**
 * WHEN A ROLLBACK NEEDS A SNAPSHOT (engines/parts/rollbackSnapshot.ts). A call or queue that is one directive of a
 * factory method that cannot partly commit takes no snapshot; any other rollback does. The two paths return the same
 * result for a refusal. Without a snapshot a method that throws partway through a write keeps its writes, and the
 * result says `rolledBack: false`.
 *
 * Which path ran is observable on a refusal: a restored snapshot is installed as the engine's records, so the record
 * object the engine holds afterwards is a different object; with no snapshot it is the same one.
 *
 * `setMatchUpStatus` cannot partly commit under the v2 outcome pipeline only, so the cases that use it as a method
 * taking no snapshot run under v2 (the suite's setup restores its own mode before each test).
 */
useEngineCatch();

const TOURNAMENT_ID = 'rollback-snapshot';
const WRITTEN = 'written before the throw';

// a factory method in every respect the engine checks: registered as a governor method is
function writeThenThrow({ tournamentRecord }: { tournamentRecord: any }) {
  tournamentRecord.tournamentName = WRITTEN;
  throw new Error('a programming error');
}
async function writeThenReject({ tournamentRecord }: { tournamentRecord: any }) {
  tournamentRecord.tournamentName = WRITTEN;
  await Promise.resolve();
  throw new Error('a programming error');
}
function customRefusal() {
  return { error: MATCHUP_NOT_FOUND };
}
const builtinLike = { writeThenThrow, writeThenReject };
setBuiltinPreviewMethods(builtinLike);

function setup() {
  const {
    tournamentRecord,
    drawIds: [drawId],
    venueIds: [venueId],
  } = mocksEngine.generateTournamentRecord({
    tournamentAttributes: { tournamentId: TOURNAMENT_ID },
    drawProfiles: [{ drawSize: 4 }],
    venueProfiles: [{ courtsCount: 3 }],
  });
  tournamentEngine.setState(tournamentRecord);
  tournamentEngine.importMethods({ ...builtinLike, customRefusal });
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } });
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
  const courtIds = tournamentEngine.findVenue({ venueId }).venue.courts.map(({ courtId }: any) => courtId);
  return { tournamentRecord, drawId, venueId, courtIds, matchUps, outcome };
}

const held = () => getTournamentRecords()[TOURNAMENT_ID];
const stored = () => JSON.stringify(tournamentEngine.getTournament().tournamentRecord);

function watch(topics: string[]) {
  const delivered: string[] = [];
  setSubscriptions({
    subscriptions: Object.fromEntries(topics.map((topic) => [topic, () => delivered.push(topic)])),
  });
  return delivered;
}

afterEach(() => {
  setSubscriptions({});
  deleteNotices();
});

describe('which calls take a snapshot', () => {
  const builtin = (name: string) => (governors as any).matchUpGovernor[name];

  it('one factory method that cannot partly commit takes none', () => {
    setOutcomePipeline(OUTCOME_PIPELINE_V2);
    expect(cannotPartlyCommit('setMatchUpStatus', builtin('setMatchUpStatus'), {})).toBe(true);
    const assignDrawPosition = (governors as any).drawsGovernor.assignDrawPosition;
    expect(cannotPartlyCommit('assignDrawPosition', assignDrawPosition, { participantId: 'p' })).toBe(true);
    expect(cannotPartlyCommit('modifyVenue', (governors as any).venueGovernor.modifyVenue, {})).toBe(true);
  });

  it('a bulk method, a BYE placement, or a custom method keeps the snapshot', () => {
    expect(cannotPartlyCommit('bulkMatchUpStatusUpdate', builtin('bulkMatchUpStatusUpdate'), {})).toBe(false);
    expect(cannotPartlyCommit('resetAdHocMatchUps', builtin('resetAdHocMatchUps'), {})).toBe(false);
    expect(cannotPartlyCommit('deleteCourts', (governors as any).venueGovernor.deleteCourts, {})).toBe(false);
    const { assignDrawPosition, assignDrawPositionBye } = (governors as any).drawsGovernor;
    expect(cannotPartlyCommit('assignDrawPositionBye', assignDrawPositionBye, {})).toBe(false);
    expect(cannotPartlyCommit('assignDrawPosition', assignDrawPosition, { bye: true })).toBe(false);
    expect(cannotPartlyCommit('customRefusal', customRefusal, {})).toBe(false);
    // a custom method registered under a factory name is still custom
    expect(cannotPartlyCommit('setMatchUpStatus', customRefusal, {})).toBe(false);
  });

  it('setMatchUpStatus keeps the snapshot under any outcome pipeline but v2', () => {
    // v1, which the differential also runs on the stored record, can refuse after writing
    for (const [pipeline, snapshot] of [
      [OUTCOME_PIPELINE_V1, true],
      [OUTCOME_PIPELINE_DIFFERENTIAL, true],
      [OUTCOME_PIPELINE_V2, false],
    ] as const) {
      setOutcomePipeline(pipeline);
      expect(cannotPartlyCommit('setMatchUpStatus', builtin('setMatchUpStatus'), {})).toBe(!snapshot);
      const methods = { setMatchUpStatus: builtin('setMatchUpStatus') };
      expect(queueCannotPartlyCommit([{ method: 'setMatchUpStatus', params: {} }], methods)).toBe(!snapshot);
    }
  });

  it('a queue of more than one directive keeps the snapshot', () => {
    setOutcomePipeline(OUTCOME_PIPELINE_V2);
    const methods = { setMatchUpStatus: builtin('setMatchUpStatus') };
    const directive = { method: 'setMatchUpStatus', params: {} };
    expect(queueCannotPartlyCommit([directive], methods)).toBe(true);
    expect(queueCannotPartlyCommit([directive, directive], methods)).toBe(false);
  });

  it('every bulk writer, and every name it is exposed under, is on the list', () => {
    // a module that runs bulk items is a bulk writer: a new one must be added to PARTIAL_COMMIT_METHODS
    const root = join(__dirname, '../..');
    const importers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith('.ts') && /from '@Mutate\/bulkItem'/.test(readFileSync(path, 'utf8')))
          importers.push(relative(root, path));
      }
    };
    walk(join(root, 'mutate'));
    const writers: Record<string, string> = {
      'mutate/events/bulkMatchUpStatusUpdate.ts': 'bulkMatchUpStatusUpdate',
      'mutate/structures/resetAdHocMatchUps.ts': 'resetAdHocMatchUps',
      'mutate/venues/deleteCourt.ts': 'deleteCourts',
    };
    expect(importers.sort()).toEqual(Object.keys(writers).sort());
    expect([...PARTIAL_COMMIT_METHODS].sort()).toEqual(Object.values(writers).sort());

    // and no governor exposes one of them, or a BYE placement, under a name the lists do not hold
    const watched = new Map<unknown, string>();
    for (const governor of Object.values(governors) as any[])
      for (const name of [...PARTIAL_COMMIT_METHODS, ...Object.keys(WRITES_BEFORE_REFUSING)])
        if (governor[name]) watched.set(governor[name], name);
    for (const governor of Object.values(governors) as any[])
      for (const [name, method] of Object.entries(governor))
        if (watched.has(method)) expect(name).toEqual(watched.get(method));
  });
});

describe('sync engine', () => {
  it('a refused single directive takes no snapshot and returns what the snapshot path returns', () => {
    setOutcomePipeline(OUTCOME_PIPELINE_V2);
    const { drawId, outcome } = setup();
    const params = { drawId, matchUpId: 'unknown', outcome };
    const before = stored();
    const record = held();
    const delivered = watch([MODIFY_MATCHUP]);
    addNotice({ topic: MODIFY_MATCHUP, payload: { pending: true }, key: 'pending' });

    const direct: any = tournamentEngine.setMatchUpStatus({ ...params, rollbackOnError: true });
    const queued: any = tournamentEngine.executionQueue([{ method: 'setMatchUpStatus', params }], true);
    expect(held()).toBe(record);
    for (const result of [direct, queued]) {
      expect(result.error).toEqual(MATCHUP_NOT_FOUND);
      expect(result.rolledBack).toEqual(true);
      expect(result.committed).toBeUndefined();
    }
    // the selection, an enclosing operation's buffered notice and the modification flag are as they were
    expect(stored()).toEqual(before);
    expect((getNoticeBuffer() ?? []).map((notice) => notice.key)).toEqual(['pending']);
    expect(readMutationStatus()).toBeFalsy();
    expect(delivered).toEqual([]);

    // the same refusal inside a queue of two takes a snapshot, and returns the same refusal
    const [first] = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } }).matchUps;
    const pair: any = tournamentEngine.executionQueue(
      [
        { method: 'setMatchUpStatus', params: { ...params, matchUpId: first.matchUpId } },
        { method: 'setMatchUpStatus', params },
      ],
      true,
    );
    expect(held()).not.toBe(record);
    expect(pair).toEqual(queued);
    expect(stored()).toEqual(before);
  });

  it('a successful single directive with rollback is unchanged', () => {
    const { drawId, matchUps, outcome } = setup();
    const delivered = watch([MODIFY_MATCHUP]);
    const params = { drawId, matchUpId: matchUps[0].matchUpId, outcome };
    const result: any = tournamentEngine.executionQueue([{ method: 'setMatchUpStatus', params }], true);
    expect(result.success).toEqual(true);
    expect(result.rolledBack).toBeUndefined();
    expect(tournamentEngine.findMatchUp({ matchUpId: params.matchUpId }).matchUp.winningSide).toEqual(1);
    expect(delivered.length).toBeGreaterThan(0);
  });

  it('a BYE placement keeps the snapshot', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      tournamentAttributes: { tournamentId: TOURNAMENT_ID },
      drawProfiles: [{ drawSize: 4, automated: false }],
    });
    tournamentEngine.setState(tournamentRecord);
    // refused for an unknown structure: the placement itself is not what is under test
    const params = { drawId, structureId: 'unknown', drawPosition: 1 };
    const placements: [string, object, boolean][] = [
      ['assignDrawPositionBye', params, true],
      ['assignDrawPosition', { ...params, bye: true }, true],
      ['assignDrawPosition', { ...params, participantId: tournamentRecord.participants[0].participantId }, false],
    ];
    for (const [method, placement, snapshot] of placements) {
      const record = held();
      const result: any = tournamentEngine.executionQueue([{ method, params: placement }], true);
      expect(result.error).toBeDefined();
      expect(result.rolledBack).toEqual(true);
      expect(held() === record).toBe(!snapshot);
    }
  });

  it('a throw partway through a write is not undone without a snapshot, and the result says so', () => {
    setup();
    const direct: any = tournamentEngine.writeThenThrow({ rollbackOnError: true });
    expect(direct.error).toBeDefined();
    expect(direct.rolledBack).toEqual(false);
    expect(tournamentEngine.getTournament().tournamentRecord.tournamentName).toEqual(WRITTEN);

    setup();
    const queued: any = tournamentEngine.executionQueue([{ method: 'writeThenThrow' }], true);
    expect(queued.error).toBeDefined();
    expect(queued.rolledBack).toEqual(false);
    expect(queued.results).toEqual([]);
    expect(tournamentEngine.getTournament().tournamentRecord.tournamentName).toEqual(WRITTEN);

    // with a snapshot (a queue of two), the same throw is restored
    setup();
    const restored: any = tournamentEngine.executionQueue(
      [{ method: 'getTournamentInfo' }, { method: 'writeThenThrow' }],
      true,
    );
    expect(restored.rolledBack).toEqual(true);
    expect(tournamentEngine.getTournament().tournamentRecord.tournamentName).not.toEqual(WRITTEN);
  });

  it('a restored bulk call keeps nothing and says so: no committed, its kept items rolled back', () => {
    const { courtIds, venueId } = setup();
    const delivered = watch([MODIFY_VENUE]);
    const courtIdList = [courtIds[0], 'unknown', courtIds[2]];
    const expected = [
      { index: 0, courtId: courtIds[0], rolledBack: true },
      { index: 1, courtId: 'unknown', error: COURT_NOT_FOUND },
      { index: 2, courtId: courtIds[2], rolledBack: true },
    ];

    const direct: any = tournamentEngine.deleteCourts({ courtIds: courtIdList, force: true, rollbackOnError: true });
    expect(direct.error).toEqual(COURT_NOT_FOUND);
    expect(direct.rolledBack).toEqual(true);
    expect(direct.committed).toBeUndefined();
    expect(direct.results).toEqual(expected);

    const queued: any = tournamentEngine.executionQueue(
      [
        { method: 'modifyVenue', params: { venueId, modifications: { venueName: 'Renamed' } } },
        { method: 'deleteCourts', params: { courtIds: courtIdList, force: true } },
      ],
      true,
    );
    expect(queued.error).toEqual(COURT_NOT_FOUND);
    expect(queued.rolledBack).toEqual(true);
    expect(queued.committed).toBeUndefined();
    expect(queued.results).toEqual(expected);

    const { venue } = tournamentEngine.findVenue({ venueId });
    expect(venue.courts.map(({ courtId }: any) => courtId)).toEqual(courtIds);
    expect(venue.venueName).not.toEqual('Renamed');
    expect(delivered).toEqual([]);

    // with rollback off the same call commits, and says so
    const kept: any = tournamentEngine.deleteCourts({ courtIds: courtIdList, force: true });
    expect(kept.committed).toEqual(true);
    expect(kept.rolledBack).toBeUndefined();
    expect(kept.results.map((item: any) => item.success ?? item.error)).toEqual([true, COURT_NOT_FOUND, true]);
  });

  it('a queue without rollback announces the directives it kept after an ordinary refusal', () => {
    const { drawId, matchUps, outcome } = setup();
    const modified: string[] = [];
    setSubscriptions({
      subscriptions: {
        [MODIFY_MATCHUP]: (notices: any[]) => notices.forEach((notice) => modified.push(notice.matchUp?.matchUpId)),
      },
    });
    const result: any = tournamentEngine.executionQueue([
      { method: 'setMatchUpStatus', params: { drawId, matchUpId: matchUps[0].matchUpId, outcome } },
      { method: 'setMatchUpStatus', params: { drawId, matchUpId: 'unknown', outcome } },
    ]);
    expect(result.error).toEqual(MATCHUP_NOT_FOUND);
    expect(result.rolledBack).toEqual(false);
    expect(result.results.map(({ methodName }: any) => methodName)).toEqual(['setMatchUpStatus']);
    expect(modified).toContain(matchUps[0].matchUpId);
    expect(getNoticeBuffer() ?? []).toEqual([]);
  });
});

describe('async engine', () => {
  beforeAll(() => setStateProvider(syncGlobalState));

  const request = async <T>(body: (fixture: ReturnType<typeof setup>) => Promise<T>) => {
    const fixture = setup();
    setStateProvider(asyncGlobalState);
    try {
      return await asyncGlobalState.runWithInstanceState(async () => {
        asyncEngine.importMethods(governors, true, 1);
        asyncEngine.importMethods({ ...builtinLike, customRefusal });
        await asyncEngine.setState(structuredClone(fixture.tournamentRecord));
        return body(fixture);
      });
    } finally {
      setStateProvider(syncGlobalState);
    }
  };
  const name = async () => (await asyncEngine.getTournament()).tournamentRecord?.tournamentName;

  it('a refused single directive takes no snapshot; a queue of two does; both return the same refusal', async () => {
    setOutcomePipeline(OUTCOME_PIPELINE_V2);
    const outcomes = await request(async ({ drawId, matchUps, outcome }) => {
      const params = { drawId, matchUpId: 'unknown', outcome };
      const record = held();
      const direct: any = await asyncEngine.setMatchUpStatus({ ...params, rollbackOnError: true });
      const single: any = await asyncEngine.executionQueue([{ method: 'setMatchUpStatus', params }], true);
      const sameRecord = held() === record;
      const pair: any = await asyncEngine.executionQueue(
        [
          { method: 'setMatchUpStatus', params: { ...params, matchUpId: matchUps[0].matchUpId } },
          { method: 'setMatchUpStatus', params },
        ],
        true,
      );
      return { direct, single, pair, sameRecord, restoredRecord: held() === record };
    });
    expect(outcomes.sameRecord).toBe(true);
    expect(outcomes.restoredRecord).toBe(false);
    expect(outcomes.direct.rolledBack).toEqual(true);
    expect(outcomes.single).toEqual(outcomes.pair);
    expect(outcomes.single.rolledBack).toEqual(true);
  });

  it('a throw or a rejection partway through a write is not undone without a snapshot, and the result says so', async () => {
    for (const method of ['writeThenThrow', 'writeThenReject']) {
      const { direct, queued, namedAfterDirect, namedAfterQueue } = await request(async ({ tournamentRecord }) => {
        const direct: any = await asyncEngine[method]({ rollbackOnError: true });
        const namedAfterDirect = await name();
        await asyncEngine.setState(structuredClone(tournamentRecord));
        const queued: any = await asyncEngine.executionQueue([{ method }], true);
        return { direct, queued, namedAfterDirect, namedAfterQueue: await name() };
      });
      expect(direct.error).toBeDefined();
      expect(direct.rolledBack).toEqual(false);
      expect(queued.error).toBeDefined();
      expect(queued.rolledBack).toEqual(false);
      expect([namedAfterDirect, namedAfterQueue]).toEqual([WRITTEN, WRITTEN]);
    }
  });

  it('a restored bulk call keeps nothing and says so', async () => {
    const { result, courts } = await request(async ({ courtIds, venueId }) => {
      const result: any = await asyncEngine.executionQueue(
        [{ method: 'deleteCourts', params: { courtIds: [courtIds[0], 'unknown'], force: true } }],
        true,
      );
      const { venue } = await asyncEngine.findVenue({ venueId });
      return { result, courts: venue.courts.length };
    });
    expect(result.rolledBack).toEqual(true);
    expect(result.committed).toBeUndefined();
    expect(result.results.map((item: any) => item.rolledBack ?? item.error)).toEqual([true, COURT_NOT_FOUND]);
    expect(courts).toEqual(3);
  });

  it('a queue without rollback announces the directives it kept after an ordinary refusal', async () => {
    const { result, modified, matchUpId } = await request(async ({ drawId, matchUps, outcome }) => {
      const modified: string[] = [];
      setSubscriptions({
        subscriptions: {
          [MODIFY_MATCHUP]: (notices: any[]) => notices.forEach((notice) => modified.push(notice.matchUp?.matchUpId)),
        },
      });
      const matchUpId = matchUps[0].matchUpId;
      const result: any = await asyncEngine.executionQueue([
        { method: 'setMatchUpStatus', params: { drawId, matchUpId, outcome } },
        { method: 'setMatchUpStatus', params: { drawId, matchUpId: 'unknown', outcome } },
      ]);
      return { result, modified, matchUpId };
    });
    expect(result.rolledBack).toEqual(false);
    expect(modified).toContain(matchUpId);
  });
});
