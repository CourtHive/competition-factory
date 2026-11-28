import { noticePayloadTestMode } from '@Global/state/noticePayloadAudit';
import { addNotice, deleteNotices, setStateProvider, setSubscriptions } from '@Global/state/globalState';
import { getOutcomePipeline, setOutcomePipeline } from '@Tests/testHarness/outcomeModes';
import syncGlobalState from '@Global/state/syncGlobalState';
import syncEngine from '@Engines/syncEngine';
import { expect, it, vi } from 'vitest';

it.each([
  ['v2', 'v2'],
  ['differential', 'differential'],
  ['differential', 'v2'],
] as const)('dryRun preserves a buffered %s notice and its record aliases in %s', (enqueue, preview) => {
  const previous = getOutcomePipeline();
  const previousCheck = noticePayloadTestMode.enabled;
  const topic = 'pending-preview';
  const record = { tournamentId: 'preview-alias', tournamentName: 'before' };
  const date = new Date(42);
  const delivered = vi.fn();
  try {
    setStateProvider(syncGlobalState);
    noticePayloadTestMode.enabled = enqueue === 'differential';
    setOutcomePipeline(enqueue);
    syncEngine.setState(record, false);
    deleteNotices();
    setSubscriptions({ subscriptions: { [topic]: delivered } });
    addNotice({
      topic,
      payload: { record, list: [record], byRecord: new Map([[record, date]]), dates: new Set([date]) },
    });
    noticePayloadTestMode.enabled = preview === 'differential';
    setOutcomePipeline(preview);
    const detail = syncEngine.dryRun([{ method: 'setTournamentName', params: { tournamentName: 'after' } }]);
    expect(detail.error).toBeUndefined();
    expect(detail.wouldSucceed).toBe(true);
    const payloads = detail.willEmitNotices.find((notice) => notice.topic === topic)?.payloads;
    const payload = payloads?.[0] as {
      record: typeof record;
      list: (typeof record)[];
      byRecord: Map<typeof record, Date>;
      dates: Set<Date>;
    };
    expect(payload.record.tournamentName).toBe('after');
    expect(payload.record).not.toBe(record);
    expect(payload.list[0]).toBe(payload.record);
    expect(payload.list).toBeInstanceOf(Array);
    expect(payload.byRecord).toBeInstanceOf(Map);
    expect(payload.dates).toBeInstanceOf(Set);
    const copiedDate = payload.byRecord.get(payload.record);
    expect(copiedDate).toBeInstanceOf(Date);
    expect(copiedDate!.toISOString()).toBe(date.toISOString());
    expect([...payload.dates][0]).toBe(copiedDate);
    const saved = structuredClone(payload);
    expect(saved.byRecord.get(saved.record)).toBe([...saved.dates][0]);
    expect(saved.list[0]).toBe(saved.record);
    expect(delivered).not.toHaveBeenCalled();
    expect(record.tournamentName).toBe('before');
  } finally {
    deleteNotices();
    setSubscriptions({ subscriptions: {} });
    noticePayloadTestMode.enabled = previousCheck;
    setOutcomePipeline(previous);
  }
});
