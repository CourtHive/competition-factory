import { getAccessorValue } from './getAccessorValue';

// extracts targeted attributes
// e.g. const byeAssignments = positionAssignments.filter(xa('bye')).map(xa('drawPosition'));
// supports xa('string'), xa(['string', 'string']), xa({ attr1: true, attr2: true })
type Accessor = string | string[] | { [key: string]: unknown };
export const extractAttributes = (accessor?: Accessor) => (element: unknown) =>
  !accessor || typeof element !== 'object'
    ? undefined
    : (Array.isArray(accessor) &&
        accessor.map((a) => ({
          [a]: getAccessorValue({ element, accessor: a })?.value,
        }))) ||
      (typeof accessor === 'object' &&
        Object.keys(accessor).map((key) => ({
          [key]: getAccessorValue({ element, accessor: key })?.value,
        }))) ||
      (typeof accessor === 'string' && getAccessorValue({ element, accessor }))?.value;
export const xa = extractAttributes;
