import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  SuppressedEvent,
  SuppressedEventSchema,
} from './suppressed-event.schema';
import { SuppressedEventsService } from './suppressed-events.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SuppressedEvent.name, schema: SuppressedEventSchema },
    ]),
  ],
  providers: [SuppressedEventsService],
  exports: [SuppressedEventsService],
})
export class SuppressedEventsModule {}
