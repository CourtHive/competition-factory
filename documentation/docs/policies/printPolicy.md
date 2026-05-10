---
title: Print Policy
---

The **Print Policy** (`POLICY_TYPE_PRINT`) is an extension slot
attached to the tournament record, used to carry composition
configuration for printed artifacts (draw sheets, order-of-play sheets,
player lists, court cards, sign-in sheets, match cards). The factory
treats the policy contents as opaque JSON — it stores the policy on
the tournament record and round-trips it intact through serialization.
Consuming applications interpret the structure and produce PDFs.

**Policy Type:** `print`

**When to Use:**

- Capturing per-tournament print appearance overrides that travel with
  the tournament record (header layout, alert banner text, content
  toggles, etc.) keyed by print artifact type.
- Persisting tournament-specific art direction (sponsor metadata,
  alternate labeling, custom subtitles) alongside the tournament data
  for later reference and reproduction.

The factory is opinion-free about the _shape_ of each per-print-type
entry — that contract is owned by the consumer that actually generates
PDFs from the policy. The factory only asserts the outer envelope:
`policyDefinitions.print` is an object whose top-level keys are print
artifact identifiers (e.g., `'draw'`, `'schedule'`, `'playerList'`).

---

## Policy Structure

```ts
{
  print: {
    policyName?: string;         // Optional human-readable identifier

    // One entry per print artifact type. The contents are opaque to
    // the factory — the consuming application defines the shape.
    [printArtifactType: string]?: {
      [key: string]: unknown;
    };
  };
}
```

A reasonable concrete shape (defined by consuming applications, not
the factory) might include `header`, `footer`, `page`, and `content`
sub-blocks per print type.

---

## Default Fixture

`POLICY_PRINT_DEFAULT` (in `src/fixtures/policies/POLICY_PRINT_DEFAULT.ts`)
is intentionally minimal — just the `policyName` envelope with no
per-print-type entries. Consumers attach this as a baseline before
layering in tournament-specific entries.

```ts
import { POLICY_PRINT_DEFAULT } from 'tods-competition-factory';

POLICY_PRINT_DEFAULT;
// → { print: { policyName: 'Default Print Configuration' } }
```

---

## Attaching to a Tournament

```ts
import { tournamentEngine } from 'tods-competition-factory';

tournamentEngine.attachPolicies({
  policyDefinitions: {
    print: {
      policyName: 'French Open 2026 — print overrides',
      schedule: {
        header: { layout: 'grand-slam', tournamentName: 'Roland Garros' },
        content: { alertBanner: 'Centre Court closes at 23:00' },
      },
    },
  },
});
```

Once attached, the policy travels with the tournament record. It
serializes/deserializes intact and is available to any consumer that
reads the tournament's `extensions` for `POLICY_TYPE_PRINT`.

---

## Reading the Policy

```ts
import { tournamentEngine, POLICY_TYPE_PRINT } from 'tods-competition-factory';

const { tournamentRecord } = tournamentEngine.getState();
const printExtension = tournamentRecord.extensions?.find((e) => e.name === POLICY_TYPE_PRINT);
const printPolicy = printExtension?.value;
// printPolicy is the opaque blob that was attached.
```

The factory does not interpret the contents beyond storage — consumers
parse the value according to their own conventions.
