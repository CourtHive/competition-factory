export const tournament = {
  endDate: '{\\"type\\":\\"string\\",\\"required\\":\\"true\\",\\"note\\":\\"\'YYYY-MM-DD\'\\"}',
  events: '{\\"type\\":\\"object\\",\\"object\\":\\"event\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
  formalName: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\"}',
  hostCountryCode: '{\\"type\\":\\"enum\\",\\"enum\\": \\"ISO3166-3\\",\\"required\\":\\"false\\"}',
  indoorOutdoor:
    '{\\"type\\":\\"enum\\",\\"enum\\": \\"\\",\\"required\\":\\"false\\",\\"note\\":\\"INDOOR, OUTDOOR, or MIXED\\"}',
  localTimeZone: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\"}',
  matchUps: '{\\"type\\":\\"object\\",\\"object\\":\\"matchUp\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
  onlineResources:
    '{\\"type\\":\\"object\\",\\"object\\":\\"onlineResource\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
  parentOrganizationid: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\"}',
  participants:
    '{\\"type\\":\\"object\\",\\"object\\":\\"participant\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
  promotionalName: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\"}',
  registrationProfile:
    '{\\"type\\":\\"object\\",\\"object\\":\\"registrationProfile\\",\\"required\\":\\"false\\",\\"link\\":\\"true\\"}',
  season: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\",\\"note\\":\\"e.g. \'Fall 2020\'\\"}',
  startDate: '{\\"type\\":\\"string\\",\\"required\\":\\"true\\",\\"note\\":\\"\'YYYY-MM-DD\'\\"}',
  surfaceCategory: '{\\"type\\":\\"enum\\",\\"enum\\": \\"\\",\\"required\\":\\"false\\"}',
  totalPrizeMoney:
    '{\\"type\\":\\"object\\",\\"object\\":\\"prizeMoney\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
  tournamentCategories:
    '{\\"type\\":\\"object\\",\\"object\\":\\"category\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
  tournamentGroups:
    '{\\"type\\":\\"string\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\",\\"note\\":\\"e.g. [\'Grand Slam\']\\"}',
  tournamentId: '{\\"type\\":\\"string\\",\\"required\\":\\"true\\"}',
  tournamentLevel: '{\\"type\\":\\"enum\\",\\"enum\\": \\"\\",\\"required\\":\\"false\\"}',
  tournamentName: '{\\"type\\":\\"string\\",\\"required\\":\\"true\\"}',
  tournamentOtherIds: '{\\"type\\":\\"string\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
  tournamentRank: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\",\\"note\\":\\"unique to provider\\"}',
  venues: '{\\"type\\":\\"object\\",\\"object\\":\\"venue\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
};

export default tournament;
