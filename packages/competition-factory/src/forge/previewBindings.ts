import { UNREGISTERED_PREVIEW_METHOD } from '@Constants/errorConditionConstants';

import type { ResultType, TournamentRecords } from '@Types/factoryTypes';
import type { Directives } from '@Assemblies/engines/types/engineTypes';
import type { Tournament } from '@Types/tournamentTypes';

type PrivateQueueResult = ResultType & {
  results?: (ResultType & Record<string, unknown> & { methodName: string })[];
  rolledBack?: boolean;
};

/** The private receiver supplied to an explicitly registered preview implementation. */
export interface PrivatePreviewEngine {
  getState(): { tournamentId: string | undefined; tournamentRecords: TournamentRecords };
  getTournament(params?: { tournamentId?: string }): { tournamentRecord?: Tournament };
  executionQueue(directives: Directives<string>): PrivateQueueResult | Promise<PrivateQueueResult>;
}

export type PreviewParams = Record<string, unknown> & {
  tournamentRecord?: Tournament;
  tournamentRecords: TournamentRecords;
};
export type PreviewImplementation<Params extends object = PreviewParams> = (
  params: Params,
  privateEngine: PrivatePreviewEngine,
) => unknown;

const builtins = new WeakSet<object>();
const registrations = new WeakMap<object, WeakMap<object, PreviewImplementation>>();

export function setBuiltinPreviewMethods<T extends object>(namespace: T): T {
  for (const implementation of Object.values(namespace)) {
    if (typeof implementation === 'function') builtins.add(implementation);
  }
  return namespace;
}

/** true for one of the factory's own governor methods, as registered above; false for an imported custom method */
export function isBuiltinMethod(method: unknown): boolean {
  return typeof method === 'function' && builtins.has(method);
}

/** Bind a raw importMethods function to the implementation that can run on private state. */
export function setPreviewMethod<Params extends object = PreviewParams>(
  engine: object,
  liveMethod: (...args: never[]) => unknown,
  privateImplementation: PreviewImplementation<Params>,
): void {
  if (typeof liveMethod !== 'function' || typeof privateImplementation !== 'function')
    throw new TypeError('Preview registration requires a live method and a private implementation');
  let methods = registrations.get(engine);
  if (!methods) registrations.set(engine, (methods = new WeakMap()));
  methods.set(liveMethod, privateImplementation as PreviewImplementation);
}

type PreviewBinding = { builtin: (params: PreviewParams) => unknown } | { custom: PreviewImplementation };

/** Called after queue validation. Resolve every directive before the first one can execute. */
export function resolvePreviewDirectives(
  engine: object,
  directives: Directives<string>,
  liveMethods: Record<string, unknown>,
) {
  const methods = new Map<string, PreviewBinding>();
  const registered = registrations.get(engine);
  for (const { method } of directives) {
    const live = liveMethods[method];
    if (typeof live === 'function') {
      if (builtins.has(live)) {
        methods.set(method, { builtin: live as (params: PreviewParams) => unknown });
        continue;
      }
      const custom = registered?.get(live);
      if (custom) {
        methods.set(method, { custom });
        continue;
      }
    }
    return { error: { ...UNREGISTERED_PREVIEW_METHOD, methodName: method } };
  }
  return { methods };
}
