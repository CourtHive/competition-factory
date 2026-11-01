import { getEntryProfileQualifiersCount } from '@Query/drawDefinition/getEntryProfileQualifiers';
import { decorateResult } from '@Functions/global/decorateResult';
import { isValidExtension } from './isValidExtension';

// constants and types
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { EventEntryProfile } from '@Types/tournamentTypes';
import { SelectionProcessEnum } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

const POSITIVE_COUNTS = ['entriesLimit', 'targetDrawSize', 'qualifyingDrawSize'];
const COUNTS = ['qualifiersCount', 'wildcardCount'];
const KNOWN_KEYS = new Set([
  ...POSITIVE_COUNTS,
  ...COUNTS,
  'qualifyingProfiles',
  'selectionProcess',
  'selectionScaleName',
  'waitlistEnabled',
  'extensions',
]);
const SELECTION_PROCESSES = new Set<string>(Object.values(SelectionProcessEnum));

const isCount = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;
const isPositiveCount = (value: unknown) => Number.isSafeInteger(value) && (value as number) > 0;

/**
 * Validates a complete `EventEntryProfile`, as it will be stored: known keys only, whole-number sizes,
 * a known `selectionProcess`, well-formed `qualifyingProfiles`, and sizes that fit together.
 */
export function validateEntryProfile(entryProfile: unknown): ResultType {
  const stack = 'validateEntryProfile';
  const invalid = (info: string) => decorateResult({ result: { error: INVALID_VALUES }, info, stack });

  if (!entryProfile || typeof entryProfile !== 'object' || Array.isArray(entryProfile))
    return invalid('entryProfile must be an object');
  const profile = entryProfile as Record<string, unknown>;

  const unknownKey = Object.keys(profile).find((key) => !KNOWN_KEYS.has(key));
  if (unknownKey) return invalid(`unknown entryProfile attribute: ${unknownKey}`);

  const badPositive = POSITIVE_COUNTS.find((key) => profile[key] !== undefined && !isPositiveCount(profile[key]));
  if (badPositive) return invalid(`${badPositive} must be a positive whole number`);
  const badCount = COUNTS.find((key) => profile[key] !== undefined && !isCount(profile[key]));
  if (badCount) return invalid(`${badCount} must be a whole number`);

  if (profile.selectionProcess !== undefined && !SELECTION_PROCESSES.has(profile.selectionProcess as string))
    return invalid('unknown selectionProcess');
  if (profile.selectionScaleName !== undefined && typeof profile.selectionScaleName !== 'string')
    return invalid('selectionScaleName must be a string');
  if (profile.waitlistEnabled !== undefined && typeof profile.waitlistEnabled !== 'boolean')
    return invalid('waitlistEnabled must be a boolean');
  if (
    profile.extensions !== undefined &&
    (!Array.isArray(profile.extensions) || !profile.extensions.every((extension) => isValidExtension({ extension })))
  )
    return invalid('extensions must be valid extensions');

  const qualifyingResult = checkQualifying(profile as EventEntryProfile, invalid);
  if (qualifyingResult) return qualifyingResult;

  const { targetDrawSize, wildcardCount = 0 } = profile as EventEntryProfile;
  const qualifierPositions = getEntryProfileQualifiersCount(profile as EventEntryProfile);
  if (targetDrawSize && qualifierPositions + wildcardCount > targetDrawSize)
    return invalid('qualifier and wildcard places exceed targetDrawSize');

  return { ...SUCCESS };
}

function checkQualifying(profile: EventEntryProfile, invalid: (info: string) => ResultType): ResultType | undefined {
  const { qualifyingProfiles, qualifyingDrawSize, qualifiersCount } = profile;

  if (qualifyingDrawSize && qualifiersCount && qualifiersCount >= qualifyingDrawSize)
    return invalid('qualifiersCount must be fewer than qualifyingDrawSize');

  if (qualifyingProfiles === undefined) return undefined;
  if (qualifyingDrawSize !== undefined || qualifiersCount !== undefined)
    return invalid('qualifyingProfiles replaces qualifyingDrawSize and qualifiersCount; state one or the other');
  if (!Array.isArray(qualifyingProfiles)) return invalid('qualifyingProfiles must be an array');

  for (const qualifyingProfile of qualifyingProfiles) {
    const { roundTarget, structureProfiles, ...others } = qualifyingProfile ?? {};
    if (Object.keys(others).length) return invalid(`unknown qualifying profile attribute: ${Object.keys(others)[0]}`);
    if (roundTarget !== undefined && !isPositiveCount(roundTarget))
      return invalid('roundTarget must be a positive whole number');
    if (!Array.isArray(structureProfiles) || !structureProfiles.length)
      return invalid('each qualifying profile needs structureProfiles');
    for (const structureProfile of structureProfiles) {
      const { stageSequence, drawSize, qualifyingPositions, ...rest } = structureProfile ?? {};
      if (Object.keys(rest).length) return invalid(`unknown structureProfile attribute: ${Object.keys(rest)[0]}`);
      if (
        ![stageSequence, drawSize, qualifyingPositions].every((value) => value === undefined || isPositiveCount(value))
      )
        return invalid('structureProfile sizes must be positive whole numbers');
      if (drawSize && qualifyingPositions && qualifyingPositions >= drawSize)
        return invalid('qualifyingPositions must be fewer than drawSize');
    }
  }

  return undefined;
}
