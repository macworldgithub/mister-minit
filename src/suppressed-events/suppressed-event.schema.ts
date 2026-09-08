import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum SuppressedReason {
  NOT_A_PILOT_STORE = 'not_a_pilot_store',
  NOT_MISSED_CALL = 'not_missed_call',
  NOT_MOBILE = 'not_mobile',
  INTERNAL_EXTENSION = 'internal_extension',
  OPTED_OUT = 'opted_out',
  DEDUP = 'dedup',
}

export type SuppressedEventDocument = SuppressedEvent & Document;

@Schema({ collection: 'suppressed-events', timestamps: { createdAt: true, updatedAt: false } })
export class SuppressedEvent {
  @Prop({ type: String, required: true })
  callerNumber: string;

  @Prop({ type: String, required: true })
  did: string;

  @Prop({ type: String, default: null })
  storeId: string;

  @Prop({ type: String, default: null })
  storeName: string;

  @Prop({ type: String, required: true })
  callId: string;

  @Prop({ type: String, enum: SuppressedReason, required: true })
  suppressedReason: SuppressedReason;

  @Prop({ type: Date })
  createdAt: Date;
}

export const SuppressedEventSchema = SchemaFactory.createForClass(SuppressedEvent);
