import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { MISSING_MATCHUP } from '@Constants/errorConditionConstants';

type CheckMatchUpIsCompleteArgs = { matchUp?: any };

/**
 * Whether a matchUp has a result.
 *
 * TAKES A MATCHUP OBJECT, not a matchUpId. `paramsMiddleware` resolves `drawId` into a
 * `drawDefinition` and stops there — it does not resolve `matchUpId` into a matchUp — so an engine
 * caller writing `checkMatchUpIsComplete({ matchUpId, drawId })` supplies no matchUp at all.
 *
 * That used to answer `false`, which is a confident wrong answer to a question nobody could ask
 * correctly: a COMPLETED matchUp reported as incomplete, with no error to notice, and `false` being
 * the safe-looking branch. It refuses now.
 *
 * The matchUp does NOT need to be hydrated — `matchUpStatus` and `winningSide` are both first-class
 * on the stored record. It does need to be a real matchUp, which is what `matchUpId` establishes.
 *
 * ⚠️ THE RETURN IS DELIBERATELY NOT A CLEAN BOOLEAN. It is `true`, the `winningSide` (1 | 2), or
 * `undefined` — and the `undefined` is load-bearing: `tallyParticipantResults` distinguishes "not
 * complete" from "no answer" with `?? matchUp.matchUpType === TEAM`. Normalising to `false` would
 * silently drop incomplete TEAM matchUps from the round-robin tally.
 *
 * ⚠️ AND THE ERROR IS AN OBJECT, therefore TRUTHY. Never call this inside a `.filter()` or
 * `.every()` over an array that can hold a falsy entry without guarding the entry first — a refusal
 * would read as "complete". Every internal caller guards.
 */
export function checkMatchUpIsComplete({ matchUp }: CheckMatchUpIsCompleteArgs) {
  if (typeof matchUp !== 'object' || matchUp === null || !matchUp.matchUpId) return { error: MISSING_MATCHUP };
  return completedMatchUpStatuses.includes(matchUp.matchUpStatus) || matchUp.winningSide;
}
