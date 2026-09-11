import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';

// constants and types
import { MISSING_POSITION_ASSIGNMENTS, NOT_FOUND } from '@Constants/errorConditionConstants';
import { TALLY } from '@Constants/extensionConstants';

type GetTallyArgs = {
  positionAssignment?: any;
};

/**
 * Mode-agnostic read of the round-robin tally on a PositionAssignment.
 *
 * In NATIVE write mode (5.0.0 default) the tally lives on
 * `positionAssignment.tally`. In LEGACY mode it lives on
 * `positionAssignment.extensions[{name: 'tally'}].value`. Callers should
 * never branch on mode — use this helper.
 */
export function getTally({ positionAssignment }: GetTallyArgs) {
  if (!positionAssignment) return { error: MISSING_POSITION_ASSIGNMENTS };

  const tally = firstClassOrExtension({ element: positionAssignment, attribute: 'tally', name: TALLY });
  if (tally === undefined) return { error: NOT_FOUND };

  return { tally };
}
