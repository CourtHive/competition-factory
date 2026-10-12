import { now, nowIso, setClock, withCapturedClock, withCapturedClockAsync } from '@Tools/clock';
import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import { getProvider, setStateProvider } from '@Global/state/globalState';
import officiatingEngine from '@Assemblies/engines/officiating';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import askEngine from '@Assemblies/engines/ask';
import { afterEach, expect, it, vi } from 'vitest';

// constants
import { INVALID_DATE } from '@Constants/errorConditionConstants';

/**
 * One instant per engine call, captured before anything is written (tools/clock.ts).
 *
 * Before capture, the entry points read the clock AFTER the methods had run (for the factory
 * extension's timeStamp), so a source that threw failed a call whose writes had already landed,
 * and every nested `now()` read the source again. A source returning junk silently became the
 * wall clock.
 */
afterEach(() => {
  setClock();
});

const FIXED = Date.parse('2026-10-01T12:00:00.000Z');

const recordJson = () => JSON.stringify(tournamentEngine.getTournament().tournamentRecord);

function setup() {
  mocksEngine.generateTournamentRecord({ setState: true });
}

/** A source that is valid for its first `valid` reads and throws on every read after. */
function failingAfter(valid: number) {
  let reads = 0;
  const source = () => {
    reads += 1;
    if (reads > valid) throw new Error('clock offline');
    return FIXED + reads * 1000;
  };
  return { source, reads: () => reads };
}

const timeItem = (itemValue: string) => ({ timeItem: { itemType: 'NOTE', itemValue } });

it('an executionQueue reads the source ONCE: nested stamps and the factory stamp share its instant', () => {
  setup();
  const clock = failingAfter(1);
  setClock(clock.source);

  const result = tournamentEngine.executionQueue([
    { method: 'addTournamentTimeItem', params: timeItem('a') },
    { method: 'addTournamentTimeItem', params: timeItem('b') },
    { method: 'addTournamentExtension', params: { extension: { name: 'x', value: 1 } } },
  ]);
  expect(result.success).toEqual(true);
  expect(clock.reads()).toEqual(1);

  const { tournamentRecord } = tournamentEngine.getTournament();
  const captured = new Date(FIXED + 1000).toISOString();
  const notes = tournamentRecord.timeItems.filter((item: any) => item.itemType === 'NOTE');
  expect(notes.map((item: any) => item.createdAt)).toEqual([captured, captured]);
  expect(tournamentRecord.extensions.find((e: any) => e.name === 'x').createdAt).toEqual(captured);
});

it('a source that throws is refused before anything is written, even without rollbackOnError', () => {
  setup();
  const before = recordJson();
  setClock(failingAfter(0).source);

  const queued: any = tournamentEngine.executionQueue([{ method: 'addTournamentTimeItem', params: timeItem('a') }]);
  expect(queued.error).toEqual(INVALID_DATE);
  expect(queued.message).toMatch(/clock offline/);

  const invoked: any = tournamentEngine.addTournamentTimeItem(timeItem('a'));
  expect(invoked.error).toEqual(INVALID_DATE);

  setClock();
  expect(recordJson()).toEqual(before);
});

it('a source returning an invalid instant is refused, not replaced by the wall clock', () => {
  setup();
  const before = recordJson();
  setClock(() => 'junk' as any);

  const result: any = tournamentEngine.addTournamentTimeItem(timeItem('a'));
  expect(result.error).toEqual(INVALID_DATE);
  expect(result.message).toMatch(/invalid instant/);

  setClock();
  expect(recordJson()).toEqual(before);
});

it('outside an engine call there is nothing to capture into: an invalid source throws', () => {
  setClock(() => 'junk' as any);
  expect(() => now()).toThrow(/invalid instant/);
  setClock(() => {
    throw new Error('clock offline');
  });
  expect(() => nowIso()).toThrow(/clock offline/);
});

it('the capture is released after the call, so a moving source moves between calls', () => {
  setup();
  let reads = 0;
  setClock(() => FIXED + ++reads * 1000);

  tournamentEngine.addTournamentTimeItem(timeItem('a'));
  tournamentEngine.addTournamentTimeItem(timeItem('b'));
  const notes = tournamentEngine
    .getTournament()
    .tournamentRecord.timeItems.filter((item: any) => item.itemType === 'NOTE')
    .map((item: any) => item.createdAt);
  expect(notes).toEqual([new Date(FIXED + 1000).toISOString(), new Date(FIXED + 2000).toISOString()]);
  // and a direct read after the calls goes to the source again
  expect(now().getTime()).toEqual(FIXED + 3000);
});

it('a capture is released when the captured call throws', () => {
  let reads = 0;
  setClock(() => FIXED + ++reads * 1000);
  expect(() =>
    withCapturedClock(() => {
      throw new Error('method crashed');
    }),
  ).toThrow(/method crashed/);
  expect(now().getTime()).toEqual(FIXED + 2000);
});

it('ask, dry run, mocks and declaration engines refuse a failing source too', () => {
  setup();
  setClock(failingAfter(0).source);

  expect((askEngine.execute({ method: 'getTournamentInfo' }) as any).error).toEqual(INVALID_DATE);
  expect(tournamentEngine.dryRun([{ method: 'addTournamentTimeItem', params: timeItem('a') }]).error).toMatchObject({
    code: INVALID_DATE.code,
  });
  expect((mocksEngine.generateTournamentRecord({}) as any).error).toEqual(INVALID_DATE);
  expect((officiatingEngine.executionQueue([]) as any).error).toEqual(INVALID_DATE);
});

it('overlapping async requests each keep their own captured instant', async () => {
  const previous = getProvider();
  setStateProvider(asyncGlobalState);
  try {
    let reads = 0;
    setClock(() => FIXED + ++reads * 1000);

    const request = (delay: number) =>
      asyncGlobalState.runWithInstanceState(() =>
        withCapturedClockAsync(async (timeStamp) => {
          const first = now().getTime();
          await new Promise((resolve) => setTimeout(resolve, delay));
          return { timeStamp, first, last: now().getTime() };
        }),
      );

    // the slower request starts first, so the faster one captures and releases inside its await
    const [slow, fast]: any[] = await Promise.all([request(20), request(1)]);
    expect(slow.first).toEqual(slow.timeStamp);
    expect(slow.last).toEqual(slow.timeStamp);
    expect(fast.first).toEqual(fast.timeStamp);
    expect(fast.last).toEqual(fast.timeStamp);
    expect(fast.timeStamp).not.toEqual(slow.timeStamp);
  } finally {
    setStateProvider(previous);
  }
});

it('installing a provider without the capture hooks is announced, not silent', () => {
  const previous = getProvider();
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    const { getCapturedClock: _get, setCapturedClock: _set, ...withoutHooks } = previous;
    expect(setStateProvider(withoutHooks).success).toEqual(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/getCapturedClock\/setCapturedClock/);

    warn.mockClear();
    expect(setStateProvider(previous).success).toEqual(true);
    expect(warn).not.toHaveBeenCalled();
  } finally {
    setStateProvider(previous);
    warn.mockRestore();
  }
});
