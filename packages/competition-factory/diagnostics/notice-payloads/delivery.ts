import { noticePayloadTestMode, readonlyNoticeValue } from './readonlyNoticePayload';
import { OUTCOME_PIPELINE_DIFFERENTIAL, type OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { INVALID_VALUES, type ErrorType } from '@Constants/errorConditionConstants';

let differentialCheck = false;

type Selector = (mode?: OutcomePipelineMode) => { success?: boolean; error?: ErrorType };
export function withNoticeAudit(select: Selector) {
  return (mode?: OutcomePipelineMode, options?: { checkNoticePayloadWrites?: boolean }): ReturnType<Selector> => {
    const check = options?.checkNoticePayloadWrites === true;
    if (check && mode !== OUTCOME_PIPELINE_DIFFERENTIAL) return { error: INVALID_VALUES };
    const result = select(mode);
    if (result.success) differentialCheck = check;
    return result;
  };
}

export function noticeValue<T>(value: T): T {
  return differentialCheck || noticePayloadTestMode.enabled ? readonlyNoticeValue(value) : value;
}

export function deliverNotice<T>(payload: T, deliver: (value: T) => unknown) {
  // A checked synchronous subscriber throws into notifySubscribers; an async subscriber keeps its rejection.
  if (differentialCheck || noticePayloadTestMode.enabled) return Promise.resolve(deliver(readonlyNoticeValue(payload)));
  return ordinaryDelivery();
  async function ordinaryDelivery() {
    return deliver(payload);
  }
}
