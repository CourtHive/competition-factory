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
 * every routed call on it runs on both. After each call the two engines' observables are compared: what the call
 * returned, the score, the timeline's shape, the servers, the undo and redo depths and the players on court (the
 * scoring corpus's observable), or the refusal's message. A call that replaces the instance's state re-opens its session
 * at the next routed call.
 *
 * Only the outermost call on an instance is routed: a method another method calls is part of that call.
 */
type Bridge = { call: (request: unknown) => any };

const RESYNC = ['setState', 'loadSupplementaryState', 'reset', 'markHardBoundary'];

/** each method's arguments as the second implementation reads them (the scoring corpus's directive params) */
const PARAMS: Record<string, (args: any[]) => Record<string, unknown>> = {
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
};

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
      const ours = refused
        ? { error: REFUSED, context: { message: String((refused as any)?.message ?? refused) } }
        : { success: true, value: engineObservable(this, returned) };
      const theirs = canonicalObject(answer.result);
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
      return returned;
    };
  }
}
