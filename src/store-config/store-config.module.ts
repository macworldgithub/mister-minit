import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StoreConfigService } from './store-config.service';
import { StoreConfigController } from './store-config.controller';
import { StoreConfig, StoreConfigSchema } from './store-config.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StoreConfig.name, schema: StoreConfigSchema },
    ]),
  ],
  controllers: [StoreConfigController],
  providers: [StoreConfigService],
  exports: [StoreConfigService],
})
export class StoreConfigModule {}
