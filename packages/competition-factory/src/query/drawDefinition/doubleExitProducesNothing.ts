import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';

// constants and types
import { CONTAINER } from '@Constants/drawDefinitionConstants';
import type { DrawDefinition, Structure } from '@Types/tournamentTypes';

/**
 * Where a double exit sends nobody on. A round robin group's matchUp (a container's) has no next matchUp. And A LUCKY
 * DRAW'S DOUBLE EXIT ADVANCES NOBODY (CA, 2026-11-17): it is written on its own matchUp and produces nothing in the next
 * round, no exit awarded to whoever stands or arrives there, no position sent on, no advance withdrawn. Who goes on
 * from a lucky draw's round is chosen (`luckyDrawAdvancement`), and a double exit chooses nobody.
 */
export const doubleExitProducesNothing = (
  structure: Readonly<Structure>,
  drawDefinition?: Readonly<DrawDefinition>,
): boolean => structure.structureType === CONTAINER || isLuckyBasedDraw(drawDefinition?.drawType);
