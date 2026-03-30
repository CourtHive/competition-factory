import { transitionCertificationStatus } from '@Mutate/officiating/transitionCertificationStatus';
import { transitionEvaluationStatus } from '@Mutate/officiating/transitionEvaluationStatus';
import { transitionAssignmentStatus } from '@Mutate/officiating/transitionAssignmentStatus';
import { addCertificationRequirement } from '@Mutate/officiating/addCertificationRequirement';
import { removeOfficialAssignment } from '@Mutate/officiating/removeOfficialAssignment';
import { getOfficialCertifications } from '@Query/officiating/getOfficialCertifications';
import { validateCertification } from '@Validators/officiating/validateCertification';
import { getOfficialAssignments } from '@Query/officiating/getOfficialAssignments';
import { getOfficialEligibility } from '@Query/officiating/getOfficialEligibility';
import { getEvaluationTemplate } from '@Query/officiating/getEvaluationTemplate';
import { getEvaluationSummary } from '@Query/officiating/getEvaluationSummary';
import { addEvaluationPolicy } from '@Mutate/officiating/addEvaluationPolicy';
import { createOfficialRecord } from '@Mutate/officiating/createOfficialRecord';
import { removeCertification } from '@Mutate/officiating/removeCertification';
import { modifyCertification } from '@Mutate/officiating/modifyCertification';
import { queryOfficialRecord } from '@Query/officiating/getOfficialRecord';
import { modifyEvaluation } from '@Mutate/officiating/modifyEvaluation';
import { removeSuspension } from '@Mutate/officiating/removeSuspension';
import { removeEvaluation } from '@Mutate/officiating/removeEvaluation';
import { addCertification } from '@Mutate/officiating/addCertification';
import { getEvaluations } from '@Query/officiating/getEvaluations';
import { factoryVersion } from '@Functions/global/factoryVersion';
import { addEvaluation } from '@Mutate/officiating/addEvaluation';
import { addSuspension } from '@Mutate/officiating/addSuspension';
import { assignOfficial } from '@Mutate/officiating/assignOfficial';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import {
  getOfficialRecords,
  getOfficialRecord,
  setOfficialRecord,
  setOfficialRecords,
  removeOfficialRecord,
  getActiveOfficialRecordId,
  setActiveOfficialRecordId,
  resetOfficiatingState,
} from './officiatingState';

// Constants
import { OFFICIAL_RECORD_EXISTS } from '@Constants/officiatingConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { OfficialRecord, OfficialRecords, OfficiatingDirectives } from '@Types/officiatingTypes';

function resolveRecord(officialRecordId?: string): OfficialRecord | undefined {
  return getOfficialRecord(officialRecordId ?? getActiveOfficialRecordId());
}

