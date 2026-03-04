---
title: Draw Engine
---

The **_drawEngine_** generates drawDefinitions and matchUp results, managing participant movement within and between structures. Participants, however, are not necessary for the operations performed by the **_drawEngine_**, and reference to `participantIds` only occurs in two places:

1. `drawDefinition.entries`
2. `drawDefinition.structures[#].positionAssignments`

## Participant "agnostic"

The **_drawEngine_** is "participant agnostic", and doesn't know or care whether the participants moving through the `structures` of a draw are `participantType` INDIVIDUAL, PAIR or TEAM.

The logic governing participant movements between `matchUps` within `structures` requires only `drawPositions`; `positionAssignments` are used when requesting `matchUps` with "context" to add `sides` which include `participants`.

## Changing matchUpStatus

Changing the `matchUpStatus` of a `matchUp` may affect other `matchUps` across the structures that make up a draw.

Any attempt to change from a **_directing_** to a **_non-directing_** `matchUpStatus`, or vice-versa, causes the **_drawEngine_** to check the validity of the change and, if valid, to modify all affected `matchUps`.

## matchUpStatus effects

| `matchUpStatus` | Completed | Directing | Active | Upcoming |
| --------------- | :-------: | :-------: | :----: | :------: |
| BYE             |     x     |     x     |        |          |
| RETIRED         |     x     |     x     |        |          |
| DEFAULTED       |     x     |     x     |        |          |
| COMPLETED       |     x     |     x     |        |          |
| WALKOVER        |     x     |     x     |        |          |
| DOUBLE_DEFAULT  |     x     |     -     |        |          |
| DOUBLE_WALKOVER |     x     |     -     |        |          |
| INCOMPLETE      |           |           |   x    |          |
| IN_PROGRESS     |           |           |   x    |          |
| SUSPENDED       |           |           |   x    |          |
| TO_BE_PLAYED    |           |           |        |    x     |
| NOT_PLAYED      |           |           |        |    x     |
| CANCELLED       |           |           |        |          |
| ABANDONED       |           |           |        |          |
| DEAD_RUBBER     |           |           |        |          |

## Single structure effects

If the effects of a change to a `matchUpStatus` are limited to a single structure, the only changes necessary are that `drawPositions` of relevant `matchUps` be modified to reflect participant movements across rounds.

## Multi-structure effects

When there are multiple structures in a draw, such as COMPASS or DOUBLE ELIMINATION draws, then losers (and sometimes winners) can move across structures. For instance a first round loser in an East structure will move into the first round of the West structure. When this happens the `positionAssignments` for the target structure must be updated to map the `participantId` to the `drawPosition` where they have been assigned.

Multi-structure draws can be generated as pre-defined draw types (e.g., `COMPASS`, `CURTIS`) or built as custom topologies using `withPlayoffs` on `generateDrawDefinition`. The `withPlayoffs.roundPlayoffs` field supports recursive nesting, enabling arbitrary COMPASS-like trees where PLAY_OFF structures themselves feed losers into sub-PLAY_OFF structures. See [Custom Playoff Topologies](/docs/concepts/draw-links#custom-playoff-topologies) and the [withPlayoffs API reference](/docs/governors/generation-governor#withplayoffs).
