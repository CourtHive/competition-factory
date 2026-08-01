export const event = {
  category: '{\\"type\\":\\"object\\",\\"object\\":\\"category\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
  discipline:
    '{\\"type\\":\\"enum\\",\\"enum\\": \\"\\",\\"required\\":\\"false\\",\\"note\\":\\"open vocabulary; known: TENNIS, BEACH_TENNIS, WHEELCHAIR_TENNIS, PADEL, PICKLEBALL, VOLLEYBALL, BEACH_VOLLEYBALL\\"}',
  drawDefinitions:
    '{\\"type\\":\\"object\\",\\"object\\":\\"drawDefinition\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
  entries: '{\\"type\\":\\"object\\",\\"object\\":\\"entry\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
  endDate: '{\\"type\\":\\"string\\",\\"required\\":\\"true\\",\\"note\\":\\"\'YYYY-MM-DD\'\\"}',
  eventId: '{\\"type\\":\\"string\\",\\"required\\":\\"true\\"}',
  eventName: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\"}',
  eventRank: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\"}',
  eventLevel: '{\\"type\\":\\"enum\\",\\"enum\\": \\"\\",\\"required\\":\\"false\\"}',
  eventType:
    '{\\"type\\":\\"enum\\",\\"enum\\": \\"\\",\\"required\\":\\"true\\",\\"note\\":\\"SINGLES, DOUBLES, or TEAM\\"}',
  gender: '{\\"type\\":\\"enum\\",\\"enum\\": \\"\\",\\"required\\":\\"false\\"}',
  indoorOutdoor:
    '{\\"type\\":\\"enum\\",\\"enum\\": \\"\\",\\"required\\":\\"false\\",\\"note\\":\\"INDOOR, OUTDOOR, or MIXED\\"}',
  links: '{\\"type\\":\\"object\\",\\"object\\":\\"link\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
  matchUpFormat:
    '{\\"type\\":\\"string\\",\\"required\\":\\"false\\",\\"note\\":\\"CODES matchup format, e.g. \'SET3-S:6/TB7\'\\"}',
  startDate: '{\\"type\\":\\"string\\",\\"required\\":\\"true\\",\\"note\\":\\"\'YYYY-MM-DD\'\\"}',
  surfaceCategory: '{\\"type\\":\\"enum\\",\\"enum\\": \\"\\",\\"required\\":\\"false\\"}',
  tennisOfficialIds:
    '{\\"type\\":\\"string\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\",\\"note\\":\\"participantId array\\"}',
  tieFormat: '{\\"type\\":\\"object\\",\\"object\\":\\"tieFormat\\",\\"required\\":\\"false\\"}',
  wheelchairClass: '{\\"type\\":\\"enum\\",\\"enum\\": \\"\\",\\"required\\":\\"false\\"}',
};

export default event;
