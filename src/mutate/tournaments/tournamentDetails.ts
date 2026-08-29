import { requireParams } from '@Helpers/parameters/requireParams';
import { addNotes, removeNotes } from '../base/addRemoveNotes';
import { addNotice } from '@Global/state/globalState';

// constants
import { INVALID_TIME_ZONE, INVALID_VALUES, TOURNAMENT_CATEGORY_IN_USE } from '@Constants/errorConditionConstants';
import { MODIFY_TOURNAMENT_DETAIL } from '@Constants/topicConstants';
import { TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function setTournamentName({ tournamentRecord, promotionalName, tournamentName, formalName }) {
  const paramsCheck = requireParams({ tournamentRecord }, [TOURNAMENT_RECORD]);
  if (paramsCheck.error) return paramsCheck;
  const tournamentId = tournamentRecord.tournamentId;

  const detailUpdates: any = { tournamentId };

  if (tournamentName && tournamentName !== tournamentRecord.tournamentName) {
    tournamentRecord.tournamentName = tournamentName;
    detailUpdates.tournamentName = tournamentName;
  }
  if (promotionalName && promotionalName !== tournamentRecord.promotionalName) {
    tournamentRecord.promotionalName = promotionalName;
    detailUpdates.promotionalName = promotionalName;
  }
  if (formalName && formalName !== tournamentRecord.formalName) {
    tournamentRecord.formalName = formalName;
    detailUpdates.formalName = formalName;
  }
  if (tournamentRecord.promotionalName === tournamentRecord.tournamentName) {
    delete tournamentRecord.promotionalName;
    detailUpdates.promotionalName = '';
  }
  if (tournamentRecord.formalName === tournamentRecord.tournamentName) {
    delete tournamentRecord.formalName;
    detailUpdates.formalName = '';
  }

  if (Object.keys(detailUpdates).length > 1) {
    addNotice({
      topic: MODIFY_TOURNAMENT_DETAIL,
      payload: {
        parentOrganisation: tournamentRecord.parentOrganisation,
        tournamentId,
        ...detailUpdates,
      },
    });
  }

  return { ...SUCCESS };
}

export function setTournamentNotes({ tournamentRecord, notes }) {
  const paramsCheck = requireParams({ tournamentRecord }, [TOURNAMENT_RECORD]);
  if (paramsCheck.error) return paramsCheck;

  const result = notes ? addNotes({ element: tournamentRecord, notes }) : removeNotes({ element: tournamentRecord });
  if (result.error) return result;

  addNotice({
    topic: MODIFY_TOURNAMENT_DETAIL,
    payload: {
      parentOrganisation: tournamentRecord.parentOrganisation,
      tournamentId: tournamentRecord.tournamentId,
      notes: notes ?? '',
    },
  });

  return { ...SUCCESS };
}

/**
 * Set (or clear) the tournament's IANA local time zone
 * (`tournamentRecord.localTimeZone`). Consumers use it to render
 * timestamps in the tournament's canonical zone rather than the
 * viewing laptop's local zone, so scores stay consistent regardless
 * of which device is displaying them.
 *
 *   localTimeZone: 'America/New_York'   — set / change
 *   localTimeZone: '' | null | undefined — clear
 *
 * Validation uses the JS runtime's `Intl.DateTimeFormat` IANA
 * database; any string that constructor rejects is returned as
 * `INVALID_TIME_ZONE` without mutating state.
 *
 * No-op on unchanged value.
 */
export function setTournamentLocalTimeZone({ tournamentRecord, localTimeZone }) {
  const paramsCheck = requireParams({ tournamentRecord }, [TOURNAMENT_RECORD]);
  if (paramsCheck.error) return paramsCheck;

  const normalised = typeof localTimeZone === 'string' ? localTimeZone.trim() : '';

  if (normalised) {
    try {
      // Any IANA zone that the runtime doesn't recognise throws here.
      new Intl.DateTimeFormat(undefined, { timeZone: normalised });
    } catch {
      return { error: INVALID_TIME_ZONE };
    }
  }

  const previous = tournamentRecord.localTimeZone;
  if (normalised === (previous ?? '')) return { ...SUCCESS };

  if (normalised) {
    tournamentRecord.localTimeZone = normalised;
  } else {
    delete tournamentRecord.localTimeZone;
  }

  addNotice({
    topic: MODIFY_TOURNAMENT_DETAIL,
    payload: {
      parentOrganisation: tournamentRecord.parentOrganisation,
      tournamentId: tournamentRecord.tournamentId,
      localTimeZone: normalised,
    },
  });

  return { ...SUCCESS };
}

/**
 * Set (or clear) the tournament's competitive tier classification.
 *
 *   tournamentTier: { system: 'ITF_JUNIOR', value: '3', numericRank: 3 }  — set
 *   tournamentTier: null | undefined                                       — clear
 *
 * The tier is orthogonal to `tournamentLevel` (organizational scope).
 * Ranking policies use `tierToLevel` mappings to resolve numeric levels
 * from the tier's system + value.
 */
export function setTournamentTier({ tournamentRecord, tournamentTier }) {
  const paramsCheck = requireParams({ tournamentRecord }, [TOURNAMENT_RECORD]);
  if (paramsCheck.error) return paramsCheck;

  if (tournamentTier && typeof tournamentTier === 'object') {
    if (!tournamentTier.system || !tournamentTier.value) {
      return { error: 'TierClassification requires system and value' };
    }
    tournamentRecord.tournamentTier = {
      system: String(tournamentTier.system).trim(),
      value: String(tournamentTier.value).trim(),
      ...(tournamentTier.numericRank !== undefined ? { numericRank: Number(tournamentTier.numericRank) } : {}),
    };
  } else {
    delete tournamentRecord.tournamentTier;
  }

  addNotice({
    topic: MODIFY_TOURNAMENT_DETAIL,
    payload: {
      parentOrganisation: tournamentRecord.parentOrganisation,
      tournamentId: tournamentRecord.tournamentId,
      tournamentTier: tournamentRecord.tournamentTier ?? null,
    },
  });

  return { ...SUCCESS };
}

/**
 * Reject an entry fee that cannot be read at a known scale.
 *
 * `setRegistrationProfile` previously merged whatever object it was handed with no validation of any
 * kind, so a fee with no `unit` — the exact ambiguity `MonetaryAmount` exists to remove — was stored
 * without complaint and read back 100× wrong by any consumer that assumed whole units.
 *
 * Deliberately narrow. It checks the fields whose absence makes the amount UNREADABLE and nothing
 * else: this is a previously ungated path, and a validator that fails closed on shapes callers have
 * always been allowed to write would be a worse defect than the one it fixes.
 *
 * NOT the only write path, and deliberately so. `activateFromSanctioning` assigns
 * `registrationProfile: proposal.registrationProfile` straight onto the record without coming
 * through here, so a proposal authored before `unit` existed still activates. That hole is left
 * open on purpose: an application mid-flight is the worst place to fail closed, and the read side
 * (`resolveEntryFee`) reports such a fee as indeterminate rather than rendering it wrong. Close it
 * when proposals are known to carry units.
 */
function invalidEntryFee(entryFees: any): boolean {
  if (!Array.isArray(entryFees)) return false;
  return entryFees.some(
    (fee) => fee && typeof fee === 'object' && typeof fee.amount === 'number' && (!fee.currencyCode || !fee.unit),
  );
}

export function setRegistrationProfile({ tournamentRecord, registrationProfile }) {
  const paramsCheck = requireParams({ tournamentRecord }, [TOURNAMENT_RECORD]);
  if (paramsCheck.error) return paramsCheck;

  if (invalidEntryFee(registrationProfile?.entryFees)) return { error: INVALID_VALUES };

  if (registrationProfile && typeof registrationProfile === 'object') {
    tournamentRecord.registrationProfile = {
      ...tournamentRecord.registrationProfile,
      ...registrationProfile,
    };
  } else {
    delete tournamentRecord.registrationProfile;
  }

  addNotice({
    topic: MODIFY_TOURNAMENT_DETAIL,
    payload: {
      parentOrganisation: tournamentRecord.parentOrganisation,
      tournamentId: tournamentRecord.tournamentId,
      registrationProfile: tournamentRecord.registrationProfile ?? null,
    },
  });

  return { ...SUCCESS };
}

export function setTournamentCategories({ tournamentRecord, categories }) {
  const paramsCheck = requireParams({ tournamentRecord }, [TOURNAMENT_RECORD]);
  if (paramsCheck.error) return paramsCheck;
  categories = (categories ?? []).filter((category) => category.categoryName && category.type);

  // Reject any removal that would leave an event.category orphaned. The
  // join key matches what consumers use (ageCategoryCode if present, else
  // categoryName); both are walked so a partial-shape event reference
  // still gets caught.
  const incomingCodes = new Set<string>();
  const incomingNames = new Set<string>();
  for (const category of categories) {
    if (category.ageCategoryCode) incomingCodes.add(category.ageCategoryCode);
    if (category.categoryName) incomingNames.add(category.categoryName);
  }

  const referenced: string[] = [];
  for (const event of tournamentRecord.events ?? []) {
    const eventCategory = event?.category;
    if (!eventCategory) continue;
    const code = eventCategory.ageCategoryCode;
    const name = eventCategory.categoryName;
    if (code && !incomingCodes.has(code) && !incomingNames.has(code)) {
      referenced.push(code);
      continue;
    }
    if (name && !incomingNames.has(name) && !incomingCodes.has(name)) {
      referenced.push(name);
    }
  }

  if (referenced.length) {
    return { error: TOURNAMENT_CATEGORY_IN_USE, referenced: [...new Set(referenced)] };
  }

  tournamentRecord.tournamentCategories = categories;

  addNotice({
    topic: MODIFY_TOURNAMENT_DETAIL,
    payload: {
      parentOrganisation: tournamentRecord.parentOrganisation,
      tournamentId: tournamentRecord.tournamentId,
      categories,
    },
  });

  return { ...SUCCESS };
}
