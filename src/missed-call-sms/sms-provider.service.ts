import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class SmsProviderService {
  private readonly logger = new Logger(SmsProviderService.name);
  private readonly apiUrl = 'https://api.mobilemessage.com.au/v1/messages';

  constructor(private readonly configService: ConfigService) {}

  /**
   * Sends an SMS via MobileMessage API (https://api.mobilemessage.com.au/v1/messages).
   * Falls back to console stub if credentials are not configured.
   */
  async sendSms(to: string, body: string): Promise<boolean> {
    const username = this.configService.get<string>('MOBILEMESSAGE_USERNAME');
    const password = this.configService.get<string>('MOBILEMESSAGE_PASSWORD');
    const fromNumber = this.configService.get<string>('MOBILEMESSAGE_FROM');

    // Fallback to stub if credentials are not configured
    if (!username || !password) {
      this.logger.warn(
        `[SMS STUB] MobileMessage credentials not configured. To: ${to} | Body: ${body}`,
      );
      return true;
    }

    // Clean phone number (remove spaces, hyphens, parentheses)
    const cleanTo = to.replace(/[\s\-()]/g, '');
    const cleanSender = fromNumber ? fromNumber.replace(/[\s\-()]/g, '') : undefined;

    const idempotencyKey = crypto.randomUUID();
    const basicAuth = Buffer.from(`${username}:${password}`).toString('base64');

    const payload = {
      messages: [
        {
          to: cleanTo,
          message: body,
          ...(cleanSender ? { sender: cleanSender } : {}),
        },
      ],
    };

    try {
      this.logger.log(`[MobileMessage] Sending SMS to ${cleanTo} (sender: ${cleanSender || 'default'})...`);

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch {
        data = null;
      }

      if (!response.ok) {
        this.logger.error(
          `[MobileMessage] Failed to send SMS (HTTP ${response.status}): ${responseText}`,
        );
        return false;
      }

      const result = data?.results?.[0];
      if (result) {
        if (result.status === 'success') {
          this.logger.log(
            `[MobileMessage] SMS sent successfully to ${cleanTo}. MessageId: ${result.message_id}, Cost: ${result.cost}`,
          );
          return true;
        } else if (result.status === 'blocked') {
          this.logger.warn(
            `[MobileMessage] Recipient ${cleanTo} is unsubscribed / blocked: ${result.error || 'Recipient opted out'}`,
          );
          return false;
        } else {
          this.logger.error(
            `[MobileMessage] Error sending SMS to ${cleanTo}: ${result.error || JSON.stringify(result)}`,
          );
          return false;
        }
      }

      // If status is complete
      if (data?.status === 'complete') {
        return true;
      }

      this.logger.warn(
        `[MobileMessage] Unexpected response structure from API: ${responseText}`,
      );
      return false;
    } catch (err: any) {
      this.logger.error(
        `[MobileMessage] Network error sending SMS to ${cleanTo}: ${err.message}`,
        err.stack,
      );
      return false;
    }
  }
}
