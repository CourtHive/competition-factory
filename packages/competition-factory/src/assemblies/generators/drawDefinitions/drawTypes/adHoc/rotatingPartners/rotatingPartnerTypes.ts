export type RotatingPartnerSide = [string, string];
export type RotatingPartnerMatch = [RotatingPartnerSide, RotatingPartnerSide];
export type RotatingPartnerRound = RotatingPartnerMatch[];

export type RotatingPartnerStanding = {
  participantId: string;
  pointsScored: number;
};

export function validIndividualIds(participantIds: string[]): boolean {
  return (
    Array.isArray(participantIds) &&
    participantIds.length >= 4 &&
    participantIds.length % 4 === 0 &&
    participantIds.every((id) => typeof id === 'string' && id.trim().length > 0) &&
    new Set(participantIds).size === participantIds.length
  );
}
