import { isObject, isString } from '@Tools/objects';
import { countries } from '@Fixtures/countryData';

// constants and types
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { ResultType } from '@Types/factoryTypes';
import {
  PlayingDoubleHandCodeEnum,
  OnlineResourceTypeEnum,
  PlayingHandCodeEnum,
  AddressTypeEnum,
  LengthUnitEnum,
  WeightUnitEnum,
} from '@Types/tournamentTypes';

/**
 * Shape checks for the structured `person` attributes `modifyParticipant` writes, following the CODES schema
 * (`src/global/schema/tournament.schema.json`). Each object type is closed (`additionalProperties: false` in the
 * schema), so an unknown key is refused rather than stored. A check returns `undefined` when the value is valid,
 * and an INVALID_VALUES result naming the field when it is not.
 */

type Kind = 'string' | 'number' | 'boolean' | 'stringOrNumber' | 'country' | 'strings' | readonly string[];
type Shape = Record<string, Kind | ((value: unknown, field: string) => ResultType | undefined)>;

// Every CODES object carries these. `extensions` and `timeItems` are accepted as arrays: nested objects have no
// setter of their own, so they travel with their parent.
const baseShape: Shape = {
  createdAt: 'stringOrNumber',
  updatedAt: 'stringOrNumber',
  isMock: 'boolean',
  notes: 'string',
  extensions: arrayOfObjects,
  timeItems: arrayOfObjects,
};

const teamAttributeShape: Shape = {
  teamId: 'string',
  teamName: 'string',
  jerseyNumber: 'string',
  jerseyName: 'string',
  position: 'string',
  captain: 'boolean',
};

const addressShape: Shape = {
  ...baseShape,
  addressLine1: 'string',
  addressLine2: 'string',
  addressLine3: 'string',
  addressName: 'string',
  addressType: Object.values(AddressTypeEnum),
  city: 'string',
  countryCode: 'country',
  // the schema says string; production records also carry numbers (see Address.latitude)
  latitude: 'stringOrNumber',
  longitude: 'stringOrNumber',
  postalCode: 'string',
  state: 'string',
  timeZone: 'string',
};

const onlineResourceShape: Shape = {
  ...baseShape,
  identifier: 'string',
  name: 'string',
  provider: 'string',
  resourceSubType: 'string',
  resourceType: Object.values(OnlineResourceTypeEnum),
};

const biographicalInformationShape: Shape = {
  ...baseShape,
  ageBeganTennis: 'number',
  ageTurnedPro: 'number',
  birthCountryCode: 'country',
  coachId: 'string',
  doublePlayingHand: Object.values(PlayingDoubleHandCodeEnum),
  height: 'number',
  heightUnit: Object.values(LengthUnitEnum),
  organisationIds: 'strings',
  placeOfResidence: 'string',
  playingHand: Object.values(PlayingHandCodeEnum),
  residenceCountryCode: 'country',
  weight: 'number',
  weightUnit: Object.values(WeightUnitEnum),
  teamAttributes: (value, field) => checkArrayOf(value, field, teamAttributeShape),
};

export function validNationalityCode(code: unknown): boolean {
  return countries
    .flatMap(({ iso, ioc }) => [iso, ioc])
    .filter(Boolean)
    .includes(code as string);
}

export function refusal(field: string, info: string, value?: unknown): ResultType {
  return { error: INVALID_VALUES, info: `${field}: ${info}`, context: { field, value } };
}

export function checkAddresses(value: unknown): ResultType | undefined {
  return checkArrayOf(value, 'person.addresses', addressShape);
}

export function checkOnlineResources(value: unknown, field: string): ResultType | undefined {
  return checkArrayOf(value, field, onlineResourceShape);
}

export function checkBiographicalInformation(value: unknown): ResultType | undefined {
  return checkObject(value, 'person.biographicalInformation', biographicalInformationShape);
}

export function checkStrings(value: unknown, field: string): ResultType | undefined {
  if (!Array.isArray(value) || !value.every(isString)) return refusal(field, 'must be an array of strings', value);
  return undefined;
}

function arrayOfObjects(value: unknown, field: string): ResultType | undefined {
  if (!Array.isArray(value) || !value.every(isObject)) return refusal(field, 'must be an array of objects', value);
  return undefined;
}

function checkArrayOf(value: unknown, field: string, shape: Shape): ResultType | undefined {
  if (!Array.isArray(value)) return refusal(field, 'must be an array', value);
  for (const [index, item] of value.entries()) {
    const result = checkObject(item, `${field}[${index}]`, shape);
    if (result) return result;
  }
  return undefined;
}

function checkObject(value: unknown, field: string, shape: Shape): ResultType | undefined {
  if (!isObject(value)) return refusal(field, 'must be an object', value);
  for (const [key, attribute] of Object.entries(value as Record<string, unknown>)) {
    if (attribute === undefined) continue;
    const kind = shape[key];
    const path = `${field}.${key}`;
    if (!kind) return refusal(path, 'is not a CODES attribute', attribute);
    const result = typeof kind === 'function' ? kind(attribute, path) : checkKind(attribute, path, kind);
    if (result) return result;
  }
  return undefined;
}

function checkKind(value: unknown, field: string, kind: Exclude<Kind, never>): ResultType | undefined {
  if (Array.isArray(kind)) {
    return kind.includes(value as string) ? undefined : refusal(field, `must be one of ${kind.join(', ')}`, value);
  }
  const valid: Record<string, () => boolean> = {
    string: () => isString(value),
    number: () => typeof value === 'number' && Number.isFinite(value),
    boolean: () => typeof value === 'boolean',
    stringOrNumber: () => isString(value) || (typeof value === 'number' && Number.isFinite(value)),
    country: () => isString(value) && validNationalityCode(value),
    strings: () => Array.isArray(value) && value.every(isString),
  };
  return valid[kind as string]() ? undefined : refusal(field, `must be ${describe(kind as string)}`, value);
}

function describe(kind: string): string {
  const descriptions: Record<string, string> = {
    stringOrNumber: 'a string or a number',
    country: 'a country code',
    strings: 'an array of strings',
  };
  return descriptions[kind] ?? `a ${kind}`;
}
