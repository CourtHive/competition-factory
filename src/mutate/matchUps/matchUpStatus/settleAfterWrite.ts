import { oweDissolvedConvergencesTheirByes } from '@Mutate/matchUps/matchUpStatus/oweDissolvedConvergencesTheirByes';
import { reconcileConsolationReservations } from '@Mutate/matchUps/matchUpStatus/reconcileConsolationReservations';
import { reconcileMissedLinkAdvancements } from '@Mutate/matchUps/matchUpStatus/reconcileMissedLinkAdvancements';
import { settleRederivedDoubleExits } from '@Mutate/matchUps/matchUpStatus/settleRederivedDoubleExits';
import { settleForwardConsequences } from '@Mutate/matchUps/matchUpStatus/settleForwardConsequences';
import { reconcileStaleExitOrigins } from '@Mutate/matchUps/matchUpStatus/reconcileStaleExitOrigins';
import { reconcileLinkAdvancements } from '@Mutate/matchUps/matchUpStatus/reconcileLinkAdvancements';
import { reconcileByeAdvancements } from '@Mutate/matchUps/matchUpStatus/reconcileByeAdvancements';
import { reconcileCarriesPastByes } from '@Mutate/matchUps/matchUpStatus/reconcileCarriesPastByes';
import { reconcileProvenanceSides } from '@Mutate/matchUps/matchUpStatus/reconcileProvenanceSides';
import { settleHeldExits } from '@Mutate/drawDefinitions/positionGovernor/doubleExitAdvancement';
import { reconcileScoredTimes } from '@Mutate/matchUps/matchUpStatus/reconcileScoredTimes';
import type { DeciderSnapshot } from '@Mutate/matchUps/matchUpStatus/reconcileDecider';
import { reconcileDeciders } from '@Mutate/matchUps/matchUpStatus/reconcileDecider';
import { observePass } from '@Mutate/matchUps/matchUpStatus/settleTelemetry';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';

// constants and types
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import type { MatchUpsMap, ResultType } from '@Types/factoryTypes';

/** the draw a call's settle passes are asked of, and the matchUp the call named */
export type SettleTarget = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpId: string;
  event?: Event;
};

export type SettleAfterWriteArgs = {
  finalsBefore: Map<string, number | undefined>;
  deciderSnapshotBefore?: DeciderSnapshot;
  doubleExitsBefore: Set<string>;
  propagateExitStatus?: boolean;
  matchUpsMap: MatchUpsMap;
  params: SettleTarget;
};

/**
 * A convergence that lost one of its origins goes where the kept origin alone puts it; then every carried
 * exit's ORIGIN is asked whether it still describes one (`reconcileStaleExitOrigins`).
 *
 * Asked of the DRAW, never of a map carried in the call's context. The reconciliation is a question about the
 * settled draw, and a map taken earlier in the call can describe an earlier draw: handed the exit-propagation
 * context's map while `decorateResult` deep-copied it, it read the draw as the direction left it and wrote to
 * detached objects, so a stale origin stood until the NEXT call repaired it (census F2, 2026-10-11).
 */
function settleExitOrigins({
  propagateExitStatus,
  doubleExitsBefore,
  matchUpId,
  params,
}: {
  params: SettleTarget;
  doubleExitsBefore: Set<string>;
  propagateExitStatus?: boolean;
  matchUpId: string;
}): ResultType | undefined {
  const settled = settleRederivedDoubleExits({
    tournamentRecord: params.tournamentRecord,
    drawDefinition: params.drawDefinition,
    targetMatchUpId: matchUpId,
    propagateExitStatus,
    doubleExitsBefore,
    event: params.event,
  });
  if (settled?.error) return settled;
  const reconciled = reconcileStaleExitOrigins({
    drawDefinition: params.drawDefinition,
    tournamentRecord: params.tournamentRecord,
    event: params.event,
  });
  if (reconciled?.error) return reconciled;
  // The reconciliation can itself re-derive a convergence: a double exit whose produced exit it withdrew because the
  // origin stopped being one. Settled only before it, that matchUp was still a double exit, and the participant it now
  // awards stayed where they stood (census policy-off 20177818, CURTIS_CONSOLATION 16/11: `Consolation 1|3|2`,
  // WINNER_NOT_ADVANCED). Those matchUps, and only those, are settled again on the draw the reconciliation left.
  const rederivedNow = new Set((reconciled?.rederived ?? []).filter((id) => doubleExitsBefore.has(id)));
  if (rederivedNow.size) {
    const resettled = settleRederivedDoubleExits({
      tournamentRecord: params.tournamentRecord,
      drawDefinition: params.drawDefinition,
      doubleExitsBefore: rederivedNow,
      targetMatchUpId: matchUpId,
      propagateExitStatus,
      event: params.event,
    });
    if (resettled?.error) return resettled;
  }
  // a convergence the call dissolved is owed the BYE it took back, on the draw as it now stands
  return oweDissolvedConvergencesTheirByes({
    tournamentRecord: params.tournamentRecord,
    drawDefinition: params.drawDefinition,
    event: params.event,
    doubleExitsBefore,
  });
}

