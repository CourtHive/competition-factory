/**
 * Example async state provider for a server consumer (e.g. competition-factory-server).
 *
 * DECISION: re-export the single reference implementation rather than keep a second copy.
 * WHY: this file and `@Server/providers/factory/engines/asyncGlobalState` had drifted into two
 * near-identical forks of the same example — same mechanism, different typing, only one of them
 * carrying the `getPayloads` alias. Two examples of one pattern is one example too many, and the
 * stale fork taught a state-propagation approach that does not hold. See competition-factory#4564.
 */
export { default } from '@Server/providers/factory/engines/asyncGlobalState';
