import { createSeededRandom, randomSource, setRandomSource } from '@Tools/prng';
import { now, nowIso, setClock } from '@Tools/clock';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it } from 'vitest';
import { UUID } from '@Tools/UUID';

// constants
import { INVALID_DATE, INVALID_VALUES } from '@Constants/errorConditionConstants';

/**
 * Golden corpus C1b: a run of the engine can be made reproducible.
 *
 * Before these hooks, `mocksEngine.generateTournamentRecord({ nonRandom: 7 })` twice gave two
 * records that differed at byte 119, the tournamentId, because `UUID()` fell back to
 * `Math.random`. Under vitest that was masked by `seedMathRandom.ts`, which is why the FIRST
 * test below resets the source between generations: with the hook, the second generation
 * restarts the stream; without it, the per-test `Math.random` stream simply continues and the
 * ids differ. Every score also stamped `schedule.scoredTime` from the wall clock.
 */
afterEach(() => {
  setRandomSource();
  setClock();
});

const generate = () =>
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 2 }],
    drawProfiles: [{ drawSize: 8 }],
    startDate: '2026-10-01',
    endDate: '2026-10-03',
  }).tournamentRecord;

it('two generations under one random source and one clock are byte-identical, ids and stamps included', () => {
  // generation stamps updatedAt on draws and structures, so the clock is part of this too
  setClock('2026-10-01T12:00:00.000Z');
  setRandomSource(7);
  const first = JSON.stringify(generate());
  setRandomSource(7);
  const second = JSON.stringify(generate());
  if (second !== first) {
    let i = 0;
    while (first[i] === second[i]) i++;
    console.log(
      'FIRST DIFF at',
      i,
      '\nA:',
      first.slice(Math.max(0, i - 120), i + 60),
      '\nB:',
      second.slice(Math.max(0, i - 120), i + 60),
    );
  }
  expect(second).toEqual(first);

  // and the discriminating half: without resetting the source they are NOT identical
  const third = JSON.stringify(generate());
  expect(third).not.toEqual(first);
});

it('a scored record is byte-identical under one random source and a fixed clock', () => {
  const score = () => {
    setRandomSource(11);
    setClock('2026-10-01T12:00:00.000Z');
    tournamentEngine.setState(generate());
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const { drawId, matchUpId } = matchUps[0];
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
    expect(tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome }).success).toEqual(true);
    const record = tournamentEngine.getTournament().tournamentRecord;
    const scored = record.events[0].drawDefinitions[0].structures[0].matchUps.find(
      (m: any) => m.matchUpId === matchUpId,
    );
    expect(scored.schedule.scoredTime).toEqual('2026-10-01T12:00:00.000Z');
    return JSON.stringify(record);
  };
  const first = score();
  const second = score();
  if (second !== first) {
    let i = 0;
    while (first[i] === second[i]) i++;
    console.log(
      'FIRST DIFF at',
      i,
      '\nA:',
      first.slice(Math.max(0, i - 120), i + 60),
      '\nB:',
      second.slice(Math.max(0, i - 120), i + 60),
    );
  }
  expect(second).toEqual(first);
});

it('an explicit random parameter still wins over the configured source', () => {
  setRandomSource(1);
  const fromSource = UUID();
  setRandomSource(1);
  const fromParam = UUID(undefined, createSeededRandom(2));
  setRandomSource(1);
  expect(UUID()).toEqual(fromSource);
  expect(fromParam).not.toEqual(fromSource);
});

it('randomSource is read at the call, so resetting restores Math.random', () => {
  setRandomSource(() => 0.5);
  expect(randomSource()()).toEqual(0.5);
  setRandomSource();
  expect(randomSource()).toEqual(Math.random);
});

it('the clock accepts an instant, a function, or nothing, and refuses junk', () => {
  expect(setClock('2026-10-01T12:00:00.000Z').success).toEqual(true);
  expect(nowIso()).toEqual('2026-10-01T12:00:00.000Z');

  expect(setClock(Date.UTC(2026, 9, 2)).success).toEqual(true);
  expect(nowIso()).toEqual('2026-10-02T00:00:00.000Z');

  let ticks = 0;
  expect(setClock(() => new Date(Date.UTC(2026, 9, 3, 0, 0, ticks++))).success).toEqual(true);
  expect(nowIso()).toEqual('2026-10-03T00:00:00.000Z');
  expect(nowIso()).toEqual('2026-10-03T00:00:01.000Z');

  expect(setClock('not a date').error).toEqual(INVALID_DATE);
  expect(setClock({} as any).error).toEqual(INVALID_VALUES);

  expect(setClock().success).toEqual(true);
  const before = Date.now();
  expect(Math.abs(now().getTime() - before)).toBeLessThan(5_000);
});

it('the random source refuses junk and resets with no argument', () => {
  expect(setRandomSource('seed' as any).error).toEqual(INVALID_VALUES);
  expect(setRandomSource(Number.NaN).error).toEqual(INVALID_VALUES);
  expect(setRandomSource(3).success).toEqual(true);
  expect(setRandomSource().success).toEqual(true);
});

it('both hooks are reachable on the engine', () => {
  expect(tournamentEngine.setRandomSource(5).success).toEqual(true);
  expect(tournamentEngine.setClock('2026-10-01T00:00:00.000Z').success).toEqual(true);
  expect(nowIso()).toEqual('2026-10-01T00:00:00.000Z');
  expect(tournamentEngine.setRandomSource().success).toEqual(true);
  expect(tournamentEngine.setClock().success).toEqual(true);
});
