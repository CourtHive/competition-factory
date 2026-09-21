export const entry = {
  entryId: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\",\\"note\\":\\"id unique within tournament\\"}',
  entryPosition: '{\\"type\\":\\"number\\",\\"required\\":\\"false\\",\\"note\\":\\"unique within status group\\"}',
  entryStage:
    '{\\"type\\":\\"enum\\",\\"enum\\": \\"\\",\\"required\\":\\"false\\",\\"note\\":\\"QUALIFYING or MAIN\\"}',
  entryStageSequence:
    '{\\"type\\":\\"number\\",\\"required\\":\\"false\\",\\"note\\":\\"e.g. in progressive qualifying\\"}',
  entryStatus:
    '{\\"type\\":\\"enum\\",\\"enum\\": \\"\\",\\"required\\":\\"false\\",\\"note\\":\\"e.g. DIRECT_ACCEPTANCE, ALTERNATE\\"}',
  participantId: '{\\"type\\":\\"string\\",\\"required\\":\\"true\\"}',
};

export default entry;
