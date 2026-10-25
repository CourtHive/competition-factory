import { carriedExitStatus, getExitSides, getSideExitProvenance } from './sideExitProvenance';
import { carryExitOnward } from '@Mutate/matchUps/matchUpStatus/settleRederivedDoubleExits';
import { matchUpHoldsBye } from '@Query/drawDefinition/getByeCrossings';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { isAnyExit, isExit } from '@Validators/isExit';
import { settleUnlessIdle } from './indexPrecheck';

// constants and types
import type { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import type { MatchUpsMap, ResultType } from '@Types/factoryTypes';
import { BYE } from '@Constants/matchUpStatusConstants';
import type { HydratedMatchUp } from '@Types/hydrated';

/**
 * AN EXIT CARRIED PAST A LATE BYE IS WRITTEN WHERE THE CARRIER LANDS — CA, 2026-10-02: *"a propagated exit encountering
 * a BYE should be advanced. In both cases the BYE remains a BYE."*
 *
 * When the BYE is in the seat first, a carrier arriving opposite it is carried past by `progressExitStatus` RULE 1 and
 * the exit is written where it lands (RULE 2, 3 or 4). When the carrier is seated first and the BYE arrives LATER, the
 * BYE cascade moved the carrier on and wrote nothing: the matchUp it landed in held it as an ordinary participant, and
 * whoever arrived there was given a match against somebody who had withdrawn. The order two results were entered in
 * decided whether an exit counted (MODIFIED_FEED_IN_CHAMPIONSHIP 8/8, census 20037222's draw).
 *
 * Asked of the draw as it stands once the mutation has settled, not inside the BYE cascade: a BYE placed mid-direction
 * (`propagateUnfillableLoserBye`) can sit in front of an exit the direction's own `progressExitStatus` loop is about to
 * carry, and carrying it there too wrote it twice (census w1 9000373, OLYMPIC 32/29, refused after mutating the draw).
 * Settled, an exit the loop carried has decided the matchUp it reached, and is left alone.
 *
 * A BYE matchUp qualifies when exactly one side records a carried exit, that side holds a participant, and the matchUp
 * the participant now stands in a round on, in the same structure, has no result. The carry is the forward path's own
 * loop (`carryExitOnward` → `progressExitStatus`), replayed from the BYE matchUp, so where the exit lands and what it
 * decides is RULE 1–4's answer, not a second one.
 */
export function reconcileCarriesPastByes({
  tournamentRecord,
  drawDefinition,
  event,
}: {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  event?: Event;
}): ResultType | undefined {
  if (!drawDefinition) return undefined;
  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  // the cheap read first: a BYE matchUp recording a carried exit, before the index is built
  if (!carryCandidates(matchUpsMap, new Set()).length) return undefined;
  // no carry owed on the structural index: the pass's hydration would find the same, and write nothing
  return settleUnlessIdle({
    detect: (inContextDrawMatchUps) => findOwedCarry({ inContextDrawMatchUps, drawDefinition, matchUpsMap }),
    run: () => carryPastByes({ tournamentRecord, drawDefinition, event }),
    site: 'reconcileCarriesPastByes',
    idle: undefined,
    drawDefinition,
  });
}

function carryPastByes({
  tournamentRecord,
  drawDefinition,
  event,
}: {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  event?: Event;
}): ResultType | undefined {
  const carriedOn = new Set<string>();
  // each carry settles one BYE matchUp; bounded as a draw is
  for (let pass = 0; pass < 16; pass += 1) {
    const matchUpsMap = getMatchUpsMap({ drawDefinition });
    // the cheap read first: a BYE matchUp recording a carried exit, before anything is hydrated
    if (!carryCandidates(matchUpsMap, carriedOn).length) return undefined;
    const inContextDrawMatchUps = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap }).matchUps ?? [];
    const carry = findOwedCarry({ inContextDrawMatchUps, drawDefinition, matchUpsMap, carriedOn });
    if (!carry) return undefined;
    carriedOn.add(carry.byeMatchUp.matchUpId);

    const origin = matchUpsMap.drawMatchUps.find((matchUp) => matchUp.matchUpId === carry.sourceMatchUpId);
    const result = carryExitOnward({
      context: {
        // the origin's reason is read from its own `sideStatusCodes` by `progressExitStatus`
        sourceMatchUpStatusCodes: [],
        sourceMatchUpStatus: carry.matchUpStatus,
        sourceWinningSide: origin?.winningSide,
        sourceMatchUpId: carry.sourceMatchUpId,
        loserParticipantId: carry.carrierId,
        loserMatchUp: carry.byeMatchUp,
        matchUpsMap,
      },
      propagateExitStatus: true,
      tournamentRecord,
      drawDefinition,
      event,
    });
    if (result?.error) return result;
  }
  return undefined;
}

function carryCandidates(matchUpsMap: MatchUpsMap, carriedOn: Set<string>): MatchUp[] {
  return matchUpsMap.drawMatchUps.filter(
    (matchUp) => matchUp.matchUpStatus === BYE && !carriedOn.has(matchUp.matchUpId) && carriedSides(matchUp).length,
  );
}

