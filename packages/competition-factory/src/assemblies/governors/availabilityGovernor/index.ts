/**
 * Availability Governor - Barrel Export
 *
 * Utility modules for court-availability scheduling: types, rail derivation,
 * capacity curves, collision detection, conflict evaluation,
 * time granularity, plan state, validation, and factory bridge.
 *
 * Renamed from temporalGovernor for factory 5.0.0 to free the "Temporal" name
 * for the TC39 Temporal API migration (targeted 5.1.0).
 */

export * from './types';
export * from './railDerivation';
export * from './capacityCurve';
export * from './collisionDetection';
export * from './conflictEvaluators';
export * from './timeGranularity';
export * from './planState';
export * from './validationPipeline';
export * from './bridge';
