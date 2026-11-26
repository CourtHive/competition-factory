import { firstClassOrExtension } from '@Helpers/extensions/firstClassOrExtension';
import { defaultsHash, defaultsHashes } from '@Fixtures/policies/defaultsHash';
import { extensionConstants } from '@Constants/extensionConstants';

// constants and types
import { ErrorType, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { APPLIED_POLICIES } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import type { Tournament } from '@Types/tournamentTypes';

const { FACTORY } = extensionConstants;

type GetDefaultsDriftArgs = { tournamentRecord?: Tournament };

export type DefaultsDriftResult = {
  success?: boolean;
  error?: ErrorType;
  /** the running factory's `defaultsHash` */
  defaultsHash?: string;
  /** the `defaultsHash` the record was stamped with; absent when it carries none */
  stampedDefaultsHash?: string;
  /**
   * The policy types the record leaves to the engine's defaults whose defaults differ from those it was stamped with,
   * sorted. `[]` when nothing it relies on changed. Absent (`undefined`) when the record carries no stamp, so cannot say.
   */
  defaultsDrift?: string[];
};

/**
 * Whether the defaults a record relies on have changed since it was stamped, and for which policy types.
 *
 * Reads the record's `factory` stamp and its own tournament-level applied policies: nothing else, and nothing below
 * the root. A type the tournament pins is never reported, because a pinned policy is stored in full and does not drift.
 * A type with a default in only one of the two sets (added or retired since) is reported. A stamp without per-type
 * hashes reports every unpinned type when the overall hash differs.
 *
 * It never refuses a record and changes nothing: the engine always uses its current defaults. The answer is for a
 * client to surface.
 */
export function getDefaultsDrift({ tournamentRecord }: GetDefaultsDriftArgs = {}): DefaultsDriftResult {
  if (!tournamentRecord || typeof tournamentRecord !== 'object') return { error: MISSING_TOURNAMENT_RECORD };

  const stamp = firstClassOrExtension({ element: tournamentRecord, attribute: 'factory', name: FACTORY });
  const stampedDefaultsHash = typeof stamp?.defaultsHash === 'string' ? stamp.defaultsHash : undefined;
  if (!stampedDefaultsHash) return { ...SUCCESS, defaultsHash };
  if (stampedDefaultsHash === defaultsHash) return { ...SUCCESS, defaultsHash, stampedDefaultsHash, defaultsDrift: [] };

  const pinned =
    firstClassOrExtension({ element: tournamentRecord, attribute: 'appliedPolicies', name: APPLIED_POLICIES }) ?? {};
  const stampedHashes =
    stamp.defaultsHashes && typeof stamp.defaultsHashes === 'object' ? stamp.defaultsHashes : undefined;
  const policyTypes = new Set([...Object.keys(defaultsHashes), ...Object.keys(stampedHashes ?? {})]);
  const defaultsDrift = [...policyTypes]
    .filter((policyType) => !pinned[policyType])
    .filter((policyType) => !stampedHashes || stampedHashes[policyType] !== defaultsHashes[policyType])
    .sort((a, b) => a.localeCompare(b));

  return { ...SUCCESS, defaultsHash, stampedDefaultsHash, defaultsDrift };
}
