import {
  EITHER,
  OPERATOR,
  PEER,
  RESULT_CONFIRMED,
  RESULT_DISPUTED,
  RESULT_SUBMITTED,
} from '@Constants/ladderConstants';
import type { LadderPolicy } from '@Types/ladderTypes';

type AttestationArgs = { matchUp: any; policy: LadderPolicy };

export type Attestation = {
  /** True only when the policy's validation requirement is satisfied. */
  validated: boolean;
  submittedBy?: string;
  confirmedBy?: string;
  /** Set when someone has contested the submitted score — neither validated nor rejected. */
  disputed: boolean;
  reason?: string;
};

const latest = (matchUp: any, itemType: string) =>
  (matchUp?.timeItems ?? [])
    .filter((item: any) => item.itemType === itemType)
    .sort((a: any, b: any) => String(a.itemDate).localeCompare(String(b.itemDate)))
    .at(-1);

/**
 * Whether a submitted score has become a RESULT, and on whose word.
 *
 * On a published ladder members report their own scores, so "a score exists" and "a result was
 * agreed" are different facts. Conflating them lets one player reorder the ladder by self-reporting
 * a win nobody contradicted — which is why `applyLadderMovement` consults this rather than trusting
 * its caller.
 *
 * Peer acceptance and operator validation are the SAME transition with a different attestor; the
 * policy decides which attestors count.
 */
export function getResultAttestation({ matchUp, policy }: AttestationArgs): Attestation {
  const submitted = latest(matchUp, RESULT_SUBMITTED);
  const confirmed = latest(matchUp, RESULT_CONFIRMED);
  const disputed = latest(matchUp, RESULT_DISPUTED);

  const submittedBy = submitted?.itemValue?.participantId;
  const confirmedBy = confirmed?.itemValue?.participantId;
  const confirmedByOperator = !!confirmed?.itemValue?.operator;

  // A dispute raised AFTER a confirmation does not un-confirm it — an operator resolves that. A
  // dispute standing alone leaves the result unvalidated, which is the point of tracking it.
  const disputeStands = !!disputed && (!confirmed || String(disputed.itemDate) > String(confirmed.itemDate));
  if (disputeStands) {
    return { validated: false, disputed: true, submittedBy, reason: 'result is disputed' };
  }

  if (!submitted) return { validated: false, disputed: false, reason: 'no score has been submitted' };
  if (!confirmed) return { validated: false, disputed: false, submittedBy, reason: 'submitted score is unconfirmed' };

  const requirement = policy.resultValidation ?? EITHER;
  // A submitter cannot confirm their own score under any policy — that is the whole exposure.
  if (confirmedBy && submittedBy && confirmedBy === submittedBy && !confirmedByOperator) {
    return { validated: false, disputed: false, submittedBy, reason: 'a participant cannot confirm their own score' };
  }
  if (requirement === OPERATOR && !confirmedByOperator) {
    return { validated: false, disputed: false, submittedBy, confirmedBy, reason: 'operator validation is required' };
  }
  if (requirement === PEER && confirmedByOperator && !confirmedBy) {
    return { validated: false, disputed: false, submittedBy, reason: 'peer confirmation is required' };
  }

  return { validated: true, disputed: false, submittedBy, confirmedBy };
}
