import { AD_HOC, LADDER, SWISS } from '@Constants/drawDefinitionConstants';

/**
 * AD_HOC here means a STRUCTURE SHAPE, not a competition philosophy: matchUps carrying neither
 * `roundPosition` nor `drawPosition`, so nothing is derived from bracket geometry.
 *
 * LADDER qualifies on that definition and gets the behaviour it needs for free — no drawSize
 * required, no stage capacity, no round generation unless `roundsCount` is supplied (a ladder
 * supplies none, so it generates zero matchUps), and participants assignable directly to a matchUp
 * side without drawPositions, which is exactly how a challenge creates one.
 *
 * What a ladder is NOT is unordered. Its `positionAssignments` ARE the standing, and `drawPosition`
 * is read as rank. Anything that needs that distinction should ask `isLadder`, not this.
 */
const AD_HOC_TYPES = new Set([AD_HOC, LADDER, SWISS]);

/** A bare drawType, or the engine's object param carrying one. */
export type DrawTypeArg = string | { drawType?: string };

/**
 * Accepts either a bare `drawType` or the engine's object param, because it is reachable both ways
 * and answering the wrong question silently is the failure this release exists to remove.
 *
 * Every engine method takes an object, so `engine.isAdHocType({ drawType })` arrives here as an object
 * while an internal caller passes the string directly. Before this accepted both, the engine path
 * resolved `drawType` to `undefined` and returned **false** — a confident wrong answer on a boolean
 * callers branch on, which is precisely the §5 fail-open class 7.0.0 closed for
 * `checkMatchUpIsComplete`.
 */
export function isAdHocType(arg?: DrawTypeArg): boolean {
  const drawType = typeof arg === 'string' ? arg : arg?.drawType;
  return !!drawType && AD_HOC_TYPES.has(drawType);
}
