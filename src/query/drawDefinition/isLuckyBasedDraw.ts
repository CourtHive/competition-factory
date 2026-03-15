import { LUCKY_DRAW, ADAPTIVE } from '@Constants/drawDefinitionConstants';

const LUCKY_BASED_DRAW_TYPES = new Set([LUCKY_DRAW, ADAPTIVE]);

export function isLuckyBasedDraw(drawType?: string): boolean {
  return !!drawType && LUCKY_BASED_DRAW_TYPES.has(drawType);
}
