---
title: Venue Governor
---

## addCourt

Add a court to a Venue. See **court** under **venue** in [Type Defs](/docs/types/typedefs#venue).

```js
const court = {
  altitude, // optional
  courtDimensions, // optional
  courtId, // generated automatically if not provided
  courtName,
  dateAvailability, // optional - see below
  latitude, // optional
  longitude, // optional
  onlineResources,  // optional
  pace, // optional - string; ITF enums
  surfaceCategory, // optional - surface constant, e.g. CLAY, HARD, GRASS, CARPET, or ARTIFICIAL
  surfaceType, // string; see: https://www.itftennis.com/en/about-us/tennis-tech/recognised-courts/
  surfacedDate?: Date;
}

engine.addCourt({ venueId, court });
```

---

## addCourts

Convenience function to bulk add courts to a Venue. Only adds **dataAvailability** and **courtName**. See [Scheduling](/docs/concepts/venues-courts). See examples in [Creating Courts](../concepts/venues-courts.md#creating-courts).

```js
const dateAvailability = [
  {
    date: '2020-01-01T00:00', // if no date is provided then this profile will be used as default
    startTime: '07:00',
    endTime: '19:00',
    bookings: [
      { startTime: '07:00', endTime: '08:30', bookingType: 'PRACTICE' },
      { startTime: '08:30', endTime: '09:00', bookingType: 'MAINTENANCE' },
      { startTime: '13:30', endTime: '14:00', bookingType: 'MAINTENANCE' },
    ],
  },
];
engine.addCourts({
  venueAbbreviationRoot, // optional boolean; whether to use venue.venueAbbreviation in court naming
  dateAvailability, // optional -- see definition in Tournament Engine API
  courtNameRoot, // optional; defaults to 'Court'
  courtNames: ['Court 1', 'Court 2', 'Court 3'], // optional
  courtsCount: 3, // optional, can be added/modified later; also can be derived from courtNames.length
  venueId,
});
```

---

## addVenue

Adds **venueId** if not provided. See examples in [Creating Venues](../concepts/venues-courts.md#creating-venues).

```js
engine.addVenue({
  venue: {
    venueName,
    defaultStartTime, // optional - HH:MM format, paired with defaultEndTime
    defaultEndTime, // optional - HH:MM format, paired with defaultStartTime
    dateAvailability, // optional - venue-level date availability (same structure as court dateAvailability)
    isPrimary, // optional boolean - designates this as the tournament's primary venue
  },
  context, // optional - adds detail in CONTEXT extension
});
```

**Notes:**

- `defaultStartTime` and `defaultEndTime` must be provided **together** — setting only one returns an error
- `defaultEndTime` must be after `defaultStartTime`
- These defaults are inherited by all courts in the venue. See [Venue-Level Scheduling Constraints](../concepts/venues-courts.md#venue-level-scheduling-constraints)
- Setting `isPrimary: true` automatically clears `isPrimary` from any previously-primary venue (at most one venue can be primary). See [Primary Venue](../concepts/venues-courts.md#primary-venue)

---

## deleteCourt

```js
engine.deleteCourt({
  courtId,
  force, // override warnings about matchUps scheduled on specified court
});
```

---

## deleteCourts

Bulk delete multiple courts. If any court has scheduled matchUps, deletion will fail unless `force: true`, in which case all relevant matchUps will be unscheduled.

```js
engine.deleteCourts({
  courtIds: ['court-uuid-1', 'court-uuid-2'],
  force, // override warnings about matchUps scheduled on specified courts
});
```

---

## deleteVenue

If a venue has scheduled matchUps then it will not be deleted unless `{ force: true }` in which case all relevant matchUps will be unscheduled.

Deleting a primary venue does **not** auto-promote another venue — the caller must explicitly designate a new primary via `modifyVenue`.

```js
engine.deleteVenue({ venueId, force });
```

---

## deleteVenues

If a venue has scheduled matchUps then it will not be deleted unless `{ force: true }` in which case all relevant matchUps will be unscheduled. See examples: [Modifying Venues](../concepts/venues-courts.md#modifying-venues).

```js
engine.deleteVenues({ venueIds, force });
```

---

## disableCourts

```js
engine.disableCourts({
  courtIds,
  dates, // optional - if not provided, courts will be disalbed for all dates
});
```

---

## disableVenues

```js
engine.disableVenues({ venueIds });
```

---

## enableCourts

```js
engine.enableCourts({
  enableAll, // optional boolean
  courtIds,
  dates, // optional - array of dates to enable (if they have been disabled)
});
```

---

## enableVenues

```js
engine.enableVenues({ venueIds, enableAll });
```

---

## findVenue

Returns a complete venue object. Primarily used internally.

```js
const { venue } = engine.findVenue({ venueId });
```

**Returns:**

```ts
{
  venue?: Venue;
  error?: ErrorType;
}
```

---

## generateCourts

Generates multiple courts with sequential naming for a venue. Convenience method for quickly creating courts during testing or initial setup.

```js
const { courts } = engine.generateCourts({
  venueId, // required - venue to add courts to
  courtsCount: 10, // number of courts to generate
  courtNames, // optional - array of custom court names
  courtIds, // optional - array of specific courtIds to use
  startTime: '08:00', // optional - court availability start
  endTime: '20:00', // optional - court availability end
  dateAvailability, // optional - full dateAvailability configurations
});
```

**Returns:**

```ts
{
  courts: Court[];  // Array of generated court objects
  success: boolean;
}
```

**Notes:**

- If `courtNames` not provided, generates names like "Court 1", "Court 2", etc.
- If `courtIds` not provided, generates UUIDs automatically
- Can specify default availability hours via `startTime` and `endTime`
- For complex availability, use full `dateAvailability` objects
- All courts added to specified venue

---

## getCompetitionVenues

Returns all venues from all tournaments in competition engine state, with optional filtering.

```js
const { venues, courts } = competitionEngine.getCompetitionVenues({
  venueIds, // optional - filter to specific venue IDs
  dates, // optional - filter courts by availability dates
  ignoreDisabled, // optional - exclude disabled venues/courts
  convertExtensions, // optional - convert extension objects to arrays
});
```

**Returns:**

```ts
{
  venues: HydratedVenue[];  // Array of venues from all tournaments
  courts: HydratedCourt[];  // Array of courts from all venues
}
```

**Use Cases:**

- Getting all venues across multi-tournament competition
- Cross-tournament venue scheduling
- Competition-wide court availability analysis
- Building unified venue selection UI

**Notes:**

- Aggregates venues from all tournament records in competition state
- Removes duplicate venues (same venueId across tournaments)
- Returns hydrated venues with computed properties
- Use `getVenuesAndCourts()` for single-tournament queries

---

## getCourts

Returns courts for a specific venue, with optional filtering and hydration. See examples: [Retrieving Venue Information](../concepts/venues-courts.md#retrieving-venue-information).

```js
const { courts } = engine.getCourts({
  venueId, // optional - specific venue (omit for all venues)
  dates, // optional - filter by date availability
  ignoreDisabled, // optional - exclude disabled courts
  convertExtensions, // optional - convert extensions format
});
```

**Returns:**

```ts
{
  courts: HydratedCourt[];
}
```

**Hydrated Court Properties:**

- `dateAvailability` - Availability schedules
- `courtName` - Display name
- `courtId` - Unique identifier
- Computed availability for specified dates
- Disability status

**Use Cases:**

- Building court selection dropdowns
- Checking court availability
- Getting schedulable courts for specific dates
- Court management interfaces

---

## getVenuesAndCourts

Returns venues and courts from a tournament record or competition, with optional filtering and hydration.

```js
const { venues, courts } = engine.getVenuesAndCourts({
  venueIds, // optional - filter to specific venues
  dates, // optional - filter by date
  ignoreDisabled, // optional - exclude disabled items
  convertExtensions, // optional - convert extension format
});
```

**Returns:**

```ts
{
  venues: HydratedVenue[];  // Array of venue objects with computed properties
  courts: HydratedCourt[];  // Array of court objects from all venues
}
```

**Hydrated Venue Properties:**

- All standard venue properties
- `courts` array with court objects
- Disability status from extensions
- Computed availability information

**Examples:**

```js
// Get all venues and courts
const { venues, courts } = engine.getVenuesAndCourts();

// Get specific venues only
const { venues } = engine.getVenuesAndCourts({
  venueIds: ['venue-1', 'venue-2'],
});

// Get courts available on specific dates
const { courts } = engine.getVenuesAndCourts({
  dates: ['2024-03-20', '2024-03-21'],
  ignoreDisabled: true,
});

// For competition engine (multi-tournament)
const { venues, courts } = competitionEngine.getVenuesAndCourts();
```

**Use Cases:**

- Building venue/court selection interfaces
- Scheduling UI data loading
- Availability analysis
- Venue management dashboards

**Notes:**

- Returns empty arrays if no venues exist
- Hydrated objects include computed properties not in raw data
- Use `ignoreDisabled: true` to exclude administratively disabled venues/courts
- Date filtering applies to court availability schedules

---

## modifyCourt

```js
engine.modifyCourt({
  courtId,
  force, // applies only to dateAvailability, will remove scheduling information from matchUps where court is no longer available
  modifications: {
    courtName,
    dateAvailability,
    courtDimensions,
    onlineResources,
    surfaceCategory,
    surfacedDate,
    surfaceType,
    altitude,
    latitude,
    longitude,
    notes,
    pace,
  },
});. See examples: [Modifying Courts](../concepts/venues-courts.md#modifying-courts), [Modifying Courts](../concepts/venues-courts.md#modifying-courts).
```

---

## modifyCourtAvailability

Modifies the `dateAvailability` attribute of a specified court. Warns if existing scheduled matchUps would be affected. See [Scheduling](/docs/concepts/venues-courts).

```js
const result = engine.modifyCourtAvailability({
  dateAvailability,
  courtId,
  force, // override warning that existing scheduled matchUps exist
});
```

---

## modifyVenue

Courts present on venue will replaced with courts specified in parameters. If courts are not present in parameters, courts will be unchanged. See examples: [Modifying Venues](../concepts/venues-courts.md#modifying-venues).

See [Scheduling](/docs/concepts/venues-courts) for more detail on court `dateAvailability` and [Venue-Level Scheduling Constraints](../concepts/venues-courts.md#venue-level-scheduling-constraints) for venue-level defaults.

```js
const modifications = {
  venueAbbreviation,
  onlineResources,
  venueName,
  defaultStartTime, // optional - HH:MM format; validated with existing or modified defaultEndTime
  defaultEndTime, // optional - HH:MM format; validated with existing or modified defaultStartTime
  dateAvailability, // optional - venue-level date availability
  isPrimary, // optional boolean - set or clear this venue as the tournament's primary venue
  courts: [
    {
      courtId: 'b9df6177-e430-4a70-ba47-9b9ff60258cb',
      courtName: 'Custom Court 1',
      dateAvailability: [
        {
          date: '2020-01-01', // if no date is provided then `startTime` and `endTime` will be considered default values
          startTime: '16:30',
          endTime: '17:30',
        },
      ],
    },
  ],
};
engine.modifyVenue({ venueId, modifications });
```

**Notes:**

- When modifying `defaultStartTime` or `defaultEndTime`, the engine validates the **resulting pair** (merging with existing values). For example, if the venue already has `defaultStartTime: '09:00'` and you modify only `defaultEndTime`, the pair `('09:00', newEndTime)` is validated.
- `dateAvailability` replaces the entire venue-level availability array when provided
- Setting `isPrimary: true` automatically clears `isPrimary` from any previously-primary venue. Setting `isPrimary: false` removes the property entirely (clean serialization). See [Primary Venue](../concepts/venues-courts.md#primary-venue)

---