/**
 * What is decided on the draw as it STANDS once the mutation has settled, rather than on the events
 * that led there. Each returns its error; neither is allowed to fail quietly.
 */
function settleDraw({
  deciderSnapshotBefore,
  finalsBefore,
  params,
}: {
  finalsBefore: Map<string, number | undefined>;
  deciderSnapshotBefore?: DeciderSnapshot;
  params: SettleTarget;
}): ResultType {
  const { tournamentRecord, drawDefinition, event } = params;

  // a participant who decided a round feeding another structure is seated there, before the decider is settled
  const crossedFirst = observePass('reconcileMissedLinkAdvancements', drawDefinition, () =>
    reconcileMissedLinkAdvancements({ tournamentRecord, drawDefinition, event }),
  );
  if (crossedFirst?.error) return crossedFirst;

  // a FIRST_MATCHUP consolation seat holds the reservation the settled first round says it should
  const reserved = observePass('reconcileConsolationReservations', drawDefinition, () =>
    reconcileConsolationReservations({ tournamentRecord, drawDefinition, event }),
  );
  if (reserved?.error) return reserved;
  // a reservation withdrawn here is a BYE taken back after the exits relayed past it were reconciled, so they are asked
  // again: a copy beyond the seat it vacated stands no longer (`reconcileStaleExitOrigins`, `getStaleRelays`)
  if (reserved?.withdrawn) {
    const relays = observePass('reconcileStaleExitOrigins', drawDefinition, () =>
      reconcileStaleExitOrigins({ tournamentRecord, drawDefinition, event }),
    );
    if (relays?.error) return relays;
  }
  // and an exit a carrier holds past a BYE that arrived after them is written where they landed
  const carried = observePass('reconcileCarriesPastByes', drawDefinition, () =>
    reconcileCarriesPastByes({ tournamentRecord, drawDefinition, event }),
  );
  if (carried?.error) return carried;

  // an exit held where nobody can play it is sent on, now that the draw it is decided on is settled
  const { appliedPolicies } = getAppliedPolicies({ tournamentRecord, drawDefinition, event });
  const settled = observePass('settleHeldExits', drawDefinition, () =>
    settleHeldExits({ tournamentRecord, appliedPolicies, drawDefinition, event }),
  );
  if (settled.error) return settled;
  // A convergence produced there serves its loser link, and the BYE it can place there stands in front of a carrier: the
  // carry past it was asked above, before that BYE existed, so it is asked again (census A1 wave 5, COMPASS 32:
  // `Southwest|2|1` stayed TO_BE_PLAYED under its carrier until the same outcome was entered a second time;
  // `aCarryPastAConvergencesByeIsCarriedOnTheFirstEntry`)
  if ((settled as { produced?: boolean }).produced) {
    const carriedAgain = observePass('reconcileCarriesPastByes', drawDefinition, () =>
      reconcileCarriesPastByes({ tournamentRecord, drawDefinition, event }),
    );
    if (carriedAgain?.error) return carriedAgain;
  }

  // and a participant opposite a BYE whose next seat was taken when the BYE landed, and is free now, goes on
  const advanced = observePass('reconcileByeAdvancements', drawDefinition, () =>
    reconcileByeAdvancements({ tournamentRecord, drawDefinition, event }),
  );
  if (advanced?.error) return advanced;

  // a held exit sent on above can decide a round feeding another structure, so its winner is seated there now, before
  // the decider is settled: asked only before it, the crossing waited for the NEXT call (census int2 nonrt,
  // DOUBLE_ELIMINATION 8/5 21037067: a double walkover at `Main|2|1` sent the Backdraw's held exit into the final,
  // which its champion won and was not seated in the decider until the same outcome was entered again)
  const crossed = observePass('reconcileMissedLinkAdvancements', drawDefinition, () =>
    reconcileMissedLinkAdvancements({ tournamentRecord, drawDefinition, event }),
  );
  if (crossed?.error) return crossed;

  // a provenance entry follows its feeder's side as the seats settle (CA ruling (1), 2026-10-20)
  observePass('reconcileProvenanceSides', drawDefinition, () =>
    reconcileProvenanceSides({ tournamentRecord, drawDefinition, event }),
  );

  // a final that feeds a decider settles whether the decider is needed — see `reconcileDecider`
  return observePass('reconcileDeciders', drawDefinition, () =>
    reconcileDeciders({
      mutatedMatchUpId: params.matchUpId,
      deciderSnapshotBefore,
      tournamentRecord,
      drawDefinition,
      finalsBefore,
      event,
    }),
  );
}

