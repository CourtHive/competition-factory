import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { engineObservable, REFUSED } from './corpus/scoringScenarios';
import { canonicalJson } from '@Tools/canonicalJson';
import { canonicalObject } from './corpus/hash';
import { differingPaths } from './backendDiff';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

/**
 * The scoring engine CLASS against a second implementation (documentation/docs/testing/second-backend.md). The class is
 * not an engine method, so its methods are routed per instance: the first call on an instance opens a session in the
 * second implementation from the instance as it stands (its options, its state and its supplementary envelope), and
 * every routed call on it runs on both, a view (getScoreboard, getInputLevels, getInputMode, getEpisodes,
 * getStatistics) as much as a write. After each call the two engines' observables are compared: what the call
 * returned, the score, the timeline's shape, the servers, the undo and redo depths and the players on court (the
 * scoring corpus's observable), or the refusal's message. A call that replaces the instance's state re-opens its
 * session at the next routed call.
 *
 * Only the outermost call on an instance is routed: a method another method calls is part of that call.
 */
type Bridge = { call: (request: unknown) => any };

const RESYNC = ['setState', 'loadSupplementaryState', 'reset', 'markHardBoundary'];

/** the views (scoring-engine-spec.md § 11.3–11.4): read, never written */
export const VIEWS = ['getScoreboard', 'getInputLevels', 'getInputMode', 'getEpisodes', 'getStatistics'];

/**
 * each method's arguments as the second implementation reads them (the scoring corpus's directive params). The views
 * (scoring-engine-spec.md § 11.3–11.4) are routed like the writes: a view call compares what it returned.
 */
export const PARAMS: Record<string, (args: any[]) => Record<string, unknown>> = {
  addPoint: ([options]) => options ?? {},
  addGame: ([options]) => options ?? {},
  addSet: ([options]) => options ?? {},
  endSegment: ([options]) => options ?? {},
  setInitialScore: ([options]) => options ?? {},
  setServer: ([side, options]) => ({ side, ...(options ? { options } : {}) }),
  setLineUp: ([sideNumber, lineUp]) => ({ sideNumber, lineUp }),
  substitute: ([options]) => options ?? {},
  addChallenge: ([options]) => options ?? {},
  addAnnotation: ([data, options]) => ({ data, ...(options ? { options } : {}) }),
  undo: ([count]) => (count === undefined ? {} : { count }),
  redo: ([count]) => (count === undefined ? {} : { count }),
  editPoint: ([pointIndex, data, options]) => ({ pointIndex, data, ...(options ? { options } : {}) }),
  removePoint: ([pointIndex, options]) => ({ pointIndex, ...(options ? { options } : {}) }),
  decoratePoint: ([pointIndex, metadata]) => ({ pointIndex, metadata }),
  setPointMultipliers: ([multipliers]) => ({ multipliers }),
  getScoreboard: ([options]) => options ?? {},
  getInputLevels: () => ({}),
  getInputMode: () => ({}),
  getEpisodes: () => ({}),
  getStatistics: ([options]) => options ?? {},
};

/**
 * A call's result as the two engines are compared on it. The statistics' counters hold the history's points whole, and
 * a point not given a timestamp is stamped by each engine's own clock, read a few milliseconds apart: the observable
 * never compares a point's timestamp, so neither do the counters.
 */
export function comparable(method: string, result: any): any {
  const counters = result?.value?.returned?.counters;
  if (method !== 'getStatistics' || !counters) return result;
  const untimed = (item: any): any => {
    if (!item || typeof item !== 'object') return item;
    if (item.point) return { ...item, point: untimed(item.point) };
    const { timestamp: _timestamp, ...rest } = item;
    return rest;
  };
  const sides = (group: Record<string, Record<string, any[]>> = {}) =>
    Object.fromEntries(
      Object.entries(group).map(([side, categories]) => [
        side,
        Object.fromEntries(Object.entries(categories).map(([category, items]) => [category, items.map(untimed)])),
      ]),
    );
  const returned = {
    ...result.value.returned,
    counters: { players: sides(counters.players), teams: sides(counters.teams) },
  };
  return { ...result, value: { ...result.value, returned } };
}

export function routeScoringEngine({
  bridge,
  methods,
  counted,
}: {
  bridge: Bridge;
  methods: string[];
  counted: (method: string) => void;
}) {
  const prototype = ScoringEngine.prototype as any;
  const sessions = new WeakMap<object, string>();
  let opened = 0;
  let depth = 0;
  // the views the second implementation answers, compared after every routed write as well as when a test reads one,
  // so each is graded on every state a write leaves; called through the routed wrappers, past any spy on the instance
  const views = VIEWS.filter((view) => methods.includes(view));
  const routed: Record<string, (...args: any[]) => unknown> = {};

  for (const name of RESYNC) {
    const original = prototype[name];
    if (typeof original !== 'function') continue;
    prototype[name] = function (this: object, ...args: unknown[]) {
      sessions.delete(this);
      return original.apply(this, args);
    };
  }

  for (const name of methods) {
    const original = prototype[name];
    const paramsOf = PARAMS[name];
    if (typeof original !== 'function' || !paramsOf) continue;
    prototype[name] = function (this: any, ...args: any[]) {
      if (depth > 0) return original.apply(this, args);
      const params = canonicalObject(paramsOf(args)) as Record<string, unknown>;
      let session = sessions.get(this);
      let create: unknown;
      if (!session) {
        opened += 1;
        session = `scoring-${process.pid}-${opened}`;
        sessions.set(this, session);
        create = {
          options: {
            matchUpFormat: this.matchUpFormat,
            ...(this.competitionFormat ? { competitionFormat: this.competitionFormat } : {}),
            ...(this.pointMultipliers?.length ? { pointMultipliers: this.pointMultipliers } : {}),
          },
          state: canonicalObject(this.getState()),
          supplementary: canonicalObject(this.getSupplementaryState()),
        };
      }

      depth += 1;
      let returned: unknown;
      let refused: unknown;
      try {
        returned = original.apply(this, args);
      } catch (error) {
        refused = error;
      } finally {
        depth -= 1;
      }

      const request = { session, create, method: name, params, clock: new Date().toISOString() };
      counted(name);
      const answer = bridge.call(request);
      if (answer?.failure) throw new Error(`scoring ${name}: ${answer.failure}`);
      const ours = comparable(
        name,
        refused
          ? { error: REFUSED, context: { message: String((refused as any)?.message ?? refused) } }
          : { success: true, value: engineObservable(this, returned) },
      );
      const theirs = comparable(name, canonicalObject(answer.result));
      if (canonicalJson(canonicalObject(ours)) !== canonicalJson(theirs)) {
        const file = path.join(tmpdir(), `backend-scoring-call-${process.pid}-${Date.now()}.json`);
        fs.writeFileSync(file, JSON.stringify({ ...request, create: create ?? '(opened earlier)' }));
        throw new Error(
          `scoring ${name}: the second implementation disagrees (the call: ${file})\n  ${differingPaths(
            canonicalObject(ours),
            theirs,
          ).join('\n  ')}`,
        );
      }
      if (refused) throw refused;
      if (!VIEWS.includes(name)) for (const view of views) routed[view]?.call(this);
      return returned;
    };
    routed[name] = prototype[name];
  }
}
