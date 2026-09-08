import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum LogEventType {
  MISSED_CALL_DETECTED = 'MISSED_CALL_DETECTED',
  CALL_SUPPRESSED = 'CALL_SUPPRESSED',
  OPT_OUT_CHECKED = 'OPT_OUT_CHECKED',
  DEDUP_BLOCKED = 'DEDUP_BLOCKED',
  OPENING_SMS_SENT = 'OPENING_SMS_SENT',
  OPENING_SMS_FAILED = 'OPENING_SMS_FAILED',
  INBOUND_SMS_RECEIVED = 'INBOUND_SMS_RECEIVED',
  OPT_OUT_RECEIVED = 'OPT_OUT_RECEIVED',
  BOOKING_CAPTURED = 'BOOKING_CAPTURED',
  STAFF_NOTIFIED = 'STAFF_NOTIFIED',
  FOLLOW_UP_SENT = 'FOLLOW_UP_SENT',
  THREAD_CLOSED = 'THREAD_CLOSED',
  SMS_DELIVERY_UPDATE = 'SMS_DELIVERY_UPDATE',
}

export type LogDocument = Log & Document;

@Schema({ collection: 'logs', timestamps: { createdAt: true, updatedAt: false } })
export class Log {
  @Prop({ type: String, enum: LogEventType, required: true })
  eventType: LogEventType;

  @Prop({ type: String, default: null })
  callerNumber: string;

  @Prop({ type: String, default: null })
  storeId: string;

  @Prop({ type: String, default: null })
  storeName: string;

  @Prop({ type: String, default: null })
  threadId: string;

  @Prop({ type: String, default: null })
  callId: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  metadata: Record<string, any>;

  @Prop({ type: Date })
  createdAt: Date;
}

export const LogSchema = SchemaFactory.createForClass(Log);
