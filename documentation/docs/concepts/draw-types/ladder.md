---
title: Ladder
---

## Overview

A **Ladder** is a continuous, challenge-driven competition. Participants occupy an ordered
**standing**, and a participant may **challenge** someone above them; the result rearranges the
standing. There are no rounds, no bracket, no fixed field, and often no end date.

In the factory this draw type is the constant `LADDER`.

A ladder is not a bracket, and almost nothing about it is derived from geometry. It shares the
`AD_HOC` _structure shape_ — matchUps carry neither `roundPosition` nor `drawPosition` — but not its
meaning: an `AD_HOC` draw's `positionAssignments` are a roster, while a ladder's **are the standing**
and `drawPosition` reads as **rank**, where 1 is the top.

Ask `isLadder(drawType)` wherever that difference matters. `isAdHocType(drawType)` is true for a
ladder and answers a different question — whether the structure has bracket geometry.

Every example below is a `tournamentEngine` call taking `drawId`. The engine resolves the
drawDefinition, the ladder's structure, and — where one is named — the matchUp, so a caller never
holds any of them. Passing a `drawDefinition` or `structure` explicitly still works and wins over
resolution.

## What a ladder is made of

| piece        | where it lives                                                 |
| ------------ | -------------------------------------------------------------- |
| the standing | `structure.positionAssignments` — `drawPosition` is rank       |
| matches      | `AD_HOC` matchUps: participants on `sides`, no `drawPositions` |
| a challenge  | a matchUp with `matchUpStatus: CHALLENGED`                     |
| history      | dated `ScaleItem`s, one per rank change                        |
| the rules    | `POLICY_LADDER`                                                |

`drawPositions` are deliberately absent from a ladder matchUp. A participant's position moves
underneath a match that has already been arranged, so recording positions on the matchUp would
freeze a standing that is expected to change.

## The challenge

A challenge is the only fixture in the factory that a **participant** creates. Everything else
arrives from a draw, which is why eligibility is enforced when the challenge is issued rather than
when a draw is generated — nothing upstream decided these two would meet.

```js
const { matchUpId } = tournamentEngine.issueChallenge({
  challengerParticipantId: 'p9',
  defenderParticipantId: 'p7',
  issuedAt: '2026-03-01T10:00:00.000Z',
  drawId,
});
```

`issueChallenge` refuses a downward challenge, a self-challenge, a participant who is not seated on
the ladder, a challenge outside the policy's range (naming the range), and any drawType that is not
`LADDER`.

### `CHALLENGED` is scoped to `LADDER`, and the scope is enforced

`CHALLENGED` is the first `matchUpStatus` whose context is **validated** rather than merely
conventional. Setting it on a matchUp in any other drawType returns `ERR_MATCHUP_STATUS_OUT_OF_SCOPE`.

The mechanism is general — `matchUpStatusScopes` declares where a status may be used, and
`getMatchUpStatusScopeViolation` enforces it. A status absent from that map is unscoped and behaves
exactly as it always has.

### Expiry is derived, never stored

`PENDING` and `EXPIRED` are the **same stored matchUp**. Nothing runs at the moment a challenge
expires to flip a flag, so the state is computed at an instant the caller supplies:

```js
const { state, expiresAt } = getChallengeState({ matchUp, policy, asOf: '2026-03-07T10:00:00.000Z' });
```

`asOf` is required. That keeps the function pure and testable without freezing time, and it means
accepting late is judged against when the response arrived rather than against when a background job
happened to run.

## Reporting a result

On a published ladder, members report their own scores. A reported score and an **agreed** score are
different facts, and conflating them would let one participant reorder the ladder by self-reporting
a win nobody contradicted.

```js
tournamentEngine.submitResult({ participantId: 'p9', outcome: { winningSide: 1 }, submittedAt, matchUpId, drawId });
// score is recorded; matchUpStatus becomes AWAITING_RESULT
tournamentEngine.confirmResult({ participantId: 'p7', confirmedAt, matchUpId, drawId });
// matchUpStatus becomes COMPLETED — and only now can the standing move
```

Peer acceptance and operator validation are the **same transition with a different attestor**;
`resultValidation` in the policy decides which attestors count (`PEER`, `OPERATOR`, `EITHER`).

