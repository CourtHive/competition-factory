# maxParticipants Attribute - Threshold-Based Tiebreaking

The `maxParticipants` attribute in round robin tally directives implements a universal pattern found across sports: **different tie-breaking rules apply based on how many teams are tied**.

---

## Overview

**Purpose:** Apply a tally directive ONLY when the number of tied participants does not exceed a specified threshold.

**Common usage:**

```javascript
{
  attribute: 'matchUpsPct',
  idsFilter: true,
  maxParticipants: 2  // Only apply when exactly 2 teams are tied
}
```

**Behavior:** 

- Rule applies when: `tiedParticipants.length <= maxParticipants`
- Rule is skipped when: `tiedParticipants.length > maxParticipants`

---

## Why This Exists

### Mathematical Reality: Circular Ties

**With 2 teams tied:**

```text
Team A beat Team B
→ Clear winner: Team A places higher
```

**With 3+ teams tied (circular tie possible):**

```text
Team A beat Team B (1-0 head-to-head)
Team B beat Team C (1-0 head-to-head)
Team C beat Team A (1-0 head-to-head)

Head-to-head records among tied teams:
- Team A: 1 win, 1 loss (50%)
- Team B: 1 win, 1 loss (50%)
- Team C: 1 win, 1 loss (50%)

→ Head-to-head CANNOT break the tie!
```

**Solution:** When 3+ teams are tied, skip head-to-head and use the next tiebreaker (games won, sets won, etc.).

---

## Sports Precedents

This pattern appears universally across sports, with explicit threshold-based rules:

### 1. Edmonton U15AA Invitational Hockey Tournament

**Explicitly separate sections:**

**"Two Teams Tied":**

1. Head-to-head result
2. Most wins
3. Goal average (goals for divided by goals against)
4. Fewest penalty minutes
5. Coin toss

**"Three or More Teams Tied":**

1. Performance among tied teams only (wins, goal average)
2. If still tied, performance in all group games
3. Coin toss

**Critical rule:** *"At no time will teams using this formula go back to the two-team tiebreaker."*

