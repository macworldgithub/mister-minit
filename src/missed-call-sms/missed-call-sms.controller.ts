// TEST ONLY — remove or guard before production

import { Controller, Post, Body } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MissedCallSmsService } from './missed-call-sms.service';
import { SmsThreadsService } from '../sms-threads/sms-threads.service';
import { StoreConfigService } from '../store-config/store-config.service';
import { SuppressedEventsService } from '../suppressed-events/suppressed-events.service';

@Controller('test')
export class MissedCallSmsController {
  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly missedCallSmsService: MissedCallSmsService,
    private readonly smsThreadsService: SmsThreadsService,
    private readonly storeConfigService: StoreConfigService,
    private readonly suppressedEventsService: SuppressedEventsService,
  ) {}

  // ── POST /test/missed-call ────────────────────────────────────────────────
  @Post('missed-call')
  async triggerMissedCall(
    @Body() body: { fromNo: string; dialNo: string },
  ) {
    const callId = `test-call-${Date.now()}`;

    // FIX 1: from-dn set to a non-numeric extension string so the internal-
    // extension check (< 6 digits, purely numeric) passes correctly.
    const mockCdr = {
      callid: callId,
      timestamp: new Date().toISOString(),
      duration: '00:00:05', // < 10 seconds → qualifies as missed call
      'time-start': new Date().toISOString(),
      'time-answered': '',
      'time-end': new Date().toISOString(),
      'reason-terminated': 'src_participant_terminated',
      'from-no': body.fromNo,
      'from-dn': 'test-ext',          // fixed: not a bare numeric extension
      'dial-no': body.dialNo,
    };

    // Call the handler directly and await completion
    await this.missedCallSmsService.handleCdrCreated(mockCdr);

    // Always check whether THIS specific call was suppressed
    const suppressedEvent = await this.suppressedEventsService.findByCallId(callId);
    const suppressedReason = suppressedEvent?.suppressedReason ?? null;

    // If this call was suppressed, no new thread was created by this call.
    // findMostRecentByCallerNumber may still return a pre-existing thread.
    const thisCallCreatedThread = suppressedReason === null;

    const thread = thisCallCreatedThread
      ? await this.smsThreadsService.findMostRecentByCallerNumber(body.fromNo)
      : null;

    const store = await this.storeConfigService.getStoreByDid(body.dialNo);

    // Build opening SMS text only when a thread was actually created
    const openingSmsText = thread && store ? (
      `Hi, sorry we missed your call to Mister Minit ${store.storeName}.\n` +
      `Our hours: ${store.tradingHours}.\n` +
      `Find us here: ${store.googleMapsLink}\n` +
      `Is there something we can help with — keys, shoe repairs, ` +
      `engraving, watches or sharpening?\n` +
      `Reply STOP to opt out of these messages.`
    ) : null;

    return {
      success: true,
      mockCdr,
      result: {
        threadCreated: thisCallCreatedThread,
        threadId: (thread as any)?._id ?? null,
        threadStatus: thread?.status ?? null,
        openingSentAt: thread?.openingSentAt ?? null,
        openingSmsText,
        suppressedReason,
      },
    };
  }

  // ── POST /test/inbound-sms ────────────────────────────────────────────────
  @Post('inbound-sms')
  async triggerInboundSms(
    @Body() body: { from: string; body: string },
  ) {
    const chatbotResult = await this.missedCallSmsService.handleInboundSms({
      from: body.from,
      body: body.body,
    });

    // Fetch updated thread state
    const thread = await this.smsThreadsService.findMostRecentByCallerNumber(body.from);

    return {
      success: true,
      payload: body,
      result: {
        chatbotResponse: chatbotResult,
        replyText: chatbotResult?.replyText ?? null,
        optOut: chatbotResult?.optOut ?? false,
        bookingIntentDetected: chatbotResult?.bookingIntentDetected ?? false,
        bookingDetails: chatbotResult?.bookingDetails ?? null,
        threadShouldClose: chatbotResult?.threadShouldClose ?? false,
        closeReason: chatbotResult?.closeReason ?? null,
        threadAfter: thread
          ? {
              status: thread.status,
              messageCount: thread.messageCount,
              customerReplied: thread.customerReplied,
              conversationHistory: thread.conversationHistory,
              bookingCaptured: thread.bookingCaptured,
              bookingDetails: thread.bookingDetails ?? null,
            }
          : null,
      },
    };
  }
}
