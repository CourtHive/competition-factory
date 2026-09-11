export const matchUp = {
  collectionId: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\",\\"note\\":\\"only applies to tieMatchUps\\"}',
  collectionPosition:
    '{\\"type\\":\\"number\\",\\"required\\":\\"false\\",\\"note\\":\\"only applies to tieMatchUps\\"}',
  drawPositions: '{\\"type\\":\\"number\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
  endDate: '{\\"type\\":\\"string\\",\\"required\\":\\"true\\",\\"note\\":\\"\'YYYY-MM-DD\'\\"}',
  indoorOutdoor:
    '{\\"type\\":\\"enum\\",\\"enum\\": \\"\\",\\"required\\":\\"false\\",\\"note\\":\\"INDOOR, OUTDOOR, or MIXED\\"}',
  finishingPositionRange: '{\\"type\\":\\"object\\",\\"object\\":\\"positionRange\\",\\"required\\":\\"false\\"}',
  finishingRound: '{\\"type\\":\\"number\\",\\"required\\":\\"false\\"}',
  loserMatchUpId: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\"}',
  matchUpDuration: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\"}',
  matchUpFormat:
    '{\\"type\\":\\"string\\",\\"required\\":\\"false\\",\\"note\\":\\"CODES matchup format, e.g. \'SET3-S:6/TB7\'\\"}',
  matchUpId: '{\\"type\\":\\"string\\",\\"required\\":\\"true\\"}',
  matchUpStatus: '{\\"type\\":\\"enum\\",\\"enum\\": \\"\\",\\"required\\":\\"true\\"}',
  matchUpStatusCodes:
    '{\\"type\\":\\"string\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\",\\"note\\":\\"provider specific\\"}',
  matchUpType:
    '{\\"type\\":\\"enum\\",\\"enum\\": \\"\\",\\"required\\":\\"true\\",\\"note\\":\\"SINGLES, DOUBLES, or TEAM\\"}',
  orderOfFinish: '{\\"type\\":\\"number\\",\\"required\\":\\"false\\"}',
  roundName: '{\\"type\\":\\"number\\",\\"required\\":\\"false\\"}',
  roundNumber: '{\\"type\\":\\"number\\",\\"required\\":\\"false\\"}',
  roundPosition: '{\\"type\\":\\"number\\",\\"required\\":\\"false\\"}',
  score: '{\\"type\\":\\"object\\",\\"object\\":\\"score\\",\\"required\\":\\"false\\"}',
  sides: '{\\"type\\":\\"object\\",\\"object\\":\\"side\\",\\"required\\":\\"false\\"}',
  startDate: '{\\"type\\":\\"string\\",\\"required\\":\\"true\\",\\"note\\":\\"\'YYYY-MM-DD\'\\"}',
  surfaceCategory: '{\\"type\\":\\"enum\\",\\"enum\\": \\"\\",\\"required\\":\\"false\\"}',
  tieFormat: '{\\"type\\":\\"object\\",\\"object\\":\\"tieFormat\\",\\"required\\":\\"false\\"}',
  tieMatchUps: '{\\"type\\":\\"object\\",\\"object\\":\\"matchUp\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
  winningSide: '{\\"type\\":\\"number\\",\\"required\\":\\"false\\",\\"note\\":\\"1 or 2\\"}',
  winnerMatchUpId: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\"}',
};

export default matchUp;
