import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OptOut, OptOutSchema } from './opt-out.schema';
import { OptOutService } from './opt-out.service';
import { OptOutController } from './opt-out.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: OptOut.name, schema: OptOutSchema }]),
  ],
  controllers: [OptOutController],
  providers: [OptOutService],
  exports: [OptOutService],
})
export class OptOutModule {}
