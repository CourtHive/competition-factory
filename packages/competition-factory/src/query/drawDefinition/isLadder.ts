import { LADDER } from '@Constants/drawDefinitionConstants';

import type { DrawTypeArg } from './isAdHocType';

/**
 * A ladder shares the AD_HOC structure SHAPE but not its meaning: a ladder's `positionAssignments`
 * are an ordered standing, where an `AD_HOC` draw's are merely a roster. Ask this — not
 * `isAdHocType` — wherever that difference matters.
 */
/**
 * Accepts either a bare `drawType` or the engine's object param, because it is reachable both ways
 * and answering the wrong question silently is the failure this release exists to remove.
 *
 * Every engine method takes an object, so `engine.isLadder({ drawType })` arrives here as an object
 * while an internal caller passes the string directly. Before this accepted both, the engine path
 * resolved `drawType` to `undefined` and returned **false** — a confident wrong answer on a boolean
 * callers branch on, which is precisely the §5 fail-open class 7.0.0 closed for
 * `checkMatchUpIsComplete`.
 */
export function isLadder(arg?: DrawTypeArg): boolean {
  const drawType = typeof arg === 'string' ? arg : arg?.drawType;
  return drawType === LADDER;
}
