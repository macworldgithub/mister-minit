import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { StoreConfigService } from '../store-config/store-config.service';
import { StoreConfig } from '../store-config/store-config.schema';
import { SmsThreadsService } from '../sms-threads/sms-threads.service';
import { ThreadStatus } from '../sms-threads/sms-thread.schema';
import { OptOutService } from '../opt-out/opt-out.service';
import { SuppressedEventsService, SuppressPayload } from '../suppressed-events/suppressed-events.service';
import { SuppressedReason } from '../suppressed-events/suppressed-event.schema';
import { LoggingService } from '../logging/logging.service';
import { LogEventType } from '../logging/log.schema';
import { ChatbotService } from '../chatbot/chatbot.service';
import { SmsProviderService } from './sms-provider.service';

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
  _id?: any;
}

export interface InboundSmsPayload {
  from: string;
  body: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MOBILE_REGEX = /^(\+614|04)\d{8}$/;
const INTERNAL_EXTENSION_REGEX = /^\d{1,5}$/;
const OPT_OUT_KEYWORDS = new Set([
  'STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT',
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
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // PART 1 — CDR EVENT LISTENER
  // ══════════════════════════════════════════════════════════════════════════

  @OnEvent('cdr.created')
  async handleCdrCreated(cdrDocument: CdrDocument): Promise<void> {
    const callId = cdrDocument.callid;
    const dialNo = cdrDocument['dial-no'];
    const fromNo = cdrDocument['from-no'];
    const fromDn = cdrDocument['from-dn'];
    const duration = cdrDocument.duration;
    const reasonTerminated = cdrDocument['reason-terminated'];

    this.logger.log(`CDR event received — callId: ${callId}`);

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

    // ── PART 4: Answered call check ────────────────────────────────────────
    // If this is NOT a missed call but an active thread exists → close it.
    const isMissedCall = this.checkMissedCall(reasonTerminated, duration);
    if (!isMissedCall) {
      const totalSecs = this.parseDurationToSeconds(duration);
      if (totalSecs >= 10 && MOBILE_REGEX.test(fromNo)) {
        const activeThread = await this.smsThreadsService.findActiveThread(fromNo, storeId);
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

    // ── Step 3: Valid mobile ───────────────────────────────────────────────
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

    // ── Step 4: Internal extension ─────────────────────────────────────────
    if (INTERNAL_EXTENSION_REGEX.test(fromDn)) {
      await this.doSuppress({
        callerNumber: fromNo,
        did: dialNo,
        storeId,
        storeName,
        callId,
        suppressedReason: SuppressedReason.INTERNAL_EXTENSION,
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
    const existingThread = await this.smsThreadsService.findActiveThread(fromNo, storeId);

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
    const sent = await this.sendWithRetry(fromNo, openingBody, MAX_SMS_RETRIES);

    if (sent) {
      await this.smsThreadsService.setOpeningSent(threadId);
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

  async handleInboundSms(payload: InboundSmsPayload): Promise<void> {
    const { from, body } = payload;
    this.logger.log(`Inbound SMS from ${from}`);

    // ── Step 1: Global opt-out guard ───────────────────────────────────────
    if (await this.optOutService.isOptedOut(from)) {
      await this.loggingService.log(LogEventType.INBOUND_SMS_RECEIVED, {
        callerNumber: from,
        metadata: { discarded: true, reason: 'already_opted_out' },
      });
      return;
    }

    // ── Step 2: Keyword opt-out (always before LLM) ────────────────────────
    const keyword = body.trim().toUpperCase();
    if (OPT_OUT_KEYWORDS.has(keyword)) {
      await this.handleKeywordOptOut(from, keyword);
      return;
    }

    // ── Step 3: Find active thread ─────────────────────────────────────────
    // We need storeId — find the most recent thread for this number
    const recentThread = await this.findMostRecentThreadForCaller(from);
    if (!recentThread) {
      this.logger.warn(`Inbound SMS from ${from} — no active thread found. Discarding.`);
      await this.loggingService.log(LogEventType.INBOUND_SMS_RECEIVED, {
        callerNumber: from,
        metadata: { discarded: true, reason: 'no_active_thread' },
      });
      return;
    }

    const threadId = (recentThread as any)._id.toString();
    const storeId = recentThread.storeId.toString();
    const store = await this.storeConfigService.getStoreByDid(recentThread.did);

    // ── Step 4: Mark customer replied ──────────────────────────────────────
    await this.smsThreadsService.setCustomerReplied(threadId);

    // ── Step 5: Pass to chatbot ────────────────────────────────────────────
    const chatbotResponse = await this.chatbotService.handleMessage({
      callerNumber: from,
      storeRecord: store,
      conversationHistory: recentThread.conversationHistory as any[],
      newInboundMessage: body,
      messageCount: recentThread.messageCount,
      missedCallId: (recentThread as any)._id,
    });

    // ── Step 6: Handle chatbot response ───────────────────────────────────
    const storeName = store?.storeName ?? '';

    // LLM-detected opt-out
    if (chatbotResponse.optOut) {
      await this.optOutService.addOptOut({
        callerNumber: from,
        keyword: body,
        source: 'llm_detected',
        threadId,
      });
      await this.sendWithRetry(from, this.buildOptOutConfirmation(), MAX_SMS_RETRIES);
      await this.smsThreadsService.closeThread(threadId, ThreadStatus.CLOSED_OPTED_OUT);
      await this.loggingService.log(LogEventType.OPT_OUT_RECEIVED, {
        callerNumber: from,
        storeId,
        storeName,
        threadId,
        metadata: { source: 'llm_detected' },
      });
      return;
    }

    // Customer has visited — close silently, no reply
    if (chatbotResponse.threadShouldClose && chatbotResponse.closeReason === ThreadStatus.CLOSED_VISITED) {
      await this.smsThreadsService.closeThread(threadId, ThreadStatus.CLOSED_VISITED);
      await this.loggingService.log(LogEventType.THREAD_CLOSED, {
        callerNumber: from,
        storeId,
        storeName,
        threadId,
        metadata: { closeReason: ThreadStatus.CLOSED_VISITED },
      });
      return;
    }

    // Booking captured
    if (chatbotResponse.bookingIntentDetected && chatbotResponse.bookingDetails) {
      const bd = chatbotResponse.bookingDetails;
      await this.smsThreadsService.saveBooking(threadId, bd);

      // Confirm to customer
      const confirmBody = this.buildBookingConfirmation(store, bd);
      await this.sendWithRetry(from, confirmBody, MAX_SMS_RETRIES);

      // Notify each staff contact
      if (store?.staffContacts?.length) {
        const staffBody = this.buildStaffNotification(store, from, bd);
        for (const contact of store.staffContacts) {
          await this.sendWithRetry(contact.mobile, staffBody, MAX_SMS_RETRIES);
        }
      }

      await this.loggingService.log(LogEventType.BOOKING_CAPTURED, {
        callerNumber: from,
        storeId,
        storeName,
        threadId,
        metadata: { bookingDetails: bd },
      });
      await this.loggingService.log(LogEventType.STAFF_NOTIFIED, {
        callerNumber: from,
        storeId,
        storeName,
        threadId,
      });
      return;
    }

    // Normal reply
    if (chatbotResponse.replyText) {
      await this.sendWithRetry(from, chatbotResponse.replyText, MAX_SMS_RETRIES);

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

      await this.loggingService.log(LogEventType.INBOUND_SMS_RECEIVED, {
        callerNumber: from,
        storeId,
        storeName,
        threadId,
        metadata: { inboundBody: body, replyText: chatbotResponse.replyText },
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PART 3 — FOLLOW-UP SCHEDULER (runs every hour)
  // ══════════════════════════════════════════════════════════════════════════

  @Cron(CronExpression.EVERY_HOUR)
  async runFollowUpScheduler(): Promise<void> {
    this.logger.log('Follow-up scheduler tick');

    // ── Step 1: Send follow-ups ────────────────────────────────────────────
    const followUpThreads = await this.smsThreadsService.findThreadsForFollowUp();
    this.logger.log(`Follow-up candidates: ${followUpThreads.length}`);

    for (const thread of followUpThreads) {
      const threadId = (thread as any)._id.toString();
      const storeId = thread.storeId.toString();

      try {
        // Check opt-out
        if (await this.optOutService.isOptedOut(thread.callerNumber)) {
          await this.smsThreadsService.closeThread(threadId, ThreadStatus.CLOSED_OPTED_OUT);
          await this.loggingService.log(LogEventType.THREAD_CLOSED, {
            callerNumber: thread.callerNumber,
            storeId,
            threadId,
            metadata: { closeReason: ThreadStatus.CLOSED_OPTED_OUT, trigger: 'follow_up_scheduler' },
          });
          continue;
        }

        const store = await this.storeConfigService.getStoreByDid(thread.did);
        const body = this.buildFollowUpSms(store);
        await this.sendWithRetry(thread.callerNumber, body, MAX_SMS_RETRIES);
        await this.smsThreadsService.setFollowUpSent(threadId);

        await this.loggingService.log(LogEventType.FOLLOW_UP_SENT, {
          callerNumber: thread.callerNumber,
          storeId,
          storeName: store?.storeName,
          threadId,
        });
      } catch (err: any) {
        this.logger.error(`Follow-up failed for thread ${threadId}: ${err.message}`, err.stack);
      }
    }

    // ── Step 2: Close ghosted threads ─────────────────────────────────────
    const threadsToClose = await this.smsThreadsService.findThreadsToClose();
    this.logger.log(`Threads to auto-close: ${threadsToClose.length}`);

    for (const thread of threadsToClose) {
      const threadId = (thread as any)._id.toString();
      const storeId = thread.storeId.toString();

      try {
        await this.smsThreadsService.closeThread(threadId, ThreadStatus.CLOSED_NO_RESPONSE);
        await this.loggingService.log(LogEventType.THREAD_CLOSED, {
          callerNumber: thread.callerNumber,
          storeId,
          threadId,
          metadata: { closeReason: ThreadStatus.CLOSED_NO_RESPONSE },
        });
      } catch (err: any) {
        this.logger.error(`Auto-close failed for thread ${threadId}: ${err.message}`, err.stack);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  private checkMissedCall(reasonTerminated: string, duration: string): boolean {
    if (reasonTerminated !== 'src_participant_terminated') return false;
    const secs = this.parseDurationToSeconds(duration);
    return secs < 10;
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
      this.logger.error(`Failed to record suppression: ${err.message}`, err.stack);
    }
  }

  private async sendWithRetry(to: string, body: string, maxAttempts: number): Promise<boolean> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const ok = await this.smsProviderService.sendSms(to, body);
        if (ok) return true;
      } catch (err: any) {
        this.logger.warn(`SMS attempt ${attempt}/${maxAttempts} failed to ${to}: ${err.message}`);
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

  private async handleKeywordOptOut(from: string, keyword: string): Promise<void> {
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
    await this.sendWithRetry(from, this.buildOptOutConfirmation(), MAX_SMS_RETRIES);

    if (threadId) {
      await this.smsThreadsService.closeThread(threadId, ThreadStatus.CLOSED_OPTED_OUT);
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

  private buildOpeningSms(store: StoreConfig): string {
    return (
      `Hi, sorry we missed your call to Mister Minit ${store.storeName}. ` +
      `Our hours: ${store.tradingHours}. ` +
      `Find us here: ${store.googleMapsLink} ` +
      `Is there something we can help with — keys, shoe repairs, engraving, watches or sharpening? ` +
      `Reply STOP to opt out of these messages.`
    );
  }

  private buildFollowUpSms(store: StoreConfig | null): string {
    if (!store) return 'Hi, just checking in from Mister Minit — did you make it into the store?';
    return (
      `Hi, just checking in from Mister Minit ${store.storeName} — ` +
      `did you make it into the store, or is there anything else we can help with? ` +
      `Hours: ${store.tradingHours}. Find us: ${store.googleMapsLink} ` +
      `Reply STOP to opt out.`
    );
  }

  private buildOptOutConfirmation(): string {
    return (
      'You have been unsubscribed and will not receive further missed-call messages from Mister Minit. ' +
      'You can still call the store directly.'
    );
  }

  private buildBookingConfirmation(store: StoreConfig | null, bd: any): string {
    const name = store?.storeName ?? 'Mister Minit';
    const maps = store?.googleMapsLink ?? '';
    return (
      `Thanks — we've let Mister Minit ${name} know you'd like to come in ${bd.preferredTime} for ${bd.serviceType}. ` +
      `Head there at that time and the team will take care of you. ${maps}`
    );
  }

  private buildStaffNotification(store: StoreConfig, callerNumber: string, bd: any): string {
    return (
      `New booking request — Mister Minit ${store.storeName}\n` +
      `Customer: ${bd.customerName || 'Not provided'}\n` +
      `Mobile: ${callerNumber}\n` +
      `Service: ${bd.serviceType}\n` +
      `Preferred time: ${bd.preferredTime}`
    );
  }
}
