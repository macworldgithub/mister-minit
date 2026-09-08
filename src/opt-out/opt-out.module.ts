import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OptOut, OptOutSchema } from './opt-out.schema';
import { OptOutService } from './opt-out.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: OptOut.name, schema: OptOutSchema }]),
  ],
  providers: [OptOutService],
  exports: [OptOutService],
})
export class OptOutModule {}
