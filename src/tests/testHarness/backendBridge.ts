import { Worker } from 'node:worker_threads';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

/**
 * A synchronous call into a long-lived process, for the engine's synchronous call path: the engine cannot await a
 * pipe, so a worker thread owns the process (`<command> --serve`: one JSON call per line in, one answer per line out)
 * and this thread blocks on an Atomics wait until the worker has the answer. An answer is handed back through a shared
 * buffer, or a temporary file when it is larger than the buffer.
 */
const BUFFER_BYTES = 64 * 1024 * 1024;

const workerSource = `
const { parentPort, workerData } = require('node:worker_threads');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const control = new Int32Array(workerData.control);
const data = new Uint8Array(workerData.data);
const child = spawn(workerData.command, ['--serve'], { stdio: ['pipe', 'pipe', 'inherit'] });
let pending = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  pending += chunk;
  let newline;
  while ((newline = pending.indexOf('\\n')) >= 0) {
    const line = pending.slice(0, newline);
    pending = pending.slice(newline + 1);
    const bytes = Buffer.from(line, 'utf8');
    if (bytes.length <= data.length) {
      data.set(bytes);
      control[1] = bytes.length;
      control[2] = 0;
    } else {
      fs.writeFileSync(workerData.overflow, bytes);
      control[1] = bytes.length;
      control[2] = 1;
    }
    Atomics.store(control, 0, 1);
    Atomics.notify(control, 0);
  }
});
child.on('exit', (code) => {
  control[1] = 0;
  control[2] = 2;
  Atomics.store(control, 0, 1);
  Atomics.notify(control, 0);
});
parentPort.on('message', (line) => child.stdin.write(line + '\\n'));
`;

export function createBackendBridge(command: string) {
  const control = new SharedArrayBuffer(3 * Int32Array.BYTES_PER_ELEMENT);
  const data = new SharedArrayBuffer(BUFFER_BYTES);
  const overflow = path.join(tmpdir(), `backend-bridge-${process.pid}-${Date.now()}.json`);
  const worker = new Worker(workerSource, { eval: true, workerData: { command, control, data, overflow } });
  worker.unref();
  const flags = new Int32Array(control);
  const bytes = new Uint8Array(data);
  const decoder = new TextDecoder();

  return {
    /** one call, answered synchronously */
    call(request: unknown): any {
      Atomics.store(flags, 0, 0);
      worker.postMessage(JSON.stringify(request));
      Atomics.wait(flags, 0, 0);
      if (flags[2] === 2) throw new Error(`${command} --serve exited`);
      const text = flags[2] === 1 ? fs.readFileSync(overflow, 'utf8') : decoder.decode(bytes.slice(0, flags[1]));
      return JSON.parse(text);
    },
    close() {
      void worker.terminate();
      fs.rmSync(overflow, { force: true });
    },
  };
}
