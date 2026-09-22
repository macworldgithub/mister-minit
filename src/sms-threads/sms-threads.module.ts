import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SmsThread, SmsThreadSchema } from './sms-thread.schema';
import { SmsThreadsService } from './sms-threads.service';
import { SmsThreadsController } from './sms-threads.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SmsThread.name, schema: SmsThreadSchema },
    ]),
  ],
  controllers: [SmsThreadsController],
  providers: [SmsThreadsService],
  exports: [SmsThreadsService, MongooseModule],
})
export class SmsThreadsModule {}

