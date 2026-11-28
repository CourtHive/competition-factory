import { noticePayloadTestMode } from '@Global/state/noticePayloadAudit';
import { getProvider, setStateProvider, type Notice } from '@Global/state/globalState';
import { getOutcomePipeline, setOutcomePipeline } from '@Tests/testHarness/outcomeModes';
import { play, won } from '@Tests/testHarness/outcome/directionFixtures';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { OUTCOME_PIPELINE_DIFFERENTIAL } from '@Tests/testHarness/outcomeModes';
import { expect, it } from 'vitest';

it('records the subscribed deferred in-context notice through a forwarding provider in differential mode', () => {
  const previous = getProvider();
  const previousMode = getOutcomePipeline();
  const previousCheck = noticePayloadTestMode.enabled;
  noticePayloadTestMode.enabled = true;
  let enqueued = 0;
  setStateProvider({
    ...previous,
    addNotice(notice: Notice, subscription?: boolean) {
      if (notice.topic === 'updateInContextMatchUp') enqueued++;
      return previous.addNotice(notice, subscription);
    },
  });
  try {
    const result = play(OUTCOME_PIPELINE_DIFFERENTIAL, {
      drawProfile: { drawType: ROUND_ROBIN, drawSize: 4 },
      setup: [{ target: { roundNumber: 1, nth: 0 }, outcome: won(1) }],
      steps: [{ target: { roundNumber: 1, nth: 0 }, outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    });
    expect(enqueued).toBeGreaterThan(0);
    expect(result.notices.some((n) => n.startsWith('updateInContextMatchUp '))).toBe(true);
    expect(result.results.every((r) => r.success)).toBe(true);
  } finally {
    noticePayloadTestMode.enabled = previousCheck;
    setOutcomePipeline(previousMode);
    setStateProvider(previous);
  }
});
