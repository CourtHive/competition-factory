import { getTargetMatchUp } from '@Query/matchUps/getTargetMatchUp';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants
import { DOUBLE_ELIMINATION, FEED_IN_CHAMPIONSHIP_TO_SF, COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * `getTargetMatchUp` must ask the RESERVED-SLOT question, not the side-ordering one.
 *
 * The branch that names a cross-structure target slot was gated on `feedRound`:
 *
 * ```ts
 * if (matchUp?.feedRound) {
 *   matchUpDrawPositionIndex = 0;
 *   targetDrawPosition = Math.min(...(matchUp.drawPositions ?? []).filter(Boolean));
 * }
 * ```
 *
 * `feedRound` means *a position arriving here takes side 1*. It does not mean *a drawPosition is
 * reserved here*. The two differ on exactly one shape — `DOUBLE_ELIMINATION`'s Main final, which
 * reserves no drawPosition at all (`draw-positions.md` §4a) — and that shape is reached by the
 * Backdraw's WINNER link.
 *
 * On a freshly generated double elimination the Main final holds NO drawPositions, so
 * `Math.min(...[])` is **`Infinity`**, and `Infinity` was handed back as the name of a slot to place
 * into. Measured 2026-09-18 on DE 8 and DE 16.
 *
 * `hasFedDrawPosition` is the reserved-slot fact (`getRoundMatchUps`, landed in #4928). Reading it
 * here makes `Math.min` sound rather than merely usually-right: the one case where the minimum did
 * not name a reserved slot is the one case where no reserved slot exists.
 *
 * Tracked as **P25** on the CourtHive design-flaws punch list.
 */

type Probe = { label: string; targetDrawPosition: any; targetKey?: string };

function probeEveryLink(drawType: string, drawSize: number): Probe[] {
  const drawId = `fts-${drawType}-${drawSize}`;
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize, drawType, drawId }],
    nonRandom: 500023,
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const inContextDrawMatchUps: any[] = tournamentEngine.allDrawMatchUps({ inContext: true, drawId }).matchUps ?? [];

  const probes: Probe[] = [];
  for (const link of drawDefinition.links ?? []) {
    const sourceRoundMatchUps = inContextDrawMatchUps.filter(
      (matchUp: any) =>
        matchUp.structureId === link.source.structureId && matchUp.roundNumber === link.source.roundNumber,
    );
    for (const source of sourceRoundMatchUps) {
      const result: any = getTargetMatchUp({
        sourceRoundMatchUpCount: sourceRoundMatchUps.length,
        sourceRoundPosition: source.roundPosition,
        inContextDrawMatchUps,
        drawDefinition,
        targetLink: link,
      });
      probes.push({
        label: `${drawType}/${drawSize} ${link.linkType} ${source.structureName}|${source.roundNumber}|${source.roundPosition}`,
        targetDrawPosition: result?.targetDrawPosition,
        targetKey: result?.matchUp
          ? `${result.matchUp.structureName}|${result.matchUp.roundNumber}|${result.matchUp.roundPosition}`
          : undefined,
      });
    }
  }
  return probes;
}

test('the reserved-slot fact reaches getTargetMatchUp, and differs from feedRound', () => {
  const drawId = 'fts-control';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, drawType: DOUBLE_ELIMINATION, drawId }],
    nonRandom: 500023,
    setState: true,
  });
  const matchUps: any[] = tournamentEngine.allDrawMatchUps({ inContext: true, drawId }).matchUps ?? [];

  // CONTROL: if nothing published `hasFedDrawPosition`, the assertion below would pass for a reason
  // unrelated to the branch under test.
  const carrying = matchUps.filter((matchUp: any) => matchUp.hasFedDrawPosition !== undefined);
  expect(carrying.length, 'no matchUp publishes hasFedDrawPosition').toBeGreaterThan(0);

  // KNOWN-POSITIVE: the one shape where the two facts disagree must be present in this fixture,
  // or the test is measuring a population that cannot contain the defect.
  const disagreeing = matchUps
    .filter((matchUp: any) => !!matchUp.feedRound !== !!matchUp.hasFedDrawPosition)
    .map((matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`);
  expect(disagreeing).toEqual(['Main|4|1']);
});

test('no link ever names a target slot of Infinity', () => {
  const probes = [
    ...probeEveryLink(DOUBLE_ELIMINATION, 8),
    ...probeEveryLink(DOUBLE_ELIMINATION, 16),
    ...probeEveryLink(FEED_IN_CHAMPIONSHIP_TO_SF, 8),
    ...probeEveryLink(COMPASS, 16),
  ];

  // CONTROL: a probe that exercised no link would report "clean".
  expect(probes.length, 'no links were probed').toBeGreaterThan(20);

  const infinite = probes
    .filter((probe) => probe.targetDrawPosition === Infinity || probe.targetDrawPosition === -Infinity)
    .map((probe) => `${probe.label} -> ${probe.targetKey}`);
  expect(infinite).toEqual([]);
});
