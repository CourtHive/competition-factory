---
title: Participants
sidebar_position: 2
---

# Managing Participants in TMX

The Participants tab in TMX provides comprehensive tools for managing tournament participants, from initial registration through check-in and assignment to events. This page demonstrates practical usage of the Competition Factory's [Participant Governor](../governors/participant-governor.md).

:::info Screenshots Coming Soon
This page will be updated with screenshots showing the TMX participant management interface.
:::

## Overview

Participant management in TMX includes:

- **Registration** - Adding new participants with required and optional information
- **Import/Export** - Bulk operations via CSV, Google Sheets, or JSON
- **Check-in** - Managing arrival and withdrawal status
- **Search & Filter** - Finding participants by various criteria
- **Editing** - Updating participant information
- **Assignment** - Adding participants to events

## Factory Methods Used

The Participants feature uses these key factory methods:

### Adding Participants

```js
// Single participant
tournamentEngine.addParticipant({
  participant: {
    participantType: 'INDIVIDUAL',
    person: {
      standardGivenName: 'John',
      standardFamilyName: 'Doe',
      nationalityCode: 'USA',
    },
  },
});

// Bulk participants
tournamentEngine.addParticipants({
  participants: [
    /* array of participant objects */
  ],
  allowDuplicateParticipantIdPairs: false,
});
```

### Participant Search and Retrieval

```js
// Get all participants
const { participants } = tournamentEngine.getParticipants({
  participantFilters: { participantTypes: ['INDIVIDUAL'] },
});

// Find specific participant
const { participant } = tournamentEngine.findParticipant({
  participantId,
});

// Search by name
const results = tournamentEngine.searchParticipants({
  searchText: 'John Doe',
});
```

### Updating Participants

```js
// Update participant details
tournamentEngine.modifyParticipant({
  participantId,
  participant: {
    person: {
      standardGivenName: 'John',
      standardFamilyName: 'Smith',
    },
  },
});

// Add participant contact info
tournamentEngine.addParticipantContact({
  participantId,
  contact: {
    emailAddress: 'john@example.com',
    phoneNumber: '+1-555-0123',
  },
});
```

## Key Features

### Registration Workflow

1. **Participant Creation**
   - Required fields: name, participant type
   - Optional fields: nationality, contact info, rankings
   - Automatic ID generation
   - Duplicate detection

2. **Validation**
   - Name validation
   - Contact information format checking
   - Nationality code validation
   - Rating/ranking validation

3. **Storage**
   - Added to tournament record
   - Available for event assignment
   - Preserved across sessions

### Import Options

#### Google Sheets Integration

```js
// TMX can import directly from Google Sheets
// Uses factory's participant structure
```

#### CSV Import

```js
// Standard CSV format
// Headers: firstName, lastName, nationality, rating, etc.
// Mapped to factory participant structure
```

#### JSON Import

```js
// Direct factory-compatible JSON
tournamentEngine.setState(tournamentRecord);
```

### Participant Assignment

```js
// Assign participant to event
tournamentEngine.addEventEntries({
  eventId,
  participantIds: [participantId],
});

// Assign with entry status
tournamentEngine.addEventEntries({
  eventId,
  participantIds: [participantId],
  entryStatus: 'DIRECT_ACCEPTANCE',
});
```

## Participant Data Structure

TMX uses the standard factory participant structure:

```js
{
  participantId: 'uuid',
  participantType: 'INDIVIDUAL',
  participantRole: 'COMPETITOR',
  person: {
    personId: 'uuid',
    standardGivenName: 'John',
    standardFamilyName: 'Doe',
    nationalityCode: 'USA',
    sex: 'MALE'
  },
  rankings: [
    {
      rankingType: 'RATING',
      ratingType: 'UTR',
      rating: 12.5
    }
  ],
  timeItems: [
    {
      itemType: 'CHECK_IN',
      itemValue: '2024-01-15T09:00:00Z'
    }
  ]
}
```

## UI Components

TMX uses these [courthive-components](https://courthive.github.io/courthive-components/) for participant management:

- **ParticipantsList** - Table view with sorting and filtering
- **ParticipantForm** - Add/edit participant details
- **ParticipantSearch** - Real-time search interface
- **BulkImport** - Import workflow component
- **CheckInManager** - Check-in status tracking

## Common Patterns

### Adding a New Participant

```js
// 1. Create participant object
const participant = {
  participantType: 'INDIVIDUAL',
  person: {
    standardGivenName: firstName,
    standardFamilyName: lastName,
    nationalityCode: country,
  },
};

// 2. Add to tournament
const result = tournamentEngine.addParticipant({ participant });

// 3. Handle result
if (result.success) {
  const { participant } = result;
  // Update UI with new participant
}
```

### Bulk Import Workflow

```js
// 1. Parse import data (CSV, Sheets, etc.)
const participants = parseImportData(data);

// 2. Validate participants
const validated = participants.filter((p) => validateParticipant(p));

// 3. Add to tournament
const result = tournamentEngine.addParticipants({
  participants: validated,
});

// 4. Report results
console.log(`Added: ${result.added.length}`);
console.log(`Duplicates: ${result.duplicates.length}`);
console.log(`Errors: ${result.errors.length}`);
```

### Participant Check-in

```js
// Add check-in time item
tournamentEngine.addTimeItem({
  itemType: 'CHECK_IN',
  itemValue: new Date().toISOString(),
  participants: [{ participantId }],
});

// Query checked-in participants
const { participants } = tournamentEngine.getParticipants({
  participantFilters: {
    participantTypes: ['INDIVIDUAL'],
  },
  withScaleValues: true,
});

const checkedIn = participants.filter((p) => p.timeItems?.some((t) => t.itemType === 'CHECK_IN'));
```

## Best Practices

### Data Quality

- Use factory methods to validate before invoking remote execution

### Performance

- Use bulk operations for multiple participants
- Understand factory based filtering capbilities

## Related Documentation

- [Participant Governor](../governors/participant-governor.md) - All participant-related methods
- [Entries Concepts](../concepts/events/entries.mdx) - How participants become event entries
- [Participant Types](../concepts/participants.md) - Data structure reference

## Next Steps

Once participants are registered, proceed to [Events & Categories](./events-categories.md) to create tournament events and assign participants.
