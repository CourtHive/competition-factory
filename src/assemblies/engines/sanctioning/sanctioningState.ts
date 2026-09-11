import { createRecordStore } from '@Functions/declaration/recordStore';

// constants and types
import { SANCTIONING_RECORD_NOT_FOUND } from '@Constants/sanctioningConstants';
import type { SanctioningRecord, SanctioningRecords } from '@Types/sanctioningTypes';

const store = createRecordStore({ idKey: 'sanctioningId', notFoundError: SANCTIONING_RECORD_NOT_FOUND });

export const getSanctioningRecords = store.getRecords as () => SanctioningRecords;
export const getSanctioningRecord = store.getRecord as (sanctioningId?: string) => SanctioningRecord | undefined;
export const setSanctioningRecord = store.setRecord as (record: SanctioningRecord) => any;
export const setSanctioningRecords = store.setRecords as (records: SanctioningRecords) => any;
export const removeSanctioningRecord = store.removeRecord;
export const getActiveSanctioningId = store.getActiveId;
export const setActiveSanctioningId = store.setActiveId;
export const getSanctioningMethods = store.getMethods;
export const setSanctioningMethods = store.setMethods;
export const resetSanctioningState = store.reset;
