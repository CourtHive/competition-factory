export const linkTarget = {
  drawId: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\",\\"note\\":\\"if target is in different draw\\"}',
  feedProfile:
    '{\\"type\\":\\"enum\\",\\"enum\\": \\"\\",\\"required\\":\\"true\\",\\"note\\":\\"e.g. TOP_DOWN, BOTTOM_UP\\"}',
  groupedOrder:
    '{\\"type\\":\\"number\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\",\\"note\\":\\"relates to fed positions\\"}',
  positionInterleave:
    '{\\"type\\":\\"object\\",\\"object\\":\\"interleave\\",\\"required\\":\\"false\\",\\"note\\":\\"e.g. double elimination backdraw\\"}',
  roundNumber: '{\\"type\\":\\"number\\",\\"required\\":\\"true\\",\\"note\\":\\"if target is in different draw\\"}',
  structureId: '{\\"type\\":\\"string\\",\\"required\\":\\"true\\",\\"note\\":\\"target structure\\"}',
};

export default linkTarget;
