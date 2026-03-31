import { UUID } from '@Tools/UUID';

// Constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { DRAFT } from '@Constants/sanctioningConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { SanctioningRecord, TournamentProposal, Applicant } from '@Types/sanctioningTypes';

type CreateSanctioningRecordArgs = {
  sanctioningId?: string;
  governingBodyId: string;
  applicantProviderId?: string;
  applicant: Applicant;
  proposal: TournamentProposal;
  sanctioningLevel?: string;
  sanctioningPolicy?: string;
  extensions?: any[];
};

export function createSanctioningRecord({
  sanctioningId,
  governingBodyId,
  applicantProviderId,
  applicant,
  proposal,
  sanctioningLevel,
  sanctioningPolicy,
  extensions,
}: CreateSanctioningRecordArgs): { error?: any; sanctioningRecord?: SanctioningRecord; success?: boolean } {
  if (!governingBodyId) return { error: INVALID_VALUES, context: { message: 'Missing governingBodyId' } } as any;
  if (!applicant) return { error: INVALID_VALUES, context: { message: 'Missing applicant' } } as any;
  if (!proposal) return { error: INVALID_VALUES, context: { message: 'Missing proposal' } } as any;
  if (!proposal.tournamentName)
    return { error: INVALID_VALUES, context: { message: 'Missing proposal.tournamentName' } } as any;
  if (!proposal.proposedStartDate)
    return { error: INVALID_VALUES, context: { message: 'Missing proposal.proposedStartDate' } } as any;
  if (!proposal.proposedEndDate)
    return { error: INVALID_VALUES, context: { message: 'Missing proposal.proposedEndDate' } } as any;
  if (!Array.isArray(proposal.events) || proposal.events.length === 0)
    return { error: INVALID_VALUES, context: { message: 'Proposal must include at least one event' } } as any;

  const now = new Date().toISOString();

  const sanctioningRecord: SanctioningRecord = {
    sanctioningId: sanctioningId || UUID(),
    status: DRAFT,
    version: 1,
    createdAt: now,
    updatedAt: now,
    applicant,
    proposal: {
      ...proposal,
      events: proposal.events.map((e) => ({
        ...e,
        eventProposalId: e.eventProposalId || UUID(),
      })),
    },
    governingBodyId,
    applicantProviderId,
    sanctioningLevel,
    sanctioningPolicy,
    statusHistory: [
      {
        fromStatus: DRAFT,
        toStatus: DRAFT,
        transitionedAt: now,
        reason: 'Record created',
      },
    ],
    extensions: extensions ?? [],
    timeItems: [],
  };

  return { ...SUCCESS, sanctioningRecord };
}
