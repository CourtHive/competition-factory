import drawDefinitionConstants from '@Constants/drawDefinitionConstants';

const { stageOrder } = drawDefinitionConstants;
// Sort rounds by order in which they will be played
export function roundSort(a, b) {
  return (
    a.eventName.localeCompare(b.eventName) ||
    a.eventId.localeCompare(b.eventId) ||
    (stageOrder[a?.stage] || 0) - (stageOrder[b?.stage] || 0) ||
    b.matchUpsCount - a.matchUpsCount ||
    `${a.stageSequence}-${a.roundNumber}-${a.minFinishingSum}`.localeCompare(
      `${b.stageSequence}-${b.roundNumber}-${b.minFinishingSum}`,
    )
  );
}
