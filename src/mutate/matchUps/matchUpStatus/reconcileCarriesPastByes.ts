import { carryExitOnward } from '@Mutate/matchUps/matchUpStatus/settleRederivedDoubleExits';
import { carriedExitStatus, getSideExitProvenance } from './sideExitProvenance';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { isAnyExit } from '@Validators/isExit';

// constants and types
import type { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import { BYE } from '@Constants/matchUpStatusConstants';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { ResultType } from '@Types/factoryTypes';

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
  const carriedOn = new Set<string>();
  // each carry settles one BYE matchUp; bounded as a draw is
  for (let pass = 0; pass < 16; pass += 1) {
    const matchUpsMap = getMatchUpsMap({ drawDefinition });
    // the cheap read first: a BYE matchUp recording a carried exit, before anything is hydrated
    const candidates = matchUpsMap.drawMatchUps.filter(
      (matchUp) => matchUp.matchUpStatus === BYE && !carriedOn.has(matchUp.matchUpId) && carriedSides(matchUp).length,
    );
    if (!candidates.length) return undefined;

    const inContextDrawMatchUps = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap }).matchUps ?? [];
    const carry = candidates.map((byeMatchUp) => owedCarry({ byeMatchUp, inContextDrawMatchUps })).find(Boolean);
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

function carriedSides(matchUp: MatchUp): number[] {
  const provenance = getSideExitProvenance({ matchUp });
  return [1, 2].filter((sideNumber) => carriedExitStatus(provenance?.[sideNumber]));
}

/** the carry a BYE matchUp still owes: one carrier, standing a round on in a matchUp that has recorded nothing */
function owedCarry({
  inContextDrawMatchUps,
  byeMatchUp,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  byeMatchUp: MatchUp;
}) {
  const sides = carriedSides(byeMatchUp);
  if (sides.length !== 1) return undefined;
  const entry = getSideExitProvenance({ matchUp: byeMatchUp })?.[sides[0]];
  const inContextBye = inContextDrawMatchUps.find((matchUp) => matchUp.matchUpId === byeMatchUp.matchUpId);
  const carrierId = inContextBye?.sides?.find((side) => side.sideNumber === sides[0])?.participantId;
  if (!carrierId || !entry?.sourceMatchUpId) return undefined;
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
