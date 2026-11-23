import { timeKeeper } from '@Global/state/globalState';
import { expect, it } from 'vitest';

async function getAllTimers(delay = 1000) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const result = timeKeeper('report', 'allTimers');
      resolve(result);
    }, delay);
  });
}

it('can keep time for various processes', async () => {
  let result: any = timeKeeper();
  expect(result.elapsedTime).toEqual(0);
  expect(result.startTime).not.toBeUndefined();

  result = timeKeeper('report');
  expect(result.timer).toEqual('default');

  result = timeKeeper('start', 'firstTimer');
  expect(result.elapsedTime).toEqual(0);
  expect(result.startTime).not.toBeUndefined();

  result = await getAllTimers();
  expect(result.length).toEqual(2);

  result = timeKeeper('start', 'secondTimer');
  expect(result.elapsedTime).toEqual(0);
  expect(result.startTime).not.toBeUndefined();

  result = await getAllTimers();
  expect(result.length).toEqual(3);

  result = timeKeeper('report', 'firstTimer');
  expect(+result.elapsedTime).toBeGreaterThanOrEqual(2);

  result = timeKeeper('report', 'secondTimer');
  expect(+result.elapsedTime).toBeLessThan(2);

  result = timeKeeper('stop', 'firstTimer');
  expect(result.state).toEqual('stopped');
  const firstTimerElapsedTime = result.elapsedTime;

  // now add 2 seconds to all running timers
  await getAllTimers(2000);

  result = timeKeeper('report', 'secondTimer');
  expect(+result.elapsedTime).toBeGreaterThan(firstTimerElapsedTime);

  result = timeKeeper('report', 'firstTimer');
  expect(Number.parseFloat(result.elapsedTime).toFixed(2)).toEqual(Number.parseFloat(firstTimerElapsedTime).toFixed(2));

  result = timeKeeper('start', 'firstTimer');
  expect(result.state).toEqual('active');

  // now add 1/2 second to all running timers
  await getAllTimers(500);

  result = timeKeeper('report', 'firstTimer');
  expect(+result.elapsedTime).toBeGreaterThan(firstTimerElapsedTime);

  result = timeKeeper('reset', 'allTimers');
  expect(result).toEqual(true);
});
