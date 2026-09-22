import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CdrService } from './cdr.service';
import { CdrController } from './cdr.controller';
import { Cdr, CdrSchema } from './cdr.schema';
import { StoreConfigModule } from '../store-config/store-config.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Cdr.name, schema: CdrSchema }]),
    StoreConfigModule,
  ],
  controllers: [CdrController],
  providers: [CdrService],
  exports: [CdrService],
})
export class CdrModule {}

