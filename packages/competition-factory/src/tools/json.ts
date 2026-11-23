import { isFunction } from './objects';
import { isNumeric } from './math';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

/**
 *
 * @param {object[]} arrayOfJSON - JSON objects array
 * @param {object} config - object which configures processing (see below)
 * @returns {string} - joined by '\r\n' or specified line separator
 *
 * config {
 *  {boolean} includeTransformAccessors, // transform accessors are included with columnAccessors
 *  {string[]} columnAccessors, // [ 'includeThis', 'andThis' ]
 *  {object} columnTransform, // e.g. { 'newColumnName': ['oldColumn1', 'oldColumn2' ]}
 *  {object} columnMap, // e.g. { 'columnName': 'newColumnName' }
 *  {object} valuesMap, // e.g. { 'columnName': { 'value1': 'mappedValue' }} // useful for mapping IDs
 *  {array} sortOrder // e.g. ['columnName1', 'columnName2'] // determine order of csv columns
 *  {object} context, // attributes which are to be added to all rows { 'columnName': 'value }
 *  {string} delimiter, // defaults to '"'
 *  {string} columnJoiner, // defaults to ',' // defines how CSV columns are joined
 *  {string} rowJoiner, // defaults to '\r\n' // defines how CSV lines are joined
 *  {string} keyJoiner, // defaults to '.' // defines how flattened column names are constructed
 * }
 *
 * NOTE: `columnTransform` mapped array elements are sensitive to order and will resolve to the first matching value
 * NOTE: `columnMap` should not contain new columnName(s) that are `columnTransform` keys
 */
export function JSON2CSV(arrayOfJSON?, config?): any {
  if (config && typeof config !== 'object') return { error: INVALID_VALUES };

  let { columnTransform = {} } = config ?? {};

  const {
    includeTransformAccessors,
    includeHeaderRow = true,
    returnTransformedJSON,
    removeEmptyColumns,
    onlyHeaderRow,

    columnAccessors = [],
    functionMap = {},
    columnMap = {},
    valuesMap = {},
    context = {},

    delimiter = '"',
    columnJoiner = ',',
    rowJoiner = '\r\n',
    keyJoiner = '.',
  } = config ?? {};

  if (
    !Array.isArray(arrayOfJSON) ||
    !Array.isArray(columnAccessors) ||
    typeof context !== 'object' ||
    typeof columnMap !== 'object' ||
    typeof columnTransform !== 'object' ||
    typeof functionMap !== 'object' ||
    typeof valuesMap !== 'object' ||
    typeof columnJoiner !== 'string' ||
    typeof rowJoiner !== 'string' ||
    typeof keyJoiner !== 'string' ||
    typeof delimiter !== 'string'
  )
    return { error: INVALID_VALUES };

  // ensure all column transformers are arrays
  columnTransform = Object.assign(
    {},
    ...Object.keys(columnTransform)
      .reverse() // reverse so that exported CSV columns are in the order as defined
      .map((key) => ({
        [key]: Array.isArray(columnTransform[key])
          ? columnTransform[key]
          : [
              // ensure transform attributes are strings
              typeof columnTransform[key] === 'string' && columnTransform[key],
            ].filter(Boolean),
      })),
  );

  const flattened = arrayOfJSON.filter(Boolean).map((obj) => flattenJSON(obj, keyJoiner));

  const transformColumns = Object.values(columnTransform).flat();
  if (includeTransformAccessors) columnAccessors.push(...transformColumns);

  const headerRow = flattened
    .reduce(
      (aggregator, row) =>
        Object.keys(row).every((key) => (!aggregator.includes(key) && aggregator.push(key)) || true) && aggregator,
      [],
    )
    .filter((key) => !columnAccessors?.length || columnAccessors.includes(key));

  const accessorMap = Object.assign(
    {},
    ...Object.keys(columnTransform)
      .reverse() // so that original order is preserved when later pushed
      .map((transform) => columnTransform[transform].map((value) => ({ [value]: transform })).flat())
      .flat(),
  );

  const sortColumns = (a, b) =>
    !config?.sortOrder
      ? 0
      : (config.sortOrder.includes(a) &&
          config.sortOrder.includes(b) &&
          config.sortOrder.indexOf(a) - config.sortOrder.indexOf(b)) ||
        (!config.sortOrder.includes(b) && -1);

  const tranformedHeaderRow = headerRow
    .reduce((def, key) => {
      const transform = accessorMap[key];
      if (transform) {
        if (!def.includes(transform)) def.push(transform);
      } else {
        def.push(key);
      }
      return def;
    }, [])
    .sort(sortColumns);

  Object.keys(columnMap).forEach(
    (columnName) => !tranformedHeaderRow.includes(columnName) && tranformedHeaderRow.unshift(columnName),
  );

  Object.keys(columnTransform).forEach(
    (columnName) => !tranformedHeaderRow.includes(columnName) && tranformedHeaderRow.unshift(columnName),
  );

  if (typeof context === 'object')
    Object.keys(context).forEach(
      (columnName) => !tranformedHeaderRow.includes(columnName) && tranformedHeaderRow.unshift(columnName),
    );

  let mappedHeaderRow = tranformedHeaderRow.map((key) => columnMap[key] || key);

  if (onlyHeaderRow) return [mappedHeaderRow];

  const withDelimiter = (value) => `${delimiter}${value}${delimiter}`;

  const columnValueCounts: number[] = [];
  const processRow = (row) => {
    return Object.values(
      tranformedHeaderRow.reduce((columnsMap, columnName, columnIndex) => {
        const accessors = columnTransform[columnName];
        const value =
          (accessors?.length ? row[accessors.find((accessor) => row[accessor])] : row[columnName]) ||
          context?.[columnName] ||
          '';

        const mappedValue = valuesMap[columnName]?.[value] || value;
        const fxValue = isFunction(functionMap[columnName]) ? functionMap[columnName](mappedValue) : mappedValue;
        columnsMap[columnName] = withDelimiter(fxValue);
        if (fxValue) {
          columnValueCounts[columnIndex] = (columnValueCounts[columnIndex] || 0) + 1;
        }
        return columnsMap;
      }, {}),
    );
  };

  let flattenedRows = flattened.map(processRow);

  const indicesToRemove =
    removeEmptyColumns &&
    [...columnValueCounts]
      .map((count, index) => !count && index)
      .filter(isNumeric)
      .reverse();

  if (indicesToRemove) {
    const purge = (row) => row.filter((_, index) => !indicesToRemove.includes(index));
    flattenedRows = flattenedRows.map(purge);
    mappedHeaderRow = purge(mappedHeaderRow);
  }

  const rows = flattenedRows.map((row) => row.join(columnJoiner));

  if (returnTransformedJSON) {
    return rows.map((row) => {
      const columnValues = row.split(columnJoiner);
      return Object.assign({}, ...columnValues.map((v, i) => ({ [mappedHeaderRow[i]]: v })));
    });
  }

  return includeHeaderRow
    ? [mappedHeaderRow.map(withDelimiter).join(columnJoiner), ...rows].join(rowJoiner)
    : rows.join(rowJoiner);
}

export function flattenJSON(obj, keyJoiner: string = '.', path: string[] = []) {
  return (
    typeof obj === 'object' &&
    Object.keys(obj).reduce((result, key: string) => {
      if (typeof obj[key] !== 'object') {
        result[path.concat(key).join(keyJoiner)] = obj[key];
        return result;
      }
      return Object.assign(result, flattenJSON(obj[key], keyJoiner, path.concat(key)));
    }, {})
  );
}
