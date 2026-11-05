import { findExtension } from '@Helpers/extensions/findExtension';

// constants and types
import { INVALID_VALUES, ErrorType } from '@Constants/errorConditionConstants';
import type { DrawDefinition } from '@Types/tournamentTypes';
import type { SwissPolicy } from '@Types/swissTypes';

/** the points a pairing-allocated bye may score: a win, a draw or a loss */
const BYE_POINTS = [1, 0.5, 0];

/**
 * The Swiss policy in force: the one given, else the draw's `swissPolicy` extension. A `byePoints` that is not a win, a
 * draw or a loss is refused, so no round is paired and no standing ranked on a score the points system cannot hold.
 */
export function swissPolicyOf({
  drawDefinition,
  swissPolicy,
}: {
  drawDefinition: DrawDefinition;
  swissPolicy?: SwissPolicy;
}): { swissPolicy?: SwissPolicy; error?: ErrorType; info?: string } {
  const policy =
    swissPolicy ??
    (findExtension({ element: drawDefinition, name: 'swissPolicy' })?.extension?.value as SwissPolicy | undefined);
  if (policy?.byePoints !== undefined && !BYE_POINTS.includes(policy.byePoints)) {
    return { error: INVALID_VALUES, info: 'swissPolicy.byePoints must be 1, 0.5 or 0' };
  }
  return { swissPolicy: policy };
}
