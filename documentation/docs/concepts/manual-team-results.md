---
title: Manual TEAM results
---

A TEAM matchUp can have a manually chosen score and winner while its individual `tieMatchUps` continue
to be scored. Use `disableAutoCalc: true` on the parent TEAM mutation to preserve that result through
subsequent line scoring, score corrections and clearing a line result.

```js
engine.setMatchUpStatus({
  drawId,
  matchUpId, // parent TEAM matchUp
  disableAutoCalc: true, // beside outcome
  outcome: {
    winningSide: 2,
    score: {
      sets: [{ setNumber: 1, side1Score: 2, side2Score: 2, winningSide: 2 }],
      scoreStringSide1: '2-2',
      scoreStringSide2: '2-2',
    },
  },
});
```

This can represent a competition awarding a level meeting to a team under its own rules. The caller
chooses `winningSide`; the engine does not invent the competition's tie-breaking decision. A winner-only
override is also supported by omitting `score`. A completed drawn result without a winner is a separate
case; it is not established by this example.

Apply later line results through their ordinary mutations. Do not reassert the parent winner after
each line edit: manual mode already protects it. The public `setMatchUpStatus` path preserves the
override when clearing a child result with `TO_BE_PLAYED` and an empty score. This describes clearing a
line's match result, rather than every point-history undo operation or bulk reset API.

## Returning to automatic scoring

```js
engine.enableTieAutoCalc({ drawId, matchUpId });
```

This explicitly resumes calculation from the current lines. It may change or remove the parent winner;
normal progression checks still apply, including restrictions when dependent matchUps are active.
`setMatchUpStatus({ drawId, matchUpId, enableAutoCalc: true })` is also an explicit resume request.
Passing `disableAutoCalc: false` does not replace these operations.

Clearing a score and resuming automatic calculation are distinct actions. In particular, do not rely
on clearing the parent score through `setMatchUpStatus` to remove manual mode. Read back the result
and handle errors before updating the UI.

## Diagnostics and consumers

`getDualIssues` returns `MANUAL_SCORE` while automatic scoring is disabled. It can also return
`MANUAL_SCORE_DIVERGES` when the entered team score differs from the lines' computed score. These
explain the override; divergence does not require rewriting the manual winner after a line mutation.

TMX's scorecard **Override** sends the parent mutation above, and **Restore** sends `enableTieAutoCalc`.
The courthive-components header editor provides callbacks for this flow. A consuming application must
persist those callbacks through its mutation queue and refresh from factory state.

For a whole competition that publishes team results without line detail, use
[`scoreSource: REPORTED`](./tieFormat.mdx#score-source--derived-vs-reported) on the tieFormat instead.

Related: [matchUp governor](../governors/matchup-governor.md), [tieMatchUps](./tieMatchUp.mdx),
[tieFormat](./tieFormat.mdx).
