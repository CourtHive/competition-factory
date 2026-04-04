// NOTE: type really does need to be any!
export function attributeFilter(params?: any): any {
  if (params === null) return {};
  const { source, template } = params ?? {};
  if (!template) return source;

  const target = {};
  attributeCopy(source, template, target);

  return target;

  function attributeCopy(valuesObject, templateObject, outputObject) {
    if (!valuesObject || !templateObject) return undefined;
    const vKeys = Object.keys(valuesObject);
    const oKeys = Object.keys(templateObject);

    // the orMap allows spcification of { 'a||b': boolean } so that filter templates can apply to multiple attributes
    const orMap = Object.assign(
      {},
      ...oKeys
        .filter((key) => key.indexOf('||'))
        .map((key) => key.split('||').map((or) => ({ [or]: key })))
        .flat(),
    );
    const allKeys = oKeys.concat(...Object.keys(orMap));
    const wildcard = allKeys.includes('*');

    for (const vKey of vKeys) {
      if (allKeys.indexOf(vKey) >= 0 || wildcard) {
        const templateKey = orMap[vKey] || vKey;
        const tobj = templateObject[templateKey] || wildcard;
        const vobj = valuesObject[vKey];

        if (typeof tobj === 'object' && typeof vobj !== 'function' && !Array.isArray(tobj)) {
          if (Array.isArray(vobj)) {
            const mappedElements = vobj
              .map((arrayMember) => {
                const target = {};
                const result = attributeCopy(arrayMember, tobj, target);
                return result !== false ? target : undefined;
              })
              .filter(Boolean);
            outputObject[vKey] = mappedElements;
          } else if (vobj) {
            outputObject[vKey] = {};
            attributeCopy(vobj, tobj, outputObject[vKey]);
          }
        } else {
          const value = valuesObject[vKey];
          const exclude = Array.isArray(tobj) && !tobj.includes(value);
          if (exclude) return false;

          if (templateObject[vKey] || (wildcard && templateObject[vKey] !== false)) {
            outputObject[vKey] = value;
          }
        }
      }
    }
    return undefined;
  }
}
