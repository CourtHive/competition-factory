# Registration Profile

## Overview

`registrationProfile` is the structured home for all tournament information that participants, officials, and the public need before and during a tournament — entry deadlines, fees, logistics, ceremonies, regulations, and sponsors.

It lives directly on the tournament record and serves three consumers:

1. **Editor clients** (e.g. TMX) — structured editing for tournament directors
2. **Web rendering** — tournament fact sheets for participants and the public
3. **PDF generation** — fact sheets and draw sheet header auto-population

## RegistrationProfile

```typescript
interface RegistrationProfile {
  // temporal
  entriesOpen?: string;
  entriesClose?: string;
  withdrawalDeadline?: string;

  // entry & eligibility
  entryFees?: RegistrationEntryFee[];
  entryMethod?: string; // 'ONLINE' | 'EMAIL' | 'POSTAL' | 'OTHER'
  entryUrl?: string;
  eligibilityNotes?: string;

  // logistics (structured + HTML notes)
  accommodation?: LogisticsSection;
  hospitality?: LogisticsSection;
  medicalInfo?: LogisticsSection;
  transportation?: LogisticsSection;

  // simple text
  contingencyPlan?: string;
  dressCode?: string;

  // ceremony & social
  awardsCeremonyDate?: string;
  awardsDescription?: string;
  drawCeremonyDate?: string;
  socialEvents?: SocialEvent[];

  // regulations & compliance
  codeOfConduct?: DocumentLink;
  regulations?: DocumentLink[];

  // branding
  sponsors?: Sponsor[];

  extensions?: Extension[];
  notes?: string;
  timeItems?: TimeItem[];
}
```

## LogisticsSection

Each logistics area (accommodation, transportation, hospitality, medical) uses the same pattern: an array of structured options plus an optional HTML notes field for anything that doesn't fit the structure.

```typescript
interface LogisticsSection {
  options?: LogisticsOption[];
  notes?: string; // HTML for free-form content
}

interface LogisticsOption {
  name: string; // required
  description?: string;
  address?: string;
  phone?: string;
  email?: string;
  url?: string;
  priceRange?: string; // e.g. "$80-120/night"
  notes?: string;
}
```

## Supporting Types

```typescript
interface MonetaryAmount {
  amount: number; // required
  currencyCode: string; // required, e.g. "USD"
  unit: CurrencyUnitUnion; // required — MINOR | MAJOR
}

interface RegistrationEntryFee extends MonetaryAmount {
  eventId?: string; // the specific event this fee buys entry to — the most specific selector
  category?: string;
  eventType?: EventTypeUnion; // SINGLES | DOUBLES | TEAM | HYBRID
  appliesFrom?: string; // early-bird / late-entry pricing window
  appliesTo?: string;
  extensions?: Extension[];
}

interface SocialEvent {
  name: string; // required
  date?: string;
  time?: string;
  location?: string;
  description?: string;
}

interface Sponsor {
  name: string; // required
  tier?: string; // TITLE | PRESENTING | OFFICIAL | SUPPORTING
  logoUrl?: string;
  websiteUrl?: string;
}

interface DocumentLink {
  name: string; // required
  url?: string;
  description?: string;
}
```

## Setting the Registration Profile

`setRegistrationProfile` **merges** the provided fields with any existing profile. To clear the entire profile, pass a falsy value.

```javascript
// set initial entry deadlines
tournamentEngine.setRegistrationProfile({
  registrationProfile: {
    entriesOpen: '2026-05-01',
    entriesClose: '2026-05-15',
    withdrawalDeadline: '2026-05-20',
    entryMethod: 'ONLINE',
    entryUrl: 'https://example.com/enter',
  },
});

// add accommodation later — merges with existing fields
tournamentEngine.setRegistrationProfile({
  registrationProfile: {
    accommodation: {
      options: [
        {
          name: 'Grand Hotel',
          address: '123 Main St',
          phone: '+1-555-0100',
          priceRange: '$120-180/night',
          url: 'https://grandhotel.example.com',
        },
      ],
      notes: '<p>Mention code TENNIS2026 for tournament rate</p>',
    },
  },
});

// clear the entire profile
tournamentEngine.setRegistrationProfile({ registrationProfile: null });
```

## Reading the Registration Profile

Returns a deep copy — mutations to the returned object do not affect engine state.

```javascript
const { registrationProfile } = tournamentEngine.getRegistrationProfile();

if (registrationProfile?.accommodation?.options?.length) {
  console.log(registrationProfile.accommodation.options[0].name);
}
```

## Event grain overrides

An event may state its own registration facts where they differ from the tournament's:

```typescript
interface EventRegistration {
  entriesOpen?: Date | string;
  entriesClose?: Date | string;
  withdrawalDeadline?: Date | string;
  entryFees?: RegistrationEntryFee[];
  entryUrl?: string;
  eligibilityNotes?: string;
  extensions?: Extension[];
}
```

Those six fields are the only overridable ones — the tournament's logistics, sponsors and dress code are not event-scoped concepts.

**Resolve them with `getEffectiveRegistrationProfile`, never by reaching for the fallback directly.** The cascade is **field by field**, and that distinction is the whole reason the function exists:

```javascript
// WRONG — an event overriding only entriesClose silently loses the tournament's
// entryUrl, entryFees and every other field
const profile = event.registrationProfile ?? tournamentRecord.registrationProfile;

// RIGHT
const profile = engine.getEffectiveRegistrationProfile({ event, tournamentRecord });
```

The wrong form fails invisibly at the call site and shows up as a missing registration link on one division.

An `undefined` value on the event does **not** override — absent means "not stated here", never "explicitly nothing". A `null` **is** preserved, so a producer can still say "this event has no entry URL" when it means it.

## Entry fees

`RegistrationEntryFee` extends `MonetaryAmount`, so **`unit` is required by construction**. An optional unit would reintroduce exactly the ambiguity the type exists to remove, since the omitted case is indistinguishable from the unconsidered one: `{ amount: 4000, currencyCode: 'USD' }` is readable as either $40.00 or $4,000 with nothing to choose between them.

Reads are tolerant where writes are strict — records written before `unit` existed still arrive over the wire without one. [`resolveEntryFee`](../governors/entries-governor.md#resolveentryfee) returns an explicit `{ indeterminate: true, reason }` rather than guessing, because the unit **cannot** be inferred from magnitude: "6000 is obviously minor units" is wrong on a real ¥6000 entry and on a genuine $6,000 pro-am, and both exist.

### Selectors

A tournament-grain fee list can carry entries for several events, so "the fees on this record" is not the question "the fees for this event". [`getEventEntryFees`](../governors/entries-governor.md#getevententryfees) matches selectors **most-specific first**:

| selector | scope |
| --- | --- |
| `eventId` | this exact event |
| `category` | events of that category name or `ageCategoryCode` |
| `eventType` | SINGLES / DOUBLES / TEAM / HYBRID |
| _(none)_ | every event — how a single tournament-wide price is stated |

Only the most specific tier that matched is returned. A fee keyed to this exact `eventId` supersedes a blanket "all doubles" price, and returning both would leave the caller to re-derive precedence and get it wrong.

`appliesFrom` / `appliesTo` bound the window in which a price is the one charged. Without them, an early rate and a late rate are two records with no stated relationship, and a consumer computing "what does this cost" has no way to exclude the one that has expired. Both ends are optional — an early-bird rate with no `appliesFrom` has simply always been available.

## Entry profile

How an event accepts entries, and how many. Separate from `registrationProfile` because it is an **acceptance rule**, not a published fact:

```typescript
interface EventEntryProfile {
  entriesLimit?: number; // how many entries the event will accept
  targetDrawSize?: number; // intended draw size before a drawDefinition exists to carry one
  selectionProcess?: SelectionProcessUnion;
  selectionScaleName?: string;
  wildcardCount?: number;
  waitlistEnabled?: boolean;
  extensions?: Extension[];
}
```

It is **event grain for a structural reason** rather than a presentational one: events within a single `tournamentRecord` can carry different sanctioning bodies (`Event.sanction`, and `eventOtherIds[].isOrigin` at the identity grain), so a limit set by body A must not be expressed at a grain body B shares.

`SelectionProcessEnum` is `FIRST_COME_FIRST_SERVED` | `TOP_DOWN_BY_RANKING` | `TOP_DOWN_BY_RATING` | `MANUAL` | `LOTTERY`.

`selectionScaleName` names **which** scale orders acceptance — 'WTN', 'NTRP', a federation ranking list. `TOP_DOWN_BY_RANKING` alone is under-specified: two events sorting by different scales accept different players. Organisers currently state this in the tournament title after an asterisk ("\*top down by ranking", "\*top down by WTN"), which is the evidence that it needs a field.

:::note

`entriesLimit` does **not** answer what the whole competition can physically schedule and play, given courts, days and daily match limits — the sum of individually valid limits can exceed that. Feasibility is the scheduler's to report and is deliberately not stored, because two statements of one fact drift.

:::

## Related Concepts

- **[Entry Eligibility](./events/entry-eligibility.md)** — who may enter, beyond age and rating: `entryRestrictions`, and asking rather than attempting.
- **[Tournament Discovery](./tournament-discovery.md)** — the read-model row that flattens these registration windows and fee ranges into discovery facets.
- **[Tournament Tier](./tournament-tier.md)** — the competitive prestige classification (`tournamentTier`). While the registration profile captures operational tournament metadata (deadlines, fees, logistics), the tier defines the competitive classification that determines ranking points, draw size requirements, and prize money bands. Both live on the tournament record and together provide a complete picture of what participants need to know.

## Design Principles

- **Structured + HTML fallback**: logistics sections have structured `options` for rendering in web and PDF outputs, plus an HTML `notes` field for anything unstructured.
- **Additive merge**: `setRegistrationProfile` spreads new fields over existing ones, so consumers can update one section without resending the entire profile.
- **Factory purity**: the factory stores and retrieves the profile. Rendering (PDF headers, web fact sheets) happens in downstream consumer applications.
- **TODS alignment**: `RegistrationProfile` is a first-class type on the tournament record, not an extension. All new fields are optional, so existing tournament records are unaffected.
