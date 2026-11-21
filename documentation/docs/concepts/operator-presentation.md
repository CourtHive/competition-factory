---
title: Operator presentation (unpublished candidate)
---

:::caution Contract and release hold

This page describes an **unpublished exploratory candidate**, not operator-document contract v1.
The presentation branch must not merge or release alongside the independent constants subpath.
Public names, fields and versioning require the complete operator-document contract review first.
Published factory 7.43.0 does not provide these APIs.

:::

## Boundary

The server-side `readModel` candidate provides `operatorMatchPresentation` and `operatorDrawPresentation`.
They consume an **already authorized, hydrated** match subset and emit selected display fields only.
CFS must authorize the source scope and supply the verified audience before projection. The factory builder owns
per-audience field minimization; query selects an authorized variant and never strips a broader payload. These
functions do not verify a live grant or establish that the draw exists. CFS still needs to add source revision, policy/build
generation, calculation time and time validity before query can serve a complete operator document.

The projector calls the existing factory `getRoundMatchUps`, `generateScoreString`, `checkScoreHasValue` and
`getMatchUpUpset`. Clients render supplied facts; neither query nor a renderer copies these rules.
It emits no participant/person/contact record, action offer, mutation payload, readiness/rest verdict or receipt.

## Server-side projection

```ts
import { readModel } from 'tods-competition-factory';

function buildPresentation(input: Parameters<typeof readModel.operatorDrawPresentation>[0]) {
  return readModel.operatorDrawPresentation(input);
}
```

The input identifies one draw and structure and supplies its authorized hydrated matchUps. Optional
`winnerLinkRoundNumbers` come from the canonical producer context. Optional `venueTimeZones` maps venue IDs
to producer-resolved IANA zones; the projector forwards the matching zone, never the browser's zone.
`operatorMatchPresentation(matchUp, { audience, venueTimeZone })` accepts the resolved zone for one match and
returns `{ presentation }` or an error, like the draw builder. Both builders require a declared audience; omission,
unknown values and prototype-property names are refused without a fallback payload.
Missing zone data remains missing; a renderer must label that uncertainty rather than invent a zone.

Draw projection refuses duplicate match identities, mixed draw/structure contexts and unrepresentable rounds.
Unrounded/ad-hoc matches are outside this first candidate draw facet; they must not silently become an empty draw.
The existing factory supplies round order and TEAM-level filtering. The result and score formatting do not mutate
the input, including its score-set array. The match facet carries IDs, names, supplied seed/BYE/qualifier/winner facts,
status, canonical score text/presence/upset, and selected schedule fields.

## Type-only browser boundary

```ts
import type { OperatorDrawPresentation } from 'tods-competition-factory/operator-types';

function roundCount(presentation: OperatorDrawPresentation) {
  return presentation.rounds.length;
}
```

The candidate subpath has ESM and CommonJS declarations and **no runtime condition**. Runtime import/require
must fail; type imports must erase completely. A browser must not import the root `readModel` builder or hold a
tournament engine/record. The `operator-presentation.v1` marker currently names only this experimental facet;
it does not establish operator-document contract v1 or a semver promise suitable for publication.

## Qualification and remaining work

### Internal result-decision preparation

The held source candidate also contains `src/query/readModel/operatorResultDecisions.ts`. It is deliberately
**not exported from `readModel` or `/operator-types`**. It resolves one explicitly supplied tournament/draw/match,
clones the source before legacy query decoration, and asks canonical `matchUpActions` for scoring/removal offers.
It emits only IDs, resolved format, disabled statuses and typed result-intention candidates. It never emits
participants, person fields, generic method/payload templates or a dependency token supplied by a caller.

The factory-owned `resultEntryContext` classifies an unscored live match as initial entry; an existing score,
winner or terminal outcome requires reviewed correction. The existing `CLEAR_SCORE` recorded-state predicate
is shared without broadening its behavior. Candidate availability comes from canonical offers, not a second
set of eligibility branches. Unknown audiences/scopes, TEAM/collection models and unusable formats are refused.

Legacy matchUp-action policies do not govern SCORE (the policy documentation explicitly states this). The
projection preserves that behavior; it must not treat a policy string as live authorization or add a private
policy filter. A complete operator builder still needs verified capability context from CFS.

These preparation objects say `wireReady: false` and `state: 'candidate'`, never the wire contract's `offered`.
Reviewed dependency construction/checking, time-validity horizons and live verified capabilities remain required
before an operator document can expose them as executable offers. No source-revision envelope, CFS command
adapter, publication fence or query endpoint is implemented here. The whole-record clone is a conservative
input-isolation cost, not an optimized per-day build; measure a shared captured build context before fan-out.

Tests generate competition scenarios with mocksEngine, drive score drafts through the pure scoring model,
and execute canonical mutations to assert actual advancement, correction and removal. Additional cases cover
BYEs/unfilled sides, the documented legacy SCORE policy exception, doubles, inherited/invalid format, stale global state and immutable/protected
input. Schema-only or mocked authorization tests do not substitute for those engine checks or future service tests.

Focused tests cover immutable input, canonical score/upset behavior, ordering, TEAM filtering, explicit selected
fields and refusal instead of silent data loss. Packed-package checks exercise both declaration formats without
DOM libraries, runtime-import refusal and browser type erasure. These do not prove CFS/query integration.

Before publication: agree the complete contract, audience/privacy semantics, source/time freshness and scope
boundaries; keep the independently merged constants work intact; update consumers to the actual published version;
and qualify the CFS producer path with a result that changes advancement. Presentation-only timings exclude actions, readiness/rest,
conflicts, mutation, queue/DB work and publication fences, so they cannot replace the full operator-document benchmark.

## Audience exposure checks

The provisional audience catalog is `recorder` and `director`, for the basic match/draw display screens only.
Both currently allow the same minimal display fields; neither includes a director-only person-details screen.
These unpublished names are not the final deployment audience set. Measure full variants before fixing that set.

`readModel.operatorPresentationSchemas[audience].match` and `.draw` declare the serialized field allow-lists.
Every object, including nested sides, schedules and rounds, refuses additional properties. Tests compile these
schemas against actual serialized builder output. Independent screen-policy assertions detect a deliberately widened
recorder schema, even when that widened schema would accept a planted director field. Unknown audience and
nested-field plants are also tested. The factory package gains no runtime JSON-schema-validator dependency.

Contact information, birth dates and raw person/participant records are excluded for both roles. Display text fields
accept strings only, so a malformed name object cannot carry a protected record through an allowed field name.
Any future protected field needs a named screen, declared audience and consent rules before it is emitted.

The catalog chooses data shape, not permission. A caller-supplied role is not proof of entitlement. Query/CFS must
verify current grants and scope before delivery/commands, including cached document reads after revocation. Those
operator integrations and their deliberate-violation checks are not implemented by this presentation candidate.
No app server or SSR is introduced. Session persistence, cookie mode/CSP and logout/provider/expiry wipe tests
remain app-shell gates; renderer teardown is not claimed as complete session erasure.
