---
title: Ladder Governor
---

:::warning Governor API transition at 8.0.0

Some methods on this page are candidates for removal from production engine exports at the 8.0.0 boundary. Their implementation references have moved: [`getLadderMovement`](/docs/implementation/records/getLadderMovement), [`refreshLadderRatings`](/docs/implementation/records/refreshLadderRatings). Existing 7.x routes remain available; final decisions and external-integrator confirmations are tracked in the [transition index](/docs/implementation/engine-api-transition-8).

:::

```js
import { ladderGovernor } from 'tods-competition-factory';
```

The **ladderGovernor** drives a `LADDER` draw: seating participants, the challenge lifecycle, reported results and
their attestation, movement of the standing, lapses and ratings. A ladder is a continuous, challenge-driven competition
whose `positionAssignments` **are the standing**, with `drawPosition` read as rank (1 is the top).

For the model, the policy (`POLICY_LADDER`) and worked examples, see [Ladder](../concepts/draw-types/ladder.md).

Every method resolves the ladder from `drawId` alone, so engine callers pass `drawId` (and `structureId` where a draw
has more than one structure). Called on the governor directly, a method takes the resolved `drawDefinition` and
`tournamentRecord` instead. Times are always **supplied by the caller** as ISO strings (`issuedAt`, `respondedAt`,
`asOf`, ...): no ladder method reads a clock, and expiry is derived from those instants rather than stored.

```js
tournamentEngine.addLadderParticipant({ drawId, participantId, addedAt });
tournamentEngine.issueChallenge({ drawId, challengerParticipantId, defenderParticipantId, issuedAt });
const standing = tournamentEngine.getLadderStanding({ drawId });
```

---

## Mutations

### addLadderParticipant

Seats a participant on a ladder. The policy's placement decides where: `BOTTOM` (the default) or `BY_RATING`. An
unrated participant under `BY_RATING` goes to the bottom. Under `RATING` ordering the participant is appended and the
standing sorts them on the next read.

```ts
{
  drawId: string;
  participantId: string;
  addedAt: string; // the scaleDate of any positions this shifts
  structureId?: string;
}
```

**Returns:** `{ success, drawPosition }`

