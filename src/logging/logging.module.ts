import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Log, LogSchema } from './log.schema';
import { LoggingService } from './logging.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Log.name, schema: LogSchema }]),
  ],
  providers: [LoggingService],
  exports: [LoggingService],
})
export class LoggingModule {}
