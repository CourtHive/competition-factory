import { setStateProvider, setSubscriptions } from '@Global/state/globalState';
import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import syncGlobalState from '@Global/state/syncGlobalState';
import { useEngineCatch } from '@Tests/testHarness/engineCatch';
import { afterEach, describe, expect, it } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import * as governors from '@Assemblies/governors';
import asyncEngine from '@Engines/asyncEngine';
import { setClock } from '@Tools/clock';

// constants
import { MATCHUP_NOT_FOUND } from '@Constants/errorConditionConstants';
import { MODIFY_MATCHUP } from '@Constants/topicConstants';

/**
 * A REFUSED QUEUE WITHOUT ROLLBACK delivers no notices, and leaves none behind (CA's D2, 2026-10-18; decided by two
 * opposed agents, who converged). mutation-engines.md § Transaction Pattern already promised that the writes before
 * the refusal stay and "no notices are delivered for any of them". The queue kept that promise only inside a
 * per-request async context, where the leftover buffer died with the request: it neither emptied the buffer nor cycled
 * the mutation flag, so on a long-lived engine the NEXT successful call delivered the refused queue's notices as its
 * own and stamped the record at its own instant.
 *
 * Now the refused queue stamps the record at its own instant (its writes are a modification), empties the buffer,
 * and returns `results`: the directives that were applied, so a caller can see what persisted.
 */

const REFUSED_AT = 1_000_000;
const LATER = 2_000_000;

afterEach(() => {
  setClock();
  setSubscriptions({});
});

function setup() {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }] });
  tournamentEngine.setState(tournamentRecord);
  const [first, second] = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } }).matchUps;
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
  const score = (matchUpId: string) => ({ method: 'setMatchUpStatus', params: { drawId, matchUpId, outcome } });
  const refused = [score(first.matchUpId), score('no-such-matchUp')];
  return { tournamentRecord, first, second, score, refused };
}

function watchModified() {
  const modified: string[] = [];
  setSubscriptions({
    subscriptions: {
      [MODIFY_MATCHUP]: (notices: any[]) => notices.forEach((notice) => modified.push(notice.matchUp?.matchUpId)),
    },
  });
  return modified;
}

const stampOf = (record: any) => record.factory?.timeStamp;

describe('sync engine', () => {
  useEngineCatch();

  it('the refused queue keeps its writes, notifies nothing, stamps the record at its instant, and reports results', () => {
    const { first, refused } = setup();
    const modified = watchModified();

    setClock(REFUSED_AT);
    const result: any = tournamentEngine.executionQueue(refused);
    expect(result.error).toEqual(MATCHUP_NOT_FOUND);
    expect(result.rolledBack).toEqual(false);
    expect(result.results.map((r: any) => r.methodName)).toEqual(['setMatchUpStatus']);
    expect(tournamentEngine.findMatchUp({ matchUpId: first.matchUpId }).matchUp.winningSide).toEqual(1);
    expect(modified).toEqual([]);
    expect(stampOf(tournamentEngine.getTournament().tournamentRecord)).toEqual(REFUSED_AT);
  });

  it('the next successful call delivers only its own notices and its own stamp', () => {
    const { first, second, score, refused } = setup();
    const modified = watchModified();

    setClock(REFUSED_AT);
    tournamentEngine.executionQueue(refused);

    // a call that writes nothing: no leftover notice to deliver, no leftover flag to stamp the record with
    setClock(LATER);
    const read: any = tournamentEngine.executionQueue([{ method: 'getTournamentInfo' }]);
    expect(read.success).toEqual(true);
    expect(modified).toEqual([]);
    expect(stampOf(tournamentEngine.getTournament().tournamentRecord)).toEqual(REFUSED_AT);

    // and a call that writes delivers its own matchUp, not the refused queue's
    const written: any = tournamentEngine.executionQueue([score(second.matchUpId)]);
    expect(written.success).toEqual(true);
    expect(modified).toContain(second.matchUpId);
    expect(modified).not.toContain(first.matchUpId);
  });

  it('with rollbackOnError the queue is restored, and reports no results', () => {
    const { first, refused } = setup();
    const modified = watchModified();
    const result: any = tournamentEngine.executionQueue(refused, true);
    expect(result.error).toEqual(MATCHUP_NOT_FOUND);
    expect(result.rolledBack).toEqual(true);
    expect(result.results).toBeUndefined();
    expect(tournamentEngine.findMatchUp({ matchUpId: first.matchUpId }).matchUp.winningSide).toBeUndefined();
    expect(modified).toEqual([]);
  });
});

it('async engine: the same within one request context', async () => {
  const { tournamentRecord, first, second, score, refused } = setup();
  setStateProvider(asyncGlobalState);
  try {
    await asyncGlobalState.runWithInstanceState(async () => {
      asyncEngine.importMethods(governors, true, 1);
      await asyncEngine.setState(structuredClone(tournamentRecord));
      const modified = watchModified();

      setClock(REFUSED_AT);
      const result: any = await asyncEngine.executionQueue(refused);
      expect(result.error).toEqual(MATCHUP_NOT_FOUND);
      expect(result.rolledBack).toEqual(false);
      expect(result.results.map((r: any) => r.methodName)).toEqual(['setMatchUpStatus']);
      expect(modified).toEqual([]);

      setClock(LATER);
      const written: any = await asyncEngine.executionQueue([score(second.matchUpId)]);
      expect(written.success).toEqual(true);
      expect(modified).toContain(second.matchUpId);
      expect(modified).not.toContain(first.matchUpId);
    });
  } finally {
    setStateProvider(syncGlobalState);
  }
});
