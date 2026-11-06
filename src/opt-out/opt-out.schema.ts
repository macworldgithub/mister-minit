import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OptOutDocument = OptOut & Document;

@Schema({
  collection: 'opt-outs',
  timestamps: { createdAt: true, updatedAt: false },
})
export class OptOut {
  @Prop({ type: String, required: true, index: true })
  callerNumber: string;

  @Prop({ type: String, required: true, default: 'BLOCK' })
  keyword: string;

  @Prop({ type: Date, required: true, default: () => new Date() })
  optOutAt: Date;

  @Prop({
    type: String,
    enum: ['keyword', 'llm_detected', 'manual_suppression', 'blocked'],
    required: true,
    default: 'manual_suppression',
  })
  source: 'keyword' | 'llm_detected' | 'manual_suppression' | 'blocked';

  @Prop({ type: String, required: false, default: 'manual' })
  threadId: string;

  @Prop({ type: Date })
  createdAt: Date;
}

export const OptOutSchema = SchemaFactory.createForClass(OptOut);
