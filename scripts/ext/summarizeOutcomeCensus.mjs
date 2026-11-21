import { readFileSync } from 'node:fs';

const inputs = process.argv.slice(2);
if (!inputs.length) throw new Error('Pass one or more name=path arguments');
const report = {};
for (const input of inputs) {
  const separator = input.indexOf('=');
  if (separator <= 0) throw new Error(`Expected name=path, got ${input}`);
  const source = input.slice(0, separator);
  const path = input.slice(separator + 1);
  const counts = new Map();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line) continue;
    for (const [key, count] of Object.entries(JSON.parse(line))) {
      counts.set(key, (counts.get(key) ?? 0) + count);
    }
  }
  const byReason = {};
  const rows = [...counts]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, calls]) => {
      const [reason, drawType, route] = JSON.parse(key);
      byReason[reason] = (byReason[reason] ?? 0) + calls;
      return { reason, drawType, route, calls };
    });
  report[source] = { total: rows.reduce((sum, row) => sum + row.calls, 0), byReason, rows };
}
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
