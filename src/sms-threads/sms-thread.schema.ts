import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum ThreadStatus {
  PENDING = 'pending',
  SMS_SENT = 'sms_sent',
  ACTIVE = 'active',
  BOOKING_REQUESTED = 'booking_requested',
  CLOSED_VISITED = 'closed_visited',
  CLOSED_NO_RESPONSE = 'closed_no_response',
  CLOSED_OPTED_OUT = 'closed_opted_out',
  CLOSED_ANSWERED = 'closed_answered',
}

export const CLOSED_STATUSES: ThreadStatus[] = [
  ThreadStatus.CLOSED_VISITED,
  ThreadStatus.CLOSED_NO_RESPONSE,
  ThreadStatus.CLOSED_OPTED_OUT,
  ThreadStatus.CLOSED_ANSWERED,
];

// ─── Sub-documents ────────────────────────────────────────────────────────────

@Schema({ _id: false })
export class ConversationEntry {
  @Prop({ type: String, enum: ['user', 'assistant'], required: true })
  role: 'user' | 'assistant';

  @Prop({ type: String, required: true })
  content: string;

  @Prop({ type: Date, required: true })
  sentAt: Date;
}
export const ConversationEntrySchema = SchemaFactory.createForClass(ConversationEntry);

@Schema({ _id: false })
export class BookingDetails {
  @Prop({ type: String, default: null })
  customerName: string;

  @Prop({ type: String, default: null })
  preferredTime: string;

  @Prop({ type: String, default: null })
  serviceType: string;
}
export const BookingDetailsSchema = SchemaFactory.createForClass(BookingDetails);

// ─── Main Document ────────────────────────────────────────────────────────────

export type SmsThreadDocument = SmsThread & Document;

@Schema({
  collection: 'sms-threads',
  timestamps: true,
})
export class SmsThread {
  @Prop({ type: String, required: true })
  callId: string;

  @Prop({ type: String, required: true, index: true })
  callerNumber: string;

  @Prop({ type: String, required: true })
  did: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'StoreConfig', required: true })
  storeId: Types.ObjectId;

  @Prop({
    type: String,
    enum: ThreadStatus,
    default: ThreadStatus.PENDING,
    required: true,
  })
  status: ThreadStatus;

  @Prop({ type: [ConversationEntrySchema], default: [] })
  conversationHistory: ConversationEntry[];

  @Prop({ type: Number, default: 0 })
  messageCount: number;

  @Prop({ type: Boolean, default: false })
  customerReplied: boolean;

  @Prop({ type: Date, default: null })
  openingSentAt: Date;

  @Prop({ type: Date, default: null })
  lastInteractionAt: Date;

  @Prop({ type: Date, default: null })
  followUpSentAt: Date;

  @Prop({ type: Boolean, default: false })
  bookingCaptured: boolean;

  @Prop({ type: BookingDetailsSchema, default: null })
  bookingDetails: BookingDetails;

  @Prop({ type: Boolean, default: false })
  optedOut: boolean;

  @Prop({ type: String, default: null })
  optOutKeyword: string;

  @Prop({ type: Date, default: null })
  optOutAt: Date;

  @Prop({ type: Date, default: null })
  closedAt: Date;

  @Prop({ type: String, default: null })
  closedReason: string;

  // Populated by timestamps: true
  createdAt: Date;
  updatedAt: Date;
}

export const SmsThreadSchema = SchemaFactory.createForClass(SmsThread);
