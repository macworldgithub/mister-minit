import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SmsProviderService {
  private readonly logger = new Logger(SmsProviderService.name);

  /**
   * Stub implementation — always returns true.
   * Replace body with real SMS provider (e.g. Twilio, MessageBird) when ready.
   */
  async sendSms(to: string, body: string): Promise<boolean> {
    this.logger.log(`[SMS STUB] To: ${to} | Body: ${body}`);
    return true;
  }
}
