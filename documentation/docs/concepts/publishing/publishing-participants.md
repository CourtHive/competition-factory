---
title: Participants
---

Participant publishing controls visibility of the participant list.

## Why Participant Publishing?

- **Entry Management**: Accept entries internally before announcing participant list
- **Privacy**: Control when participant information becomes public
- **Marketing**: Coordinate announcements with promotional campaigns
- **Staged Entries**: Announce wildcards separately from direct acceptances

## Publishing Participants

```js
engine.publishParticipants();

// Clear previous publications and republish
engine.publishParticipants({
  removePriorValues: true,
});

// Publish with embargo — participant list hidden until embargo time passes
engine.publishParticipants({
  embargo: '2024-06-10T09:00:00Z',
});
```

See [Embargo and Scheduled Rounds](./publishing-embargo.md) for details on how embargo enforcement works across all publishing levels.

**API Reference:** [publishParticipants](/docs/governors/publishing-governor#publishparticipants)

## Unpublishing Participants

```js
engine.unPublishParticipants({
  removePriorValues: true,
});
```

**API Reference:** [unPublishParticipants](/docs/governors/publishing-governor#unpublishparticipants)

## Privacy Policies

Publishing integrates with **privacy policies** to control which participant attributes are visible:

### Participant Privacy Policy

```js
import { policyConstants } from 'tods-competition-factory';

const privacyPolicy = {
  participant: {
    contacts: false, // Hide contact information
    addresses: false, // Hide addresses
    individualParticipants: {
      // For pairs/teams
      contacts: false,
      addresses: false,
    },
  },
};

// Apply privacy policy during publishing
const { eventData } = engine.publishEvent({
  eventId,
  policyDefinitions: { [policyConstants.POLICY_TYPE_PARTICIPANT]: privacyPolicy },
});

// Participant data in eventData respects privacy policy
// Internal operations still have access to complete data
```

**API Reference:** [publishEvent](/docs/governors/publishing-governor#publishevent)

### Display Settings

Control visibility of specific matchUp and schedule attributes:

```js
const displaySettings = {
  matchUps: {
    scheduleDate: true,
    scheduledTime: false, // Hide specific times
    courtName: true,
    courtOrder: false,
  },
  participants: {
    addresses: false,
    contacts: false,
  },
};

engine.setEventDisplay({
  eventId,
  displaySettings,
});

// Settings applied when usePublishState: true in queries
```

**API Reference:** [setEventDisplay](/docs/governors/publishing-governor#seteventdisplay)

### Privacy by Default

Apply privacy policies consistently:

```js
const defaultPrivacyPolicy = {
  participant: {
    contacts: false,
    addresses: false,
    individualParticipants: {
      contacts: false,
      addresses: false,
    },
  },
};

// Attach to tournament for consistent application
engine.attachPolicies({
  policyDefinitions: {
    [policyConstants.POLICY_TYPE_PARTICIPANT]: defaultPrivacyPolicy,
  },
});
```
