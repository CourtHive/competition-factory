import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { MALE, FEMALE } from '@Constants/genderConstants';
import { Participant } from '@Types/tournamentTypes';

/**
 * Rewrites the `individualParticipantIds` on each PAIR participant in
 * `unique` so each pair contains exactly one MALE and one FEMALE member.
 *
 * Mirrors the gender-balanced assembly that `buildTeamParticipants` does
 * for TEAM events: split the INDIVIDUAL pool by sex, then for each PAIR
 * at index i, pair `males[i]` with `females[i]`. The PAIRs' own
 * participantIds stay stable; only the member references and the
 * participantName are rewritten.
 *
 * Caller must request balanced MALE/FEMALE counts upstream (e.g. by
 * setting `gendersCount = { MALE: pairCount, FEMALE: pairCount }` before
 * calling `generateParticipants`). If the pool is short on one sex, the
 * extra PAIRs are left untouched and will fail `checkValidEntries` —
 * that's the safer failure mode than silently producing same-sex
 * pairs in a MIXED event.
 */
export function rebuildPairsAsMixed(unique: Participant[]) {
  const pairs = unique.filter((p) => p.participantType === PAIR);
  const individuals = unique.filter((p) => p.participantType === INDIVIDUAL);
  const males = individuals.filter((p) => (p as any).person?.sex === MALE);
  const females = individuals.filter((p) => (p as any).person?.sex === FEMALE);
  for (let i = 0; i < pairs.length; i++) {
    const m = males[i];
    const f = females[i];
    if (!m || !f) continue;
    const pair: any = pairs[i];
    pair.individualParticipantIds = [m.participantId, f.participantId];
    const mName = (m as any).person?.standardFamilyName ?? '';
    const fName = (f as any).person?.standardFamilyName ?? '';
    pair.participantName = `${mName}/${fName}`;
  }
}
