---
title: Entry Eligibility
---

Whether a participant **may** enter an event — asked, rather than attempted.

The predicate is not new. `validateParticipantCategory` has evaluated age at both ends of an event,
handled exact-DOB and calendar-year (`birthYear`) conventions, and expanded `ageCategoryCode` since
it was written. It was reachable only through `addEventEntries`, so the only way to learn whether
someone could enter was to try to enter them — which a discovery surface evaluating one person
against thousands of events cannot do.

```js
import { eventGovernor } from 'tods-competition-factory';
```

## getParticipantEligibility

```ts
function getParticipantEligibility(params: {
  participant: Participant;
  event: Event;
  tournamentRecord?: Tournament;
}): ResultType & Partial<ParticipantEligibility>;

interface ParticipantEligibility {
  eligible: boolean;
  indeterminate: boolean;
  rejectionReasons: RejectionReason[];
  undeterminedRestrictions?: EntryRestriction[];
}
```

```js
const { eligible, indeterminate, rejectionReasons, undeterminedRestrictions } = engine.getParticipantEligibility({
  participant,
  event,
});
```

Read-only: it emits no notices and mutates nothing.

### `indeterminate` is not `eligible: false`

The two answer different questions, and collapsing them produces a confident wrong answer about
whether someone may play:

- **`eligible: false`** with `indeterminate: false` — a rule was **breached**. The participant is
  over the age limit.
- **`indeterminate: true`** — at least one rule could **not be evaluated**, because the data it needs
  is absent: an unknown `birthDate`, an unrecorded rating. `eligible` is `false` alongside it, and
  the honest reading is "cannot be determined".

Indeterminate applies only when **nothing** was actually breached. A participant who is both over
the age limit and missing a rating is ineligible, full stop — the missing rating cannot soften a
breach established on other grounds.

:::note

`addEventEntries` keeps its own behaviour exactly: a participant whose `birthDate` is unknown is
still filtered out of the entry list there, while here the same participant reports `indeterminate`.

That divergence is deliberate. Both call sites share the predicate and apply different policy to its
output, because "we cannot tell" is correctly a **refusal** when writing an entry and correctly
**not** a refusal when answering a question.

:::

An event with no `category` restricts nobody on age or rating, and returns `eligible: true` — not a
silent pass, but the absence of any such rule. An `entryRestriction` may still make the answer
undecidable, so restrictions are collected before that path is taken.

## getEligibleEvents

The same question across many events — "which of these can I enter". The bulk form exists because
asking per event means re-resolving the participant and the tournament for each one.

```ts
function getEligibleEvents(params: {
  participant: Participant;
  events: Event[];
  tournamentRecord?: Tournament;
}): ResultType & { eventEligibility?: EventEligibility[] };

interface EventEligibility extends ParticipantEligibility {
  eventId: string;
}
```

```js
const { eventEligibility } = engine.getEligibleEvents({ participant, events: tournamentRecord.events });

const canEnter = eventEligibility.filter(({ eligible }) => eligible);
const askOrganiser = eventEligibility.filter(({ indeterminate }) => indeterminate);
```

Events that cannot be evaluated at all — no resolvable date range, for instance — are returned as
`indeterminate`, **never dropped**. A silently shortened list is indistinguishable from one where
those events were checked and found ineligible.

## entryRestrictions

A condition on **who** may enter, beyond the age, gender and rating that `category` already carries.

Two federations evidence the need independently. One gates on residency — a level whose name ends
"Closed" is open only to competitors of the sanctioning section, which is why its grade and its
eligibility rule are currently welded into one facet string. The other gates on membership, bought
from the organisation running the event.

Where a governing body's level name encodes a restriction, the **grade** belongs in
`sanction.classification` and the **rule** belongs here. Welding them into one string makes the grade
unsortable and the rule unreadable.

```ts
interface EntryRestriction {
  type: EntryRestrictionUnion;
  organisationId?: string; // whose territory, roster or register this resolves against
  membershipCategory?: string; // which membership, where a body sells more than one
  description?: string; // free text for a consumer to show — not parsed
  evaluable?: boolean;
  extensions?: Extension[];
}
```

`EntryRestrictionEnum` is open in spirit — governing bodies invent gates — but enumerated so a
consumer can branch on the common ones rather than parse `description`:

| type | meaning |
| --- | --- |
| `RESIDENCY` | competitor must be of the stated organisation's territory |
| `MEMBERSHIP` | competitor must hold a membership of the stated organisation |
| `RANKING_FLOOR` | competitor must hold a ranking or rating at or above a threshold |
| `CLEARANCE` | competitor must hold a current safeguarding / background clearance |
| `INVITATION` | entry is by invitation of the organiser |
| `OTHER` | stated by the organiser and not one of the above |

`organisationId` is required in practice for `MEMBERSHIP` and `RESIDENCY` and meaningless without it:
"members only" is not a rule until it says whose members. A membership of the organisation running
the event and a membership of its national body are different gates.

### `evaluable` — absence means undecidable, not satisfied

CODES holds no section rosters and no membership registers, so most restrictions **cannot** be
resolved from a record. A restriction with no explicit `evaluable: true` is therefore treated as
undecidable and surfaced in `undeterminedRestrictions` rather than swallowed:

```js
const { eligible, undeterminedRestrictions } = engine.getParticipantEligibility({ participant, event });

// eligible: false, indeterminate: true
// undeterminedRestrictions: [{ type: 'RESIDENCY', organisationId: 'USTA-SOUTHERN' }]
```

That lets a consumer say _"this event is closed to your section — check with the organiser"_ instead
of either a flat no or a misleading yes. Defaulting the other way would answer "yes, you may enter"
on a rule nothing checked.

A producer that **has** resolved a restriction sets `evaluable: true` explicitly and takes
responsibility for it.

**Advisory in v1, and deliberately so.** A restriction that announces itself is strictly more useful
than one that stays silent, because silence is indistinguishable from "no restriction".

## Cancellation

`TournamentStatusEnum.CANCELLED` says **that** a competition was cancelled. Two event-grain fields say
when and why, for a consumer that must explain it to an entrant:

```ts
interface Event {
  cancelledAt?: Date | string;
  cancellationReason?: string;
}
```

The same pair exists at tournament grain. `Event.cancelledAt` is unrelated to
`PracticeRegistration.cancelledAt`, which is a different object's own lifecycle.

## Related

- [Entries](./entries.mdx) — adding and modifying entries
- [Categories](./categories.mdx) — the age / rating rules this evaluates
- [Registration Profile](../registration-profile.md) — entry windows, fees and entry profile
