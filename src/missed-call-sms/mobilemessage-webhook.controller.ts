import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Req,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { MissedCallSmsService } from './missed-call-sms.service';

interface MobileMessageWebhookDto {
  type?: string;
  sender?: string;
  from?: string;
  from_number?: string;
  to?: string;
  message?: string;
  body?: string;
  text?: string;
  received_at?: string;
  original_message_id?: string;
  original_custom_ref?: string;
  status?: string;
  message_id?: string;
  [key: string]: any;
}

@ApiTags('MobileMessage Webhooks')
@Controller()
export class MobileMessageWebhookController {
  private readonly logger = new Logger(MobileMessageWebhookController.name);

  constructor(
    private readonly missedCallSmsService: MissedCallSmsService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Main MobileMessage Webhook Endpoint
   * Handles inbound SMS replies and delivery status callbacks.
   * Also registered with alias /sms/webhook.
   */
  @Post('webhooks/mobilemessage')
  @ApiOperation({ summary: 'Webhook endpoint for MobileMessage inbound SMS replies' })
  @HttpCode(HttpStatus.OK)
  async handleMobileMessageWebhook(
    @Body() payload: MobileMessageWebhookDto,
    @Headers('x-mm-timestamp') timestamp?: string,
    @Headers('x-mm-signature') signature?: string,
    @Req() req?: Request,
  ) {
    return this.processWebhook(payload, timestamp, signature, req);
  }

  @Post('sms/webhook')
  @HttpCode(HttpStatus.OK)
  async handleSmsWebhookAlias(
    @Body() payload: MobileMessageWebhookDto,
    @Headers('x-mm-timestamp') timestamp?: string,
    @Headers('x-mm-signature') signature?: string,
    @Req() req?: Request,
  ) {
    return this.processWebhook(payload, timestamp, signature, req);
  }

  private async processWebhook(
    payload: MobileMessageWebhookDto,
    timestamp?: string,
    signature?: string,
    req?: Request,
  ) {
    this.logger.log(`Received MobileMessage webhook: ${JSON.stringify(payload)}`);

    // 1. Optional Signature Verification
    const signingSecret = this.configService.get<string>('MOBILEMESSAGE_SIGNING_SECRET');
    if (signingSecret) {
      this.verifySignature(signingSecret, timestamp, signature, req, payload);
    }

    // 2. Check if this is a Delivery Receipt / Status webhook
    if (payload.status && !payload.message && !payload.body) {
      this.logger.log(
        `[MobileMessage] Delivery status update: MessageId=${payload.message_id}, Status=${payload.status}, To=${payload.to}`,
      );
      return { success: true, message: 'Status receipt acknowledged' };
    }

    // 3. Extract sender number and message text
    const sender =
      payload.sender || payload.from || payload.from_number || payload.source;
    const messageContent =
      payload.message || payload.body || payload.text || payload.content;

    if (!sender || messageContent === undefined || messageContent === null) {
      this.logger.warn(
        `[MobileMessage] Webhook received without sender or message content: ${JSON.stringify(payload)}`,
      );
      return {
        success: false,
        message: 'Missing sender or message content',
      };
    }

    // 4. Pass to MissedCallSmsService for conversational processing
    try {
      this.logger.log(
        `[MobileMessage] Processing inbound SMS from: ${sender} | Message: "${messageContent}"`,
      );

      const result = await this.missedCallSmsService.handleInboundSms({
        from: sender,
        body: String(messageContent).trim(),
      });

      return {
        success: true,
        message: 'Inbound message processed',
        details: {
          replySent: !!result?.replyText,
          bookingDetected: !!result?.bookingIntentDetected,
          optOut: !!result?.optOut,
        },
      };
    } catch (err: any) {
      this.logger.error(
        `[MobileMessage] Error handling inbound SMS from ${sender}: ${err.message}`,
        err.stack,
      );
      // Return 200 OK so MobileMessage does not continually retry if internal logic threw
      return {
        success: false,
        error: err.message,
      };
    }
  }

  private verifySignature(
    secret: string,
    timestamp?: string,
    signature?: string,
    req?: Request,
    payload?: any,
  ) {
    if (!timestamp || !signature) {
      this.logger.warn('[MobileMessage] Webhook missing timestamp or signature header');
      throw new UnauthorizedException('Missing signature headers');
    }

    const ts = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (isNaN(ts) || Math.abs(now - ts) > 300) {
      this.logger.warn(`[MobileMessage] Webhook timestamp expired or invalid: ${timestamp}`);
      throw new BadRequestException('Stale or invalid webhook timestamp');
    }

    // Signing string: {timestamp}.{rawBody}
    const rawBody = (req as any)?.rawBody
      ? (req as any).rawBody.toString('utf8')
      : JSON.stringify(payload);

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    if (
      expectedSignature.length !== signature.length ||
      !crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'utf8'),
        Buffer.from(signature, 'utf8'),
      )
    ) {
      this.logger.warn('[MobileMessage] Invalid webhook signature detected');
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }
}
