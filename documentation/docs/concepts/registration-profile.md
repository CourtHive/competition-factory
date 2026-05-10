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
interface RegistrationEntryFee {
  amount: number; // required
  currencyCode: string; // required, e.g. "USD"
  eventType?: EventTypeUnion; // SINGLES | DOUBLES | TEAM | HYBRID
  category?: string;
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

## Related Concepts

- **[Tournament Tier](./tournament-tier.md)** — the competitive prestige classification (`tournamentTier`). While the registration profile captures operational tournament metadata (deadlines, fees, logistics), the tier defines the competitive classification that determines ranking points, draw size requirements, and prize money bands. Both live on the tournament record and together provide a complete picture of what participants need to know.

## Design Principles

- **Structured + HTML fallback**: logistics sections have structured `options` for rendering in web and PDF outputs, plus an HTML `notes` field for anything unstructured.
- **Additive merge**: `setRegistrationProfile` spreads new fields over existing ones, so consumers can update one section without resending the entire profile.
- **Factory purity**: the factory stores and retrieves the profile. Rendering (PDF headers, web fact sheets) happens in downstream consumer applications.
- **TODS alignment**: `RegistrationProfile` is a first-class type on the tournament record, not an extension. All new fields are optional, so existing tournament records are unaffected.
