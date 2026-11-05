---
title: Rating Other Sports
---

The [ratings policy](./ratingsPolicy.md) rates any sport the factory scores. Each preset below encodes one sport's published rating method and names it in its `source`. Every example on this page runs as written in the factory's documentation check, so its numbers are the factory's output.

| Sport                             | Preset                              | Scale (`ratingType`) | Published method                                             |
| --------------------------------- | ----------------------------------- | -------------------- | ------------------------------------------------------------ |
| Basketball                        | `POLICY_RATINGS_ELO_538_NBA`        | `ELO`                | FiveThirtyEight, "How We Calculate NBA Elo Ratings", 2015    |
| American football                 | `POLICY_RATINGS_ELO_538_NFL`        | `ELO`                | FiveThirtyEight, "How Our NFL Predictions Work", 2018        |
| Ice hockey                        | `POLICY_RATINGS_ELO_538_NHL`        | `ELO`                | FiveThirtyEight, "How Our NHL Predictions Work", 2021        |
| Football (men's national teams)   | `POLICY_RATINGS_FIFA_SUM`           | `ELO`                | FIFA, "Revision of the FIFA / Coca-Cola World Ranking", 2018 |
| Football (women's national teams) | `POLICY_RATINGS_FIFA_WOMEN`         | `ELO`                | FIFA, "Women's ranking procedures", April 2023               |
| Football (any)                    | `POLICY_RATINGS_ELO_WORLD_FOOTBALL` | `ELO`                | World Football Elo Ratings (eloratings.net)                  |
| Rugby union                       | `POLICY_RATINGS_WORLD_RUGBY`        | `WORLD_RUGBY`        | World Rugby, "Rankings Explanation"                          |
| Volleyball                        | `POLICY_RATINGS_FIVB`               | `FIVB`               | FIVB, "Volleyball World Ranking for Senior National Teams"   |

World Rugby and FIVB rankings are points on their own scales, not Elo ratings: rate them with `ratingType: 'WORLD_RUGBY'` or `ratingType: 'FIVB'`, and the update runs in their own points to two decimals.

**Not encoded in any preset:** home advantage (World Rugby's 3 points, FIFA's 100, FiveThirtyEight's 48 to 100), because a matchUp has no home or away side. Each preset's `source` comment lists what else it leaves out.

## Record a result

The examples share this helper. It records one result in a round robin (where a level result may stand) and, when given, the two sides' starting ratings.

```ts
function recordResult({
  matchUpFormat,
  sets,
  winningSide,
  ratingType = 'ELO',
  ratings,
}: {
  matchUpFormat: string;
  sets: [number, number][];
  winningSide?: number;
  ratingType?: string;
  ratings?: [number, number];
}) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 3, drawType: 'ROUND_ROBIN', matchUpFormat }],
  });
  tournamentEngine.setState(tournamentRecord);
  const matchUp = tournamentEngine.allTournamentMatchUps().matchUps?.[0];
  if (!matchUp) throw new Error('no matchUp generated');
  const { matchUpId, drawId, eventId, sides } = matchUp;
  const participantIds = (sides ?? []).map((side) => side.participantId as string);
  ratings?.forEach((scaleValue, index) =>
    tournamentEngine.setParticipantScaleItem({
      participantId: participantIds[index],
      scaleItem: { scaleType: 'RATING', eventType: 'SINGLES', scaleName: ratingType, scaleValue },
    }),
  );
  const score = {
    sets: sets.map(([side1Score, side2Score], index) => ({
      setNumber: index + 1,
      side1Score,
      side2Score,
      winningSide: side1Score === side2Score ? undefined : side1Score > side2Score ? 1 : 2,
    })),
  };
  tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome: { matchUpStatus: 'COMPLETED', score, winningSide } });
  return { matchUpId, eventId, participantIds };
}
```

## Basketball

FiveThirtyEight's NBA Elo scales K by the points margin and damps it for a favourite. A 155-104 win between two teams at 1500:

```ts
const nba = recordResult({ matchUpFormat: 'SET1A-S:T48P', sets: [[155, 104]], winningSide: 1 });
const nbaResult = scaleEngine.generateDynamicRatings({
  ratingsPolicy: fixtures.policies.POLICY_RATINGS_ELO_538_NBA.ratings,
  matchUpIds: [nba.matchUpId],
});
const nbaRatings: Record<string, any> = nbaResult.modifiedScaleValues ?? {};
const nbaValues = nba.participantIds.map((id) => nbaRatings[id].scaleValue); // [1532, 1468]
```

## American football

FiveThirtyEight's NFL Elo takes the log of the margin; a tie is rated 0.5 each, with K × 1.525:

```ts
const nfl = recordResult({ matchUpFormat: 'SET1A-S:T60P', sets: [[40, 0]], winningSide: 1 });
const nflResult = scaleEngine.generateDynamicRatings({
  ratingsPolicy: fixtures.policies.POLICY_RATINGS_ELO_538_NFL.ratings,
  matchUpIds: [nfl.matchUpId],
});
const nflRatings: Record<string, any> = nflResult.modifiedScaleValues ?? {};
const nflValues = nfl.participantIds.map((id) => nflRatings[id].scaleValue); // [1537, 1463]
```

## Rugby union

World Rugby's own example: Wales (76.92, at home, so 79.92) beat Scotland (76.36), a gap of 3.56. The ratings move 0.64 each way, and would move 1.5 times as much for a win by more than 15 points:

```ts
const rugby = recordResult({
  matchUpFormat: 'SET1A-S:T80P',
  sets: [[23, 10]],
  winningSide: 1,
  ratingType: 'WORLD_RUGBY',
  ratings: [79.92, 76.36],
});
const rugbyResult = scaleEngine.generateDynamicRatings({
  ratingsPolicy: fixtures.policies.POLICY_RATINGS_WORLD_RUGBY.ratings,
  matchUpIds: [rugby.matchUpId],
  ratingType: 'WORLD_RUGBY',
});
const rugbyRatings: Record<string, any> = rugbyResult.modifiedScaleValues ?? {};
const rugbyValues = rugby.participantIds.map((id) => rugbyRatings[id].scaleValue); // [80.56, 75.72]
```

## Volleyball

FIVB's own example: Brazil (415) beat Japan (192) 3-0 at a World Championship. The preset's K is that event's weight (MWF 50 / 8); set the other events' weights in `kByTier`:

```ts
const volleyball = recordResult({
  matchUpFormat: 'SET5-S:TB25-F:TB15',
  sets: [
    [25, 20],
    [25, 21],
    [25, 17],
  ],
  winningSide: 1,
  ratingType: 'FIVB',
  ratings: [415, 192],
});
const volleyballResult = scaleEngine.generateDynamicRatings({
  ratingsPolicy: fixtures.policies.POLICY_RATINGS_FIVB.ratings,
  matchUpIds: [volleyball.matchUpId],
  ratingType: 'FIVB',
});
const volleyballRatings: Record<string, any> = volleyballResult.modifiedScaleValues ?? {};
const volleyballValues = volleyball.participantIds.map((id) => volleyballRatings[id].scaleValue); // [416.51, 190.49]
```

FIVB prints 416.5 and 190.5: it rounds the expected result to 1.76 before multiplying.

## Women's football, with the event's importance

FIFA's women's ranking reads the actual result from a table of goals, and K from the match's importance: a Women's World Cup match is × 4, K 60. Key K by tier, and give the tournament that tier:

```ts
const women = recordResult({ matchUpFormat: 'SET1A-S:T90', sets: [[2, 1]], winningSide: 1 });
tournamentEngine.setTournamentTier({ tournamentTier: { system: 'FIFA', value: 'WOMENS_WORLD_CUP' } });
const womenResult = scaleEngine.generateDynamicRatings({
  ratingsPolicy: {
    ...fixtures.policies.POLICY_RATINGS_FIFA_WOMEN.ratings,
    kByTier: { 'FIFA:WOMENS_WORLD_CUP': 60 },
  },
  matchUpIds: [women.matchUpId],
});
const womenRatings: Record<string, any> = womenResult.modifiedScaleValues ?? {};
const womenValues = women.participantIds.map((id) => womenRatings[id].scaleValue); // [1520, 1480]
```

A 2-1 win scores the winner 0.84 (the loser, with one goal and a difference of one, 0.16): 60 × (0.84 − 0.5) = 20.4.

## Choosing the policy by sport

Instead of passing a policy to each run, attach one to the tournament or event, or name a preset on the event's `competitionFormat`: every matchUp of that event is then rated by it. A policy passed to the run comes first, then one attached to the event or tournament, then the `competitionFormat`'s.

```ts
const hockey = recordResult({ matchUpFormat: 'SET1A-S:T60P', sets: [[4, 1]], winningSide: 1 });
tournamentEngine.modifyEvent({
  eventId: hockey.eventId,
  eventUpdates: { competitionFormat: { ratingsPolicy: 'POLICY_RATINGS_ELO_538_NHL' } },
});
const hockeyResult = scaleEngine.generateDynamicRatings({ matchUpIds: [hockey.matchUpId] });
const hockeyNames = hockeyResult.ratingsPolicyNames; // ['Elo, FiveThirtyEight NHL']
```

## Tested against real seasons

Besides each source's worked examples, the factory replays five anonymised public competition stages through these presets: a rugby championship, an Olympic volleyball pool, two groups of a women's world cup, a week of American football and fifteen games of one basketball team. Its final ratings must equal an independent implementation of each published method.
