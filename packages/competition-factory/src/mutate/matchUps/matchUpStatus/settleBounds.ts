/**
 * THE PASS LIMITS OF v1's BOUNDED SETTLE LOOPS (F9, CA 2026-10-19 and 2026-10-24). A loop that reaches its limit with
 * work still to do refuses the call with `SETTLE_BOUND_REACHED`; none was reached on ~97,000 census schedules (settle
 * telemetry, 2026-10-24). The forward settle keeps its own `PASS_LIMIT` and its `FORWARD_SETTLE_EXHAUSTED` warning,
 * F9's one exception (CA, 2026-10-24): it is a repair loop that imported data can reach.
 *
 * Mutable so a test can lower a limit to 0 and plant the refusal on a draw with real work at that site; production
 * never writes it.
 */
export const SETTLE_PASS_LIMITS = {
  /** `propagateExitFrom`: levels of consolation an exit is propagated through */
  exitLevels: 10,
  /** `sendHeldExitsOn`: held exits carried on */
  heldExits: 16,
  /** `produceStrandedConvergences`: stranded convergences produced */
  strandedConvergences: 16,
  /** `crossLinksThroughByes`: BYE advancements carried across a winner link */
  linkCrossings: 16,
};
