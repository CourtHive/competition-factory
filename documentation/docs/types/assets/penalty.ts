export const penalty = {
  issuedAt: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\",\\"note\\":\\"ISO 8601 Date/time string\\"}',
  matchUpId: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\"}',
  penaltyCode: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\",\\"note\\":\\"provider specific\\"}',
  penaltyId:
    '{\\"type\\":\\"string\\",\\"required\\":\\"false\\",\\"note\\":\\"unique identifier within tournament\\"}',
  penaltyType: '{\\"type\\":\\"enum\\",\\"enum\\": \\"\\",\\"required\\":\\"false\\"}',
  refereeParticipantId:
    '{\\"type\\":\\"string\\",\\"required\\":\\"false\\",\\"note\\":\\"participantId of official\\"}',
};

export default penalty;
