import { getMutationStatus } from '@Assemblies/engines/parts/getMutationStatus';
import { keepWrites } from '@Assemblies/engines/parts/keepWrites';
import { deleteNotices, getNotices, getTopics } from '@Global/state/globalState';
import { topicSort } from '@Global/state/notifySubscribers';
import { MUTATIONS } from '@Constants/topicConstants';
import { copyPreviewValue } from './previewState';

import type { Directives } from '@Types/factoryTypes';
import type { QueueOutcome } from './finishPreview';
import type { EmittedNotice } from './dryRun';

/** Finish a nested rollback-off queue against the child. Record each delivery at its normal flush boundary. */
export function settleNestedQueue(
  outcome: QueueOutcome,
  directives: Directives,
  timeStamp: number,
  delivered: EmittedNotice[],
) {
  if (outcome.error) {
    keepWrites(timeStamp);
    const results = outcome.refusal ? outcome.results.slice(0, -1) : outcome.results;
    return { ...outcome.refusal, error: outcome.error, rolledBack: false, results };
  }

  const mutationStatus = getMutationStatus({ timeStamp });
  const { topics } = getTopics();
  for (const topic of [...topics].sort(topicSort)) {
    const payloads = getNotices({ topic });
    if (payloads?.length) delivered.push({ topic, payloads: copyPreviewValue(payloads) });
  }
  if (mutationStatus && timeStamp && topics.includes(MUTATIONS)) {
    delivered.push({
      topic: MUTATIONS,
      payloads: [{ tournamentId: undefined, directives: copyPreviewValue(directives), timeStamp }],
    });
  }
  deleteNotices();
  return outcome;
}
