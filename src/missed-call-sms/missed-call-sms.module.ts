import { Module } from '@nestjs/common';
import { MissedCallSmsService } from './missed-call-sms.service';
import { SmsProviderService } from './sms-provider.service';
import { SmsThreadsModule } from '../sms-threads/sms-threads.module';
import { OptOutModule } from '../opt-out/opt-out.module';
import { SuppressedEventsModule } from '../suppressed-events/suppressed-events.module';
import { StoreConfigModule } from '../store-config/store-config.module';
import { ChatbotModule } from '../chatbot/chatbot.module';

@Module({
  imports: [
    SmsThreadsModule,
    OptOutModule,
    SuppressedEventsModule,
    StoreConfigModule,
    ChatbotModule,
  ],
  providers: [MissedCallSmsService, SmsProviderService],
  exports: [MissedCallSmsService, SmsProviderService],
})
export class MissedCallSmsModule {}