/**
 * THE PASS'S DETECTOR: the first carry past a BYE still owed, read from the draw, its map and its hydration. The pass
 * acts on it; v2's has-work predicate (`outcome/settleWork.ts`) asks it of the working view, so the two cannot drift.
 */
export function findOwedCarry({
  inContextDrawMatchUps,
  carriedOn = new Set(),
  drawDefinition,
  matchUpsMap,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  carriedOn?: Set<string>;
  matchUpsMap: MatchUpsMap;
}) {
  return carryCandidates(matchUpsMap, carriedOn)
    .map((byeMatchUp) => owedCarry({ byeMatchUp, inContextDrawMatchUps, drawDefinition, matchUpsMap }))
    .find(Boolean);
}

function carriedSides(matchUp: MatchUp): number[] {
  const provenance = getSideExitProvenance({ matchUp });
  return [1, 2].filter((sideNumber) => carriedExitStatus(provenance?.[sideNumber]));
}

/** the carry a BYE matchUp still owes: one carrier, standing a round on in a matchUp that has recorded nothing */
function owedCarry({
  inContextDrawMatchUps,
  drawDefinition,
  matchUpsMap,
  byeMatchUp,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
  byeMatchUp: MatchUp;
}) {
  const sides = carriedSides(byeMatchUp);
  if (sides.length !== 1) return undefined;
  const entry = getSideExitProvenance({ matchUp: byeMatchUp })?.[sides[0]];
  const inContextBye = inContextDrawMatchUps.find((matchUp) => matchUp.matchUpId === byeMatchUp.matchUpId);
  const carrierId = inContextBye?.sides?.find((side) => side.sideNumber === sides[0])?.participantId;
  if (!carrierId || !entry?.sourceMatchUpId || !inContextBye) return undefined;
  if (byeLeftByAHolder({ inContextBye, inContextDrawMatchUps, drawDefinition, matchUpsMap })) return undefined;
  // where the carrier now stands: the furthest round on in this structure. A BYE that lands beside them advances them
  // past every BYE waiting further on in the same cascade, so the matchUp a round on can itself be a BYE matchUp they
  // have already passed (census 20178071, FEED_IN_CHAMPIONSHIP 8/7: through `Consolation|1|2` and `2|2` into `3|1`)
  const reached = inContextDrawMatchUps
    .filter(
      (matchUp) =>
        matchUp.structureId === inContextBye.structureId &&
        (matchUp.roundNumber ?? 0) > (inContextBye.roundNumber ?? 0) &&
        matchUp.sides?.some((side) => side?.participantId === carrierId),
    )
    .sort((a, b) => (b.roundNumber ?? 0) - (a.roundNumber ?? 0))[0];
  // a matchUp to be PLAYED: nothing recorded, and no BYE in it — a carrier standing at another BYE is carried past it
  // by the forward rule once it is settled there, and is not this reconciliation's to chase
  if (
    !reached ||
    reached.winningSide ||
    reached.matchUpStatus === BYE ||
    isAnyExit(reached.matchUpStatus) ||
    reached.sides?.some((side) => side?.bye)
  )
    return undefined;
  return { byeMatchUp, carrierId, matchUpStatus: carriedExitStatus(entry), sourceMatchUpId: entry.sourceMatchUpId };
}

/**
 * THE BYE OPPOSITE IS A HOLDER'S, AND ITS EXIT IS STILL TO COME (P54, CA 2026-10-11: "the BYE stays; the exit
 * travels"). A pending exit can advance its empty seat ahead of it as a reservation; when that seat then becomes a BYE
 * nobody can fill, the matchUp a round on holds the holder's BYE beside the carrier. It is not a BYE the carrier passes:
 * the held exit is sent on to that seat when the draw settles (`settleHeldExits`), and the two exits meet there (RULE
 * 4). Carried past it first, the carrier decided the matchUp beyond as well, and the convergence that followed left both
 * (census run 19, FEED_IN_CHAMPIONSHIP 16/14, 20833621: `Consolation|3|2`, and a later result refused after writing).
 */
function byeLeftByAHolder({
  inContextDrawMatchUps,
  drawDefinition,
  matchUpsMap,
  inContextBye,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  inContextBye: HydratedMatchUp;
  matchUpsMap: MatchUpsMap;
}): boolean {
  const byePositions = new Set((inContextBye.sides ?? []).filter((side) => side?.bye).map((side) => side.drawPosition));
  return inContextDrawMatchUps.some((feeder) => {
    if (feeder.winnerMatchUpId !== inContextBye.matchUpId) return false;
    if (!(feeder.drawPositions ?? []).some((drawPosition) => byePositions.has(drawPosition))) return false;
    if (feeder.winningSide || feeder.sides?.some((side) => side?.participantId)) return false;
    if (!matchUpHoldsBye({ drawDefinition, matchUp: feeder })) return false;
    const stored = matchUpsMap.drawMatchUps.find((candidate) => candidate.matchUpId === feeder.matchUpId);
    const [exitSideNumber] = getExitSides({ matchUp: stored });
    return !!exitSideNumber && isExit(getSideExitProvenance({ matchUp: stored })?.[exitSideNumber]?.matchUpStatus);
  });
}
