import {
  getTournamentId,
  getTournamentRecords,
  hasTopic,
  restoreMutationStatus,
  setFactoryBackend,
  setTournamentId,
  setTournamentRecords,
} from '@Global/state/globalState';
import { errorConditionConstants } from '@Constants/errorConditionConstants';
import { topicConstants } from '@Constants/topicConstants';
import { randomSource, setRandomSource } from '@Tools/prng';
import { afterAll, beforeEach, expect } from 'vitest';
import { canonicalHash, canonicalObject } from './corpus/hash';
import { createBackendBridge } from './backendBridge';
import { differingPaths } from './backendDiff';
import { BACKEND_EXCLUSIONS } from './backendExclusions';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// types
import type { FactoryBackend, FactoryBackendCall } from '@Global/state/globalState';
import type { SeededRandom } from '@Tools/prng';

/**
 * Vitest setupFiles hook: the suite against a SECOND IMPLEMENTATION of the engine's methods (documentation/docs/testing/
 * second-backend.md). `FACTORY_BACKEND_COMMAND` names an executable that answers one engine call (its methods with `--methods`,
 * a call as JSON on stdin), and every call to a method it lists is routed to it:
 *
 * - `FACTORY_BACKEND=external`: its answer is the call's answer, and the records it returns are the engine's state;
 * - `FACTORY_BACKEND=differential`: the engine runs the call too, and its answer stands; a different result (success
 *   or the error's code) or a different record (canonical hash, version stamps aside) fails the test, naming both.
 *
 * The executable is started once per worker (`--serve`, backendBridge.ts) and answers every routed call. Unset, this
 * file does nothing.
 *
 * The executable may decline a call it does not implement with the params given (`{ declined: reason }`): this engine
 * then runs it, and the report counts it as declined, not as routed. With `FACTORY_BACKEND_REPORT`, each worker appends per test file the calls it routed,
 * by method, so a run can show the second implementation was actually reached (a test that routed nothing tested only
 * this engine).
 */
const mode = process.env.FACTORY_BACKEND;
const command = process.env.FACTORY_BACKEND_COMMAND;

