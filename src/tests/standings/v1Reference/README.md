# Frozen v1 round-robin tally (oracle)

A byte-for-byte copy of `src/query/matchUps/roundRobinTally/` taken at factory `origin/dev` `857309b4f0`
(2026-11-01), before the standings engine restructure (Mentat `planning/STANDINGS_ENGINE_SPEC.md` § 7, S1).

`../v1Differential.test.ts` runs the live engine and this copy over the same seeded random groups and requires
identical output. **Never edit these files.** When a ruled behaviour change lands (S3: K1, K8, K10), the
differential test excludes the affected inputs explicitly and names the ruling; the oracle itself stays frozen.

The copy is untyped v1 code, so it carries 166 implicit-any errors. They sit under their own key,
`src/tests/standings/v1Reference`, in `scripts/verify/baseline/tsc-implicit-any.json`, and that key goes
when the oracle is deleted. `@ts-nocheck` is banned by lint, and annotating the copy would unfreeze it.
