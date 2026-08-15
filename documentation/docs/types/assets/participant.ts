export const participant = {
  contacts: '{\\"type\\":\\"object\\",\\"object\\":\\"contact\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
  individualParticipantIds:
    '{\\"type\\":\\"string\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\",\\"note\\":\\"participantIds in TEAM, GROUP, or PAIR\\"}',
  onlineResources:
    '{\\"type\\":\\"object\\",\\"object\\":\\"onlineResource\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
  participantId: '{\\"type\\":\\"string\\",\\"required\\":\\"true\\"}',
  participantName: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\"}',
  participantOtherIds:
    '{\\"type\\":\\"object\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\",\\"note\\":\\"this participant\'s identity in other organisations\' systems; unlike person.personOtherIds it works for PAIR and TEAM participants, which carry no person\\"}',
  participantOtherName: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\"}',
  participantRole:
    '{\\"type\\":\\"enum\\",\\"enum\\": \\"\\",\\"required\\":\\"false\\",\\"note\\":\\"ADMINISTRATION, CAPTAIN, COACH, COMPETITOR, DIRECTOR, HOSPITALITY, MEDIA, MEDICAL, OFFICIAL, OTHER, SECURITY, STRINGER, SUPERVISOR, TRANSPORT, VOLUNTEER\\"}',
  participantRoleResponsibilities: '{\\"type\\":\\"string\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
  participantStatus: '{\\"type\\":\\"enum\\",\\"enum\\": \\"\\",\\"required\\":\\"false\\"}',
  participantType:
    '{\\"type\\":\\"enum\\",\\"enum\\": \\"\\",\\"required\\":\\"false\\",\\"note\\":\\"e.g. INDIVIDUAL, PAIR, TEAM, GROUP\\"}',
  penalties: '{\\"type\\":\\"object\\",\\"object\\":\\"penalty\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
  person: '{\\"type\\":\\"object\\",\\"object\\":\\"person\\",\\"required\\":\\"false\\"}',
  representing: '{\\"type\\":\\"enum\\",\\"enum\\": \\"ISO3166-3\\",\\"required\\":\\"false\\"}',
  teamId:
    '{\\"type\\":\\"string\\",\\"required\\":\\"false\\",\\"note\\":\\"if participant is TEAM; provider specific\\"}',
};

export default participant;
