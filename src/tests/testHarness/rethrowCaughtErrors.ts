import { setStateProvider } from '@Global/state/globalState';
import { rethrowingStateProvider } from './engineCatch';

// Every test file starts with engine throws rethrown, not caught. See engineCatch.ts.
setStateProvider(rethrowingStateProvider);
