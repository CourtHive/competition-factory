// Installed before the suite selects OUTCOME_PIPELINE. The environment is read only in this test hook.
import { noticePayloadTestMode } from './readonlyNoticePayload';

noticePayloadTestMode.enabled = process.env.NOTICE_PAYLOAD_WRITE_CHECK === '1';
