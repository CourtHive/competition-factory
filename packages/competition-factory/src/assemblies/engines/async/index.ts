import { engineStart } from '@Assemblies/engines/parts/engineStart';
import { createInstanceState } from '@Global/state/globalState';
import { registerAsyncPreviewEngine } from '@Forge/dryRun';
import { asyncExecutionQueue } from './asyncExecutionQueue';
import { asyncEngineInvoke } from './asyncEngineInvoke';

// types
import { FactoryEngine } from '@Types/factoryTypes';
import type { Directives } from '@Assemblies/engines/types/engineTypes';

export function asyncEngine(test?: boolean): FactoryEngine & { error?: any } {
  const result = createInstanceState();
  if (result.error && !test) return result;

  const engine: FactoryEngine = {
    executionQueue: (directives: Directives<string>, rollbackOnError?: boolean) =>
      asyncExecutionQueue(engine, directives, rollbackOnError),
    execute: (args: any) => asyncEngineInvoke(engine, args),
  };

  registerAsyncPreviewEngine(engine);
  engineStart(engine, asyncEngineInvoke);

  return engine;
}

export default asyncEngine;
