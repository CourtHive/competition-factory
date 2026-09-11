/**
 * Availability Engine - Barrel Export
 *
 * Court availability as continuous time-based capacity streams.
 * UI-agnostic state machine for tournament scheduling.
 *
 * Renamed from TemporalEngine for factory 5.0.0 to free the "Temporal" name
 * for the TC39 Temporal API migration (targeted 5.1.0).
 */

// Core engine
export { AvailabilityEngine } from './AvailabilityEngine';

// Re-export all governor modules
export * from '@Assemblies/governors/availabilityGovernor';
