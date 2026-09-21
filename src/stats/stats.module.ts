import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';
import { SmsThread, SmsThreadSchema } from '../sms-threads/sms-thread.schema';
import { Cdr, CdrSchema } from '../cdr/cdr.schema';
import { SuppressedEvent, SuppressedEventSchema } from '../suppressed-events/suppressed-event.schema';
import { OptOut, OptOutSchema } from '../opt-out/opt-out.schema';
import { StoreConfig, StoreConfigSchema } from '../store-config/store-config.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SmsThread.name, schema: SmsThreadSchema },
      { name: Cdr.name, schema: CdrSchema },
      { name: SuppressedEvent.name, schema: SuppressedEventSchema },
      { name: OptOut.name, schema: OptOutSchema },
      { name: StoreConfig.name, schema: StoreConfigSchema },
    ]),
  ],
  controllers: [StatsController],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule {}