**Source:** [printyourbrackets.com](https://www.printyourbrackets.com/tiebreaker-in-round-robin-tournaments.html)

---

### 2. Play K Sports Baseball

**Explicit threshold condition:**

> "Head-to-head (only when two (2) teams are tied, and only when they have played each other). Once three (3) teams are tied in a pool, then we go to the next tie breakers."

**Tiebreaker sequence:**

1. Head-to-head record (**only when 2 teams tied**)
2. Runs allowed
3. Run differential (capped)
4. Coin flip

**Implementation as policy:**

```javascript
{
  tallyDirectives: [
    { attribute: 'matchUpsPct', idsFilter: true, maxParticipants: 2 },
    { attribute: 'pointsLost', idsFilter: false, reversed: true },
    { attribute: 'pointsDifferential', idsFilter: false },
  ]
}
```

**Source:** [tarrant.apaleagues.com](https://tarrant.apaleagues.com/Uploads/tarrant/2025_AlohaChallengeRules_TarrantCounty.pdf)

---

### 3. Ripken Baseball Tournaments

**Separate sections with different procedures:**

**"2 Team Tie Breaker":**

1. Head to head
2. Fewest runs allowed
3. Run differential (capped at 7 per game)
4. Coin flip

**"3 or more Team Tie Breaker":**

1. Head to head among all tied teams
2. Fewest runs allowed among tied teams
3. Run differential among tied teams (capped)
4. If still tied, compare overall stats
5. Coin flip

**Note:** Head-to-head must be evaluated differently when 3+ teams (among tied teams only).

**Source:** [districtsixbridge.org](https://www.districtsixbridge.org/wp-content/uploads/2018/12/Round-Robin-Fact-Sheet-.pdf)

---

### 4. USA Pickleball Tournaments

**Different procedures based on tie size:**

**Two teams tied:**

- Direct head-to-head result determines placement

**Three or more teams tied:**

- Results among tied teams evaluated first
- Then game/point differentials among tied teams
- Then overall group performance

**Source:** [rules.usapickleball.org](https://rules.usapickleball.org/view/rule-changes-view-all/entry/527/)

---

### 5. EMFC 3v3 Soccer Challenge Cup

**Head-to-head conditioned on tie size:**

**Two teams tied:**

1. Head-to-head result
2. Goal differential
3. Goals scored
4. Coin toss

**Three or more teams tied:**

1. Performance among tied teams
2. Goal differential among tied teams
3. Overall group statistics
4. Coin toss

---

### 6. DSBN Volleyball Tournaments

**Explicit participant threshold:**

**Two teams tied:**

- Winner of head-to-head match places higher

**Three or more teams tied:**

- Set ratio among tied teams
- Point ratio among tied teams
- Overall group performance

---

### 7. Major Sports Organizations

**FIFA World Cup:**

- 2 teams: Direct head-to-head
- 3+ teams: Mini-table among tied teams

**UEFA Champions League:**

- 2 teams: Head-to-head points/goal difference
- 3+ teams: Mini-league calculation

**NFL:**

- 2 teams: Head-to-head record
- 3+ teams: "Head-to-head sweep" (only if one team beat ALL others)

**USTA Team Tennis:**

- 2 teams: Head-to-head result
- 3+ teams: Match/set/game percentages among tied teams

**ITF Davis Cup:**

- 2 teams: Direct tie breaker
- 3+ teams: Results within tied subgroup

---

## Implementation in Policies

### Example 1: Tournament of Champions (TOC) Policy

```javascript
export const POLICY_ROUND_ROBIN_TALLY_TOC = {
  [POLICY_TYPE_ROUND_ROBIN_TALLY]: {
    policyName: 'TOC Round Robin Tally',
    groupOrderKey: 'matchUpsPct',
    tallyDirectives: [
      // Head-to-head ONLY if 2 teams tied
      { 
        attribute: 'matchUpsPct', 
        idsFilter: true, 
        maxParticipants: 2 
      },
      // Games percentage (all ties)
      { attribute: 'gamesPct', idsFilter: false },
      // Total games won (all ties)
      { attribute: 'gamesWon', idsFilter: false },
      // Fewest games lost (all ties)
      { attribute: 'gamesLost', idsFilter: false, reversed: true },
    ],
  },
};
```

**Behavior:**

- **2 teams tied:** Uses head-to-head record
- **3+ teams tied:** Skips head-to-head, uses games percentage immediately

---

### Example 2: Custom Hockey Tournament Policy

```javascript
const hockeyTournamentPolicy = {
  [POLICY_TYPE_ROUND_ROBIN_TALLY]: {
    policyName: 'Hockey Tournament',
    groupOrderKey: 'matchUpsWon',
    tallyDirectives: [
      // Two teams tied: head-to-head
      { 
        attribute: 'matchUpsPct', 
        idsFilter: true, 
        maxParticipants: 2 
      },
      // Three+ teams tied: goal average among tied teams
      { 
        attribute: 'goalAverage', // Custom attribute
        idsFilter: true  // Among tied teams only
      },
      // Still tied: overall goal average
      { 
        attribute: 'goalAverage', 
        idsFilter: false 
      },
      // Still tied: fewest penalty minutes
      { 
        attribute: 'penaltyMinutes', 
        idsFilter: false, 
        reversed: true 
      },
    ],
  },
};
```

---

### Example 3: Baseball Tournament Policy

```javascript
const baseballTournamentPolicy = {
  [POLICY_TYPE_ROUND_ROBIN_TALLY]: {
    policyName: 'Baseball Tournament',
    groupOrderKey: 'matchUpsWon',
    tallyDirectives: [
      // Two teams: direct head-to-head
      { 
        attribute: 'matchUpsPct', 
        idsFilter: true, 
        maxParticipants: 2 
      },
      // Three+: fewest runs allowed among tied teams
      { 
        attribute: 'pointsLost', 
        idsFilter: true, 
        reversed: true 
      },
      // Run differential (capped) among tied teams
      { 
        attribute: 'pointsDifferential', 
        idsFilter: true 
      },
      // Overall runs allowed
      { 
        attribute: 'pointsLost', 
        idsFilter: false, 
        reversed: true 
      },
    ],
  },
};
```

---

## When to Use maxParticipants

### ✅ **Use maxParticipants for:**

**1. Head-to-head rules (idsFilter: true)**

```javascript
{ 
  attribute: 'matchUpsPct', 
  idsFilter: true,     // Compare only tied teams
  maxParticipants: 2   // Only when exactly 2 tied
}
```

**Why:** Head-to-head comparison is only meaningful when one team clearly beat the other. With 3+, circular ties are possible.

**2. Direct comparison attributes**

```javascript
{ 
  attribute: 'matchUpsWon', 
  idsFilter: true, 
  maxParticipants: 2 
}
```

**Why:** Similar to head-to-head - direct comparison works best with 2 teams.

---

### ❌ **Don't use maxParticipants for:**

**1. Percentage-based rules**

```javascript
{ 
  attribute: 'gamesPct', 
  idsFilter: false 
  // No maxParticipants needed
}
```

**Why:** Percentages work equally well with 2 or 200 teams.

**2. Absolute count rules**

```javascript
{ 
  attribute: 'gamesWon', 
  idsFilter: false 
  // No maxParticipants needed
}
```

**Why:** Total games won is comparable regardless of number of tied teams.

**3. Reversed (fewest) rules**

```javascript
{ 
  attribute: 'gamesLost', 
  idsFilter: false, 
  reversed: true 
  // No maxParticipants needed
}
```

**Why:** Fewest games lost works with any number of teams.

---

## Circular Tie Scenarios

### Example 1: 3-Team Circular Tie

**Round robin results:**

```text
Match 1: Team A 6-2 Team B  (A wins)
Match 2: Team B 6-3 Team C  (B wins)
Match 3: Team C 6-4 Team A  (C wins)

Standings:
- Team A: 1-1 (won vs B, lost vs C)
- Team B: 1-1 (won vs C, lost vs A)
- Team C: 1-1 (won vs A, lost vs B)
```

**Without maxParticipants:**

```javascript
tallyDirectives: [
  { attribute: 'matchUpsPct', idsFilter: true }
]

// All teams: 50% head-to-head (1-1)
// Cannot break tie → stuck or requires additional logic
```

**With maxParticipants:**

```javascript
tallyDirectives: [
  { attribute: 'matchUpsPct', idsFilter: true, maxParticipants: 2 },
  { attribute: 'gamesPct', idsFilter: false }
]

// 3 teams tied → skip head-to-head
// Use games percentage:
// - Team A: 6-2 + 4-6 = 10-8 (55.6%)
// - Team B: 2-6 + 6-3 = 8-9 (47.1%)
// - Team C: 3-6 + 6-4 = 9-10 (47.4%)
// 
// Result: A (1st), C (2nd), B (3rd) ✓
```

---

### Example 2: 4-Team Partial Circular Tie

**Round robin results (6 total matches):**

```text
Team A: 3-0 (beat B, C, D)
Team B: 1-2 (beat C, lost to A and D)
Team C: 1-2 (beat D, lost to A and B)
Team D: 1-2 (beat B, lost to A and C)

Standings: B, C, D all 1-2 (tied for 2nd)

Head-to-head among tied teams:
- B beat C (but lost to D)
- C beat D (but lost to B)
- D beat B (but lost to C)
```

**With maxParticipants: 2**

```javascript
// 3 teams tied → skip head-to-head
// Proceed to games percentage among B, C, D
```

**Without maxParticipants:**

```javascript
// Would try head-to-head: B, C, D all 1-1
// Stuck in circular tie
```

---

## Testing maxParticipants

### Test 1: Verify 2-team behavior

```javascript
it('maxParticipants: 2 applies head-to-head when exactly 2 teams tied', () => {
  // Create scenario where exactly 2 teams are tied
  // Verify head-to-head determines order
});
```

### Test 2: Verify 3+-team skipping

```javascript
it('maxParticipants: 2 skips head-to-head when 3+ teams tied', () => {
  // Create circular tie scenario (A>B>C>A)
  // Verify head-to-head is skipped
  // Verify next directive is used
});
```

### Test 3: Compare outcomes

```javascript
it('maxParticipants changes outcomes in circular ties', () => {
  // With maxParticipants: should break tie using games
  // Without maxParticipants: should be stuck at head-to-head
});
```

---

## Implementation Details

### Source Code

**From `getGroupOrder.ts`:**

```javascript
// Line 286-287
const keepDirective = !(
  isNumeric(directive.maxParticipants) && 
  participantIds?.length > directive.maxParticipants
);
```

**Behavior:**

- `keepDirective = true`: Apply this directive
- `keepDirective = false`: Skip this directive, try next one

**When does it skip?**

- When `maxParticipants` is defined (numeric)
- AND number of tied participants exceeds `maxParticipants`

---

## Common Patterns

### Pattern 1: Two-Stage Head-to-Head

```javascript
{
  tallyDirectives: [
    // Stage 1: Direct head-to-head (2 teams only)
    { 
      attribute: 'matchUpsPct', 
      idsFilter: true, 
      maxParticipants: 2 
    },
    
    // Stage 2: Head-to-head among all tied (3+ teams)
    { 
      attribute: 'matchUpsPct', 
      idsFilter: true 
    },
    
    // Stage 3: Overall group performance
    { 
      attribute: 'matchUpsPct', 
      idsFilter: false 
    },
  ]
}
```

**Used by:** FIFA, UEFA, many tournament formats

---

### Pattern 2: Skip Head-to-Head for Large Ties

```javascript
{
  tallyDirectives: [
    // Only use head-to-head if 2-3 teams
    { 
      attribute: 'matchUpsPct', 
      idsFilter: true, 
      maxParticipants: 3 
    },
    
    // 4+ teams: use games percentage
    { 
      attribute: 'gamesPct', 
      idsFilter: false 
    },
  ]
}
```

**Rationale:** With 4+ teams, likelihood of circular ties increases significantly.

---

### Pattern 3: Threshold-Based Escalation

```javascript
{
  tallyDirectives: [
    // 2 teams: simple head-to-head
    { 
      attribute: 'matchUpsPct', 
      idsFilter: true, 
      maxParticipants: 2 
    },
    
    // 3-4 teams: games among tied teams
    { 
      attribute: 'gamesPct', 
      idsFilter: true, 
      maxParticipants: 4 
    },
    
    // 5+ teams: overall games
    { 
      attribute: 'gamesPct', 
      idsFilter: false 
    },
  ]
}
```

**Used by:** Large tournaments with multiple groups

---

## Best Practices

### 1. Always Provide Fallback

```javascript
// ✓ GOOD: Has fallback when maxParticipants filters out rule
{
  tallyDirectives: [
    { attribute: 'matchUpsPct', idsFilter: true, maxParticipants: 2 },
    { attribute: 'gamesPct', idsFilter: false }, // Fallback
  ]
}

// ✗ BAD: No fallback if 3+ teams tied
{
  tallyDirectives: [
    { attribute: 'matchUpsPct', idsFilter: true, maxParticipants: 2 },
    // No other rules! What happens with 3+ teams?
  ]
}
```

---

### 2. Document Tournament-Specific Rules

```javascript
const myTournamentPolicy = {
  [POLICY_TYPE_ROUND_ROBIN_TALLY]: {
    policyName: 'Spring Championship 2024',
    // Document why maxParticipants is used
    // "Per tournament rules section 5.2: Head-to-head only applies 
    //  when exactly two teams are tied"
    tallyDirectives: [
      { attribute: 'matchUpsPct', idsFilter: true, maxParticipants: 2 },
      { attribute: 'gamesPct', idsFilter: false },
    ],
  },
};
```

---

### 3. Consider Circular Tie Probability

**Small groups (4 teams):**

- Circular ties less common
- `maxParticipants: 2` usually sufficient

**Large groups (8+ teams):**

- Circular ties more likely
- Consider `maxParticipants: 3` or removing head-to-head entirely

---

## Conclusion

The `maxParticipants` attribute implements a **universal sports rule pattern**: different tie-breaking procedures apply based on how many teams are tied. This is not arbitrary - it reflects the mathematical reality that head-to-head comparisons work for 2 teams but can produce circular ties with 3+ teams.

**Key takeaways:**

1. ✅ Use `maxParticipants: 2` for head-to-head rules
2. ✅ Always provide fallback directives
3. ✅ Matches real-world sports tournament rules
4. ✅ Prevents futile calculations on circular ties
5. ✅ Well-precedented across hockey, baseball, soccer, volleyball, pickleball, tennis, and football

**Sports precedents:** Edmonton Hockey, Play K Baseball, Ripken Baseball, USA Pickleball, FIFA, UEFA, NFL, USTA, ITF, Olympics, and many more.
