import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';

import { StoreConfigService } from '../store-config/store-config.service';
import { StoreConfig } from '../store-config/store-config.schema';
import { SmsThreadsService } from '../sms-threads/sms-threads.service';
import { ThreadStatus } from '../sms-threads/sms-thread.schema';
import { OptOutService } from '../opt-out/opt-out.service';
import {
  SuppressedEventsService,
  SuppressPayload,
} from '../suppressed-events/suppressed-events.service';
import { SuppressedReason } from '../suppressed-events/suppressed-event.schema';
import { LoggingService } from '../logging/logging.service';
import { LogEventType } from '../logging/log.schema';
import { ChatbotService } from '../chatbot/chatbot.service';
import { SmsProviderService } from './sms-provider.service';
import { MailService } from '../mail/mail.service';
import { getMissedCallRule } from '../cdr/cdr-call-outcome.util';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CdrDocument {
  callid: string;
  timestamp: string;
  duration: string;
  'time-start': string;
  'time-answered': string;
  'time-end': string;
  'reason-terminated': string;
  'from-no': string;
  'from-dn': string;
  'dial-no': string;
  'to-no'?: string;
  'to-dn'?: string;
  'reason-changed'?: string;
  'final-number'?: string;
  'final-dn'?: string;
  chain?: string;
  'from-type'?: string;
  'to-type'?: string;
  'final-type'?: string;
  'from-dispname'?: string;
  'missed-queue-calls'?: string;
  _id?: any;
}

