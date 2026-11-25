import { noticePayloadTestMode } from '@Global/state/noticePayloadAudit';
import {
  getOutcomePipeline,
  getProvider,
  setOutcomePipeline,
  setStateProvider,
  type Notice,
} from '@Global/state/globalState';
import { getDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { play, won } from '@Tests/testHarness/outcome/directionFixtures';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { OUTCOME_PIPELINE_DIFFERENTIAL } from '@Constants/outcomePipelineConstants';
import { expect, it } from 'vitest';

const tally = (key: string) => {
  const entry = getDifferentialTally()[key];
  return (entry?.compared ?? 0) + (entry?.deferred ?? 0);
};

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
    const before = tally('shadow:applied');
    const result = play(OUTCOME_PIPELINE_DIFFERENTIAL, {
      drawProfile: { drawType: ROUND_ROBIN, drawSize: 4 },
      setup: [{ target: { roundNumber: 1, nth: 0 }, outcome: won(1) }],
      steps: [{ target: { roundNumber: 1, nth: 0 }, outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    });
    expect(enqueued).toBeGreaterThan(0);
    expect(result.notices.some((n) => n.startsWith('updateInContextMatchUp '))).toBe(true);
    expect(tally('shadow:applied')).toBe(before + 1);
    expect(result.results.every((r) => r.success)).toBe(true);
  } finally {
    noticePayloadTestMode.enabled = previousCheck;
    setOutcomePipeline(previousMode);
    setStateProvider(previous);
  }
});