if (mode) {
  if (mode !== 'external' && mode !== 'differential')
    throw new Error(`FACTORY_BACKEND=${mode} is not one of external, differential`);
  if (!command) throw new Error('FACTORY_BACKEND needs FACTORY_BACKEND_COMMAND, the executable that answers a call');

  const methods = new Set<string>(JSON.parse(execFileSync(command, ['--methods'], { encoding: 'utf8' })));
  const errorsByCode = new Map<string, unknown>(
    Object.values(errorConditionConstants)
      .filter((value: any) => typeof value?.code === 'string')
      .map((value: any) => [value.code, value]),
  );
  const bridge = createBackendBridge(command);
  let lastRequest: unknown;
  const routed: { [file: string]: { [method: string]: number } } = {};
  let currentFile = '';

  const backend: FactoryBackend = {
    name: mode,
    implements: (methodName) => methods.has(methodName),
    invoke: (call) => (mode === 'external' ? external(call) : differential(call)),
  };

  // the scoring engine class, per instance (scoringBackend.ts): compared only, so only under differential
  if (mode === 'differential') {
    const scoringMethods = listed(command, '--scoring-methods');
    if (scoringMethods.length) {
      const { routeScoringEngine } = await import('./scoringBackend');
      routeScoringEngine({
        counted: (method) => {
          const counts = (routed[currentFile] ??= {});
          counts[`scoring.${method}`] = (counts[`scoring.${method}`] ?? 0) + 1;
        },
        methods: scoringMethods,
        bridge,
      });
    }
  }

  beforeEach(() => {
    currentFile = expect.getState().testPath ?? '';
    const excluded = BACKEND_EXCLUSIONS.find(({ file }) => currentFile.endsWith(file));
    if (excluded) (routed[currentFile] ??= {})[`excluded: ${excluded.reason}`] = 1;
    setFactoryBackend(excluded ? undefined : backend);
  });

  afterAll(() => {
    bridge.close();
    const report = process.env.FACTORY_BACKEND_REPORT;
    if (!report) return;
    for (const [file, counts] of Object.entries(routed))
      fs.appendFileSync(report, JSON.stringify({ file, routed: counts }) + '\n');
  });

  /** the call as the second implementation reads it: plain data, the records in state, the instant and the stream */
  function ask({ methodName, params, timeStamp }: FactoryBackendCall) {
    const counts = (routed[currentFile] ??= {});
    counts[methodName] = (counts[methodName] ?? 0) + 1;
    const source = randomSource() as SeededRandom;
    const request = {
      method: methodName,
      params: callParams(params),
      records: Object.values(getTournamentRecords() ?? {}),
      activeTournamentId: getTournamentId(),
      clock: new Date(timeStamp).toISOString(),
      seed: typeof source.state === 'function' ? source.state() : undefined,
      // a method announces to a subscribed topic instead of writing (an audit, for one)
      topics: Object.values(topicConstants).filter((topic) => hasTopic(topic)),
    };
    lastRequest = request;
    const answer = bridge.call(request);
    if (answer?.failure) throw new Error(`${command}: ${answer.failure}`);
    if (answer?.declined) {
      // the second implementation does not answer this call with these params: this engine runs it
      counts[methodName] -= 1;
      const declined = (counts[`${methodName} (declined)`] ??= 0);
      counts[`${methodName} (declined)`] = declined + 1;
    }
    return answer as { result: any; records: any[]; seed?: number; declined?: string };
  }

  function hashOf(list: any[]) {
    return list.map((record) => `${record.tournamentId}:${canonicalHash(record)}`).sort((a, b) => a.localeCompare(b));
  }

  /** an error as this engine returns it: the constant its code names, else as given */
  function asEngineResult(result: any) {
    const code = result?.error?.code;
    return code && errorsByCode.has(code) ? { ...result, error: errorsByCode.get(code) } : result;
  }

  function external(call: FactoryBackendCall) {
    const activeTournamentId = getTournamentId();
    const before = hashOf(Object.values(getTournamentRecords() ?? {}));
    const answer = ask(call);
    if (answer.declined) return call.runLocal();
    // the engine stamps a record a method changed (getMutationStatus): tell it this one did
    if (JSON.stringify(hashOf(answer.records)) !== JSON.stringify(before)) restoreMutationStatus(true);
    setTournamentRecords(Object.fromEntries(answer.records.map((record) => [record.tournamentId, record])));
    if (activeTournamentId) setTournamentId(activeTournamentId);
    if (answer.seed !== undefined) setRandomSource(answer.seed);
    return asEngineResult(answer.result);
  }

  function differential(call: FactoryBackendCall) {
    const answer = ask(call);
    if (answer.declined) return call.runLocal();
    const local = call.runLocal();
    const records: any[] = Object.values(getTournamentRecords() ?? {});
    const kind = (result: any) => (result?.error ? `error ${result.error.code ?? result.error}` : 'success');
    const disagreements: string[] = [];
    if (kind(answer.result) !== kind(local))
      disagreements.push(`result: this engine ${kind(local)}, the second ${kind(answer.result)}`);
    const [ours, theirs] = [hashOf(records), hashOf(answer.records)];
    if (JSON.stringify(ours) !== JSON.stringify(theirs)) {
      const theirsById = new Map(answer.records.map((record) => [record.tournamentId, record]));
      for (const record of records) {
        const paths = differingPaths(canonicalObject(record), canonicalObject(theirsById.get(record.tournamentId)));
        disagreements.push(
          `records: ${record.tournamentId} differs at ${paths.join('; ') || 'no path (record missing)'}`,
        );
      }
    }
    if (disagreements.length) {
      // the call as sent, to replay by hand: <command> < file
      const file = path.join(tmpdir(), `backend-call-${process.pid}-${Date.now()}.json`);
      fs.writeFileSync(file, JSON.stringify(lastRequest));
      throw new Error(
        `${call.methodName}: the second implementation disagrees (the call: ${file})\n  ${disagreements.join('\n  ')}`,
      );
    }
    return local;
  }
}

/** the names an executable lists with a flag; none when it does not know the flag */
function listed(command: string, flag: string): string[] {
  try {
    return JSON.parse(execFileSync(command, [flag], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return [];
  }
}

/** the params as the caller gave them: without the records and the active tournament the engine adds (the call
 * carries those itself) and without functions, which no other process can read */
function callParams(params: { [key: string]: unknown } | undefined) {
  const added = new Set(['activeTournamentId', 'tournamentRecord', 'tournamentRecords']);
  return Object.fromEntries(
    Object.entries(params ?? {}).filter(([key, value]) => !added.has(key) && typeof value !== 'function'),
  );
}
