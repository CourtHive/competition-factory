import { competitionNowMs, nowMs, setClock, setCompetitionClock, withCapturedClockAsync } from '@Tools/clock';
import { createSeededRandom, randomSource, withCallRandomSourceAsync } from '@Tools/prng';
import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import * as globalState from '@Global/state/globalState';
import { expect, it } from 'vitest';

it('keeps record time, competition time, the stamp ledger and the random stream with each overlapping request', async () => {
  const previous = globalState.getProvider();
  let instant = 1000;
  setClock(() => ++instant);
  setCompetitionClock({ nowMs: () => instant + 100 });
  globalState.setStateProvider(asyncGlobalState);
  try {
    const request = (seed: number) =>
      asyncGlobalState.runWithInstanceState(() =>
        withCapturedClockAsync(async () =>
          withCallRandomSourceAsync(createSeededRandom(seed), async () => {
            const ledger = globalState.getCapturedStamps();
            const state = [nowMs(), competitionNowMs(), randomSource()()];
            const entity = {};
            expect(ledger).toBeInstanceOf(WeakSet);
            ledger?.add(entity);
            // Both requests enter and capture their state before either resumes.
            await Promise.resolve();
            expect(globalState.getCapturedClock()).toBe(nowMs());
            expect(globalState.getCapturedCompetitionClock()).toBe(competitionNowMs());
            expect(globalState.getCallRandomSource()).toBe(randomSource());
            expect(globalState.getCapturedStamps()?.has(entity)).toBe(true);
            expect([nowMs(), competitionNowMs()]).toEqual(state.slice(0, 2));
            return state;
          }),
        ),
      );
    const [first, second] = await Promise.all([request(11), request(22)]);
    expect(first).toEqual([1001, 1101, createSeededRandom(11)()]);
    expect(second).toEqual([1002, 1102, createSeededRandom(22)()]);
  } finally {
    globalState.setStateProvider(previous);
    setCompetitionClock();
    setClock();
  }
});
