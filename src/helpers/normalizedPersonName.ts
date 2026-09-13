import { collapseWhitespace } from '@Tools/strings';

type PersonNames = {
  standardFamilyName?: any;
  standardGivenName?: any;
};

// The name fields whitespace is normalized on. Deliberately the two the factory
// composes `participantName` from — widening this to every name-ish field on a
// person would start rewriting values no comparison depends on.
const NAME_KEYS = ['standardGivenName', 'standardFamilyName'] as const;

// Mutate a person in place, collapsing whitespace runs in its standard names.
// No-op when the person is absent or a name is not a string.
//
// Person names reach the factory from forms and spreadsheets that trim
// inconsistently or not at all, and a trailing space in a given-name field
// composes a participantName with a double space in the middle of it. HTML
// collapses that run when it renders, so nothing looks wrong until something
// compares the string — a schedule search for 'Michael Livson' skipping past the
// cell that plainly reads "Michael Livson" is how this surfaces.
//
// Normalizing here rather than at each caller is what makes the guarantee hold
// for every consumer: the client's edit form, the server's import paths, and
// anything else that reaches addParticipant/modifyParticipant.
export function normalizePersonNames(person?: PersonNames): void {
  if (!person) return;
  for (const key of NAME_KEYS) {
    const normalized = collapseWhitespace(person[key]);
    if (normalized !== person[key]) person[key] = normalized;
  }
}
