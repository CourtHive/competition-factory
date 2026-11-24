import { getDevContext, setDevContext } from '@Global/state/globalState';
import { getGlobalLog, purgeGlobalLog } from '@Functions/global/globalLog';
import { buildCounters } from '@Query/scoring/statistics/counters';
import { expect, it } from 'vitest';

it('routes scoring diagnostics through the installed engine log and honors dev context', () => {
  const previous = getDevContext();
  const point = { index: 1 };
  try {
    purgeGlobalLog();
    setDevContext(false);
    buildCounters([point]);
    expect(getGlobalLog(false)).toEqual([]);
    setDevContext(true);
    buildCounters([point]);
    expect(getGlobalLog(false)).toEqual([{ method: 'counters', issue: 'point missing winner', point }]);
  } finally {
    setDevContext(previous);
    purgeGlobalLog();
  }
});
