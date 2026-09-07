import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type StoreConfigDocument = StoreConfig & Document;

@Schema({ _id: false })
export class StaffContact {
  @Prop()
  name: string;

  @Prop()
  mobile: string;

  @Prop()
  email: string;
}
export const StaffContactSchema = SchemaFactory.createForClass(StaffContact);

@Schema({ collection: 'Store_Config', timestamps: true })
export class StoreConfig {
  @Prop({ required: true, unique: true })
  did: string;

  @Prop({ required: true })
  storeName: string;

  @Prop({ required: true })
  address: string;

  @Prop({ required: true })
  tradingHours: string;

  @Prop({ default: '' })
  googleMapsLink: string;

  @Prop({ type: [StaffContactSchema], default: [] })
  staffContacts: StaffContact[];

  @Prop({ default: true })
  isActive: boolean;
}

export const StoreConfigSchema = SchemaFactory.createForClass(StoreConfig);
