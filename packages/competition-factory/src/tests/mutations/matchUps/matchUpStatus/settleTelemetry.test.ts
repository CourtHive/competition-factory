import {
  enableSettleTelemetry,
  observePass,
  recordSettleEvent,
  takeSettleEvents,
} from '@Mutate/matchUps/matchUpStatus/settleTelemetry';
import { afterEach, expect, it } from 'vitest';

/**
 * Settle telemetry is inert unless enabled (production never enables it), and a take clears what it returns. The
 * census harness enables it around each step; that it fires there was shown by planting a bound of 1 in
 * `crossLinksThroughByes`: 13 events over 150 DOUBLE_ELIMINATION schedules, and none at the real bound.
 */
afterEach(() => {
  enableSettleTelemetry(false);
});

it('records nothing while disabled', () => {
  enableSettleTelemetry(false);
  recordSettleEvent({ kind: 'bound', site: 'test' });
  expect(takeSettleEvents()).toEqual([]);
});

it('records while enabled, and a take returns and clears', () => {
  enableSettleTelemetry();
  recordSettleEvent({ kind: 'bound', site: 'a' });
  recordSettleEvent({ kind: 'dropped-error', site: 'b', detail: 'm: ERR' });
  expect(takeSettleEvents()).toEqual([
    { kind: 'bound', site: 'a' },
    { kind: 'dropped-error', site: 'b', detail: 'm: ERR' },
  ]);
  expect(takeSettleEvents()).toEqual([]);
});

it('enabling again starts from nothing', () => {
  enableSettleTelemetry();
  recordSettleEvent({ kind: 'bound', site: 'a' });
  enableSettleTelemetry();
  expect(takeSettleEvents()).toEqual([]);
});

it('records a pass that writes only when passes are enabled, with the paths it changed', () => {
  const draw: any = { drawId: 'd', structures: [] };
  enableSettleTelemetry();
  observePass('quiet', draw, () => undefined);
  observePass('writer', draw, () => (draw.updated = true));
  expect(takeSettleEvents()).toEqual([]);

  enableSettleTelemetry(true, { passes: true });
  observePass('quiet', draw, () => undefined);
  const result = observePass('writer', draw, () => (draw.extra = 1));
  expect(result).toEqual(1);
  expect(takeSettleEvents()).toEqual([{ kind: 'wrote', site: 'writer', detail: '1 paths' }]);
});
