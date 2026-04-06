import { AD_HOC, SWISS } from '@Constants/drawDefinitionConstants';

const AD_HOC_TYPES = new Set([AD_HOC, SWISS]);

export function isAdHocType(drawType?: string): boolean {
  return !!drawType && AD_HOC_TYPES.has(drawType);
}
