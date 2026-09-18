---
title: Order of Play
---

Order of Play publishing controls visibility of scheduled matchUps - which matches are scheduled for which courts and times.

## Why Order of Play Publishing?

- **Schedule Preparation**: Prepare schedules internally before announcing
- **Flexibility**: Make scheduling changes before public release
- **Coordination**: Synchronize releases with media partners
- **Daily Updates**: Publish each day's schedule separately

## Publishing Scheduled MatchUps

```js
// Publish all scheduled dates and events
engine.publishOrderOfPlay();

// Publish specific dates only
engine.publishOrderOfPlay({
  scheduledDates: ['2024-06-15', '2024-06-16'],
});

// Publish specific events only
engine.publishOrderOfPlay({
  eventIds: ['singles-main', 'doubles-main'],
});

// Publish specific dates and events
engine.publishOrderOfPlay({
  scheduledDates: ['2024-06-15'],
  eventIds: ['singles-main'],
  removePriorValues: true, // Clear previous publications
});

// Publish with embargo — schedule hidden until embargo time passes
engine.publishOrderOfPlay({
  scheduledDates: ['2024-06-15'],
  embargo: '2024-06-14T18:00:00Z', // Visible after 6pm the day before
});
```

See [Embargo and Scheduled Rounds](./publishing-embargo.md) for details on how embargo enforcement works across all publishing levels.

**API Reference:** [publishOrderOfPlay](/docs/governors/publishing-governor#publishorderofplay)

## Unpublishing Order of Play

```js
engine.unPublishOrderOfPlay({
  removePriorValues: true, // Remove timeItems (default)
});
```

**API Reference:** [unPublishOrderOfPlay](/docs/governors/publishing-governor#unpublishorderofplay)

## Querying Published Schedules

```js
const { dateMatchUps } = engine.competitionScheduleMatchUps({
  usePublishState: true, // Only return published matchUps
});

// dateMatchUps organized by date, filtered by publish state
// Only matchUps on published dates in published events returned
```

**API Reference:** [competitionScheduleMatchUps](/docs/governors/query-governor#competitionschedulematchups)
