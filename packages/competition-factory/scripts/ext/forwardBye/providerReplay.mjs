import * as cascade from '@Mutate/matchUps/outcome/plan/recordedCascade';
import asyncEngine from '@Engines/asyncEngine';
import * as governors from '@Assemblies/governors';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deserialize } from 'node:v8';
import { gzipSync, gunzipSync } from 'node:zlib';
import { expect, it, vi } from 'vitest';
import engine from '@Engines/syncEngine';
import { captureReturn } from '@Tests/testHarness/outcome/returnParity';
import { topicConstants } from '@Constants/topicConstants';
import * as state from '@Global/state/globalState';
import sync from '@Global/state/syncGlobalState';
import requestState from '@Server/providers/factory/engines/asyncGlobalState';
import { inDraftWrites } from '@Global/state/withDraftWrites';
import { notifySubscribers } from '@Global/state/notifySubscribers';
import { setMatchUpStatus } from '@Mutate/matchUps/matchUpStatus/setMatchUpStatus';
import * as whole from '@Mutate/matchUps/outcome/plan/recordedCall';
import * as writer from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import { setClock } from '@Tools/clock';
import { setRandomSource } from '@Tools/prng';
function graph(root, entry = new Map()) {
  const ids = new Map(entry),
    seen = new Set(),
    nodes = [];
  function visit(value) {
    if (value === undefined) return ['undefined'];
    if (typeof value === 'symbol') return ['symbol', String(value)];
    if (typeof value === 'bigint') return ['bigint', String(value)];
    if (value === null || !['object', 'function'].includes(typeof value)) return value;
    if (!ids.has(value)) ids.set(value, ids.size);
    const id = ids.get(value);
    if (!seen.has(value)) {
      seen.add(value);
      const node = [id, Array.isArray(value) ? 'array' : Object.prototype.toString.call(value), null];
      nodes.push(node);
      node[2] =
        typeof value === 'function'
          ? [value.name, Object.keys(value).map((k) => [k, visit(value[k])])]
          : value instanceof Set
            ? [...value].map(visit)
            : value instanceof Map
              ? [...value].map(([k, v]) => [visit(k), visit(v)])
              : value instanceof Date
                ? value.toISOString()
                : Object.entries(value).map(([k, v]) => [k, visit(v)]);
      if (Array.isArray(value)) node.push(value.length);
    }
    return ['ref', id];
  }
  const head = visit(root);
  return { ids, data: { head, nodes } };
}
const inputs = process.env.BYE_INPUTS;
const head = process.env.BYE_HEAD;
const out = process.env.BYE_OUTPUT;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fingerprint = (value) => hash(JSON.stringify(graph(value).data));
const unpack = (file) => gunzipSync(readFileSync(file));
let onExternalNotice;
async function replay(row, provider, kind) {
  const stem = join(inputs, 'inputs', row.key);
  const bytes = unpack(stem + '.bin.gz');
  expect(hash(bytes)).toBe(row.sha);
  const { record, params } = deserialize(bytes);
  const meta = JSON.parse(unpack(stem + '.json.gz').toString());
  const enclosed = meta.boundary === 'enclosed';
  let reads = 0;
  setClock(meta.clock);
  state.setOutcomePipeline('v1');
  state.setSubscriptions({ subscriptions: {} });
  const host = kind === 'async-engine' ? asyncEngine : engine;
  if (kind === 'async-engine') asyncEngine.importMethods(governors);
  await host.reset();
  if (!enclosed) expect((await host.setState(record, false)).success).toBe(true);
  const stored = enclosed
    ? (params.tournamentRecord ?? params.drawDefinition)
    : Object.values(state.getTournamentRecords())[0];
  const entry = graph(stored);
  const delivery = [];
  state.deleteNotices();
  state.setSubscriptions({
    subscriptions: Object.fromEntries(
      Object.values(topicConstants).map((topic) => [
        topic,
        (payloads) => delivery.push([topic, payloads.length, fingerprint([stored, payloads])]),
      ]),
    ),
  });
  setClock(() => meta.clock + reads++);
  setRandomSource(meta.seed);
  state.setOutcomePipeline(process.env.R27_MODE ?? 'v2');
  if (enclosed) {
    state.setCapturedClock(meta.clock);
    state.setCapturedStamps(new WeakSet(meta.stamps.map((path) => path.reduce((v, k) => v[k], params))));
  }
  const calls = [];
  const held = [];
  const returns = [];
  const pending = [];
  const external = [];
  const spies = [];
  const recorder = vi.spyOn(whole, 'recordWholeCall');
  const nested = vi.spyOn(cascade, 'recordDoubleExitCascade');
  const legacy = vi.spyOn(writer, 'setMatchUpState');
  // Observe actual entries and the immediate return, including captured clock/stamp reads.
  // Install after setup. Scope snapshots read storage fields without calling another provider method.
  const scope = provider.getDeliveryScope();
  const bufferState = () => [
    scope.notices.length,
    scope.modified,
    [...(scope.modifiedTopics ?? [])],
    [...(scope.modifiedTournamentIds ?? [])],
  ];
  onExternalNotice = (notice) => external.push([notice.topic, notice.key ?? null, inDraftWrites()]);
  try {
    for (const [name, method] of Object.entries(provider)) {
      if (typeof method !== 'function') continue;
      spies.push(
        vi.spyOn(provider, name).mockImplementation(function (...args) {
          const call = { name, draft: inDraftWrites() };
          calls.push(call);
          held.push(args);
          call.arguments = fingerprint(args);
          if (name === 'addNotice') {
            const [{ topic, key, payload }] = args;
            if (kind === 'custom-eager' && typeof payload.__deferredPayload === 'function') {
              const resolved = payload.__deferredPayload();
              call.resolvedAtEntry = fingerprint([stored, resolved]);
            }
            const entity = payload.matchUp ?? payload.drawDefinition ?? payload.positionAssignments;
            Object.assign(call, {
              topic,
              key,
              live: entity ? entry.ids.has(entity) : null,
              joint: fingerprint([stored, payload]),
              before: bufferState(),
            });
          }
          if (name === 'setNoticeBuffer' || name === 'setMutationStatus' || name === 'markModified') {
            call.args = fingerprint(args);
            call.before = bufferState();
          }
          const value = method.apply(this, args);
          returns.push(value);
          if (value instanceof Promise)
            pending.push(
              value.then((resolved) => {
                call.resolved = fingerprint(resolved);
              }),
            );
          if (value instanceof WeakSet) {
            call.stampedEntryObjects = [...entry.ids].filter(([obj]) => value.has(obj)).map(([, id]) => id);
          }
          if (['addNotice', 'setNoticeBuffer', 'setMutationStatus', 'markModified'].includes(name))
            call.after = bufferState();
          if (value && typeof value === 'object' && !(value instanceof Promise) && !(value instanceof WeakSet))
            call.returnGraph = fingerprint(value);
          if (value instanceof Set) call.value = [...value];
          else if (['getNoticeBuffer', 'getPayloads', 'getNotices', 'getNoticeState'].includes(name))
            call.value = fingerprint(value);
          else if (value === null || ['number', 'string', 'boolean'].includes(typeof value)) call.value = value;
          else if (name === 'addNotice') call.value = fingerprint(value);
          else call.valueType = Object.prototype.toString.call(value);
          if (name === 'getNoticeState' && value) call.marks = [...(value.modifiedTopics ?? [])];
          return value;
        }),
      );
    }
    const answer = enclosed ? setMatchUpStatus(params) : await host.setMatchUpStatus(params);
    if (enclosed) notifySubscribers();
    await Promise.all(pending);
    expect(answer?.success).toBe(true);
    expect(Array.isArray(answer.stack)).toBe(true);
    expect(recorder.mock.calls.length).toBe(head === 'recorded' || row.disposition !== 'pass' ? 1 : 0);
    if (row.disposition === 'pass') expect(nested).not.toHaveBeenCalled();
    expect(legacy.mock.calls.length).toBe(
      (head === 'recorded' || row.disposition !== 'pass' ? 1 : 0) + (process.env.R27_MODE === 'differential' ? 1 : 0),
    );
    return {
      retainedArguments: fingerprint([stored, held, returns]),
      key: row.key,
      input: row.sha,
      kind,
      head,
      enclosed,
      reads,
      nested: nested.mock.calls.length,
      recorder: recorder.mock.calls.length,
      writer: legacy.mock.calls.length,
      pre: hash(JSON.stringify(entry.data)),
      retained: hash(JSON.stringify(graph(stored, entry.ids).data)),
      material: fingerprint([stored, captureReturn(answer).result]),
      delivery,
      external,
      calls,
      final: bufferState(),
    };
  } finally {
    for (const spy of spies.reverse()) spy.mockRestore();
    recorder.mockRestore();
    nested.mockRestore();
    legacy.mockRestore();
    onExternalNotice = undefined;
    state.setCapturedClock(undefined);
    state.setCapturedStamps(undefined);
    state.setSubscriptions({ subscriptions: {} });
    state.setOutcomePipeline();
    setRandomSource();
    setClock();
  }
}
it('replays the sealed BYE inputs in the specified provider environments', async () => {
  const manifest = readFileSync(join(inputs, 'bound.json'));
  expect(hash(manifest)).toBe('f96bea64dd175000d5f03f1ee6f070dca81b195b04f3467c9e63322607bcc8ad');
  const rows = JSON.parse(manifest.toString());
  expect(rows.length).toBe(122);
  const prior = state.getProvider();
  const observer = state.getInvokeObserver();
  const custom = {
    ...sync,
    addNotice(notice, global) {
      onExternalNotice?.(notice);
      return sync.addNotice(notice, global);
    },
  };
  const implicit = requestState.implicitContextCreations();
  const scopes = new WeakSet();
  try {
    for (const [kind, provider] of [
      ['sync', sync],
      ['mirror', prior],
      ['custom', custom],
      ['async', requestState],
      ['async-engine', requestState],
      ['custom-eager', custom],
    ]) {
      if (kind === 'mirror')
        expect(Reflect.ownKeys(provider).some((k) => String(k) === 'Symbol(queryPurityMirror)')).toBe(true);
      state.setInvokeObserver(kind === 'mirror' ? observer : undefined);
      state.setStateProvider(provider);
      expect(state.getProvider()).toBe(provider);
      for (const row of rows) {
        const result = !kind.startsWith('async')
          ? await replay(row, provider, kind)
          : await requestState.runWithInstanceState(async () => {
              const scope = requestState.getDeliveryScope();
              expect(scopes.has(scope)).toBe(false);
              scopes.add(scope);
              await new Promise((resolve) => setImmediate(resolve));
              expect(requestState.getDeliveryScope()).toBe(scope);
              const observed = await replay(row, provider, kind);
              await Promise.resolve();
              expect(requestState.getDeliveryScope()).toBe(scope);
              return observed;
            });
        writeFileSync(join(out, head + '-' + kind + '-' + row.key + '.json.gz'), gzipSync(JSON.stringify(result)));
      }
    }
    expect(requestState.implicitContextCreations()).toBe(implicit);
  } finally {
    state.setStateProvider(prior);
    state.setInvokeObserver(observer);
  }
}, 1200000);
