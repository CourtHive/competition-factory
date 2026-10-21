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

## Default Fixture (deprecated)

`POLICY_PRINT_DEFAULT` is deprecated and will be removed in 8.0.0. It holds only a `policyName`, and
`attachPolicies` refuses a policy with no values (`INVALID_VALUES`), so it could never be attached. Attach a print
policy with at least one print-type entry, as below.

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

Once attached, the policy travels with the tournament record. Like every attached policy, it is stored in the
tournament's `appliedPolicies` extension, under the `print` key; there is no extension named `print`.

A print policy can also be attached to an event or a draw (`attachPolicies({ policyDefinitions, eventId })`, or
`drawId`), for prints that belong to them: a draw sheet, a sign-in sheet, a player list.

---

## Reading the Policy

```ts
import { policyConstants, tournamentEngine } from 'tods-competition-factory';
const { POLICY_TYPE_PRINT } = policyConstants;

const { appliedPolicies } = tournamentEngine.getAppliedPolicies();
const printPolicy = appliedPolicies?.[POLICY_TYPE_PRINT];
// printPolicy is the opaque blob that was attached.
```

The factory does not interpret the contents beyond storage — consumers
parse the value according to their own conventions.

## How pdf-factory resolves it

pdf-factory's `resolveCompositionConfig` layers the composition for a print type, each layer deep-merged over the ones
before it:

1. the provider default (`providerConfigSettings.policies.printPolicies[printType]`);
2. the tournament's own `appliedPolicies.print[printType]`;
3. the event's, when the print belongs to an event;
4. the drawDefinition's, when the print belongs to a draw;
5. runtime tweaks from the print dialog.

This differs from how the factory resolves other policies. `getAppliedPolicies` replaces an outer policy of a type
with the inner one whole; print layers deep-merge, so a draw that sets only its header keeps the tournament's footer
and page settings. Pass the full tournament record, not `getTournamentInfo()` output, which has no `extensions`.
