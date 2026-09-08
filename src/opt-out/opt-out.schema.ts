import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OptOutDocument = OptOut & Document;

@Schema({ collection: 'opt-outs', timestamps: { createdAt: true, updatedAt: false } })
export class OptOut {
  @Prop({ type: String, required: true, index: true })
  callerNumber: string;

  @Prop({ type: String, required: true })
  keyword: string;

  @Prop({ type: Date, required: true })
  optOutAt: Date;

  @Prop({ type: String, enum: ['keyword', 'llm_detected'], required: true })
  source: 'keyword' | 'llm_detected';

  @Prop({ type: String, required: true })
  threadId: string;

  @Prop({ type: Date })
  createdAt: Date;
}

export const OptOutSchema = SchemaFactory.createForClass(OptOut);
