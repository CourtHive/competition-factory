import { matchUpDuration } from '@Query/matchUp/matchUpDuration';
import { setClock, setCompetitionClock } from '@Tools/clock';
import { afterEach, beforeEach, expect, it } from 'vitest';

// constants
import { START_TIME } from '@Constants/timeItemConstants';

const ORIGINAL_TZ = process.env.TZ;

// a bare HH:MM is read as process-local wall time on the reference day; the zone travels with the file
beforeEach(() => {
  process.env.TZ = 'UTC';
  setClock('2026-05-17T09:53:34Z');
  setCompetitionClock({ nowMs: () => Date.parse('2026-05-17T09:53:34Z') });
});

afterEach(() => {
  setCompetitionClock();
  setClock();
  // assigning undefined would store the string 'undefined'
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

// Each component used to be formatted on its own, sign included, and cut to its last two characters: a negative
// duration printed as `10:-6:26` and `-9:52:26` (found on the ingest corpus, whose live starts are read against today).
it.each([
  ['20:00', '-10:06:26'],
  ['10:00', '-00:06:26'],
  ['09:00', '00:53:34'],
])('a live bare start of %s reads as %s', (itemValue, time) => {
  const result: any = matchUpDuration({ matchUp: { timeItems: [{ itemType: START_TIME, itemValue }] } });
  expect(result.time).toEqual(time);
  expect(Math.sign(result.milliseconds)).toEqual(time.startsWith('-') ? -1 : 1);
});

// the hours were cut to two digits as well: 125 hours printed as `25:00:00`
it('prints every hour of a duration past 99 hours', () => {
  const result: any = matchUpDuration({
    matchUp: { timeItems: [{ itemType: START_TIME, itemValue: '2026-05-12T04:53:34Z' }] },
  });
  expect(result.milliseconds).toEqual(125 * 60 * 60 * 1000);
  expect(result.time).toEqual('125:00:00');
});
