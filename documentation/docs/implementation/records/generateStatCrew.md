---
title: generateStatCrew
---

# generateStatCrew

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
export function generateStatCrew(params: GenerateStatCrewArgs);
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `generationGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/assemblies/generators/tournamentRecords/generateStatCrew.ts` — `generateStatCrew`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/assemblies/generators/tournamentRecords/generateStatCrew.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Preserved 7.x reference

The passages below preserve the existing governor documentation. **Engine examples describe 7.x availability, not an 8.x replacement.** Source contracts take precedence where an explicitly noted correction applies.

### From governors/generation-governor.md

Generates XML output in StatCrew format for college tennis scoring systems.

```js
const { xml, json, games } = engine.generateStatCrew({
  tournamentRecord, // required - tournament to export
  matchUpId, // optional - export only this TEAM matchUp (dual)
  drawId, // optional - export only the TEAM matchUps of this draw
});

// one <tngame> per team matchUp: save each for StatCrew import, named by the dual it reports
games.forEach(({ matchUpId, xml }) => fs.writeFileSync(`statcrew-${matchUpId}.xml`, xml));
```

**Returns:**

```ts
{
  xml: string[]; // one StatCrew <tngame> document per team matchUp
  json: object[]; // the same games before XML conversion
  games: {
    matchUpId: string; // the TEAM matchUp this game reports
    eventId?: string;
    drawId?: string;
    xml: string;
    json: object;
  }[]; // index-aligned with xml and json
  success: boolean;
}
```

**Errors:** `MATCHUP_NOT_FOUND` when `matchUpId` is not in the tournament (or not in `drawId` when both are given);
`INVALID_MATCHUP` when `matchUpId` names a SINGLES or DOUBLES matchUp rather than a TEAM matchUp.

**Purpose:** Export tournament data in StatCrew XML format, which is used by college tennis programs in the United States for official scoring and statistics.

**Features:**

- Exports tournament metadata (name, date, ID)
- Includes all team participants
- Exports singles and doubles matchUps
- Handles TEAM/dual match format
- Distinguishes between tournament and dual match formats
- Maps participant IDs to teams and individuals

**When to Use:**

- College tennis tournaments requiring StatCrew integration
- Exporting data to NCAA systems
- Providing official match results in standardized format

**Notes:**

- Specifically designed for college tennis workflows
- Handles both tournament and dual match formats
- Each game reports ONE team matchUp: a team's `score`, its singles/doubles totals and its players' won/lost
  records count only that matchUp's tieMatchUps, so a team that won none scores 0
- Includes participant and matchUp mappings
- The `<tngame>` has no slot for a matchUpId (`gameid` carries the `tournamentId`), so the matchUp each game
  reports is returned beside it in `games`, never written into the XML
- `tournament="Y"` marks a game played in a multi-team event: the record holds more than one TEAM matchUp or more
  than two TEAM participants, or holds SINGLES/DOUBLES matchUps outside any dual. A stand-alone dual is
  `tournament="N"`. The flag describes the record, so a game selected by `matchUpId` keeps it. `tournamentname` is
  written only when `tournament="Y"`
- Home and visitor come from `resolveHomeParticipantId` for each team matchUp, with one extra rung for existing
  exports: a TEAM with `participantRoleResponsibilities: ['Home']`. Order: the explicit `homeParticipantId`, then
  the `'Home'` responsibility (a stated home ranks above an inferred one, but it belongs to the team, not the
  matchUp, so a per-matchUp explicit home overrides it), then the home venue, then the host organisation. Each
  rung counts only when exactly one team matches
- With no home team the game is neutral: `neutralgame="Y"`. StatCrew still fills both the home and visitor slots;
  at a neutral site they are positional (the second team takes the home slot) and do not claim either team is home.
  With a home team, `neutralgame="N"` and the team and score rows carry `vh` `H`/`V`
- XML format matches StatCrew import specifications

---

## Related documentation

- [governors/generation-governor.md](/docs/governors/generation-governor)