export interface InboundSmsPayload {
  from: string;
  body: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Supports Australian mobile formats: +614..., 614..., 04..., and 014...
const MOBILE_REGEX = /^(\+?614|0[14])\d{8}$/;
// Matches internal PBX extensions (e.g., Ext.1001, 1211, 9999) on from-no
const INTERNAL_EXTENSION_REGEX = /^(\d{1,5}|ext\.?\s*\d+|\w*extension\w*)$/i;
const OPT_OUT_KEYWORDS = new Set([
  'STOP',
  'STOPALL',
  'UNSUBSCRIBE',
  'CANCEL',
  'END',
  'QUIT',
]);
const DEDUP_WINDOW_MS = 60 * 60 * 1000; // 60 minutes
const MAX_SMS_RETRIES = 3;

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class MissedCallSmsService {
  private readonly logger = new Logger(MissedCallSmsService.name);

  constructor(
    private readonly storeConfigService: StoreConfigService,
    private readonly smsThreadsService: SmsThreadsService,
    private readonly optOutService: OptOutService,
    private readonly suppressedEventsService: SuppressedEventsService,
    private readonly loggingService: LoggingService,
    private readonly chatbotService: ChatbotService,
    private readonly smsProviderService: SmsProviderService,
    private readonly eventEmitter: EventEmitter2,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // PART 1 — CDR EVENT LISTENER
  // ══════════════════════════════════════════════════════════════════════════

  @OnEvent('cdr.created')
  async onCdrCreatedEvent(cdrDocument: CdrDocument): Promise<void> {
    const isListenerEnabled =
      this.configService.get<string>('ENABLE_CDR_LISTENER') === 'true';

    if (!isListenerEnabled) {
      this.logger.debug(
        `[CDR LISTENER SUPPRESSED] Live CDR event ignored for CallId=${cdrDocument.callid}. (ENABLE_CDR_LISTENER is false)`,
      );
      return;
    }

    await this.handleCdrCreated(cdrDocument);
  }

  @OnEvent('cdr.test')
  async onCdrTestEvent(cdrDocument: CdrDocument): Promise<void> {
    this.logger.log(
      `[MANUAL TEST CDR] Processing manual test CDR event for CallId=${cdrDocument.callid}`,
    );
    await this.handleCdrCreated(cdrDocument);
  }

  async handleCdrCreated(cdrDocument: CdrDocument): Promise<void> {
    const callId = cdrDocument.callid;
    const dialNo = cdrDocument['dial-no'];
    const fromNo = cdrDocument['from-no'];
    const fromDn = cdrDocument['from-dn'];
    const duration = cdrDocument.duration;
    const reasonTerminated = cdrDocument['reason-terminated'];

    this.logger.log(
      `[CDR INGEST] Received call event: CallId=${callId}, From=${fromNo}, Dial=${dialNo}, Duration=${duration}, Reason=${reasonTerminated}, FromDN=${fromDn}`,
    );

    // ── Step 1: DID match ──────────────────────────────────────────────────
    const store = await this.storeConfigService.getStoreByDid(dialNo);
    if (!store || !store.isActive) {
      await this.doSuppress({
        callerNumber: fromNo,
        did: dialNo,
        callId,
        suppressedReason: SuppressedReason.NOT_A_PILOT_STORE,
      });
      await this.loggingService.log(LogEventType.CALL_SUPPRESSED, {
        callerNumber: fromNo,
        callId,
        metadata: { reason: SuppressedReason.NOT_A_PILOT_STORE, did: dialNo },
      });
      return;
    }

    const storeId = (store as any)._id.toString();
    const storeName = store.storeName;

    this.logger.log(
      `[CDR INGEST] Store matched: "${storeName}" (DID: ${dialNo}, StoreId: ${storeId})`,
    );

    // ── PART 4: Answered call check ────────────────────────────────────────
    // If this is NOT a missed call but an active thread exists → close it.
    const missedRule = getMissedCallRule(cdrDocument);
    const isMissedCall = missedRule !== null;
    this.logger.log(
      `[CDR OUTCOME] CallId=${callId} | FinalType=${cdrDocument['final-type'] || '-'} | FinalNo=${cdrDocument['final-number'] || '-'} | Reason=${reasonTerminated} | Duration=${duration} | Result=${isMissedCall ? `MISSED (${missedRule})` : 'ANSWERED'}`,
    );
    if (!isMissedCall) {
      const totalSecs = this.parseDurationToSeconds(duration);
      if (totalSecs >= 10 && MOBILE_REGEX.test(fromNo)) {
        const activeThread = await this.smsThreadsService.findActiveThread(
          fromNo,
          storeId,
        );
        if (activeThread) {
          await this.smsThreadsService.closeThread(
            (activeThread as any)._id.toString(),
            ThreadStatus.CLOSED_ANSWERED,
          );
          await this.loggingService.log(LogEventType.THREAD_CLOSED, {
            callerNumber: fromNo,
            storeId,
            storeName,
            callId,
            metadata: { closeReason: ThreadStatus.CLOSED_ANSWERED },
          });
          this.logger.log(`Thread closed (answered) for ${fromNo}`);
        }
      }

      // Suppress as not_missed_call
      await this.doSuppress({
        callerNumber: fromNo,
        did: dialNo,
        storeId,
        storeName,
        callId,
        suppressedReason: SuppressedReason.NOT_MISSED_CALL,
      });
      await this.loggingService.log(LogEventType.CALL_SUPPRESSED, {
        callerNumber: fromNo,
        storeId,
        storeName,
        callId,
        metadata: { reason: SuppressedReason.NOT_MISSED_CALL },
      });
      return;
    }

    // ── Step 3: Check if internal extension ────────────────────────────────
    // Check if the caller number itself is an internal extension (e.g. "Ext.1001", "1211", "9999")
    // Note: fromDn is NOT checked because 3CX populates fromDn with trunk IDs (e.g. 10001, 10008) for external calls.
    if (fromNo && INTERNAL_EXTENSION_REGEX.test(fromNo.trim())) {
      await this.doSuppress({
        callerNumber: fromNo,
        did: dialNo,
        storeId,
        storeName,
        callId,
        suppressedReason: SuppressedReason.INTERNAL_EXTENSION,
      });
      await this.loggingService.log(LogEventType.CALL_SUPPRESSED, {
        callerNumber: fromNo,
        storeId,
        storeName,
        callId,
        metadata: { reason: SuppressedReason.INTERNAL_EXTENSION },
      });
      return;
    }

    // ── Step 4: Valid Australian mobile check ──────────────────────────────
    // If not a valid Australian mobile (e.g. landlines starting with 02/03/07/08 or non-Australian numbers)
    if (!MOBILE_REGEX.test(fromNo)) {
      await this.doSuppress({
        callerNumber: fromNo,
        did: dialNo,
        storeId,
        storeName,
        callId,
        suppressedReason: SuppressedReason.NOT_MOBILE,
      });
      await this.loggingService.log(LogEventType.CALL_SUPPRESSED, {
        callerNumber: fromNo,
        storeId,
        storeName,
        callId,
        metadata: { reason: SuppressedReason.NOT_MOBILE },
      });
      return;
    }

    // ── Step 5: Opt-out ────────────────────────────────────────────────────
    const isOptedOut = await this.optOutService.isOptedOut(fromNo);
    if (isOptedOut) {
      await this.doSuppress({
        callerNumber: fromNo,
        did: dialNo,
        storeId,
        storeName,
        callId,
        suppressedReason: SuppressedReason.OPTED_OUT,
      });
      await this.loggingService.log(LogEventType.OPT_OUT_CHECKED, {
        callerNumber: fromNo,
        storeId,
        storeName,
        callId,
        metadata: { wasOptedOut: true },
      });
      return;
    }

    // ── Step 6: 60-min dedup ───────────────────────────────────────────────
    let threadId: string;
    const existingThread = await this.smsThreadsService.findActiveThread(
      fromNo,
      storeId,
    );

    if (existingThread) {
      const openingSentAt = existingThread.openingSentAt;
      if (openingSentAt) {
        const sixtyMinsAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (openingSentAt > sixtyMinsAgo) {
          await this.doSuppress({
            callerNumber: fromNo,
            did: dialNo,
            storeId,
            storeName,
            callId,
            suppressedReason: SuppressedReason.DEDUP,
          });
          await this.loggingService.log(LogEventType.DEDUP_BLOCKED, {
            callerNumber: fromNo,
            storeId,
            storeName,
            callId,
            metadata: { openingSentAt },
          });
          return;
        }
      }
      threadId = (existingThread as any)._id.toString();
    } else {
      const newThread = await this.smsThreadsService.createThread({
        callId,
        callerNumber: fromNo,
        did: dialNo,
        storeId,
      });
      threadId = (newThread as any)._id.toString();
    }

    // ── Step 7: Send opening SMS ───────────────────────────────────────────
    const openingBody = this.buildOpeningSms(store);
    this.logger.log(
      `[OPENING SMS] Triggering opening SMS to ${fromNo} for "${storeName}": "${openingBody}"`,
    );
    const sent = await this.sendWithRetry(fromNo, openingBody, MAX_SMS_RETRIES);

    if (sent) {
      await this.smsThreadsService.setOpeningSent(threadId);
      await this.smsThreadsService.appendToHistory(threadId, {
        role: 'assistant',
        content: openingBody,
        sentAt: new Date(),
      });
      await this.smsThreadsService.incrementMessageCount(threadId);
      await this.loggingService.log(LogEventType.OPENING_SMS_SENT, {
        callerNumber: fromNo,
        storeId,
        storeName,
        threadId,
        callId,
      });
    } else {
      await this.loggingService.log(LogEventType.OPENING_SMS_FAILED, {
        callerNumber: fromNo,
        storeId,
        storeName,
        threadId,
        callId,
        metadata: { alert: true, attempts: MAX_SMS_RETRIES },
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PART 2 — INBOUND SMS HANDLER
  // ══════════════════════════════════════════════════════════════════════════

  async handleInboundSms(payload: InboundSmsPayload): Promise<any> {
    const { from, body } = payload;
    this.logger.log(`[INBOUND SMS] Handling message from ${from}: "${body}"`);

    // ── Step 1: Global opt-out guard ───────────────────────────────────────
    if (await this.optOutService.isOptedOut(from)) {
      await this.loggingService.log(LogEventType.INBOUND_SMS_RECEIVED, {
        callerNumber: from,
        metadata: { discarded: true, reason: 'already_opted_out' },
      });
      return { discarded: true, reason: 'already_opted_out' };
    }

    // ── Step 2: Keyword opt-out (always before LLM) ────────────────────────
    const keyword = body.trim().toUpperCase();
    if (OPT_OUT_KEYWORDS.has(keyword)) {
      await this.handleKeywordOptOut(from, keyword);
      return {
        optOut: true,
        source: 'keyword',
        replyText: this.buildOptOutConfirmation(),
        threadShouldClose: true,
        closeReason: ThreadStatus.CLOSED_OPTED_OUT,
      };
    }

    // ── Step 3: Find active thread ─────────────────────────────────────────
    // We need storeId — find the most recent thread for this number
    const recentThread = await this.findMostRecentThreadForCaller(from);
    if (!recentThread) {
      this.logger.warn(
        `Inbound SMS from ${from} — no active thread found. Discarding.`,
      );
      await this.loggingService.log(LogEventType.INBOUND_SMS_RECEIVED, {
        callerNumber: from,
        metadata: { discarded: true, reason: 'no_active_thread' },
      });
      return { discarded: true, reason: 'no_active_thread' };
    }

    const threadId = (recentThread as any)._id.toString();
    const storeId = (recentThread.storeId || '').toString();
    let store = await this.storeConfigService.getStoreByDid(recentThread.did);
    if (!store && storeId) {
      store = await this.storeConfigService.getStoreById(storeId);
    }

    // ── Step 4: Mark customer replied ──────────────────────────────────────
    await this.smsThreadsService.setCustomerReplied(threadId);

    // ── Step 4b: Fast path — plain affirmative reply to the callback offer ─
    // e.g. "yes", "yeah", "sure", "please do", "ok". The LLM still handles every
    // other phrasing (and anything mixed with a question) below.
    if (
      this.isCallbackOfferPending(recentThread.conversationHistory) &&
      this.isAffirmativeReply(body)
    ) {
      return this.processCallbackRequest({
        from,
        body,
        threadId,
        storeId,
        store,
        replyText: null,
        source: 'affirmative_fast_path',
      });
    }

    // ── Step 5: Pass to chatbot ────────────────────────────────────────────
    const chatbotResponse = await this.chatbotService.handleMessage({
      callerNumber: from,
      storeRecord: store,
      conversationHistory: recentThread.conversationHistory,
      newInboundMessage: body,
      messageCount: recentThread.messageCount,
      missedCallId: (recentThread as any)._id,
    });

    // ── Step 6: Handle chatbot response ───────────────────────────────────
    const storeName = store?.storeName ?? '';

    this.logger.log(
      `[CHATBOT ASSISTANT] Generated reply for ${from}: "${chatbotResponse.replyText}" (BookingDetected=${chatbotResponse.bookingIntentDetected}, OptOut=${chatbotResponse.optOut})`,
    );

    // LLM-detected opt-out
    if (chatbotResponse.optOut) {
      await this.optOutService.addOptOut({
        callerNumber: from,
        keyword: body,
        source: 'llm_detected',
        threadId,
      });
      await this.sendWithRetry(
        from,
        this.buildOptOutConfirmation(),
        MAX_SMS_RETRIES,
      );
      await this.smsThreadsService.closeThread(
        threadId,
        ThreadStatus.CLOSED_OPTED_OUT,
      );
      await this.loggingService.log(LogEventType.OPT_OUT_RECEIVED, {
        callerNumber: from,
        storeId,
        storeName,
        threadId,
        metadata: { source: 'llm_detected' },
      });
      return { ...chatbotResponse, threadId };
    }

    // Customer asked for a human callback (any affirmative wording / explicit request)
    if (chatbotResponse.humanCallbackRequested) {
      return this.processCallbackRequest({
        from,
        body,
        threadId,
        storeId,
        store,
        replyText: chatbotResponse.replyText,
        source: 'llm_detected',
        chatbotResponse,
      });
    }

    // Customer has visited — send thank you reply, append to history, then close thread
    if (
      chatbotResponse.threadShouldClose &&
      chatbotResponse.closeReason === ThreadStatus.CLOSED_VISITED
    ) {
      if (chatbotResponse.replyText) {
        await this.sendWithRetry(
          from,
          chatbotResponse.replyText,
          MAX_SMS_RETRIES,
        );
        await this.smsThreadsService.appendToHistory(threadId, {
          role: 'user',
          content: body,
          sentAt: new Date(),
        });
        await this.smsThreadsService.appendToHistory(threadId, {
          role: 'assistant',
          content: chatbotResponse.replyText,
          sentAt: new Date(),
        });
      }

      await this.smsThreadsService.closeThread(
        threadId,
        ThreadStatus.CLOSED_VISITED,
      );
      await this.loggingService.log(LogEventType.THREAD_CLOSED, {
        callerNumber: from,
        storeId,
        storeName,
        threadId,
        metadata: { closeReason: ThreadStatus.CLOSED_VISITED },
      });
      return { ...chatbotResponse, threadId };
    }

    // Booking captured
    if (
      chatbotResponse.bookingIntentDetected &&
      chatbotResponse.bookingDetails
    ) {
      const bd = chatbotResponse.bookingDetails;
      await this.smsThreadsService.saveBooking(threadId, bd);

      // Confirm to customer
      const confirmBody = this.buildBookingConfirmation(store, bd);
      await this.sendWithRetry(from, confirmBody, MAX_SMS_RETRIES);

      // Notify each staff contact via SMS & Email (always)
      // If this is also an emergency escalation, mark it URGENT in subject/body
      const isUrgent = chatbotResponse.emergencyEscalation === true;
      const staffEmails = this.extractStoreEmails(store);
      this.logger.log(
        `[BOOKING REQUEST] Notifying store staff for "${this.formatStoreDisplayName(store)}" at emails: [${staffEmails.join(', ')}]`,
      );

      const emailSubject = isUrgent
        ? `⚠️ URGENT — New Booking Request — ${this.formatStoreDisplayName(store)}`
        : `New Booking Request — ${this.formatStoreDisplayName(store)}`;

      const urgentNote = isUrgent
        ? `🚨 URGENT: Customer confirmed an emergency situation — contact immediately.\n\n`
        : '';

      const emailBody =
        `${urgentNote}New booking request — ${this.formatStoreDisplayName(store)}\n` +
        `Customer: ${bd.customerName ?? 'Not provided'}\n` +
        `Mobile: ${from}\n` +
        `Service: ${bd.serviceType}\n` +
        `Preferred time: ${bd.preferredTime}`;

      if (staffEmails.length > 0) {
        await this.mailService.sendEmail(staffEmails, emailSubject, emailBody);
      }

      if (store?.staffContacts?.length) {
        store.staffContacts.forEach((contact) => {
          if (contact.mobile) {
            this.smsProviderService.sendSms(contact.mobile, emailBody);
          }
        });
      }

      await this.loggingService.log(LogEventType.BOOKING_CAPTURED, {
        callerNumber: from,
        storeId,
        storeName,
        threadId,
        metadata: {
          bookingDetails: bd,
          emergencyEscalation: chatbotResponse.emergencyEscalation,
        },
      });
      await this.loggingService.log(LogEventType.STAFF_NOTIFIED, {
        callerNumber: from,
        storeId,
        storeName,
        threadId,
      });
      return { ...chatbotResponse, threadId };
    }

    // Normal reply
    if (chatbotResponse.replyText) {
      await this.sendWithRetry(
        from,
        chatbotResponse.replyText,
        MAX_SMS_RETRIES,
      );

      await this.smsThreadsService.appendToHistory(threadId, {
        role: 'user',
        content: body,
        sentAt: new Date(),
      });
      await this.smsThreadsService.appendToHistory(threadId, {
        role: 'assistant',
        content: chatbotResponse.replyText,
        sentAt: new Date(),
      });

      await this.smsThreadsService.incrementMessageCount(threadId);

      await this.loggingService.log(LogEventType.INBOUND_SMS_RECEIVED, {
        callerNumber: from,
        storeId,
        storeName,
        threadId,
        metadata: { inboundBody: body, replyText: chatbotResponse.replyText },
      });
    }

    return { ...chatbotResponse, threadId };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PART 3 — FOLLOW-UP SCHEDULER (runs every minute)
  // ══════════════════════════════════════════════════════════════════════════

  private followUpRunning = false;

  // Runs every minute: follow-up 15 min after the opening SMS, auto-close
  // 45 min after the follow-up (see sms-threads.service constants).
  @Cron(CronExpression.EVERY_MINUTE)
  async runFollowUpScheduler(): Promise<void> {
    if (this.followUpRunning) return; // never overlap ticks (avoids double sends)
    this.followUpRunning = true;
    try {
      await this.processFollowUpsAndClosures();
    } finally {
      this.followUpRunning = false;
    }
  }

  private async processFollowUpsAndClosures(): Promise<void> {
    this.logger.debug('Follow-up scheduler tick');

    // ── Step 1: Send follow-ups ────────────────────────────────────────────
    const followUpThreads =
      await this.smsThreadsService.findThreadsForFollowUp();
    if (followUpThreads.length) {
      this.logger.log(`Follow-up candidates: ${followUpThreads.length}`);
    }

    for (const thread of followUpThreads) {
      const threadId = (thread as any)._id.toString();
      const storeId = thread.storeId.toString();

      try {
        // Check opt-out
        if (await this.optOutService.isOptedOut(thread.callerNumber)) {
          await this.smsThreadsService.closeThread(
            threadId,
            ThreadStatus.CLOSED_OPTED_OUT,
          );
          await this.loggingService.log(LogEventType.THREAD_CLOSED, {
            callerNumber: thread.callerNumber,
            storeId,
            threadId,
            metadata: {
              closeReason: ThreadStatus.CLOSED_OPTED_OUT,
              trigger: 'follow_up_scheduler',
            },
          });
          continue;
        }

        let store = await this.storeConfigService.getStoreByDid(thread.did);
        if (!store && thread.storeId) {
          store = await this.storeConfigService.getStoreById(
            thread.storeId.toString(),
          );
        }
        if (!store) continue; // skip if store not found

        const body = this.buildFollowUpSms(store);
        const sent = await this.sendWithRetry(
          thread.callerNumber,
          body,
          MAX_SMS_RETRIES,
        );
        if (!sent) {
          // Not marked as sent: retried next tick while within the safety window
          this.logger.warn(`Follow-up SMS failed for thread ${threadId}`);
          continue;
        }
        await this.smsThreadsService.setFollowUpSent(threadId);
        await this.smsThreadsService.appendToHistory(threadId, {
          role: 'assistant',
          content: body,
          sentAt: new Date(),
        });
        await this.smsThreadsService.incrementMessageCount(threadId);

        await this.loggingService.log(LogEventType.FOLLOW_UP_SENT, {
          callerNumber: thread.callerNumber,
          storeId,
          storeName: store?.storeName,
          threadId,
        });
      } catch (err: any) {
        this.logger.error(
          `Follow-up failed for thread ${threadId}: ${err.message}`,
          err.stack,
        );
      }
    }

    // ── Step 2: Close ghosted threads ─────────────────────────────────────
    const threadsToClose = await this.smsThreadsService.findThreadsToClose();
    if (threadsToClose.length) {
      this.logger.log(`Threads to auto-close: ${threadsToClose.length}`);
    }

    for (const thread of threadsToClose) {
      const threadId = (thread as any)._id.toString();
      const storeId = thread.storeId.toString();

      try {
        await this.smsThreadsService.closeThread(
          threadId,
          ThreadStatus.CLOSED_NO_RESPONSE,
        );
        await this.loggingService.log(LogEventType.THREAD_CLOSED, {
          callerNumber: thread.callerNumber,
          storeId,
          threadId,
          metadata: { closeReason: ThreadStatus.CLOSED_NO_RESPONSE },
        });
      } catch (err: any) {
        this.logger.error(
          `Auto-close failed for thread ${threadId}: ${err.message}`,
          err.stack,
        );
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  /** True when the latest assistant message offered a human callback. */
  public isCallbackOfferPending(
    history: Array<{ role: string; content: string }> | undefined,
  ): boolean {
    if (!history?.length) return false;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'assistant') {
        return /call you back/i.test(history[i].content || '');
      }
    }
    return false;
  }

  /**
   * Conservative detector for a *plain* affirmative ("yes", "yeah", "sure",
   * "please do", "ok", thumbs-up...). Every word must be affirmative vocabulary
   * and at least one must be a strong yes — anything else (questions, "no",
   * mixed content) is left to the LLM.
   */
  public isAffirmativeReply(body: string): boolean {
    const raw = (body || '').trim();
    if (!raw) return false;
    if (/^[\u{1F44D}\u{1F44C}\u2705\u{1F64F}\s]+$/u.test(raw)) return true;

    const tokens = raw
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    if (tokens.length === 0 || tokens.length > 6) return false;

    const strong = new Set([
      'yes', 'yess', 'yesss', 'yeah', 'yea', 'yep', 'yup', 'yah', 'ya', 'y',
      'sure', 'ok', 'okay', 'okey', 'please', 'pls', 'plz', 'definitely',
      'absolutely', 'ahead', 'sounds', 'call', 'ring', 'works', 'course',
    ]);
    const filler = new Set([
      'thanks', 'thank', 'you', 'thx', 'ty', 'of', 'go', 'good', 'great',
      'that', 'would', 'be', 'it', 'do', 'me', 'back', 'can', 'u', 'now',
      'a', 'to', 'fine', 'yeah', 'for', 'sure', 'like', 'i',
    ]);
    if (!tokens.every((t) => strong.has(t) || filler.has(t))) return false;
    return tokens.some((t) => strong.has(t));
  }

  /**
   * Customer wants a human: confirm to them, flag the thread and notify store
   * staff by SMS + email. The thread stays open so the conversation can continue.
   */
  private async processCallbackRequest(params: {
    from: string;
    body: string;
    threadId: string;
    storeId: string;
    store: StoreConfig | null;
    replyText: string | null;
    source: string;
    chatbotResponse?: any;
  }): Promise<any> {
    const { from, body, threadId, storeId, store, source } = params;
    const storeName = store?.storeName ?? '';

    // Use the LLM wording only when it clearly confirms a call back
    // (e.g. it also answered a question); otherwise the fixed confirmation.
    const llmReply = (params.replyText || '').trim();
    const replyText =
      llmReply && /call/i.test(llmReply)
        ? llmReply
        : this.buildCallbackConfirmation(store);

    await this.smsThreadsService.setCallbackRequested(threadId);
    await this.sendWithRetry(from, replyText, MAX_SMS_RETRIES);
    await this.smsThreadsService.appendToHistory(threadId, {
      role: 'user',
      content: body,
      sentAt: new Date(),
    });
    await this.smsThreadsService.appendToHistory(threadId, {
      role: 'assistant',
      content: replyText,
      sentAt: new Date(),
    });
    await this.smsThreadsService.incrementMessageCount(threadId);

    // Notify store staff (SMS + email)
    const staffMessage = this.buildCallbackStaffNotification(store, from);
    const staffEmails = this.extractStoreEmails(store);
    this.logger.log(
      `[CALLBACK REQUEST] Notifying store staff for "${this.formatStoreDisplayName(store)}" at emails: [${staffEmails.join(', ')}]`,
    );
    try {
      if (staffEmails.length > 0) {
        await this.mailService.sendEmail(
          staffEmails,
          `Callback Request — ${this.formatStoreDisplayName(store)}`,
          staffMessage,
        );
      }
      for (const contact of store?.staffContacts || []) {
        if (contact.mobile) {
          await this.smsProviderService.sendSms(contact.mobile, staffMessage);
        }
      }
    } catch (err: any) {
      this.logger.error(
        `Failed to notify staff of callback request for thread ${threadId}: ${err.message}`,
        err.stack,
      );
    }

    await this.loggingService.log(LogEventType.CALLBACK_REQUESTED, {
      callerNumber: from,
      storeId,
      storeName,
      threadId,
      metadata: { inboundBody: body, source },
    });
    await this.loggingService.log(LogEventType.STAFF_NOTIFIED, {
      callerNumber: from,
      storeId,
      storeName,
      threadId,
      metadata: { reason: 'callback_requested' },
    });

    return {
      ...(params.chatbotResponse || {}),
      replyText,
      humanCallbackRequested: true,
      threadId,
    };
  }

  private parseDurationToSeconds(duration: string): number {
    if (!duration || !duration.trim()) return 0;
    const parts = duration.trim().split(':');
    if (parts.length !== 3) return 0;
    const hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    const seconds = parseInt(parts[2], 10) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  }

  private async doSuppress(payload: SuppressPayload): Promise<void> {
    try {
      await this.suppressedEventsService.suppress(payload);
    } catch (err: any) {
      this.logger.error(
        `Failed to record suppression: ${err.message}`,
        err.stack,
      );
    }
  }

  private async sendWithRetry(
    to: string,
    body: string,
    maxAttempts: number,
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const ok = await this.smsProviderService.sendSms(to, body);
        if (ok) return true;
      } catch (err: any) {
        this.logger.warn(
          `SMS attempt ${attempt}/${maxAttempts} failed to ${to}: ${err.message}`,
        );
      }
    }
    this.logger.error(`All ${maxAttempts} SMS attempts failed for ${to}`);
    return false;
  }

  private async findMostRecentThreadForCaller(callerNumber: string) {
    // We search across all stores for the most recent active thread.
    // SmsThreadsService.findByCallerAndStore needs storeId — use findActiveThread
    // across all stores via a direct service call variation.
    // Since we don't have a global lookup, we rely on the thread's stored data
    // and search by callerNumber only — we add this helper method usage pattern.
    return this.smsThreadsService.findMostRecentByCallerNumber(callerNumber);
  }

  private async handleKeywordOptOut(
    from: string,
    keyword: string,
  ): Promise<void> {
    // Find most recent thread to get storeId/threadId
    const thread = await this.findMostRecentThreadForCaller(from);
    const threadId = thread ? (thread as any)._id.toString() : '';
    const storeId = thread ? thread.storeId.toString() : '';
    const storeName = '';

    await this.optOutService.addOptOut({
      callerNumber: from,
      keyword,
      source: 'keyword',
      threadId,
    });
    await this.sendWithRetry(
      from,
      this.buildOptOutConfirmation(),
      MAX_SMS_RETRIES,
    );

    if (threadId) {
      await this.smsThreadsService.closeThread(
        threadId,
        ThreadStatus.CLOSED_OPTED_OUT,
      );
    }

    await this.loggingService.log(LogEventType.OPT_OUT_RECEIVED, {
      callerNumber: from,
      storeId,
      storeName,
      threadId: threadId || undefined,
      metadata: { keyword, source: 'keyword' },
    });
  }

  // ── SMS templates ──────────────────────────────────────────────────────────

  /**
   * Extracts and normalizes all notification emails attached to the store:
   * 1. All staff contact emails on store.staffContacts
   * 2. Store-level email/emails/notificationEmail fields if present
   * 3. Fallback to DEFAULT_NOTIFICATION_EMAIL or SMTP_USER if none configured on store
   */
  public extractStoreEmails(store: StoreConfig | null): string[] {
    const emails = new Set<string>();

    const addEmail = (raw: any) => {
      if (!raw || typeof raw !== 'string') return;
      const parts = raw.split(/[,;\s]+/);
      for (const part of parts) {
        const trimmed = part.trim().toLowerCase();
        if (trimmed && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
          emails.add(trimmed);
        }
      }
    };

    // 1. All staffContacts attached to the store
    if (store?.staffContacts && Array.isArray(store.staffContacts)) {
      for (const contact of store.staffContacts) {
        if (contact?.email) {
          addEmail(contact.email);
        }
      }
    }

    // 2. Store-level email fields if present
    const storeAny = store as any;
    if (storeAny) {
      if (storeAny.email) addEmail(storeAny.email);
      if (storeAny.notificationEmail) addEmail(storeAny.notificationEmail);
      if (storeAny.storeEmail) addEmail(storeAny.storeEmail);
      if (Array.isArray(storeAny.emails)) {
        storeAny.emails.forEach(addEmail);
      }
    }

    // 3. Fallback if store has no emails configured
    if (emails.size === 0) {
      const fallbackEmail =
        this.configService.get<string>('DEFAULT_NOTIFICATION_EMAIL') ||
        this.configService.get<string>('SMTP_USER');
      if (fallbackEmail) addEmail(fallbackEmail);
    }

    return Array.from(emails);
  }

  public formatStoreDisplayName(store: StoreConfig | null): string {
    const raw = store?.storeName?.trim();
    if (!raw) return 'Mister Minit';
    if (/^mister\s+minit/i.test(raw)) return raw;
    return `Mister Minit ${raw}`;
  }

  public buildOpeningSms(store: StoreConfig): string {
    const displayName = this.formatStoreDisplayName(store);
    return [
      `Hi, sorry we missed your call to ${displayName}! How can we help you today?`,
      ``,
      `Website: https://misterminit.co`,
      `Reply STOP to opt out.`,
    ].join('\n');
  }

  public buildFollowUpSms(store: StoreConfig | null): string {
    const displayName = this.formatStoreDisplayName(store);
    return [
      `Hi, just checking in from ${displayName}! Did you still need help? I'm our smart virtual assistant and can answer anything about our services or pricing.`,
      ``,
      `Would you like one of our store team members to call you back instead? Reply YES`,
      ``,
      `Reply STOP to opt out.`,
    ].join('\n');
  }

  public buildCallbackConfirmation(store: StoreConfig | null): string {
    const displayName = this.formatStoreDisplayName(store);
    return (
      `Thanks! I've notified the team at ${displayName} — you'll receive a call back soon. ` +
      `In the meantime, feel free to message me if you have any questions.`
    );
  }

  public buildCallbackStaffNotification(
    store: StoreConfig | null,
    callerNumber: string,
  ): string {
    const displayName = this.formatStoreDisplayName(store);
    return (
      `Callback request — ${displayName}\n` +
      `Customer mobile: ${callerNumber}\n` +
      `The customer missed our call and asked for a team member to call them back. Please call them as soon as possible.`
    );
  }

  private buildOptOutConfirmation(): string {
    return (
      'You have been unsubscribed and will not receive further missed-call messages from Mister Minit. ' +
      'You can still call the store directly.'
    );
  }

  private buildBookingConfirmation(store: StoreConfig | null, bd: any): string {
    const displayName = this.formatStoreDisplayName(store);
    const maps = store?.googleMapsLink ?? '';
    return (
      `Thanks — we've let ${displayName} know you'd like to come in ${bd.preferredTime} for ${bd.serviceType}. ` +
      `Head there at that time and the team will take care of you. ${maps}`.trim()
    );
  }

  private buildStaffNotification(
    store: StoreConfig,
    callerNumber: string,
    bd: any,
  ): string {
    return (
      `New booking request — Mister Minit ${store.storeName}\n` +
      `Customer: ${bd.customerName || 'Not provided'}\n` +
      `Mobile: ${callerNumber}\n` +
      `Service: ${bd.serviceType}\n` +
      `Preferred time: ${bd.preferredTime}`
    );
  }
}
