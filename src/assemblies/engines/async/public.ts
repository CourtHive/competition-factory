import { competitionEngineAsync as assembled } from '../../../tests/engines/asyncEngine';
import createAsyncEngine from './index';

import type { AsyncEngineFactory, AsyncFactoryEngine } from '../../../types/asyncEngineTypes';

// The dynamic internal assemblies retain their open type for method registration.
// Publish a closed, classified contract without wrapping or changing any runtime call.
export const asyncEngine = createAsyncEngine as AsyncEngineFactory;
export const competitionEngineAsync = assembled as AsyncFactoryEngine;
export const tournamentEngineAsync = competitionEngineAsync;