Two rules hold under every policy:

- a participant can never confirm their own score, or "confirmation" is satisfied by submitting twice
- a standing dispute blocks movement, even after a confirmation — a disputed result is not a result

`disputeResult` returns a `COMPLETED` matchUp to `AWAITING_RESULT`. Nothing resolves the dispute
automatically.

## Movement

`applyLadderMovement` is the **only** place a ladder standing moves — a challenge result, a lapse
consequence and an operator removal all route through it, so the movement rule and the history it
writes cannot diverge between paths.

It takes a **trigger** rather than an outcome, and derives the rest:

```js
tournamentEngine.applyLadderMovement({ trigger: 'RESULT', matchUpId, appliedAt, drawId });
```

| trigger   | requires                                                                                                                                      |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `RESULT`  | a `matchUpId`. Challenger, defender and who prevailed are read off the matchUp, and the attestation gate decides whether it may move anything |
| `FORFEIT` | the two participantIds — a declined challenge has no score to attest                                                                          |

A `RESULT` whose result is not validated returns `ERR_RESULT_NOT_VALIDATED` with the reason.

### `SWAP` and `INSERTION` are different competitions

```text
start                      p1 p2 p3 p4 p5
p4 beats p2, SWAP       →  p1 p4 p3 p2 p5     the two exchange; nobody else moves
p4 beats p2, INSERTION  →  p1 p4 p2 p3 p5     p2 and p3 each shift down one
```

Under `INSERTION` a challenger winning from far below displaces a whole run of players. Both are
common club settings, which is why neither is hardcoded.

## History

Every rank change is mirrored to a dated `ScaleItem` (`scaleType: RANKING`, `scaleName` the ladder's
`drawId`) as a **side effect** of the position mutation — never as a separate call a caller might
skip. "Where was I in March" is then an ordinary scale lookup rather than a second store.

## Ordering: `RANK` or `RATING`

Ordering is a property of the ladder, and it changes what the machinery does:

| `ordering`       | the standing is                                      | movement                                       |
| ---------------- | ---------------------------------------------------- | ---------------------------------------------- |
| `RANK` (default) | `positionAssignments`, mutated by the movement rules | on a resolved challenge                        |
| `RATING`         | derived from each participant's rating               | **none** — the ordering already _is_ the scale |

Under `RATING`, `positionAssignments` becomes a projection rather than the source of truth and
`applyLadderMovement` does nothing, reporting `moved: false`. Always read the ordering through
`getLadderOrdering` rather than the policy field, and read the standing through `getLadderStanding`
rather than assuming `positionAssignments`.

```js
const standing = tournamentEngine.getLadderStanding({ drawId });
// [{ position: 1, participantId: 'p3', ratingValue: 12.5 }, …]
```

**Direction is read, never assumed.** `ratingsParameters[ratingType].ascending` decides which end is
the top: `WTN`, `BWF` and `USAR` are lower-is-better, while `UTR`, `ELO`, `DUPR`, `PSA` and the
squash ratings are higher-is-better. Hardcoding "higher wins" would invert an entire WTN ladder and
raise no error.

With `dynamicRating`, a factory-maintained `<ratingType>.DYNAMIC` value is preferred and the
published rating is the **starting position** — the same pattern DrawMatic uses, so a club can run a
rating-ordered ladder without every member holding a current published rating.

An unrated participant sorts **last**: absent is not "best". An unknown `ratingType` returns the
stored order with no `ratingValue`, rather than presenting a misconfiguration as a working ladder.

## Lapses

Declining a challenge, ignoring one, and accepting then not turning up are **one mechanism**, not
three. From the challenger's side they are the same offence — being unavailable to the people below
you — and clubs already treat them that way.

| lapse      | what happened                                 |
| ---------- | --------------------------------------------- |
| `DECLINE`  | the defender said no                          |
| `EXPIRY`   | the defender never answered                   |
| `UNPLAYED` | accepted, then not played by the play-by date |

All three count by default. **Omitting `EXPIRY` makes the policy avoidable**: a defender simply never
responds and accumulates nothing.

Lapses are counted only from the **defender's** side; issuing challenges is not an offence. They are
evaluated **when a challenge resolves**, never by a background sweep — which has one consequence
worth knowing: _inactivity_ here means unresponsive to challenges, never "has not played". A
participant nobody challenges never lapses.

