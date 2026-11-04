---
title: 'Formats: what, how and scoring'
---

Three formats describe a competition. Each answers a different question, and each is stored and resolved on its
own.

| Format              | Answers                 | Shape                                                                                                         |
| ------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `tieFormat`         | WHAT is played          | The collections of a TEAM matchUp and how their results aggregate to a tie score                              |
| `matchUpFormat`     | How a matchUp is scored | A code: sets or timed segments, games, tiebreaks, overtime and deciders                                       |
| `competitionFormat` | HOW the sport is played | Timers, timeouts, substitutions, penalties, point vocabulary, the server rule and an optional `matchUpFormat` |

- **[tieFormat](./tieFormat.mdx)** describes the `collectionDefinitions` of a `{ matchUpType: TEAM }` matchUp
  (singles, doubles or any custom grouping), how many matchUps each holds, and how value won in each collection
  adds up to the result of the tie.
- **[matchUpFormat](../codes/matchup-format.mdx)** is a scoring code such as `SET3-S:6/TB7`. The
  [grammar](../codes/matchup-format-grammar.md) covers sets, timed segments, overtime and final-set deciders.
- **competitionFormat** covers what the scoring code does not: `timerProfile`, `timeoutRules`,
  `substitutionRules`, `playerRules`, `penaltyProfile`, `penaltyBoxProfile`, `pointProfile`, `pointMultipliers`
  and `serverRule` (`ALTERNATE_GAMES` by default, or `WINNER_SERVES`). It may also name a default
  `matchUpFormat`. See `@Types/competitionFormat`.

## How they nest

Each `collectionDefinition` in a tieFormat carries its own `matchUpFormat`, which is the format of every line
matchUp in that collection. A competitionFormat does not sit inside either: it is attached beside them, to an
event, a drawDefinition or a structure.

The shipped `PICKLEBALL_STANDARD` competitionFormat fixture (abridged):

```json
{
  "competitionFormatName": "PICKLEBALL_STANDARD",
  "matchUpFormat": "SET3-S:TB11",
  "sport": "PICKLEBALL",
  "serverRule": "WINNER_SERVES",
  "timerProfile": { "changeoverSeconds": 60, "setBreakSeconds": 120 },
  "timeoutRules": { "count": 1, "per": "SET" },
  "substitutionRules": { "allowed": false }
}
```

Its `matchUpFormat`, `SET3-S:TB11`, is the scoring structure: best of three sets, each set a single tiebreak game
to 11. Everything else in the fixture (the server rule, a 60-second changeover, a 120-second set break, one
timeout per set, no substitutions, plus its penalty and point vocabularies) is how the sport is played, and none
of it can be expressed in the code.

## Where each is stored and resolved

| Format              | Stored on                                                                                               | Resolution order                             | Query                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------- |
| `tieFormat`         | matchUp, structure, drawDefinition, event (inline `tieFormat` or a `tieFormatId` into `tieFormats`)     | matchUp → structure → drawDefinition → event | [getTieFormat](../governors/query-governor.md#gettieformat)                 |
| `matchUpFormat`     | matchUp, structure, drawDefinition, event; a TEAM line takes its collection's format from the tieFormat | matchUp → structure → drawDefinition → event | [getMatchUpFormat](../governors/query-governor.md#getmatchupformat)         |
| `competitionFormat` | structure, drawDefinition, event                                                                        | structure → drawDefinition → event           | [getCompetitionFormat](../governors/query-governor.md#getcompetitionformat) |

The first level that defines a value wins. A matchUp does not carry a competitionFormat: `getCompetitionFormat`
accepts a `matchUpId`, but only to find the matchUp's structure and drawDefinition. An event-level
competitionFormat is set with `modifyEvent({ eventUpdates: { competitionFormat } })`; pass `null` to clear it.

For a TEAM line matchUp, hydration and the scoring write path take the format from the line's
`collectionDefinition` before falling back to structure, drawDefinition and event.

## Which matchUpFormat applies

The [ScoringEngine](../scoring-engine/event-handlers.md#competitionformat-integration) prefers an explicit
`matchUpFormat` option, then `competitionFormat.matchUpFormat`, then its default format.

No tournament query or mutation reads `competitionFormat.matchUpFormat`: hierarchical resolution, hydration and
score validation use only the hierarchical `matchUpFormat`, and there is no rule for which applies when the two
disagree.

## Not to be confused with competitionProfile

A [`competitionProfile`](./draw-types/competition-profile.md) is a versioned attribute of a drawDefinition that
describes the draw's competition format, such as the rotating-partner formats Americano and Mexicano. A
competitionFormat describes how the sport itself is played.

## Planned

:::note Planned, not shipped
competitionFormat is planned to carry explicit constraints that narrow which matchUpFormats it accepts, for
example refusing a tiebreak final-set decider. Constraints will only narrow: they cannot admit a code that the
[matchUpFormat grammar](../codes/matchup-format-grammar.md) refuses.
:::
