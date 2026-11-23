import { getMethods } from '@Global/state/globalState';

// types
import { FactoryEngine } from '@Types/factoryTypes';

type MethodMap = { [methodName: string]: unknown };

/**
 * The raw methods each engine imported, keyed by the engine.
 *
 * `importMethods` writes its methods into the installed state provider's registry, which is where `executionQueue`
 * and `dryRun` resolve a directive's method by name. An engine whose module imports its governors when it is
 * evaluated (`tournamentEngineAsync`) does so before a server installs the async provider, and the async provider
 * keeps its registry per request state, so a fresh request found none of them: every queue was refused with
 * METHOD_NOT_FOUND while direct calls, which read the engine itself, worked. The engine's own imports are now the
 * fallback. They are the raw functions, not the engine's invoke wrappers, so a queue still stamps and notifies once.
 *
 * Cost: registration happens once per import, in place. A queue whose methods are all in the registry gets the
 * registry itself back, exactly as before; a merged map is built only when a directive needs the fallback.
 */
const engineMethods = new WeakMap<object, MethodMap>();

export function registerEngineMethods(engine: FactoryEngine, methods: MethodMap, methodNames: string[]): void {
  let own = engineMethods.get(engine);
  if (!own) engineMethods.set(engine, (own = {}));
  for (const name of methodNames) own[name] = methods[name];
}

/** The methods a queue resolves its directives from: the provider's registry, which keeps precedence. */
export function getQueueMethods(engine: FactoryEngine, directives: unknown): ReturnType<typeof getMethods> {
  const registry = getMethods();
  if (!Array.isArray(directives)) return registry;
  for (const directive of directives) {
    const methodName = directive?.method;
    if (typeof methodName === 'string' && !registry[methodName] && engineMethods.get(engine)?.[methodName]) {
      return { ...engineMethods.get(engine), ...registry };
    }
  }
  return registry;
}
