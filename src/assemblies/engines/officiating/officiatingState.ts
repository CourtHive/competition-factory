import { createRecordStore } from '@Functions/declaration/recordStore';

// constants and types
import { OFFICIAL_RECORD_NOT_FOUND } from '@Constants/officiatingConstants';
import type { OfficialRecord, OfficialRecords } from '@Types/officiatingTypes';

const store = createRecordStore({ idKey: 'officialRecordId', notFoundError: OFFICIAL_RECORD_NOT_FOUND });

export const getOfficialRecords = store.getRecords as () => OfficialRecords;
export const getOfficialRecord = store.getRecord as (officialRecordId?: string) => OfficialRecord | undefined;
export const setOfficialRecord = store.setRecord as (record: OfficialRecord) => any;
export const setOfficialRecords = store.setRecords as (records: OfficialRecords) => any;
export const removeOfficialRecord = store.removeRecord;
export const getActiveOfficialRecordId = store.getActiveId;
export const setActiveOfficialRecordId = store.setActiveId;
export const getOfficiatingMethods = store.getMethods;
export const setOfficiatingMethods = store.setMethods;
export const resetOfficiatingState = store.reset;
