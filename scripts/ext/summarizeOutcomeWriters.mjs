import { readFileSync } from 'node:fs';

const paths = process.argv.slice(2);
if (!paths.length) throw new Error('Pass one or more coverage JSONL paths');
const reasons = new Map();
for (const path of paths) {
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line) continue;
    for (const [reason, files] of Object.entries(JSON.parse(line))) {
      const entry = reasons.get(reason) ?? { samples: 0, files: new Map() };
      entry.samples++;
      for (const [file, functions] of Object.entries(files)) {
        const names = entry.files.get(file) ?? new Set();
        functions.forEach((name) => names.add(name));
        entry.files.set(file, names);
      }
      reasons.set(reason, entry);
    }
  }
}
const rows = [...reasons]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([reason, entry]) => {
    const files = Object.fromEntries(
      [...entry.files]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([file, names]) => [file, [...names].sort()]),
    );
    const functionCount = Object.values(files).reduce((count, names) => count + names.length, 0);
    return { reason, samples: entry.samples, fileCount: Object.keys(files).length, functionCount, files };
  });
process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
