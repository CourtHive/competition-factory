import { writeLegacyEnabled, writeNativeEnabled, addNotice } from '@Global/state/globalState';
import { removeExtension } from '@Mutate/extensions/removeExtension';
import { requireParams } from '@Helpers/parameters/requireParams';
import { addExtension } from '@Mutate/extensions/addExtension';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import type { SanctionConstraints, SanctionEventConstraints, Tournament } from '@Types/tournamentTypes';
import { DOUBLES_EVENT, SINGLES_EVENT, TEAM_EVENT } from '@Constants/eventConstants';
import { SANCTIONING_CONSTRAINTS } from '@Constants/extensionConstants';
import { MODIFY_TOURNAMENT_DETAIL } from '@Constants/topicConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import type { ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

const EVENT_TYPES: string[] = [SINGLES_EVENT, DOUBLES_EVENT, TEAM_EVENT];
const LIMITS = ['drawSize', 'maxWildcards', 'maxAlternates', 'maxQualifiers'] as const;

type SetSanctionConstraintsArgs = {
  tournamentRecord: Tournament;
  /** the resolved limits; `undefined` or `null` removes them */
  constraints?: SanctionConstraints | null;
};

const isText = (value: unknown, required?: boolean) =>
  value === undefined ? !required : typeof value === 'string' && (!required || !!value.trim());
const onlyKeys = (value: object, keys: string[]) => Object.keys(value).every((key) => keys.includes(key));
const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** What is wrong with a constraints value, or undefined when it is well formed. */
export function sanctionConstraintsError(constraints: unknown): string | undefined {
  if (!isObject(constraints)) return 'constraints must be an object';
  if (!onlyKeys(constraints, ['definedBy', 'source', 'events', 'extensions'])) return 'unknown constraints attribute';
  const { definedBy, source, events } = constraints;
  if (!isObject(definedBy) || !isText(definedBy.providerId, true))
    return 'definedBy.providerId is required: sanction constraints are defined by a provider';
  if (!onlyKeys(definedBy, ['providerId', 'organisationName']) || !isText(definedBy.organisationName))
    return 'invalid definedBy';
  if (
    source !== undefined &&
    (!isObject(source) ||
      !onlyKeys(source, ['policyName', 'policyVersion']) ||
      !isText(source.policyName) ||
      !isText(source.policyVersion))
  )
    return 'invalid source';
  if (!Array.isArray(events)) return 'events must be an array';
  for (const [index, event] of events.entries()) {
    const error = eventConstraintsError(event);
    if (error) return `events[${index}]: ${error}`;
  }
  return undefined;
}

function eventConstraintsError(event: unknown): string | undefined {
  if (!isObject(event) || !onlyKeys(event, ['match', ...LIMITS])) return 'unknown event constraints attribute';
  const { match } = event;
  if (!isObject(match) || !EVENT_TYPES.includes(match.eventType as string))
    return 'match.eventType must be an event type';
  if (!onlyKeys(match, ['eventType', 'eventName', 'categoryName'])) return 'unknown match attribute';
  if (!isText(match.eventName) || !isText(match.categoryName)) return 'invalid match';
  for (const limit of LIMITS) {
    const value = event[limit];
    if (value !== undefined && !(typeof value === 'number' && Number.isInteger(value) && value >= 0))
      return `${limit} must be a whole number of 0 or more`;
  }
  return undefined;
}

/** An event entry in the legacy `sanctioningConstraints` extension's shape. */
function toLegacyEventConstraints({ match, ...limits }: SanctionEventConstraints) {
  return {
    eventType: match.eventType,
    ...(match.eventName ? { eventName: match.eventName } : {}),
    ...(match.categoryName ? { category: { categoryName: match.categoryName } } : {}),
    ...limits,
  };
}

/**
 * Records the limits a sanctioning provider's rules set for this tournament on its sanction (`sanction.constraints`).
 *
 * The limits are PROVIDER-DEFINED: the provider curates its rules where sanctioning applications are reviewed, and they
 * are resolved into these per-tournament limits there. The factory validates their shape and enforces them; it never
 * derives them, so `definedBy.providerId` is required. A tournament with no sanction cannot hold them.
 *
 * Write modes, as for every former extension: NATIVE writes `sanction.constraints` and removes a stale
 * `sanctioningConstraints` extension; BRIDGE writes both; LEGACY writes the extension only.
 */
export function setSanctionConstraints(params: SetSanctionConstraintsArgs): ResultType {
  const paramsCheck = requireParams(params, [TOURNAMENT_RECORD]);
  if (paramsCheck.error) return paramsCheck;
  const { tournamentRecord, constraints } = params;
  const sanction = tournamentRecord.sanction;
  if (!sanction) return { error: INVALID_VALUES, info: 'the tournament holds no sanction' };

  const remove = constraints === undefined || constraints === null;
  if (!remove) {
    const info = sanctionConstraintsError(constraints);
    if (info) return { error: INVALID_VALUES, info };
  }
  const value = remove ? undefined : (makeDeepCopy(constraints, false, true) as SanctionConstraints);

  if (writeNativeEnabled()) {
    if (value) sanction.constraints = value;
    else delete sanction.constraints;
  }
  if (writeLegacyEnabled()) {
    if (value) {
      const extension = {
        name: SANCTIONING_CONSTRAINTS,
        value: { events: value.events.map(toLegacyEventConstraints) },
      };
      const result = addExtension({ element: tournamentRecord, extension });
      if (result.error) return result;
    } else {
      removeExtension({ element: tournamentRecord, name: SANCTIONING_CONSTRAINTS });
    }
  } else if (tournamentRecord.extensions?.some((extension) => extension?.name === SANCTIONING_CONSTRAINTS)) {
    removeExtension({ element: tournamentRecord, name: SANCTIONING_CONSTRAINTS });
  }

  addNotice({
    topic: MODIFY_TOURNAMENT_DETAIL,
    payload: {
      parentOrganisation: tournamentRecord.parentOrganisation,
      tournamentId: tournamentRecord.tournamentId,
      sanction: tournamentRecord.sanction,
      extensions: tournamentRecord.extensions ?? [],
    },
  });

  return { ...SUCCESS };
}
