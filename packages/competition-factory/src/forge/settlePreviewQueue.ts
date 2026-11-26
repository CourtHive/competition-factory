import { getMutationStatus } from '@Assemblies/engines/parts/getMutationStatus';
import { isThrownResult } from '@Assemblies/engines/parts/executeMethod';
import { keepWrites } from '@Assemblies/engines/parts/keepWrites';
import { deleteNotices, getNotices, getTopics } from '@Global/state/globalState';
import { topicSort } from '@Global/state/notifySubscribers';
import { PARTIAL_COMMIT } from '@Constants/resultConstants';
import { MUTATIONS } from '@Constants/topicConstants';
import { copyPreviewValue } from './previewState';

import type { Directives } from '@Types/factoryTypes';
import type { QueueOutcome } from './finishPreview';
import type { EmittedNotice } from './dryRun';

/**
 * Finish a nested rollback-off queue against the child, as the live queue finishes it. Record each delivery at its
 * normal flush boundary. A refused queue keeps the writes before the refusal, and its committed work announces itself:
 * the directives that succeeded, and a refusing directive that committed part of its work. A method that threw
 * announces nothing.
 */
export function settleNestedQueue(
  outcome: QueueOutcome,
  directives: Directives,
  timeStamp: number,
  delivered: EmittedNotice[],
) {
  if (outcome.error) {
    const refusal: Record<string, any> | undefined = outcome.refusal;
    const results = refusal ? outcome.results.slice(0, -1) : outcome.results;
    const ran = results.length + (refusal?.[PARTIAL_COMMIT] === true ? 1 : 0);
    if (refusal && ran && !isThrownResult(refusal)) deliver(directives.slice(0, ran), timeStamp, delivered);
    else keepWrites(timeStamp);
    // a refused bulk directive is listed, last, with its whole result: its per-item results among it
    const listed = Array.isArray(refusal?.results) ? outcome.results : results;
    return { ...refusal, error: outcome.error, rolledBack: false, results: listed };
  }

  deliver(directives, timeStamp, delivered);
  return outcome;
}

function deliver(directives: Directives, timeStamp: number, delivered: EmittedNotice[]) {
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
}
