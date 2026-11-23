import { createBackendBridge } from './backendBridge';
import { afterAll, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// throwaway backends: each answers one line per call, echoing `seq` faithfully, one call late, or not at all
const directory = fs.mkdtempSync(path.join(tmpdir(), 'backend-bridge-'));
const backend = (name: string, answer: string) => {
  const file = path.join(directory, `${name}.mjs`);
  fs.writeFileSync(
    file,
    `#!/usr/bin/env node
import readline from 'node:readline';
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const request = JSON.parse(line);
  process.stdout.write(JSON.stringify(${answer}) + '\\n');
});
`,
  );
  fs.chmodSync(file, 0o755);
  return file;
};
afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

it('numbers each call and reads the answer that echoes it', () => {
  const bridge = createBackendBridge(backend('echo', '{ seq: request.seq, n: request.n }'));
  for (let n = 1; n <= 50; n++) expect(bridge.call({ n })).toEqual({ seq: n, n });
  bridge.close();
});

it('refuses an answer that echoes another call', () => {
  const bridge = createBackendBridge(backend('late', '{ seq: request.seq === 3 ? 2 : request.seq }'));
  bridge.call({});
  bridge.call({});
  expect(() => bridge.call({})).toThrow('the answer read for call 3 is the answer to call 2');
  bridge.close();
});

it('reads an answer that states no seq', () => {
  const bridge = createBackendBridge(backend('silent', '{ n: request.n }'));
  expect(bridge.call({ n: 7 })).toEqual({ n: 7 });
  bridge.close();
});