```js
const { count, exceeded, consequence } = tournamentEngine.getLapses({ participantId, asOf, drawId });
```

Windows: `SEASON` counts everything, `ROLLING` forgets beyond `windowDays`, and `CONSECUTIVE` is
forgiven by turning up — a played match breaks the run.

`declineChallenge` records the decline **and then** evaluates the lapse, so that decline is among
those counted; evaluating first would give every defender one permanent free decline.

Consequences: `FORFEIT_POSITION` hands the position to the challenger of the resolving challenge,
`DROP` moves the participant down (nobody takes their place — everyone passed moves up one), and
`REMOVE` takes them off the ladder.

## Removing someone by hand

Because a participant nobody challenges never lapses, there is no automatic route for the member who
has left the club, is injured for the season, or has died. `removeLadderParticipant` is that route:

```js
tournamentEngine.removeLadderParticipant({ participantId, reason: 'left the club', removedAt, drawId });
```

It closes the ladder up beneath them — a ladder with a hole in it is not a ranking — and records the
reason. A manual override without one is indistinguishable from a mistake.

## Policy

```js
{
  ladder: {
    ordering: 'RANK',              // or RATING
    movement: 'SWAP',              // or INSERTION
    challengeRange: 3,             // positions above; or 'ANY'
    resultValidation: 'EITHER',    // PEER | OPERATOR | EITHER
    acceptanceDays: 5,
    playByDays: 14,
    lapsePolicy: {
      allowance: 0,
      window: 'ROLLING',           // SEASON | ROLLING | CONSECUTIVE
      windowDays: 30,
      countsAsLapse: ['DECLINE', 'EXPIRY', 'UNPLAYED'],
      consequence: 'FORFEIT_POSITION',
    },
  },
}
```

Policies resolve through the ordinary hierarchy, so a club-wide policy is inherited and a draw may
override part of it. **An absent policy is not an error** — a ladder with no policy runs on the
defaults, which is the common case rather than a misconfiguration. `declineForfeitsPosition: true`
remains as sugar for `{ allowance: 0, consequence: 'FORFEIT_POSITION' }`.

## Joining a ladder

`entryPlacement` decides where a newcomer lands.

`BOTTOM` is the default and the conservative choice: joining costs nobody anything, and the newcomer
earns their way up by challenging.

`BY_RATING` seats them where their rating says they belong. Fairer to a strong newcomer, but on a
`RANK` ladder it is a real intervention — every position beneath them shifts down, and those
positions were earned by challenge. An unrated participant under `BY_RATING` goes to the **bottom**,
because absent is not "best". Direction is honoured here as everywhere: on a WTN ladder a lower
number seats higher.

```js
tournamentEngine.addLadderParticipant({ participantId, addedAt, drawId });
```

Under `RATING` ordering placement is moot — the participant is appended and `getLadderStanding`
sorts them correctly on the next read.

## Ratings on a rating-ordered ladder

**The factory does not fetch ratings.** UTR, WTN and DUPR are other people's systems with their own
credentials and terms; retrieving values is an operator's job and belongs in an ingest adapter, not
in a competition engine.

That leaves two modes, and the default is the first:

**Dynamic (the default).** The factory computes the rating from ladder results, seeding from each
participant's published rating as a starting position. A validated result updates the
`<ratingType>.DYNAMIC` scale via the same `generateDynamicRatings` machinery DrawMatic uses, and the
standing re-derives.

**External.** Ratings belong to a provider. An operator refreshes them in bulk:

```js
tournamentEngine.refreshLadderRatings({ ratings: { [participantId]: 12.4 }, refreshedAt, drawId });
```

Between refreshes the standing **holds still**, and that is not a block on play: a participant
awaiting new values may challenge and be challenged exactly as normal — only their _position_ is
unaffected until the refresh lands, at which point the whole standing re-derives at once.

A partial refresh is the normal case, because a provider will not have a value for everyone;
participants absent from the map are left as they were rather than cleared. A rating for someone not
seated on the ladder is reported back in `skipped` rather than written quietly.

## Not yet built

- **Dispute resolution.** A disputed result is blocked from moving the ladder, but nothing resolves
  it.