→ [Joining a ladder](../concepts/draw-types/ladder.md#joining-a-ladder)

---

### removeLadderParticipant

Removes a participant by hand, closing everyone below up one rank: a member who has left, is injured for a season or
has died. The only position change not driven by a challenge, and it never fires on its own.

```ts
{
  drawId: string;
  participantId: string;
  removedAt: string;
  reason?: string; // recorded: an override with no reason is indistinguishable from a mistake
  structureId?: string;
}
```

**Returns:** `{ success, vacatedPosition }`

→ [Removing someone by hand](../concepts/draw-types/ladder.md#removing-someone-by-hand)

---

### issueChallenge

One participant challenges another, creating the `CHALLENGED` matchUp the ladder is played through. Eligibility is
enforced here: a downward challenge, a self-challenge, a participant not on the ladder, a challenge outside the policy's
range, and any drawType other than `LADDER` are refused.

```ts
{
  drawId: string;
  challengerParticipantId: string;
  defenderParticipantId: string;
  issuedAt: string;
  structureId?: string;
}
```

**Returns:** `{ success, matchUpId }`

→ [The challenge](../concepts/draw-types/ladder.md#the-challenge)

---

### acceptChallenge

The defender accepts: the challenge becomes an ordinary fixture to be played. An expired challenge is refused, judged
against `respondedAt`.

```ts
{
  drawId: string;
  matchUpId: string;
  respondedAt: string;
}
```

---

### declineChallenge

The defender declines. The decline is recorded first and the lapse evaluated after, so this decline counts; any
consequence the policy says the defender has earned is applied here.

```ts
{
  drawId: string;
  matchUpId: string;
  respondedAt: string;
}
```

**Returns:** `{ success, applied?, consequence?, lapseCount? }`

→ [Lapses](../concepts/draw-types/ladder.md#lapses)

---

### submitResult

A participant reports the score of a ladder match they played. The score lands on the matchUp, but its status becomes
`AWAITING_RESULT`, not `COMPLETED`: a reported score is not yet an agreed one, and the standing will not move on it.

```ts
{
  drawId: string;
  matchUpId: string;
  participantId: string; // who reports
  submittedAt: string;
  outcome: { winningSide: 1 | 2; score?: any };
}
```

→ [Reporting a result](../concepts/draw-types/ladder.md#reporting-a-result)

---

### confirmResult

The other participant, or an operator, agrees the reported score. Only now does the matchUp become `COMPLETED` and
the standing become movable. The policy's `resultValidation` (`PEER`, `OPERATOR` or `EITHER`) decides whose
confirmation counts.

```ts
{
  drawId: string;
  matchUpId: string;
  confirmedAt: string;
  participantId?: string; // a peer confirming
  operator?: boolean; // an official confirming
}
```

---

### disputeResult

A participant contests the reported score. A completed matchUp goes back to `AWAITING_RESULT`, and a disputed result
cannot move the standing.

```ts
{
  drawId: string;
  matchUpId: string;
  participantId: string;
  disputedAt: string;
  reason?: string;
}
```

---

### applyLadderMovement

Rearranges the standing after a challenge resolves, and records each changed rank as a dated scale item (the ladder's
history). The only place a `RANK` standing moves. Under `RATING` ordering it does nothing and says so, since the
standing is derived from ratings.

```ts
{
  drawId: string;
  appliedAt: string; // the scaleDate of the resulting standing
  trigger: 'RESULT' | 'FORFEIT';
  matchUpId?: string; // required for RESULT: the attested matchUp is the evidence
  challengerParticipantId?: string; // required for FORFEIT
  defenderParticipantId?: string; // required for FORFEIT
  structureId?: string;
}
```

**Returns:** `{ success, moved?, ratingsUpdated? }`

`RESULT` takes no caller opinion about the outcome: challenger, defender and winner come off the matchUp, and an
unattested or disputed result is refused.

→ [Movement](../concepts/draw-types/ladder.md#movement), [History](../concepts/draw-types/ladder.md#history)

---

### refreshLadderRatings

Writes externally sourced ratings for the participants on a ladder. **The factory does not fetch ratings**: the caller
supplies the values. Participants absent from `ratings` are left as they were, since a partial refresh is normal.

```ts
{
  drawId: string;
  ratings: Record<string, number>; // { participantId: ratingValue }
  refreshedAt: string; // becomes the values' scaleDate
}
```

**Returns:** `{ success, updated, skipped }`

→ [Ratings on a rating-ordered ladder](../concepts/draw-types/ladder.md#ratings-on-a-rating-ordered-ladder)

---

## Queries

### getLadderStanding

The standing, ordered by whichever mechanism the policy declares. Under `RANK` it is `positionAssignments` as stored;
under `RATING` it is derived from each participant's rating, in the direction `ratingsParameters[ratingType].ascending`
declares (WTN is lower-is-better, UTR higher-is-better). Nothing is mutated by asking.

```ts
{
  drawId: string;
  structureId?: string;
}
```

**Returns:** `{ position, participantId, ratingValue? }[]`

→ [Ordering: RANK or RATING](../concepts/draw-types/ladder.md#ordering-rank-or-rating)

---

### getChallengeState

What has become of a challenge at an explicit instant: `PENDING`, `EXPIRED`, `ACCEPTED` or `DECLINED`. `asOf` is
required because expiry is derived from `issuedAt` and the policy's `acceptanceDays`, never stored.

```ts
{
  drawId: string;
  matchUpId: string;
  asOf: string;
}
```

**Returns:** `{ state, expiresAt? }`

→ [Expiry is derived, never stored](../concepts/draw-types/ladder.md#expiry-is-derived-never-stored)

---

### getResultAttestation

Whether a submitted score has become a result, and on whose word.

```ts
{
  drawId: string;
  matchUpId: string;
}
```

**Returns:** `{ attested, disputed, submittedBy?, confirmedBy?, reason? }`

---

### getLapses

What a participant has failed to do as a defender (declined, expired or unplayed challenges), counted at an instant.

```ts
{
  drawId: string;
  participantId: string;
  asOf: string;
  structureId?: string;
}
```

**Returns:** `{ lapses, count, allowance, exceeded, consequence?, dropPositions? }`

---

### getLadderPolicy

The ladder policy in force, with defaults filled in. Resolved through the ordinary policy hierarchy (structure, draw,
event, tournament); a ladder with no policy attached runs on the defaults.

```ts
{
  drawId: string;
}
```

**Returns:** the `LadderPolicy`

→ [Policy](../concepts/draw-types/ladder.md#policy)

---

### getLadderOrdering

The ordering in force: `RANK` (the default) or `RATING`. Ask this rather than reading `policy.ordering` or assuming
`positionAssignments` is the source of truth.

```ts
{
  drawId: string;
}
```

---

### getLadderMovement

The movement rule under `RANK` ordering: `SWAP` (the default) or `INSERTION`.

```ts
{
  drawId: string;
}
```

→ [`SWAP` and `INSERTION` are different competitions](../concepts/draw-types/ladder.md#swap-and-insertion-are-different-competitions)

---

### isChallengeInRange

Whether the participant at `challengerPosition` may challenge the one at `defenderPosition`. Upward only, and bounded
by the policy's `challengeRange` (a number of places, or `ANY`).

```ts
{
  drawId: string;
  challengerPosition: number;
  defenderPosition: number;
}
```

**Returns:** `boolean`
