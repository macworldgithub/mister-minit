import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SmsThread, SmsThreadSchema } from './sms-thread.schema';
import { SmsThreadsService } from './sms-threads.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SmsThread.name, schema: SmsThreadSchema },
    ]),
  ],
  providers: [SmsThreadsService],
  exports: [SmsThreadsService, MongooseModule],
})
export class SmsThreadsModule {}
