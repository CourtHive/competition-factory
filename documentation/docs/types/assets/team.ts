export const team = {
  gender: '{\\"type\\":\\"enum\\",\\"enum\\": \\"\\",\\"required\\":\\"false\\"}',
  teamName: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\"}',
  nativeTeamName: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\"}',
  otherTeamNames: '{\\"type\\":\\"string\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
  personIds: '{\\"type\\":\\"string\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
  previousTeamNames: '{\\"type\\":\\"string\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
  parentOrganisationId: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\"}',
  teamId: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\"}',
  teamOtherIds:
    '{\\"type\\":\\"object\\",\\"object\\":\\"unifiedteamId\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
};

export default team;
