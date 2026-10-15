import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CdrDocument = Cdr & Document;

@Schema({ collection: 'cdr', timestamps: true })
export class Cdr {
  @Prop()
  timestamp: string;

  @Prop({ unique: true })
  callid: string;

  @Prop()
  duration: string;

  @Prop()
  'time-start': string;

  @Prop()
  'time-answered': string;

  @Prop()
  'time-end': string;

  @Prop()
  'reason-terminated': string;

  @Prop()
  'from-no': string;

  @Prop()
  'from-dn': string;

  @Prop()
  'dial-no': string;

  @Prop()
  'to-no': string;

  @Prop()
  'to-dn': string;

  @Prop()
  'reason-changed': string;

  @Prop()
  'final-number': string;

  @Prop()
  'final-dn': string;

  @Prop()
  chain: string;

  @Prop()
  'from-type': string;

  @Prop()
  'to-type': string;

  @Prop()
  'final-type': string;

  @Prop()
  'from-dispname': string;

  @Prop()
  'missed-queue-calls': string;
}

export const CdrSchema = SchemaFactory.createForClass(Cdr);
