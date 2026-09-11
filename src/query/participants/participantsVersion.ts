/**
 * A version stamp for a participant set, used by the payload-decomposition handshake.
 *
 * WHY A HANDSHAKE AND NOT A CLIENT ASSERTION. A client saying "I already have these participants" is
 * a claim the server cannot check, and when it is wrong the failure is SILENT — every bracket side
 * renders TBD. That is not hypothetical: it is the documented reason competition-factory-server
 * invalidates its cache rather than seeding it. With a version stamp the client PROVES what it holds;
 * a mismatch simply sends bytes that were not needed. Loud and self-correcting beats silent.
 *
 * WHY A HAND-ROLLED HASH. The factory has no runtime dependencies and runs in browsers as well as
 * Node, so `node:crypto` is unavailable. This is a cache-validity check, not a security primitive.
 *
 * COLLISION SAFETY MATTERS HERE, because a false MATCH is the dangerous direction — it would omit
 * participants that actually differ, reproducing the silent-blank-bracket failure this design exists
 * to prevent. So the stamp is deliberately over-specified: participant COUNT plus two independent
 * 32-bit hashes with different primes. Two sets must collide on all three to be confused.
 *
 * A false MISMATCH is harmless — the server sends participants, exactly as it does today.
 */

/** FNV-1a, 32-bit, parameterised so two independent digests can be taken over the same input. */
function fnv1a(input: string, offsetBasis: number, prime: number): number {
  let hash = offsetBasis;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, prime);
  }
  // >>> 0 keeps it an unsigned 32-bit value; Math.imul can produce negatives
  return hash >>> 0;
}

/**
 * Canonical serialization: participants sorted by their serialized form so an ordering change in an
 * upstream query does not present as a content change. Order-independence is the point — a false
 * mismatch is safe but pointless, and it would make the handshake never fire.
 */
function canonicalize(participants: any[]): string {
  return participants
    .map((participant) => JSON.stringify(participant))
    .sort()
    .join(' ');
}

/**
 * Stable stamp for a participant set. Same participants (in any order) produce the same stamp.
 *
 * Format: `p1-<count>-<hashA><hashB>`. The `p1` prefix names the scheme so it can change without a
 * client mistaking an old stamp for a new one — a scheme change makes every stamp mismatch, which
 * degrades to today's behaviour rather than to a wrong match.
 */
export function participantsVersion(participants?: any[]): string | undefined {
  if (!Array.isArray(participants)) return undefined;

  const canonical = canonicalize(participants);
  const hashA = fnv1a(canonical, 0x811c9dc5, 0x01000193).toString(36);
  const hashB = fnv1a(canonical, 0x9e3779b1, 0x85ebca77).toString(36);

  return `p1-${participants.length}-${hashA}${hashB}`;
}