/**
 * EVERYTHING A CALL SETTLES once its own write, its directions and its exit propagation are done: `setMatchUpStatus`
 * runs it on the stored draw, and outcome v2 runs the same passes on its working copy for a cascade it records
 * (`outcome/plan/recordedCascade.ts`; CA, 2026-11-16), so the two cannot drift. The first error is returned as the pass
 * returned it; `exhausted` names the matchUp the forward settle stopped at.
 */
export function settleAfterWrite({
  deciderSnapshotBefore,
  propagateExitStatus,
  doubleExitsBefore,
  finalsBefore,
  matchUpsMap,
  params,
}: SettleAfterWriteArgs): ResultType & { exhausted?: string } {
  const { matchUpId } = params;
  // Everything has settled — removals, directions and exit propagation — which is the earliest point
  // at which a carried exit's ORIGIN can be asked whether it still describes one. See
  // `reconcileStaleExitOrigins` for the two corrections that pull the timing in opposite directions.
  const settled = observePass('settleExitOrigins', params.drawDefinition, () =>
    settleExitOrigins({ params, matchUpId, propagateExitStatus, doubleExitsBefore }),
  );
  if (settled?.error) return settled;
  const drawSettled = settleDraw({ deciderSnapshotBefore, finalsBefore, params });
  if (drawSettled.error) return drawSettled;
  // what forward play sends on from a result is sent on from one a removal re-derived: asked of the settled draw
  const forward = observePass('settleForwardConsequences', params.drawDefinition, () =>
    settleForwardConsequences({
      tournamentRecord: params.tournamentRecord,
      drawDefinition: params.drawDefinition,
      event: params.event,
      propagateExitStatus,
    }),
  );
  if (forward?.error) return forward;
  // A direction the forward settle makes can put a BYE back in front of a carrier: a loser it directs re-forms a double
  // exit, whose loser seat takes its BYE again. The carry past a late BYE was asked in `settleDraw`, before that BYE
  // existed, so it is asked again (census A1 wave 3 R12, COMPASS 32: `Southeast|2|1` left TO_BE_PLAYED under its
  // carrier; `aCarryPastAByeTheSettleReplacesIsCarriedAgain`).
  if (forward?.settled) {
    const carried = observePass('reconcileCarriesPastByes', params.drawDefinition, () =>
      reconcileCarriesPastByes({
        tournamentRecord: params.tournamentRecord,
        drawDefinition: params.drawDefinition,
        event: params.event,
      }),
    );
    if (carried?.error) return carried;
  }
  // and, last, nobody stands across a link out of a matchUp that has no result. After `settleDraw`, not before:
  // a held exit is decided there, and a placement made for it is not unearned (de 9301605, the Decider).
  const released = observePass('reconcileLinkAdvancements', params.drawDefinition, () =>
    reconcileLinkAdvancements({
      drawDefinition: params.drawDefinition,
      tournamentRecord: params.tournamentRecord,
      event: params.event,
    }),
  );
  if (released?.error) return released;
  // and once everything has settled, no matchUp left without a result keeps the `scoredTime` it was stamped with. Last,
  // because the passes above can take a result away: `settleHeldExits` turns an exit holder into a BYE, and the
  // forward settle and the link passes release what was placed. Asked before them, the stamp outlived the result
  // until the next call, whatever that call was (`aResultTheSettleRemovesTakesItsScoredTime`).
  observePass('reconcileScoredTimes', params.drawDefinition, () =>
    reconcileScoredTimes({
      matchUps: matchUpsMap.drawMatchUps,
      drawDefinition: params.drawDefinition,
      tournamentRecord: params.tournamentRecord,
      event: params.event,
    }),
  );
  return { exhausted: forward?.exhausted };
}
