// `require('tods-competition-factory/score-entry-state')` from the packed tarball: the draft works with no DOM, and
// loading it loads none of the root bundle.
const { exerciseDrafts } = require('./scoreEntryState.drafts.js');

const before = new Set(Object.keys(globalThis));
const entry = require('tods-competition-factory/score-entry-state');
const exported = exerciseDrafts(entry);

const loaded = Object.keys(require.cache).filter((path) => path.includes('tods-competition-factory'));
const outside = loaded.filter((path) => !/[\\/]dist[\\/]score-entry-state[\\/]/.test(path));
if (outside.length) throw new Error(`score-entry-state loaded the root bundle: ${outside.join(', ')}`);
const added = Object.keys(globalThis).filter((key) => !before.has(key));
if (added.length) throw new Error(`score-entry-state added globals: ${added.join(', ')}`);
console.log(
  `[score-entry-state cjs] ${exported} exports; loaded ${loaded.length} file(s), all in dist/score-entry-state`,
);
