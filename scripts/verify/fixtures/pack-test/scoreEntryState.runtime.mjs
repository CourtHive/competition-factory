// `import 'tods-competition-factory/score-entry-state'` from the packed tarball: the score state works with no DOM.
import { createRequire } from 'node:module';

const { exerciseScoreStates } = createRequire(import.meta.url)('./scoreEntryState.states.js');

const before = new Set(Object.keys(globalThis));
const entry = await import('tods-competition-factory/score-entry-state');
const exported = exerciseScoreStates(entry);
const added = Object.keys(globalThis).filter((key) => !before.has(key));
if (added.length) throw new Error(`score-entry-state added globals: ${added.join(', ')}`);
if ('tournamentEngine' in entry || 'syncEngine' in entry) throw new Error('score-entry-state exposes an engine');
console.log(`[score-entry-state esm] ${exported} exports`);
