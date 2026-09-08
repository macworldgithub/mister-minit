import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CdrModule } from './cdr/cdr.module';
import { ChatbotModule } from './chatbot/chatbot.module';
import { StoreConfigModule } from './store-config/store-config.module';
import { LoggingModule } from './logging/logging.module';
import { OptOutModule } from './opt-out/opt-out.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URI'),
      }),
      inject: [ConfigService],
    }),
    EventEmitterModule.forRoot(),
    LoggingModule,
    OptOutModule,
    CdrModule,
    ChatbotModule,
    StoreConfigModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
