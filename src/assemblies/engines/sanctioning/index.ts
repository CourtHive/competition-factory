import { requestEndorsement, endorseApplication, declineEndorsement } from '@Mutate/sanctioning/endorsement';
import { activateFromSanctioning } from '@Mutate/sanctioning/activateFromSanctioning';
import { createSanctioningRecord } from '@Mutate/sanctioning/createSanctioningRecord';
import { getAvailableTransitions } from '@Query/sanctioning/getAvailableTransitions';
import { proposeAmendment, reviewAmendment } from '@Mutate/sanctioning/amendments';
import { querySanctioningRecord } from '@Query/sanctioning/getSanctioningRecord';
import { conditionallyApprove } from '@Mutate/sanctioning/conditionallyApprove';
import { removeEventProposal } from '@Mutate/sanctioning/removeEventProposal';
import { getCalendarConflicts } from '@Query/sanctioning/getCalendarConflicts';
import { updateEventProposal } from '@Mutate/sanctioning/updateEventProposal';
import { withdrawApplication } from '@Mutate/sanctioning/withdrawApplication';
import { requestModification } from '@Mutate/sanctioning/requestModification';
import { approveApplication } from '@Mutate/sanctioning/approveApplication';
import { validateProposal } from '@Validators/sanctioning/validateProposal';
import { rejectApplication } from '@Mutate/sanctioning/rejectApplication';
import { reviewApplication } from '@Mutate/sanctioning/reviewApplication';
import { submitApplication } from '@Mutate/sanctioning/submitApplication';
import { addEventProposal } from '@Mutate/sanctioning/addEventProposal';
import { getEligibleTiers } from '@Query/sanctioning/getEligibleTiers';
import { getStatusHistory } from '@Query/sanctioning/getStatusHistory';
import { getCompleteness } from '@Query/sanctioning/getCompleteness';
import { updateProposal } from '@Mutate/sanctioning/updateProposal';
import { addReviewNote } from '@Mutate/sanctioning/addReviewNote';
import { meetCondition } from '@Mutate/sanctioning/meetCondition';
import { factoryVersion } from '@Functions/global/factoryVersion';
import { executeDeclarationQueue } from '@Functions/declaration/executeDeclarationQueue';
import { registerCreatedRecord } from '@Functions/declaration/registerCreatedRecord';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import {
  getSanctioningRecords,
  getSanctioningRecord,
  setSanctioningRecord,
  setSanctioningRecords,
  removeSanctioningRecord,
  getActiveSanctioningId,
  setActiveSanctioningId,
  resetSanctioningState,
} from './sanctioningState';

import {
  transitionToPostEvent,
  submitComplianceItem,
  verifyComplianceItem,
  waiveComplianceItem,
  flagComplianceIssues,
  closeApplication,
  checkComplianceDeadlines,
} from '@Mutate/sanctioning/compliance';

// constants
import { SANCTIONING_RECORD_EXISTS } from '@Constants/sanctioningConstants';
import { SUCCESS } from '@Constants/resultConstants';

// types
import type { SanctioningRecord, SanctioningRecords, SanctioningDirectives } from '@Types/sanctioningTypes';

function resolveRecord(sanctioningId?: string): SanctioningRecord | undefined {
  return getSanctioningRecord(sanctioningId ?? getActiveSanctioningId());
}

