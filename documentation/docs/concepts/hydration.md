---
title: What hydration derives
---

A stored draw holds matchUps as written: their positions, schedules, scores and the ids of the matchUps they feed.
**Hydration** turns them into matchUps in context: each side's participant, the round's context, the schedule with its
recovery time, the matchUps it feeds, and the participants who may yet arrive. This page states what hydration derives,
and from what, precisely enough for a second implementation to reproduce it from a stored draw. Its scope is the
fields the scheduling pipeline reads ([the scheduling pipeline](./scheduling-pipeline)); the planning view serializes
exactly these for `kernel.scheduling.plan@2`. The rulings cited are CA's of 2026-10-26.

## 1. The merge

Each matchUp in context is built in three layers, a later layer winning:

1. **Context** inherited from the tournament, the event and the draw (`tournamentId`, `eventId`, the event's
   `matchUpFormat`, its category, …).
2. **Derived** values: the format and type, the round's context, the schedule, the draw positions.
3. **The stored matchUp** itself: any attribute stored on the matchUp overrides the derived one.

Absent, `null` and empty values never override. Three derived values win over what is stored:

- `schedule` is rebuilt (section 4); of the stored schedule only `calledAt` and `scoredTime` are kept.
- `sides` are rebuilt after the merge (section 3); a stored side is spread under the derived one.
- A line of a TEAM dual that is a BYE is a BYE, whatever the line stores (ruling OPEN-1). The dual carries the BYE; its
  lines stay stored `TO_BE_PLAYED`.

## 2. Identity, format and type

| field                                   | rule                                                                                                                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `tournamentId`, `eventId`, `drawId`     | from the containers                                                                                                                             |
| `structureId`                           | the structure holding the matchUp; in a round robin, the GROUP's                                                                                |
| `stage`, `stageSequence`                | the top-level structure's (a round robin's container)                                                                                           |
| `roundNumber`, `roundPosition`          | stored; a TEAM line takes its dual's `roundNumber` and has no `roundPosition`                                                                   |
| `matchUpFormat`                         | the matchUp's own, else the structure's, the draw's, the event's. A TEAM line: its collection's format, else the same chain                     |
| `matchUpType`                           | the matchUp's, the collection's, the structure's, the draw's, else the event's type (not TEAM); else inferred from the first side's participant |
| `matchUpStatus`, `winningSide`, `score` | stored (a BYE dual's lines: section 1)                                                                                                          |

**A TEAM line resolves its tieFormat through its dual** (ruling OPEN-4): the line's own, else the dual's, which falls
back to the structure, the draw and the event. A `tieFormatId` is resolved before any inline default: the referenced
tieFormat in the draw's `tieFormats`, then the event's, then the draw's own `tieFormat`, then the event's.

## 3. Sides

**Draw positions are read, never derived.** A matchUp's `drawPositions` are those it stores (a TEAM line: its dual's).
A later round holds a position only once a result, a BYE or an exit advanced it.

**Side order.** Two positions: ascending, side 1 the lower. One position: in a feed round, side 2 when the position
advanced from the round before, side 1 when it was fed; otherwise the side whose feeding matchUp it came from (the
round's paired positions). None: both sides empty.

**Side content.** A side's `participantId` is the structure's position assignment for its draw position (a round
robin: the groups' assignments together); an assignment marked `bye` makes a BYE side. A TEAM line's side is the
player (SINGLES) or the PAIR participant of the two players (DOUBLES) the team's lineUp assigns to the line's collection
position; the lineUp is the dual side's, else the draw's lineUps by the team's `participantId` (ruling OPEN-12). A
DOUBLES line's side has a `participantId` only when that PAIR exists: hydration never creates participants (ruling
OPEN-6).

`sides[].participant` and its `person.personId` come from the tournament's participants, through any participant
privacy policy: data outside the draw.

**The round profile** (round counts and paired positions, `roundFactor`, `feedRound`) of a round robin is its
container's, computed over all its groups. Generated round robins have groups of equal size (BYE positions pad them),
so it equals each group's; an imported draw with unequal groups differs only in the display-only `roundFactor` and
`feedRound` (ruling OPEN-13).

## 4. Schedule

Each attribute is read from the first-class `schedule` when present, else from the latest timeItem of its type, the
last of those stamped alike: `scheduledDate` (else the date of a date-time `scheduledTime`), `scheduledTime`,
`venueId`, `courtId`, and `endTime` (ruling OPEN-9).

**Recovery** (when asked for, as the scheduling view asks): with a `scheduledTime` and a known type, the matchUp's
average and recovery minutes for its format and category, from the scheduling policy of the draw, else the event,
else the tournament, else the default policy (ruling OPEN-11), and the tournament's and event's timing settings.

- `timeAfterRecovery` is `HH:MM`: the end of play plus the recovery minutes, or the start plus the average and
  recovery minutes. `dateAfterRecovery` is the day it falls on: the matchUp's date, or the next day past midnight
  (ruling OPEN-8). An end of play recorded as a time earlier than the start was after midnight. An unparseable time
  gives neither.
- `typeChangeTimeAfterRecovery` and `typeChangeDateAfterRecovery` likewise, with the singles-to-doubles recovery.
- The arithmetic is on minutes past midnight: no clock, no time zone (ruling OPEN-7).

## 5. The graph

Hydration adds, for every matchUp of an elimination structure, the matchUp its winner goes to and the matchUp its
loser goes to; targets never cross draws.

- **Stored ids first.** A matchUp storing its edges (`winnerMatchUpId`, and `loserMatchUpId` wherever a loser link
  exists) uses them: every generated draw stores them. A matchUp storing only one keeps it and derives the other from
  the links (ruling OPEN-10).
- **Derived** from the links of the source round: the target round's matchUp at the position the link's feed profile
  gives; with no winner link, the next round of the same structure.
- `winnerTo` and `loserTo` describe the target (id, structure, round, position, schedule). **`loserTo` skips a BYE**:
  a loser whose target is a BYE goes on to the next matchUp to be played, and `loserTo` names that one.
- `sidesTo` (round robin groups and other win-ratio structures, which have no `winnerTo`/`loserTo`): for each of the
  matchUp's positions, the next round's matchUp holding it.
- A TEAM line has no edges: the graph lives on its dual, reached through `matchUpTieId` (ruling OPEN-5).

`schedule.scheduleConflict` is set on a target scheduled before the source's recovery ends, comparing the date and
the time where both dates are known (ruling OPEN-8).

## 6. Potential participants

The participants who may arrive at a matchUp from an undecided matchUp feeding it, one round back:

- A source contributes when it has a draw position and a side with a participant, is not a BYE, and is not decided.
- To its winner target, its participants, unless one of them already stands there; to its loser target, likewise.
- The loser target is the matchUp the loser actually reaches (the one `loserTo` names); **no BYE holds potentials**
  (ruling OPEN-3).
- In a first-match-loser consolation, a loser target receiving fewer than two participants also receives
  `{ bye: true, tbd: true }`: an exit could yet send someone. **The marker is the loser target's only** (ruling OPEN-2).
- One group per contributing source, in source order. A TEAM line, and a win-ratio structure's matchUps, have none.

## Related

- [The scheduling pipeline](./scheduling-pipeline), which reads these fields
- [MatchUp context](./matchup-context), the API view of the same
