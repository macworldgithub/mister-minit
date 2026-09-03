import { Module } from '@nestjs/common';
import { CdrService } from './cdr.service';

@Module({
  providers: [CdrService]
})
export class CdrModule {}
