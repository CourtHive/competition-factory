import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A matchUp's `drawPositions` are stored ASCENDING, and a winner/loser swap must not break that.
 *
 * This is not a cosmetic convention — it is the binding between a side and its position.
 * `getOrderedDrawPositions` states it under a "DO NOT CHANGE" banner: *"when both present,
 * drawPositions are always sorted numerically … { sideNumber: 1 } always goes to the lower
 * drawPosition"*. Readers index on it.
 *
 * `swapWinnerLoser` rewrote `drawPositions` with a positional `map`, replacing the advancing
 * position in place, which cannot preserve order. Measured on census seed 9000012
 * (DOUBLE_ELIMINATION 8/7): flipping `Backdraw|2|2` turned a round-3 matchUp holding [4, 5] into
 * [7, 5]. `getStructureInconsistencies` reported it as `DRAW_POSITIONS_NOT_SORTED` — 25 findings
 * across two 600-seed frozen windows, every one downstream of that single line.
 *
 * Reachable only through `allowChangePropagation`, which `resolveAndApplyOutcome` checks before the
 * `activeDownstream` dispatch — a consumer choice, and one that scoring clients do make.
 */

const coordinates = (item: any) => `${item.structureName}|${item.roundNumber}|${item.roundPosition}`;

/** every matchUp whose stored drawPositions are not ascending, ignoring empty slots */
function unsortedDrawPositions(drawId: string) {
  const offenders: any[] = [];
  const walk = (structure: any) => {
    for (const matchUp of structure.matchUps ?? []) {
      const filled = (matchUp.drawPositions ?? []).filter((position: any) => typeof position === 'number');
      const ascending = [...filled].sort((a: number, b: number) => a - b);
      if (filled.some((position: number, index: number) => position !== ascending[index])) {
        offenders.push({ roundNumber: matchUp.roundNumber, drawPositions: matchUp.drawPositions });
      }
    }
    for (const child of structure.structures ?? []) walk(child);
  };
  for (const structure of tournamentEngine.getEvent({ drawId })?.drawDefinition?.structures ?? []) walk(structure);
  return offenders;
}

it('a winner/loser swap leaves every matchUp with ascending drawPositions', () => {
  const drawId = 'sort-invariant';
  const { drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount: 7, drawSize: 8, drawType: DOUBLE_ELIMINATION, drawId }],
    nonRandom: 9000012,
    setState: true,
  });
  expect(drawIds).toContain(drawId);
  setSubscriptions({});

  // Shrunk by delta debugging from the 30-step schedule of census seed 9000012. Every step runs
  // through `allowChangePropagation`, as the census run that found this did.
  const schedule: any[] = [
    { coordinate: 'Main|1|4', outcome: { winningSide: 1 } },
    {
      coordinate: 'Main|1|3',
      outcome: {
        matchUpStatus: RETIRED,
        winningSide: 1,
        score: { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' },
      },
    },
    { coordinate: 'Backdraw|1|1', outcome: { matchUpStatus: WALKOVER, winningSide: 1 } },
    { coordinate: 'Main|2|2', outcome: { matchUpStatus: WALKOVER, winningSide: 2 } },
    { coordinate: 'Main|1|2', outcome: { winningSide: 2 } },
    { coordinate: 'Main|2|1', outcome: { matchUpStatus: DOUBLE_WALKOVER } },
    { coordinate: 'Backdraw|2|2', outcome: { winningSide: 1 } },
    // the flip: a decided matchUp re-scored the other way, which rewrites downstream drawPositions
    { coordinate: 'Backdraw|2|2', outcome: { winningSide: 2 } },
  ];

  let applied = 0;
  for (const step of schedule) {
    const matchUps = tournamentEngine.allDrawMatchUps({ inContext: true, drawId })?.matchUps ?? [];
    const target = matchUps.find((matchUp: any) => coordinates(matchUp) === step.coordinate);
    if (!target) continue;
    tournamentEngine.setMatchUpStatus({
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      allowChangePropagation: true,
      drawId,
    });
    applied++;
  }

  // the control: a schedule that applied nothing could not break anything
  expect(applied).toEqual(schedule.length);
  expect(unsortedDrawPositions(drawId)).toEqual([]);
});
