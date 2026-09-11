import * as governors from '@Assemblies/governors';
import syncEngine from '@Assemblies/engines/sync';

// constants and types
import { FactoryEngine, FactoryEngineTyped } from '@Types/factoryTypes';

syncEngine.importMethods(governors, true, 1);

/**
 * Default exports — typed via `FactoryEngineTyped`. Method names autocomplete,
 * per-method params/returns are precise where `MethodSignatures` has lifted
 * them (~89% of the 600-method surface as of factory 5.0.x), and the facades
 * (`engine.q.*`, `engine.dryRun`, `engine.explain`, `engine.inspect`,
 * `engine.on/once/off/waitFor`, `engine.build.*`) carry their full generics.
 *
 * Consumers that can't take the typed lift yet (third-party packages on
 * factory 5.x without TypeScript or with implicit-any reliance) can opt out
 * by importing the `Untyped` variant — same runtime singleton, looser type.
 */
export const competitionEngine = syncEngine as unknown as FactoryEngineTyped;
export const tournamentEngine = syncEngine as unknown as FactoryEngineTyped;

/**
 * Opt-out variants — same runtime instance as `tournamentEngine` /
 * `competitionEngine`, but typed as the open `FactoryEngine` (`{[key: string]: any}`).
 * Use these only when you want the pre-5.x untyped shape; new code should
 * prefer the typed defaults.
 */
export const competitionEngineUntyped: FactoryEngine = syncEngine;
export const tournamentEngineUntyped: FactoryEngine = syncEngine;

export default syncEngine;
