---
title: Practice Governor
---

```js
import { practiceGovernor } from 'tods-competition-factory';
```

The **practiceGovernor** manages participant registrations for time windows
inside court bookings of type `PRACTICE`. Tournament directors paint PRACTICE
availability blocks via the existing `modifyCourtAvailability` mutation; the
practiceGovernor lets participants then claim specific sub-windows inside
those blocks for hitting sessions, coaching slots, or other reserved practice
time.

**Use cases:**

- Open hitting sessions where 2–4 participants share a court hour
- Coaching slots where one participant claims a 30-minute window with a coach
- Walk-up practice reservations recorded by the tournament desk

**Identity model:** registrations point at a tournament-scoped
`participantId`. A participant in two tournaments has two isolated practice
schedules. No cross-tournament identity is required.

---

## addPracticeRegistration

Adds a participant registration to a PRACTICE booking sub-window. Capacity
is enforced as a hard reject (`ERR_CAPACITY_EXCEEDED`). Participant
double-bookings — a matchUp scheduled during the slot, or another practice
registration on a different court — are returned as a `conflicts` payload
alongside the success result, never as a block. Callers (TMX) surface a
confirmation modal and decide whether to proceed.

**Parameters:**

- `tournamentRecord` _required_ — tournament containing the booking.
- `courtId` _required_ — court the PRACTICE booking is on.
- `date` _required_ — date the booking is scheduled.
- `bookingId` _required_ — booking identifier. Legacy bookings without an
  explicit `bookingId` resolve via the deterministic id
  `${courtId}-${date}-${startTime}`; the booking is stamped with the
  resolved id on first touch.
- `participantId` _required_ — tournament-local participant identifier.
- `startTime` _required_ — sub-window start (must be inside the booking
  window).
- `endTime` _required_ — sub-window end.
- `notes` _optional_ — free-text annotation.

**Returns:**

```ts
{
  success: true,
  registration: { registrationId, participantId, startTime, endTime, status, ... },
  conflicts?: {
    matchUps: [{ matchUpId, scheduledDate, scheduledTime }],
    practiceRegistrations: [{ registrationId, courtId, date, startTime, endTime }],
  }
}
```

`conflicts` is only present when at least one conflict was detected. Its
absence is a positive signal that the new slot is clean against the
participant's other tournament commitments.

---

## removePracticeRegistration

Removes a registration by `registrationId`. Hard delete — splices the row
out of `booking.registrations`. To preserve audit history instead, use
`updatePracticeRegistration` with `{ status: 'CANCELLED' }`.

**Parameters:** `tournamentRecord`, `courtId`, `date`, `bookingId`,
`registrationId`.

---

## updatePracticeRegistration

Mutates an existing registration in place. Sub-window time changes
re-validate against the booking window, capacity, and participant conflicts.
Status flips to `CANCELLED` stamp `cancelledAt`; flips back to `CONFIRMED`
clear it.

**Parameters:** `tournamentRecord`, `courtId`, `date`, `bookingId`,
`registrationId`, and an `updates` object with any of `startTime`,
`endTime`, `notes`, or `status`.

`status` is `'CONFIRMED' | 'CANCELLED'` in Phase 1. The `'WAITLISTED'`
value is reserved for a future Phase 3 release that adds auto-promote
logic.

---

## setPracticeDefaultCapacity

Sets the tournament-wide default capacity for PRACTICE bookings that don't
carry their own per-block `booking.capacity`. The setting lives at
`Tournament.scheduling.practice.defaultCapacity`.

**Parameters:**

- `tournamentRecord` _required_
- `defaultCapacity` _required_ — `number | null`. `null` clears the field
  (unlimited); `0` closes the slot to new registrations; positive integers
  cap the simultaneous CONFIRMED registrations whose sub-windows overlap.

**Returns:** standard `{ success }` envelope.

Rejected values: negative numbers, fractional numbers, non-number /
non-null types return `ERR_INVALID_VALUES`.

---

## getPracticeRegistrations

Returns every registration in the tournament as a flat list, optionally
filtered. Cancelled registrations are excluded by default.

**Parameters:**

- `tournamentRecord` _required_
- `courtId` _optional_ — restrict to a single court.
- `date` _optional_ — restrict to a single date.
- `participantId` _optional_ — restrict to one participant.
- `includeCancelled` _optional_ — when `true`, cancelled registrations
  are also returned.

**Returns:**

```ts
{
  registrations: [
    {
      registration: { ... },
      venueId, courtId, date, bookingId,
      bookingStartTime, bookingEndTime,
    },
    ...
  ]
}
```

---

## Capacity model

Capacity is resolved per registration:

1. If `booking.capacity` is set, it wins.
2. Else `tournament.scheduling.practice.defaultCapacity` is used.
3. Else capacity is unlimited.

The values are uniform:

- `null` or omitted — **unlimited**
- `0` — **closed** (every add returns `ERR_CAPACITY_EXCEEDED`)
- positive integer — cap on simultaneous CONFIRMED registrations whose
  sub-windows overlap

Cancelled registrations never count toward the cap.

---

## Conflict detection

Two conflict classes are detected when adding or updating a registration:

- **matchUp conflict** — a non-completed matchUp involving the participant
  is scheduled during the requested window.
- **practice conflict** — the same participant has a CONFIRMED registration
  on any court whose sub-window overlaps the requested window.

Both classes are returned as a `conflicts` payload alongside the success
response. The factory never rejects a registration on a participant
conflict; the calling surface (TMX) decides how to present the conflict to
the operator and whether to proceed.

Capacity-exceeded is a different category — it _is_ a hard reject.
