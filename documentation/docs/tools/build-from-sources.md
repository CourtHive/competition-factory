---
title: buildFromSources
---

```js
import { tools } from 'tods-competition-factory';
```

Assemble a `tournamentRecord` from partial, heterogeneous or third-party sources — a set of API
responses, a network-tab paste, an adapter's output — without knowing in advance what each one is.

It exists because the factory cannot control how other systems present their data, and because the
alternative is every ingest tool re-deriving the same assembly logic in a place that has no access
to the generators which already know the answer.

## buildFromSources

Pass an array of raw objects in any combination and any order. Each is classified by shape, routed
to the extractor for its kind, and merged into one record. Draw links are then repaired so the
result is readable — see [Link repair](#link-repair) below.

```ts
function buildFromSources(sources?: any[]): BuildFromSourcesResult;

interface BuildFromSourcesResult {
  record: Record<string, any>;
  classification: { index: number; kind: SourceKind }[];
  unknownCount: number;
  inferredLinks: { drawId?: string; inferred: InferredLink[]; issues: string[] }[];
  unplacedMatchUps: UnplacedMatchUp[];
}

type SourceKind = 'event-data' | 'matchups' | 'participants' | 'unknown';
```

```js
const { record, classification, unknownCount, inferredLinks, unplacedMatchUps } = tools.buildFromSources([
  eventDataResponse, // { data: { tournamentPublicEventData: { ... } } }
  scheduleResponse, // { tournamentMatchUps: [ ... ] }
  participantsResponse, // { tournamentParticipants: [ ... ] }
]);

// classification: [{ index: 0, kind: 'event-data' }, { index: 1, kind: 'matchups' }, ...]
```

**Nothing is dropped silently.** Three of the five returned keys exist only so the caller can see
what the assembler could not do:

| key | reports |
| --- | --- |
| `classification` | what each input was taken to be, by index — so a caller can show its work |
| `unknownCount` | inputs matching no known shape. Reported rather than discarded |
| `inferredLinks` | links added to make reconstructed draws readable, with confidence |
| `unplacedMatchUps` | matchUps naming a structure their draw does not contain |

A caller that would rather refuse than accept a repaired or lossy record inspects these and decides.

### Classification

Sources are sniffed rather than labelled. A single-key `{ data: { ... } }` envelope is peeled
recursively first — network-tab copies sometimes carry it and sometimes not — then:

- a wrapper key (`tournamentPublicEventData`, `tournamentMatchUps`, `tournamentParticipants`) names
  the kind outright;
- an array is classified from its first object member (`matchUpId` → matchups, `participantId`
  without `eventInfo` → participants);
- an object is classified from its distinguishing keys (`dateMatchUps` → matchups, `eventData` →
  event data).

Anything else is `'unknown'` and increments `unknownCount`.

`classifySource`, `extractEventData`, `extractMatchUps` and `extractParticipants` are exported
separately for a caller that already knows what it holds.

### unplacedMatchUps

`augmentDrawWithMatchUps` inserts a matchUp only into an existing structure whose `structureId`
matches. When no structure matches, the matchUp cannot be placed.

It is reported rather than dropped, because a shorter draw with no complaint is the hardest kind of
loss to notice:

```js
const { unplacedMatchUps } = tools.buildFromSources(sources);

// [{ matchUpId, eventId, drawId, structureId }]
// structureId is the one the matchUp NAMED — which no structure in that draw carries
```

Each entry carries enough identity to find the matchUp in the source. An empty array is the
ordinary case.

## buildTournamentRecord

The lower-level assembler, for a caller that has already separated its sources.

```ts
function buildTournamentRecord(args?: {
  eventDataDocs?: any[];
  matchUpDocs?: any[];
  participantDocs?: any[];
  unplaced?: UnplacedMatchUp[];
}): Record<string, any>;
```

```js
const record = tools.buildTournamentRecord({ eventDataDocs, matchUpDocs, participantDocs });
```

**It does not repair links**, deliberately: a caller assembling a record by hand keeps exactly its
previous behaviour and opts in via `repairDrawLinks`. Unplaced matchUps are collected only if the
caller hands over an array to collect them into, so the function's shape is unchanged for callers
that do not want the report.

## Link repair

A `drawDefinition` whose structures are not all joined into one group is **refused** by
`getDrawData` — not degraded, refused (`ERR_MISSING_STRUCTURE_LINKS`). The record still saves and
still lists in a calendar, so the failure is invisible until something asks for the draw.

Links are a property of the draw while matchUps are a projection of it, so reconstruction from
matchUps can never preserve them. Inference is the only route back.

### inferDrawLinks

```ts
function inferDrawLinks(params: { drawDefinition: DrawDefinition }): InferDrawLinksResult;

interface InferDrawLinksResult {
  links: DrawLink[]; // the links to ADD — existing links are never modified or removed
  inferred: InferredLink[];
  alreadyLinked: boolean; // the draw already formed a single group; nothing was needed
  issues: string[];
}

interface InferredLink {
  linkType: string;
  sourceStructureId: string;
  targetStructureId: string;
  basis: string; // why this pairing was chosen, in the stages' own vocabulary
  confidence: 'exact' | 'shape';
}
```

**This repairs; it does not reconstruct, and it says which.** Link count and `feedProfile` follow the
`drawType`, not the structure shape:

| drawType | structures | links |
| --- | --- | --- |
| `FIRST_MATCH_LOSER_CONSOLATION` | MAIN, CONSOLATION | 2, LOSER round 1 + 2 TOP_DOWN |
| `FEED_IN_CHAMPIONSHIP` | MAIN, CONSOLATION | 4, alternating TOP_DOWN / BOTTOM_UP |
| `ROUND_ROBIN_WITH_PLAYOFF` | MAIN, PLAY_OFF | 1, POSITION with feedProfile DRAW |
| `COMPASS` | 8 | 7 |

Two draws with identical structures therefore have different correct links, and nothing can recover
that from the structures alone. So `inferDrawLinks` emits the **minimum** set of links that joins
every structure into one group, and reports how confident it is:

- **`'exact'`** — a two-structure draw whose stages name an unambiguous relationship.
- **`'shape'`** — more than two structures, or stages that do not name one. The draw becomes
  readable; the feed pattern is a guess and is flagged as one.

The rule is read from the data rather than assumed: a `CONTAINER` source (round robin) feeds by
`POSITION` with `feedProfile: DRAW`; an `ITEM` source feeds by `LOSER` `TOP_DOWN`; and `QUALIFYING`
feeds `MAIN` by position — matching `generateQualifyingLink`.

A caller that knows the `drawType` and wants the true feed pattern should **generate** the draw
properly rather than repair it here.

### repairDrawLinks

Applies `inferDrawLinks` across every `drawDefinition` in a record, mutating it in place and
returning the report.

```js
const inferredLinks = tools.repairDrawLinks(record);
// [{ drawId, inferred: [{ linkType, basis, confidence, ... }], issues: [] }]
```

Empty when nothing needed repair. `buildFromSources` calls this before returning; `buildTournamentRecord`
does not.
