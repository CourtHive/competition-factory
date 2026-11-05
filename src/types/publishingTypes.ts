// The publishing state an event records per draw, stage and structure: written by publishEvent, read by the
// publishing queries, the read model and the view types.

export type ScheduledRoundDetail = {
  published?: boolean;
  embargo?: string;
};

export type PublishingDetail = {
  scheduledRounds?: { [roundNumber: number]: ScheduledRoundDetail };
  roundLimit?: number; // only applicable to structureDetails
  published?: boolean;
  embargo?: string;
};

export type DrawPublishingDetails = {
  structureDetails?: { [key: string]: PublishingDetail }; // if no keys, all published
  stageDetails?: { [key: string]: PublishingDetail }; // if no keys, all published; stage embargo supercedes structure embargo
  publishingDetail: PublishingDetail; // draw embargo supercedes structure/stage embargo
  structureIdsToRemove?: string[];
  structureIdsToAdd?: string[];
  stagesToRemove?: string[];
  stagesToAdd?: string[];
};
