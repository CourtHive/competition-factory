import { nextPlayable } from '@Tests/testHarness/exitPropagation/driver';
import { clearOutcome } from '@Tests/testHarness/exitPropagation/transitions';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * AN ORIGIN MAY ONLY NAME A MATCHUP THAT ACTUALLY FEEDS THE MATCHUP HOLDING IT.
 *
 * "Paired previous" was `roundPosition ± 1` — the ELIMINATION bracket rule, rp1 with rp2, rp3 with
 * rp4 — written out twice, in `getPairedPreviousMatchup` and in
 * `getPairedPreviousMatchUpIsDoubleExit`. It holds only where both previous-round matchUps advance
 * into the SAME target. On a FED round they do not: each advances into its own target and the other
 * side arrives over a link from another structure.
 *
 * So scoring `Consolation|1|2` named `Consolation|1|1` as its pair and stamped that origin onto
 * `Consolation|2|2` side 1 — a side fed from the Main draw, which `Consolation|1|1` never reaches.
 * Because the unwind withdraws by IDENTITY, a false entry then survived every clear: it was the
 * residue behind four `DO_UNDO_IDENTITY` cells, and no amount of work on the unwind could have
 * removed it, because the defect was in the WRITE.
 *
 * The second test is the general form, and it is the one worth keeping: it sweeps the whole draw
 * rather than naming coordinates, so it catches the next false pairing wherever it appears.
 */
const setUp = (drawId: string) => {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawId, drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8, participantsCount: 8, idPrefix: 'pp' },
    ],
    nonRandom: 61,
    setState: true,
  });
  for (let taken = 0; taken < 5; taken++) {
    const target = nextPlayable(drawId);
    expect(target, `warm-up step ${taken + 1}`).toBeTruthy();
    tournamentEngine.setMatchUpStatus({
      outcome: taken % 3 === 2 ? { matchUpStatus: DOUBLE_WALKOVER } : { winningSide: 1 },
      matchUpId: target.matchUpId,
      propagateExitStatus: true,
      drawId,
    });
  }
  return (): any[] => tournamentEngine.allDrawMatchUps({ inContext: true, drawId }).matchUps ?? [];
};

const at = (matchUps: any[], stage: string, roundNumber: number, roundPosition: number): any =>
  matchUps.find((m: any) => m.stage === stage && m.roundNumber === roundNumber && m.roundPosition === roundPosition);

test('a fed round gains no origin from the matchUp beside its feeder', () => {
  const drawId = 'paired-feeds';
  const matchUps = setUp(drawId);

  // CONTROL: the two consolation first-round matchUps must advance into DIFFERENT targets, or the
  // bracket arithmetic and the structural answer agree and this proves nothing.
  const firstRoundOne = at(matchUps(), 'CONSOLATION', 1, 1);
  const firstRoundTwo = at(matchUps(), 'CONSOLATION', 1, 2);
  expect(firstRoundOne.winnerMatchUpId).not.toEqual(firstRoundTwo.winnerMatchUpId);
  expect(firstRoundOne.winnerMatchUpId).toEqual(at(matchUps(), 'CONSOLATION', 2, 1).matchUpId);

  const applied: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: firstRoundTwo.matchUpId,
    propagateExitStatus: true,
    drawId,
  });
  expect(applied.error).toBeUndefined();

  // `CONSOLATION|1|1` does not feed `CONSOLATION|2|2`, so it may not appear as its origin
  const fedTarget = at(matchUps(), 'CONSOLATION', 2, 2);
  expect(fedTarget.sideExitProvenance?.[1]?.sourceMatchUpId).not.toEqual(firstRoundOne.matchUpId);

  // and the round trip is clean, which is what the false entry prevented
  const cleared: any = tournamentEngine.setMatchUpStatus({
    outcome: clearOutcome,
    matchUpId: firstRoundTwo.matchUpId,
    propagateExitStatus: true,
    drawId,
  });
  expect(cleared.error).toBeUndefined();
  expect(at(matchUps(), 'CONSOLATION', 2, 2).sideExitProvenance).toBeUndefined();
});

/**
 * REACHABILITY, NOT ADJACENCY, and the difference is deliberate.
 *
 * An exit carried through a BYE keeps its ORIGIN rather than taking the name of the matchUp it
 * passed through — `carryExitOnward` follows `progressExitStatus` RULE 1 in this, so
 * `CONSOLATION|3|1` legitimately names `CONSOLATION|1|1` two hops upstream. What must never happen
 * is an origin that cannot reach the matchUp at all, which is what the bracket arithmetic produced.
 */
test('every recorded origin names a matchUp that can reach the matchUp holding it', () => {
  const drawId = 'paired-sweep';
  const matchUps = setUp(drawId);
  const target = nextPlayable(drawId);
  tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: target.matchUpId,
    propagateExitStatus: true,
    drawId,
  });

  const all = matchUps();
  const byId = new Map(all.map((m: any) => [m.matchUpId, m]));

  // every matchUp downstream of `from`, following winner and loser links
  const reaches = (from: any, toMatchUpId: string): boolean => {
    const seen = new Set<string>();
    const queue = [from?.winnerMatchUpId, from?.loserMatchUpId].filter(Boolean);
    while (queue.length) {
      const next = queue.shift() as string;
      if (next === toMatchUpId) return true;
      if (seen.has(next)) continue;
      seen.add(next);
      const matchUp: any = byId.get(next);
      if (matchUp?.winnerMatchUpId) queue.push(matchUp.winnerMatchUpId);
      if (matchUp?.loserMatchUpId) queue.push(matchUp.loserMatchUpId);
    }
    return false;
  };

  const offenders: string[] = [];
  let entriesChecked = 0;
  for (const matchUp of all) {
    for (const sideNumber of [1, 2]) {
      const sourceMatchUpId = matchUp.sideExitProvenance?.[sideNumber]?.sourceMatchUpId;
      if (!sourceMatchUpId) continue;
      entriesChecked += 1;
      const source: any = byId.get(sourceMatchUpId);
      if (!reaches(source, matchUp.matchUpId)) {
        offenders.push(
          `${matchUp.stage}|${matchUp.roundNumber}|${matchUp.roundPosition} side ${sideNumber} <- ` +
            `${source?.stage}|${source?.roundNumber}|${source?.roundPosition}`,
        );
      }
    }
  }

  // CONTROL: a sweep that inspected nothing is indistinguishable from a clean one
  expect(entriesChecked).toBeGreaterThan(0);
  expect(offenders).toEqual([]);
});
