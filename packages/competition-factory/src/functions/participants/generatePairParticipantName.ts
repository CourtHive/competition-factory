import { isFemale } from '@Validators/isFemale';
import { isMale } from '@Validators/isMale';

type PairNameMember = {
  participantOtherName?: string;
  participantName?: string;
  participantId?: string;
  person?: { standardFamilyName?: string; sex?: string } & Record<string, any>;
} & Record<string, any>;

type GeneratePairParticipantNameArgs = {
  individualParticipantIds?: string[];
  individualParticipants?: PairNameMember[];
};

// Pinned to 'en' rather than the runtime default. An unqualified
// localeCompare resolves against the host locale, so the same pair would be
// named differently on a server in Stockholm than in New York — and the
// difference is invisible until a name reorders in production.
const collator = new Intl.Collator('en');

// Which surname a member contributes. `standardFamilyName` first because the
// convention is a surname convention; the alternates exist for members that
// carry no person record.
function memberName(member: PairNameMember): string {
  return member?.person?.standardFamilyName || member?.participantOtherName || member?.participantName || '';
}

/**
 * Generate the display name for a PAIR participant.
 *
 * **The result is display text, not an identifier.** It is a rendering of the
 * pair's members and nothing may parse it to recover them — members are
 * addressed through `individualParticipantIds`. Two orderings of the same pair
 * are both correct, which is precisely why the order must not be load-bearing.
 *
 * Ordering follows the convention the sport actually uses:
 *
 * - **Same-sex pairs are alphabetical by surname.** Verified across a full
 *   Grand Slam seeding (32/32 men's and women's teams), and it is alphabetical
 *   rather than ranking-based — an Olympic draw lists `Alcaraz / Nadal` and
 *   `Evans / Murray` though every report led with Nadal and with Murray.
 * - **Mixed pairs list the woman first**, which overrides alphabetical:
 *   `Świątek / Ruud`, `Pegula / Draper`, `Rybakina / Fritz`.
 *
 * Neither rule is codified by any governing body — the 2026 WTA Rulebook uses
 * "alphabetical" only for ranking tie-breaks — so it is encoded here
 * deliberately rather than inherited from whatever a `.sort()` happened to do.
 *
 * "Mixed" is derived from the members' own `person.sex`, not from an event's
 * gender: a PAIR is a tournament-level participant that may be entered in
 * several events, so the pair itself is the only reliable source. Anything
 * other than exactly one male and one female — a missing sex, `OTHER`, a
 * single member — falls back to alphabetical.
 */
export function generatePairParticipantName({
  individualParticipantIds,
  individualParticipants,
}: GeneratePairParticipantNameArgs): string {
  // Set rather than Array#includes for the membership test, per the standards:
  // built once here instead of re-scanned per member.
  const memberIds = Array.isArray(individualParticipantIds) ? new Set(individualParticipantIds) : undefined;

  const members = (individualParticipants ?? []).filter((member) => {
    if (!memberIds) return true;
    const participantId = member?.participantId;
    return typeof participantId === 'string' && memberIds.has(participantId);
  });

  const named = members.filter((member) => !!memberName(member));

  const ordered = orderMembers(named);
  let participantName = ordered.map(memberName).join('/');

  // Fewer than two contributing names means the partner is not known. Guard on
  // the names actually produced rather than on the id count: two ids where one
  // resolves to nothing is the same situation as one id, and previously the
  // two write paths disagreed about which of those they measured.
  if (ordered.length === 1) participantName += '/Unknown';

  return participantName;
}

function orderMembers(members: PairNameMember[]): PairNameMember[] {
  if (members.length !== 2) return alphabetical(members);

  const [a, b] = members;
  const aFemale = isFemale(a?.person?.sex);
  const bFemale = isFemale(b?.person?.sex);
  const aMale = isMale(a?.person?.sex);
  const bMale = isMale(b?.person?.sex);

  if (aFemale && bMale) return [a, b];
  if (bFemale && aMale) return [b, a];

  return alphabetical(members);
}

function alphabetical(members: PairNameMember[]): PairNameMember[] {
  return [...members].sort((a, b) => collator.compare(memberName(a), memberName(b)));
}
