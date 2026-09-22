import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  SuppressedEvent,
  SuppressedEventSchema,
} from './suppressed-event.schema';
import { SuppressedEventsService } from './suppressed-events.service';
import { SuppressedEventsController } from './suppressed-events.controller';
import { OptOutModule } from '../opt-out/opt-out.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SuppressedEvent.name, schema: SuppressedEventSchema },
    ]),
    OptOutModule,
  ],
  controllers: [SuppressedEventsController],
  providers: [SuppressedEventsService],
  exports: [SuppressedEventsService],
})
export class SuppressedEventsModule {}