export const officiatingEngine = (() => {
  const engine = {
    version: () => factoryVersion(),

    // -----------------------------------------------------------------------
    // State management
    // -----------------------------------------------------------------------
    reset: () => {
      resetOfficiatingState();
      return { ...SUCCESS };
    },

    getState: () => {
      return { ...SUCCESS, officialRecords: makeDeepCopy(getOfficialRecords(), false, true) };
    },

    setState: (records: OfficialRecords) => {
      setOfficialRecords(records);
      return { ...SUCCESS };
    },

    setOfficialRecord: (record: OfficialRecord) => {
      return setOfficialRecord(record);
    },

    removeOfficialRecord: (officialRecordId: string) => {
      return removeOfficialRecord(officialRecordId);
    },

    setActiveOfficialRecordId: (officialRecordId?: string) => {
      return setActiveOfficialRecordId(officialRecordId);
    },

    getActiveOfficialRecordId: () => getActiveOfficialRecordId(),

    // -----------------------------------------------------------------------
    // Mutations
    // -----------------------------------------------------------------------
    createOfficialRecord: (params: any) => {
      const result = createOfficialRecord(params);
      if (result.error) return result;
      const { officialRecord } = result;
      if (!officialRecord) return result;

      const existing = getOfficialRecord(officialRecord.officialRecordId);
      if (existing) return { error: OFFICIAL_RECORD_EXISTS };

      setOfficialRecord(officialRecord);
      setActiveOfficialRecordId(officialRecord.officialRecordId);
      return result;
    },

    // --- Certifications ---
    addCertification: (params: any) => {
      const officialRecord = params.officialRecord ?? resolveRecord(params.officialRecordId);
      return addCertification({ ...params, officialRecord });
    },

    modifyCertification: (params: any) => {
      const officialRecord = params.officialRecord ?? resolveRecord(params.officialRecordId);
      return modifyCertification({ ...params, officialRecord });
    },

    removeCertification: (params: any) => {
      const officialRecord = params.officialRecord ?? resolveRecord(params.officialRecordId);
      return removeCertification({ ...params, officialRecord });
    },

    transitionCertificationStatus: (params: any) => {
      const officialRecord = params.officialRecord ?? resolveRecord(params.officialRecordId);
      return transitionCertificationStatus({ ...params, officialRecord });
    },

    // --- Evaluations ---
    addEvaluation: (params: any) => {
      const officialRecord = params.officialRecord ?? resolveRecord(params.officialRecordId);
      return addEvaluation({ ...params, officialRecord });
    },

    modifyEvaluation: (params: any) => {
      const officialRecord = params.officialRecord ?? resolveRecord(params.officialRecordId);
      return modifyEvaluation({ ...params, officialRecord });
    },

    removeEvaluation: (params: any) => {
      const officialRecord = params.officialRecord ?? resolveRecord(params.officialRecordId);
      return removeEvaluation({ ...params, officialRecord });
    },

    transitionEvaluationStatus: (params: any) => {
      const officialRecord = params.officialRecord ?? resolveRecord(params.officialRecordId);
      return transitionEvaluationStatus({ ...params, officialRecord });
    },

    // --- Assignments ---
    assignOfficial: (params: any) => {
      const officialRecord = params.officialRecord ?? resolveRecord(params.officialRecordId);
      return assignOfficial({ ...params, officialRecord });
    },

    removeOfficialAssignment: (params: any) => {
      const officialRecord = params.officialRecord ?? resolveRecord(params.officialRecordId);
      return removeOfficialAssignment({ ...params, officialRecord });
    },

    transitionAssignmentStatus: (params: any) => {
      const officialRecord = params.officialRecord ?? resolveRecord(params.officialRecordId);
      return transitionAssignmentStatus({ ...params, officialRecord });
    },

    // --- Certification Requirements ---
    addCertificationRequirement: (params: any) => {
      const officialRecord = params.officialRecord ?? resolveRecord(params.officialRecordId);
      return addCertificationRequirement({ ...params, officialRecord });
    },

    // --- Suspensions ---
    addSuspension: (params: any) => {
      const officialRecord = params.officialRecord ?? resolveRecord(params.officialRecordId);
      return addSuspension({ ...params, officialRecord });
    },

    removeSuspension: (params: any) => {
      const officialRecord = params.officialRecord ?? resolveRecord(params.officialRecordId);
      return removeSuspension({ ...params, officialRecord });
    },

    // --- Evaluation Policies ---
    addEvaluationPolicy: (params: any) => {
      const officialRecord = params.officialRecord ?? resolveRecord(params.officialRecordId);
      return addEvaluationPolicy({ ...params, officialRecord });
    },

    // -----------------------------------------------------------------------
    // Queries
    // -----------------------------------------------------------------------
    getOfficialRecord: (params?: any) => {
      const officialRecord = params?.officialRecord ?? resolveRecord(params?.officialRecordId);
      return queryOfficialRecord({ officialRecord: officialRecord as OfficialRecord });
    },

    getOfficialCertifications: (params?: any) => {
      const officialRecord = params?.officialRecord ?? resolveRecord(params?.officialRecordId);
      return getOfficialCertifications({ officialRecord: officialRecord as OfficialRecord, ...params });
    },

    validateCertification: (params: any) => {
      const officialRecord = params?.officialRecord ?? resolveRecord(params?.officialRecordId);
      return validateCertification({ ...params, officialRecord: officialRecord as OfficialRecord });
    },

    getEvaluations: (params?: any) => {
      const officialRecord = params?.officialRecord ?? resolveRecord(params?.officialRecordId);
      return getEvaluations({ officialRecord: officialRecord as OfficialRecord, ...params });
    },

    getEvaluationSummary: (params?: any) => {
      const officialRecord = params?.officialRecord ?? resolveRecord(params?.officialRecordId);
      return getEvaluationSummary({ officialRecord: officialRecord as OfficialRecord, ...params });
    },

    getOfficialEligibility: (params: any) => {
      const officialRecord = params?.officialRecord ?? resolveRecord(params?.officialRecordId);
      return getOfficialEligibility({ ...params, officialRecord: officialRecord as OfficialRecord });
    },

    getOfficialAssignments: (params?: any) => {
      const officialRecord = params?.officialRecord ?? resolveRecord(params?.officialRecordId);
      return getOfficialAssignments({ officialRecord: officialRecord as OfficialRecord, ...params });
    },

    getEvaluationTemplate: (params: any) => {
      const officialRecord = params?.officialRecord ?? resolveRecord(params?.officialRecordId);
      return getEvaluationTemplate({ ...params, officialRecord });
    },

    // -----------------------------------------------------------------------
    // Execution Queue
    // -----------------------------------------------------------------------
    executionQueue: (directives: OfficiatingDirectives, rollbackOnError?: boolean) => {
      if (!Array.isArray(directives))
        return { error: INVALID_VALUES, context: { message: 'directives must be an array' } };

      const snapshot = rollbackOnError ? makeDeepCopy(getOfficialRecords(), false, true) : undefined;

      const results: any[] = [];
      for (const directive of directives) {
        if (typeof directive !== 'object')
          return { error: INVALID_VALUES, context: { message: 'directive must be an object' } };

        const { method: methodName, pipe } = directive;
        const params: any = directive.params ? { ...directive.params } : {};

        const method = (engine as any)[methodName];
        if (!method) {
          if (snapshot) setOfficialRecords(snapshot);
          return {
            error: INVALID_VALUES,
            context: { message: `Method not found: ${methodName}` },
            rolledBack: !!snapshot,
          };
        }

        if (pipe && results.length) {
          const lastResult = results.at(-1);
          for (const pipeKey of Object.keys(pipe)) {
            if (lastResult[pipeKey] !== undefined) params[pipeKey] = lastResult[pipeKey];
          }
        }

        const result = method(params);
        if (result?.error) {
          if (snapshot) setOfficialRecords(snapshot);
          return { ...result, rolledBack: !!snapshot };
        }

        results.push({ ...result, methodName });
      }

      const success = results.every((r) => r.success);
      return { success, results };
    },
  };

  return engine;
})();

export default officiatingEngine;
