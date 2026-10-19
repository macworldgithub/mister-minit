/**
 * Shared call-outcome rules for 3CX CDR records.
 *
 * Used by both the missed-call SMS pipeline and the CDR logs API so the
 * "missed vs answered" decision is identical everywhere.
 */

export interface CdrOutcomeInput {
  duration?: string;
  'reason-terminated'?: string;
  'final-type'?: string;
}

export type MissedCallRule =
  | 'voicemail' // ended in voicemail (no agent picked up)
  | 'ivr_drop' // ended in IVR because caller hung up before connecting to an agent
  | 'queue_unanswered' // ended while still sitting in a queue (no agent picked up)
  | 'short_hangup' // legacy rule: caller hung up in under 10 seconds
  | null; // not a missed call

/** Caller hung up OR the queue/ring timed out. */
const QUEUE_DROP_REASONS = new Set(['src_participant_terminated', 'no_answer']);

/** Legacy threshold — unchanged from the original logic. */
export const SHORT_HANGUP_SECONDS = 10;

export function parseDurationToSeconds(duration?: string): number {
  if (!duration || !duration.trim()) return 0;
  const parts = duration.trim().split(':');
  if (parts.length !== 3) return 0;
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  const seconds = parseInt(parts[2], 10) || 0;
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Returns which rule classified the call as missed, or null if it was answered.
 *
 * Rule 1 (voicemail): final-type === 'voicemail' means call rolled over to
 *   voicemail because no agent answered.
 *
 * Rule 2 (ivr_drop): final-type === 'ivr' and caller hung up (src_participant_terminated)
 *   while listening to the automated IVR menu.
 *
 * Rule 3 (queue): final-type === 'queue' means the call ended while still in a
 *   queue. Verified on live 3CX data: when an agent answers, 3CX changes
 *   final-type to 'extension'. So 'queue' at the end means no one answered,
 *   no matter how long the caller waited.
 *
 * Rule 4 (legacy, unchanged): caller hung up (src_participant_terminated)
 *   in under 10 seconds. Also covers older records with no final-type.
 */
export function getMissedCallRule(cdr: CdrOutcomeInput): MissedCallRule {
  const reason = (cdr['reason-terminated'] || '').trim();
  const finalType = (cdr['final-type'] || '').trim().toLowerCase();

  if (finalType === 'voicemail') {
    return 'voicemail';
  }

  if (finalType === 'ivr' && reason === 'src_participant_terminated') {
    return 'ivr_drop';
  }

  if (finalType === 'queue' && QUEUE_DROP_REASONS.has(reason)) {
    return 'queue_unanswered';
  }

  if (
    reason === 'src_participant_terminated' &&
    parseDurationToSeconds(cdr.duration) < SHORT_HANGUP_SECONDS
  ) {
    return 'short_hangup';
  }

  return null;
}

export function isMissedCall(cdr: CdrOutcomeInput): boolean {
  return getMissedCallRule(cdr) !== null;
}
