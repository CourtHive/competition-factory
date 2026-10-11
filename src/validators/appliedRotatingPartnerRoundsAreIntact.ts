import { getRotatingPartnerScoringContract } from '@Query/drawDefinition/getRotatingPartnerScoringContract';
import { stringifyCombinedPointFormat } from '@Helpers/matchUpFormatCode/combinedPointFormat';
import { validRotatingPartnerSettlementHistory } from './rotatingPartnerSettlement';
import { isRotatingPartnerTallyPolicy } from './rotatingPartnerTallyPolicy';
import { matchUpsOf } from '@Acquire/structureMembers';
import { canonicalJson } from '@Tools/canonicalJson';

// constants and types
import type { DrawDefinition, Tournament, Participant } from '@Types/tournamentTypes';
import type { RotatingPartnerRoundRecord } from '@Types/rotatingPartnerRound';
import { PAIR } from '@Constants/participantConstants';

/** Membership snapshots prevent deleted or edited rounds from silently changing the rotation. */
export function appliedRotatingPartnerRoundsAreIntact({
  drawDefinition,
  tournamentRecord,
}: {
  drawDefinition: DrawDefinition;
  tournamentRecord: Tournament;
}): boolean {
  if (!validRotatingPartnerSettlementHistory(drawDefinition)) return false;
  const rounds = drawDefinition.competitionRounds ?? [];
  if (rounds.length && !drawDefinition.competitionRoster?.length) return false;
  const profile = drawDefinition.competitionProfile;
  const scoring = getRotatingPartnerScoringContract({ drawDefinition });
  if (rounds.length && (!profile || profile.format === 'LADDER' || scoring.error)) return false;
  const participants = new Map(
    (tournamentRecord.participants ?? []).map((participant) => [participant.participantId, participant]),
  );
  const roster = new Set(drawDefinition.competitionRoster ?? []);
  const usedMatches = new Set<string>();
  const orderedRounds = rounds.toSorted((a, b) => a.roundNumber - b.roundNumber);
  for (const [roundIndex, round] of orderedRounds.entries()) {
    if (round.roundNumber !== roundIndex + 1 || !validRoundShape(round, roster)) return false;
    if (round.matchUpIds.some((id) => usedMatches.has(id))) return false;
    round.matchUpIds.forEach((id) => usedMatches.add(id));
    if (!isRotatingPartnerTallyPolicy(round.tallyContract)) return false;
    if (
      !profile ||
      profile.format === 'LADDER' ||
      round.format !== profile.format ||
      round.baseSeed !== profile.pairing.seed ||
      canonicalJson(round.scoringContract) !== canonicalJson(scoring.contract)
    )
      return false;
    if (!membershipMatches(round, drawDefinition, participants)) return false;
  }
  const matches = (drawDefinition.structures ?? []).flatMap((structure) => matchUpsOf(structure) ?? []);
  return matches.length === usedMatches.size && matches.every((matchUp) => usedMatches.has(matchUp.matchUpId));
}

function membershipMatches(
  round: RotatingPartnerRoundRecord,
  drawDefinition: DrawDefinition,
  participants: Map<string, Participant>,
): boolean {
  const structure = drawDefinition.structures?.find((candidate) => candidate.structureId === round.structureId);
  const matches = new Map((matchUpsOf(structure) ?? []).map((matchUp) => [matchUp.matchUpId, matchUp]));

  for (const [index, id] of round.matchUpIds.entries()) {
    const matchUp = matches.get(id);
    if (matchUp?.roundNumber !== round.roundNumber || matchUp.sides?.length !== 2) return false;
    if (matchUp.matchUpFormat !== `SET1-S:${stringifyCombinedPointFormat(round.scoringContract)}`) return false;
    for (let sideNumber = 1; sideNumber <= 2; sideNumber++) {
      const side = matchUp.sides.find((candidate) => candidate.sideNumber === sideNumber);
      const pair = participants.get(side?.participantId ?? '');
      const members = pair?.individualParticipantIds;
      if (
        pair?.participantType !== PAIR ||
        !Array.isArray(members) ||
        canonicalJson(members.toSorted()) !== canonicalJson(round.pairings[index][sideNumber - 1].toSorted())
      )
        return false;
    }
  }
  return true;
}

function validRoundShape(round: RotatingPartnerRoundRecord, roster: Set<string>): boolean {
  if (round.algorithmVersion !== 1 || round.version !== 1) return false;
  if (!Array.isArray(round.matchUpIds) || !Array.isArray(round.pairings)) return false;
  if (round.matchUpIds.length !== round.pairings.length || new Set(round.matchUpIds).size !== round.matchUpIds.length)
    return false;
  if (
    round.pairings.some(
      (pairing) =>
        !Array.isArray(pairing) ||
        pairing.length !== 2 ||
        pairing.some((side) => !Array.isArray(side) || side.length !== 2),
    )
  )
    return false;
  const members = round.pairings.flat(2);
  if (members.length !== roster.size || new Set(members).size !== roster.size || members.some((id) => !roster.has(id)))
    return false;
  if (round.format !== 'MEXICANO') return true;
  const snapshot = round.standingsSnapshot;
  return (
    round.standingsThroughRoundNumber === round.roundNumber - 1 &&
    Array.isArray(snapshot) &&
    snapshot.length === roster.size &&
    new Set(snapshot.map((row) => row.participantId)).size === roster.size &&
    snapshot.every(
      (row) => roster.has(row.participantId) && Number.isSafeInteger(row.pointsScored) && row.pointsScored >= 0,
    )
  );
}
