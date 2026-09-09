import { CHALLENGE_ACCEPTED, CHALLENGE_DECLINED, CHALLENGE_ISSUED } from '@Constants/ladderConstants';
import { ACCEPTED, DECLINED, EXPIRED, PENDING } from '@Constants/ladderConstants';
import type { ChallengeState } from '@Constants/ladderConstants';
import type { LadderPolicy } from '@Types/ladderTypes';

type ChallengeStateArgs = {
  /** The instant to evaluate against. REQUIRED — see below. */
  asOf: string;
  policy: LadderPolicy;
  matchUp: any;
};

const itemDateOf = (matchUp: any, itemType: string): string | undefined =>
  (matchUp?.timeItems ?? [])
    .filter((item: any) => item.itemType === itemType)
    .map((item: any) => item.itemDate)
    .sort((a: string, b: string) => a.localeCompare(b))
    .at(-1);

/** Days added to an ISO instant, returned as an ISO instant. The only date arithmetic here. */
export function addDaysIso(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

/**
 * What has become of a challenge, evaluated at an explicit instant.
 *
 * `asOf` IS REQUIRED AND THAT IS DELIBERATE. Expiry is not stored — `PENDING` and `EXPIRED` are the
 * same stored `CHALLENGED` matchUp, and nothing runs at the moment of expiry to flip a flag. Reading
 * an ambient clock inside here would make the function untestable without freezing time, and would
 * bury a conversion the factory's Temporal migration will have to find. The caller supplies the
 * instant; this stays pure.
 */
export function getChallengeState({ matchUp, policy, asOf }: ChallengeStateArgs): {
  state: ChallengeState;
  expiresAt?: string;
} {
  if (itemDateOf(matchUp, CHALLENGE_DECLINED)) return { state: DECLINED };
  if (itemDateOf(matchUp, CHALLENGE_ACCEPTED)) return { state: ACCEPTED };

  const issuedAt = itemDateOf(matchUp, CHALLENGE_ISSUED);
  // No issue record means nothing to expire — a challenge that never started cannot have run out.
  if (!issuedAt) return { state: PENDING };

  const acceptanceDays = policy.acceptanceDays;
  if (typeof acceptanceDays !== 'number') return { state: PENDING };

  const expiresAt = addDaysIso(issuedAt, acceptanceDays);
  return { state: asOf >= expiresAt ? EXPIRED : PENDING, expiresAt };
}
