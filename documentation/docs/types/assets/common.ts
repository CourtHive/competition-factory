export const common = {
  createdAt: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\",\\"note\\":\\"ISO 8601 Date/time string\\"}',
  extensions:
    '{\\"type\\":\\"object\\",\\"object\\":\\"extension\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
  isMock: '{\\"type\\":\\"boolean\\",\\"required\\":\\"false\\",\\"note\\":\\"flag for test data\\"}',
  notes: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\"}',
  timeItems: '{\\"type\\":\\"object\\",\\"object\\":\\"timeItem\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
  updatedAt: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\",\\"note\\":\\"ISO 8601 Date/time string\\"}',
};

export default common;
