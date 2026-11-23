/** Ranking credit for a legitimate drawn match; scoring rules decide whether a tie is complete. */
export type RoundRobinDrawTallyOptions = {
  /** Fraction of a win credited in matchUpsPct. Defaults to 0.5; must be between 0 and 1. */
  drawCredit?: number;
  /** Optional standings points, separate from rally points. All three finite values are required. */
  outcomePoints?: { win: number; draw: number; loss: number };
};

/** Existing tally-policy fields remain extensible; the drawn-result contract is typed. */
export type RoundRobinTallyPolicy = RoundRobinDrawTallyOptions & {
  groupOrderKey?: string;
  tallyDirectives?: { attribute: string; [key: string]: unknown }[];
  [key: string]: unknown;
};
