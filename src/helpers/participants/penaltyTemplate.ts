import { UUID } from '@Tools/UUID';

export const penaltyTemplate = ({ penaltyId = UUID() } = {}) => ({
  refereeParticipantId: undefined,
  penaltyCode: undefined,
  penaltyType: undefined,
  extensions: undefined,
  matchUpId: undefined,
  createdAt: undefined,
  issuedAt: undefined,
  notes: undefined,
  penaltyId,
});

export default penaltyTemplate;
