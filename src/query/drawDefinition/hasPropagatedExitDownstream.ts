import { isDoubleExit, isExit } from '@Validators/isExit';

export function hasPropagatedExitDownstream(params) {
  // relevantLink is passed in iterative calls (see below)
  const { targetData, matchUpsMap } = params;

  const {
    targetMatchUps: { loserMatchUp },
  } = targetData;

  const isLoserMatchUpWO = isExit(loserMatchUp?.matchUpStatus);
  const hasLoserMatchUpUpstreamWOMatches = !!matchUpsMap?.drawMatchUps.find(
    (m) => m.loserMatchUpId === loserMatchUp?.matchUpId && isExit(m.matchUpStatus),
  );

  //if there is a downstream match with two propagated exits we mark it as active
  // `=== DOUBLE_WALKOVER` meant "is this a double exit"; a DOUBLE_DEFAULT reached here and took the
  // false branch 161 times over the 600-seed sweep window, against 526 DOUBLE_WALKOVERs.
  return (
    (hasLoserMatchUpUpstreamWOMatches && isDoubleExit(loserMatchUp?.matchUpStatus)) ||
    //if there is a downstream propagated exit and we are trying to clear the score we stop the user
    //by marking the downstream as active
    (hasLoserMatchUpUpstreamWOMatches && isLoserMatchUpWO)
  );
}
