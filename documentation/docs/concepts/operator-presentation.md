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
The producer must perform authorization/privacy filtering before projection. These functions do not authorize
an operator or establish that the draw exists. CFS still needs to add source revision, audience, policy/build
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
`operatorMatchPresentation(matchUp, { venueTimeZone })` accepts the resolved zone for one match.
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

Focused tests cover immutable input, canonical score/upset behavior, ordering, TEAM filtering, explicit selected
fields and refusal instead of silent data loss. Packed-package checks exercise both declaration formats without
DOM libraries, runtime-import refusal and browser type erasure. These do not prove CFS/query integration.

Before publication: agree the complete contract, audience/privacy semantics, source/time freshness and scope
boundaries; rebase onto the independently merged constants work; update consumers to the actual published version;
and qualify a live-day result that changes advancement. Presentation-only timings exclude actions, readiness/rest,
conflicts, mutation, queue/DB work and publication fences, so they cannot replace the full operator-document benchmark.
