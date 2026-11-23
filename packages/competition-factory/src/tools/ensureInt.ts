export function ensureInt(val: any) {
  if (typeof val === 'number') return parseInt(val.toString());
  if (typeof val === 'string') return parseInt(val);
  return 0;
}
