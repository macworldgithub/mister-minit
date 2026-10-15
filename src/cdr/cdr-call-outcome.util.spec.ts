import { getMissedCallRule } from './cdr-call-outcome.util';

describe('getMissedCallRule', () => {
  // ── Real 3CX records captured live on 2026-10-15 ──────────────────────────
  it('queue rang agent, nobody picked up (no_answer, 51s) → missed', () => {
    expect(
      getMissedCallRule({
        duration: '00:00:51',
        'reason-terminated': 'no_answer',
        'final-type': 'queue',
      }),
    ).toBe('queue_unanswered');
  });

  it('agent answered from queue, talked 2:02 → answered', () => {
    expect(
      getMissedCallRule({
        duration: '00:02:02',
        'reason-terminated': 'src_participant_terminated',
        'final-type': 'extension',
      }),
    ).toBeNull();
  });

  it('agent answered, talked 1:05 → answered', () => {
    expect(
      getMissedCallRule({
        duration: '00:01:05',
        'reason-terminated': 'src_participant_terminated',
        'final-type': 'extension',
      }),
    ).toBeNull();
  });

  // ── New rule ──────────────────────────────────────────────────────────────
  it('caller hung up while waiting in queue for 85s → missed', () => {
    expect(
      getMissedCallRule({
        duration: '00:01:25',
        'reason-terminated': 'src_participant_terminated',
        'final-type': 'queue',
      }),
    ).toBe('queue_unanswered');
  });

  it('final-type is case/space insensitive', () => {
    expect(
      getMissedCallRule({
        duration: '00:00:40',
        'reason-terminated': 'src_participant_terminated',
        'final-type': ' Queue ',
      }),
    ).toBe('queue_unanswered');
  });

  it('queue call ended by store side (dst_participant_terminated) → not missed', () => {
    expect(
      getMissedCallRule({
        duration: '00:00:40',
        'reason-terminated': 'dst_participant_terminated',
        'final-type': 'queue',
      }),
    ).toBeNull();
  });

  // ── Legacy behaviour must be unchanged ────────────────────────────────────
  it('legacy record, hang-up under 10s → missed', () => {
    expect(
      getMissedCallRule({
        duration: '00:00:07',
        'reason-terminated': 'src_participant_terminated',
      }),
    ).toBe('short_hangup');
  });

  it('legacy record, hang-up at exactly 10s → answered', () => {
    expect(
      getMissedCallRule({
        duration: '00:00:10',
        'reason-terminated': 'src_participant_terminated',
      }),
    ).toBeNull();
  });

  it('legacy record, long call → answered', () => {
    expect(
      getMissedCallRule({
        duration: '00:01:11',
        'reason-terminated': 'src_participant_terminated',
      }),
    ).toBeNull();
  });

  it('legacy record, empty duration with caller hang-up → missed', () => {
    expect(
      getMissedCallRule({
        duration: '',
        'reason-terminated': 'src_participant_terminated',
      }),
    ).toBe('short_hangup');
  });

  it('legacy no_answer without final-type → not missed (unchanged)', () => {
    expect(
      getMissedCallRule({
        duration: '00:00:20',
        'reason-terminated': 'no_answer',
      }),
    ).toBeNull();
  });

  it('extension final-type, short hang-up → still missed by legacy rule', () => {
    expect(
      getMissedCallRule({
        duration: '00:00:04',
        'reason-terminated': 'src_participant_terminated',
        'final-type': 'extension',
      }),
    ).toBe('short_hangup');
  });
});
