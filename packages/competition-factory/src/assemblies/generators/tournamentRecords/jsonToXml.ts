export function jsonToXml({ json, tagName }) {
  const childArrays = Object.keys(json)
    .filter((key) => Array.isArray(json[key]))
    .map((key) => ({ key, value: json[key].filter((v) => typeof v === 'object' && Object.keys(v).length === 1) }));
  const childObjects = Object.keys(json)
    .filter((key) => typeof json[key] === 'object' && !Array.isArray(json[key]))
    .map((key) => ({ key, value: json[key] }));
  const attributes = Object.keys(json)
    .filter((key) => ['string', 'number'].includes(typeof json[key]))
    .map((key) => ({ key, value: json[key] }));

  return generateTag({ tagName, attributes, childArrays, childObjects });
}

function generateTag(params) {
  const { tagName, attributes = [], childArrays = [], childObjects } = params;
  const carriageReturn = '\r\n';

  const arrayChild = (v) => {
    const key = Object.keys(v)[0];
    const value = v[key];
    return { key, value };
  };
  const arrayValues = childArrays
    ?.map(({ key, value }) => generateTag({ tagName: key, childObjects: value.map(arrayChild) }))
    .join('\r\n');

  const childValues = childObjects
    ?.map(({ key, value }) => jsonToXml({ tagName: key, json: value ?? [] }))
    .join('\r\n');

  const attributeString = attributes?.map(({ key, value }) => `${key}="${value}"`).join(' ');
  const attributeValue = attributeString ? ` ${attributeString}` : '';

  if (tagName === 'childArray') return childValues;

  const objectsTag = childValues?.length ? `${carriageReturn}${childValues}${carriageReturn}` : '';
  const arraysTag = arrayValues?.length ? `${carriageReturn}${arrayValues}${carriageReturn}` : '';

  return `<${tagName}${attributeValue}>${objectsTag}${arraysTag}</${tagName}>`;
}
