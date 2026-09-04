import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CdrService } from './cdr.service';
import { CdrController } from './cdr.controller';
import { Cdr, CdrSchema } from './cdr.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Cdr.name, schema: CdrSchema }]),
  ],
  controllers: [CdrController],
  providers: [CdrService],
  exports: [CdrService],
})
export class CdrModule {}
