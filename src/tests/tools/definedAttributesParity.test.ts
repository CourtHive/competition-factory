import { definedAttributes } from '@Tools/definedAttributes';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, vi } from 'vitest';

// definedAttributes builds its result in one object rather than merging a one-key object per attribute. Every
// output must be unchanged, so each case is filtered by the current implementation and by the one it replaced (kept
// verbatim below as referenceDefinedAttributes), and the results are compared, including which values are shared
// with the source rather than rebuilt.

let enabled = true;
vi.mock('@Global/state/globalState', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@Global/state/globalState')>()),
  deepCopyEnabled: () => ({ enabled }),
}));
const deepCopyEnabled = () => ({ enabled });

function referenceGetDefinedKeys(obj, ignoreValues, ignoreEmptyArrays) {
  return Object.keys(obj).filter(
    (key) =>
      !ignoreValues.includes(obj[key]) && (!ignoreEmptyArrays || (Array.isArray(obj[key]) ? obj[key].length : true)),
  );
}

function referenceDefinedAttributes(
  obj: object,
  ignoreFalse?: boolean,
  ignoreEmptyArrays?: boolean,
  shallow?: boolean,
) {
  if (typeof obj !== 'object' || obj === null) return obj;
  const deepCopy = deepCopyEnabled();
  if (!deepCopy?.enabled) shallow = true;

  const ignoreValues: any[] = ['', undefined, null];
  if (ignoreFalse) ignoreValues.push(false);

  const definedKeys = referenceGetDefinedKeys(obj, ignoreValues, ignoreEmptyArrays);

  return Object.assign(
    {},
    ...definedKeys.map((key) => {
      return Array.isArray(obj[key])
        ? {
            [key]: shallow ? obj[key] : obj[key].map(referenceDefinedElement),
          } // doesn't filter out undefined array elements
        : { [key]: shallow ? obj[key] : referenceDefinedAttributes(obj[key]) };
    }),
  );
}

function referenceDefinedElement(element: unknown): unknown {
  return Array.isArray(element) ? element.map(referenceDefinedElement) : referenceDefinedAttributes(element as object);
}

// the paths at which a result holds the source's own object rather than a rebuilt one
function sharedPaths(result, source, path = '', found: string[] = []) {
  if (typeof result !== 'object' || result === null) return found;
  if (result === source) found.push(path || '<root>');
  else if (typeof source === 'object' && source !== null) {
    for (const key of Object.keys(result)) sharedPaths(result[key], source[key], `${path}.${key}`, found);
  }
  return found;
}

const { tournamentRecord } = mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 8 }, { drawSize: 4, eventType: 'DOUBLES' }],
  completeAllMatchUps: true,
});

const crafted = {
  empty: '',
  nothing: null,
  missing: undefined,
  no: false,
  zero: 0,
  notANumber: Number.NaN,
  when: new Date('2026-10-17T12:00:00Z'),
  fn: () => 'kept',
  none: [],
  list: [1, null, undefined, '', false, [], [2, [3, { a: null, b: '', c: [] }]], { deep: { no: false, gone: null } }],
  nested: { empty: '', no: false, none: [], inner: { gone: undefined, kept: 'yes', none: [] } },
};

const sources: any[] = [
  crafted,
  tournamentRecord,
  ...tournamentRecord.participants,
  tournamentRecord.events[0],
  [crafted, 'x', null],
  'text',
  7,
  null,
  undefined,
];

it('filters every case exactly as the implementation it replaced', () => {
  let compared = 0;
  for (const deepCopy of [true, false]) {
    enabled = deepCopy;
    for (const source of sources) {
      for (const ignoreFalse of [undefined, false, true]) {
        for (const ignoreEmptyArrays of [undefined, true]) {
          for (const shallow of [undefined, false, true]) {
            const args = [ignoreFalse, ignoreEmptyArrays, shallow] as const;
            const result = definedAttributes(source, ...args);
            const reference = referenceDefinedAttributes(source, ...args);
            expect(result).toStrictEqual(reference);
            expect(Object.keys(result ?? {})).toEqual(Object.keys(reference ?? {}));
            expect(sharedPaths(result, source)).toEqual(sharedPaths(reference, source));
            compared += 1;
          }
        }
      }
    }
  }
  expect(compared).toEqual(2 * sources.length * 18);
});
