import { PolicyDefinitions } from '@Types/factoryTypes';

/**
 * Whether a double exit produces a BYE for the seat its loser would have taken.
 *
 * **ON unless a policy turns it off** — CA, 2026-09-29: *"two BYEs meeting always produces a BYE"*,
 * and of a double exit's target, 2026-09-18: *"a DOUBLE_WALKOVER in a source structure can logically
 * only produce a BYE in a target structure."* A double exit removes both competitors, so nobody will
 * ever arrive in the seat one of them would have taken, and a seat that will receive nobody is a BYE.
 *
 * `{ progression: { doubleExitPropagateBye: false } }` keeps the older behaviour, in which the seat
 * receives a produced WALKOVER or DEFAULTED instead. That matters to a provider who awards ranking
 * points by matchUpStatus and needs the two told apart.
 *
 * ONE READER, because the three sites that asked this each read the policy for themselves and each
 * treated an absent policy as OFF. A default that is decided in three places is three defaults.
 */
export function propagatesByeOnDoubleExit(appliedPolicies?: PolicyDefinitions): boolean {
  return appliedPolicies?.progression?.doubleExitPropagateBye !== false;
}
