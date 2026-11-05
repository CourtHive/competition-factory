export { generateTieMatchUpScore } from '@Assemblies/generators/tieMatchUpScore/generateTieMatchUpScore';
export { generateScoreString } from '@Scoring/views/generateScoreString';
export { reverseScore } from '@Scoring/views/reverseScore';

// ScoringEngine
export { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
export type {
  ScoringEngineOptions,
  ScoringEngineSupplementaryState,
  CompetitionFormat,
  ServerRule,
  TimerProfile,
  TimeoutRules,
  SubstitutionRules,
  PlayerRules,
  PenaltyProfile,
  PointProfile,
} from '@Assemblies/engines/scoring/ScoringEngine';