export const sanctioningEngine = (() => {
  const engine = {
    version: () => factoryVersion(),

    // -----------------------------------------------------------------------
    // State management
    // -----------------------------------------------------------------------
    reset: () => {
      resetSanctioningState();
      return { ...SUCCESS };
    },

    getState: () => {
      return { ...SUCCESS, sanctioningRecords: makeDeepCopy(getSanctioningRecords(), false, true) };
    },

    setState: (records: SanctioningRecords) => {
      setSanctioningRecords(records);
      return { ...SUCCESS };
    },

    setSanctioningRecord: (record: SanctioningRecord) => {
      return setSanctioningRecord(record);
    },

    removeSanctioningRecord: (sanctioningId: string) => {
      return removeSanctioningRecord(sanctioningId);
    },

    setActiveSanctioningId: (sanctioningId?: string) => {
      return setActiveSanctioningId(sanctioningId);
    },

    getActiveSanctioningId: () => getActiveSanctioningId(),

    // -----------------------------------------------------------------------
    // Mutations
    // -----------------------------------------------------------------------
    createSanctioningRecord: (params: any) =>
      registerCreatedRecord({
        result: createSanctioningRecord(params),
        recordKey: 'sanctioningRecord',
        idKey: 'sanctioningId',
        getRecord: getSanctioningRecord,
        setRecord: setSanctioningRecord,
        setActiveId: setActiveSanctioningId,
        existsError: SANCTIONING_RECORD_EXISTS,
      }),

    updateProposal: (params: any) => {
      const sanctioningRecord = params.sanctioningRecord ?? resolveRecord(params.sanctioningId);
      return updateProposal({ ...params, sanctioningRecord });
    },

    addEventProposal: (params: any) => {
      const sanctioningRecord = params.sanctioningRecord ?? resolveRecord(params.sanctioningId);
      return addEventProposal({ ...params, sanctioningRecord });
    },

    removeEventProposal: (params: any) => {
      const sanctioningRecord = params.sanctioningRecord ?? resolveRecord(params.sanctioningId);
      return removeEventProposal({ ...params, sanctioningRecord });
    },

    updateEventProposal: (params: any) => {
      const sanctioningRecord = params.sanctioningRecord ?? resolveRecord(params.sanctioningId);
      return updateEventProposal({ ...params, sanctioningRecord });
    },

    // --- Workflow Transitions ---
    submitApplication: (params: any) => {
      const sanctioningRecord = params.sanctioningRecord ?? resolveRecord(params.sanctioningId);
      return submitApplication({ ...params, sanctioningRecord });
    },

    reviewApplication: (params: any) => {
      const sanctioningRecord = params.sanctioningRecord ?? resolveRecord(params.sanctioningId);
      return reviewApplication({ ...params, sanctioningRecord });
    },

    approveApplication: (params: any) => {
      const sanctioningRecord = params.sanctioningRecord ?? resolveRecord(params.sanctioningId);
      return approveApplication({ ...params, sanctioningRecord });
    },

    conditionallyApprove: (params: any) => {
      const sanctioningRecord = params.sanctioningRecord ?? resolveRecord(params.sanctioningId);
      return conditionallyApprove({ ...params, sanctioningRecord });
    },

    meetCondition: (params: any) => {
      const sanctioningRecord = params.sanctioningRecord ?? resolveRecord(params.sanctioningId);
      return meetCondition({ ...params, sanctioningRecord });
    },

    rejectApplication: (params: any) => {
      const sanctioningRecord = params.sanctioningRecord ?? resolveRecord(params.sanctioningId);
      return rejectApplication({ ...params, sanctioningRecord });
    },

    withdrawApplication: (params: any) => {
      const sanctioningRecord = params.sanctioningRecord ?? resolveRecord(params.sanctioningId);
      return withdrawApplication({ ...params, sanctioningRecord });
    },

    requestModification: (params: any) => {
      const sanctioningRecord = params.sanctioningRecord ?? resolveRecord(params.sanctioningId);
      return requestModification({ ...params, sanctioningRecord });
    },

    // --- Endorsement ---
    requestEndorsement: (params: any) => {
      const sanctioningRecord = params.sanctioningRecord ?? resolveRecord(params.sanctioningId);
      return requestEndorsement({ ...params, sanctioningRecord });
    },

    endorseApplication: (params: any) => {
      const sanctioningRecord = params.sanctioningRecord ?? resolveRecord(params.sanctioningId);
      return endorseApplication({ ...params, sanctioningRecord });
    },

    declineEndorsement: (params: any) => {
      const sanctioningRecord = params.sanctioningRecord ?? resolveRecord(params.sanctioningId);
      return declineEndorsement({ ...params, sanctioningRecord });
    },

    addReviewNote: (params: any) => {
      const sanctioningRecord = params.sanctioningRecord ?? resolveRecord(params.sanctioningId);
      return addReviewNote({ ...params, sanctioningRecord });
    },

    activateFromSanctioning: (params: any) => {
      const sanctioningRecord = params.sanctioningRecord ?? resolveRecord(params.sanctioningId);
      return activateFromSanctioning({ ...params, sanctioningRecord });
    },

    proposeAmendment: (params: any) => {
      const sanctioningRecord = params.sanctioningRecord ?? resolveRecord(params.sanctioningId);
      return proposeAmendment({ ...params, sanctioningRecord });
    },

    reviewAmendment: (params: any) => {
      const sanctioningRecord = params.sanctioningRecord ?? resolveRecord(params.sanctioningId);
      return reviewAmendment({ ...params, sanctioningRecord });
    },

    // --- Post-Event Compliance ---
    transitionToPostEvent: (params: any) => {
      const sanctioningRecord = params.sanctioningRecord ?? resolveRecord(params.sanctioningId);
      return transitionToPostEvent({ ...params, sanctioningRecord });
    },

    submitComplianceItem: (params: any) => {
      const sanctioningRecord = params.sanctioningRecord ?? resolveRecord(params.sanctioningId);
      return submitComplianceItem({ ...params, sanctioningRecord });
    },

    verifyComplianceItem: (params: any) => {
      const sanctioningRecord = params.sanctioningRecord ?? resolveRecord(params.sanctioningId);
      return verifyComplianceItem({ ...params, sanctioningRecord });
    },

    waiveComplianceItem: (params: any) => {
      const sanctioningRecord = params.sanctioningRecord ?? resolveRecord(params.sanctioningId);
      return waiveComplianceItem({ ...params, sanctioningRecord });
    },

    flagComplianceIssues: (params: any) => {
      const sanctioningRecord = params.sanctioningRecord ?? resolveRecord(params.sanctioningId);
      return flagComplianceIssues({ ...params, sanctioningRecord });
    },

    closeApplication: (params: any) => {
      const sanctioningRecord = params.sanctioningRecord ?? resolveRecord(params.sanctioningId);
      return closeApplication({ ...params, sanctioningRecord });
    },

    checkComplianceDeadlines: (params: any) => {
      const sanctioningRecord = params.sanctioningRecord ?? resolveRecord(params.sanctioningId);
      return checkComplianceDeadlines({ ...params, sanctioningRecord });
    },

    // -----------------------------------------------------------------------
    // Queries
    // -----------------------------------------------------------------------
    getSanctioningRecord: (params?: any) => {
      const sanctioningRecord = params?.sanctioningRecord ?? resolveRecord(params?.sanctioningId);
      return querySanctioningRecord({ sanctioningRecord: sanctioningRecord as SanctioningRecord });
    },

    getAvailableTransitions: (params?: any) => {
      const sanctioningRecord = params?.sanctioningRecord ?? resolveRecord(params?.sanctioningId);
      return getAvailableTransitions({ sanctioningRecord: sanctioningRecord as SanctioningRecord });
    },

    getStatusHistory: (params?: any) => {
      const sanctioningRecord = params?.sanctioningRecord ?? resolveRecord(params?.sanctioningId);
      return getStatusHistory({ sanctioningRecord: sanctioningRecord as SanctioningRecord });
    },

    getCompleteness: (params?: any) => {
      const sanctioningRecord = params?.sanctioningRecord ?? resolveRecord(params?.sanctioningId);
      return getCompleteness({ sanctioningRecord: sanctioningRecord as SanctioningRecord, ...params });
    },

    getEligibleTiers: (params: any) => {
      const sanctioningRecord = params?.sanctioningRecord ?? resolveRecord(params?.sanctioningId);
      const proposal = params.proposal ?? sanctioningRecord?.proposal;
      return getEligibleTiers({ proposal, ...params });
    },

    validateProposal: (params: any) => {
      const sanctioningRecord = params?.sanctioningRecord ?? resolveRecord(params?.sanctioningId);
      const proposal = params.proposal ?? sanctioningRecord?.proposal;
      return validateProposal({ proposal, ...params });
    },

    getCalendarConflicts: (params: any) => {
      const sanctioningRecord = params?.sanctioningRecord ?? resolveRecord(params?.sanctioningId);
      return getCalendarConflicts({ sanctioningRecord: sanctioningRecord as SanctioningRecord, ...params });
    },

    // -----------------------------------------------------------------------
    // Execution Queue
    // -----------------------------------------------------------------------
    executionQueue: (directives: SanctioningDirectives, rollbackOnError?: boolean) =>
      executeDeclarationQueue({
        engine,
        directives,
        rollbackOnError,
        getRecords: getSanctioningRecords,
        setRecords: setSanctioningRecords,
      }),
  };

  return engine;
})();

export default sanctioningEngine;
