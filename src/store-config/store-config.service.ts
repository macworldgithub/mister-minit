import {
  Injectable,
  NotFoundException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StoreConfig, StoreConfigDocument } from './store-config.schema';
import { CreateStoreConfigDto } from './dto/create-store-config.dto';
import { UpdateStoreConfigDto } from './dto/update-store-config.dto';
import { STORE_MAPPING } from '../config/store.mapping';

@Injectable()
export class StoreConfigService implements OnModuleInit {
  private readonly logger = new Logger(StoreConfigService.name);

  constructor(
    @InjectModel(StoreConfig.name)
    private storeConfigModel: Model<StoreConfigDocument>,
  ) {}

  async onModuleInit() {
    try {
      this.logger.log('Syncing store configs to MongoDB...');
      await this.migrateData();
    } catch (err: any) {
      this.logger.warn(`Auto-migration on startup failed: ${err.message}`);
    }
  }

  async create(createDto: CreateStoreConfigDto): Promise<StoreConfig> {
    const created = new this.storeConfigModel(createDto);
    return created.save();
  }

  async findAll(): Promise<StoreConfig[]> {
    return this.storeConfigModel.find().exec();
  }

  async findOneByDid(did: string): Promise<StoreConfig> {
    const store = await this.storeConfigModel.findOne({ did }).exec();
    if (!store) {
      throw new NotFoundException(`Store with did ${did} not found`);
    }
    return store;
  }

  async getStoreByDid(did: string): Promise<StoreConfig | null> {
    return this.storeConfigModel.findOne({ did }).exec();
  }

  async update(
    did: string,
    updateDto: UpdateStoreConfigDto,
  ): Promise<StoreConfig> {
    const updated = await this.storeConfigModel
      .findOneAndUpdate({ did }, updateDto, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException(`Store with did ${did} not found`);
    }
    return updated;
  }

  async remove(did: string): Promise<StoreConfig> {
    const deleted = await this.storeConfigModel
      .findOneAndDelete({ did })
      .exec();
    if (!deleted) {
      throw new NotFoundException(`Store with did ${did} not found`);
    }
    return deleted;
  }

  async migrateData(): Promise<any> {
    const results: { did: string; status: string }[] = [];
    for (const did of Object.keys(STORE_MAPPING)) {
      const oldStore = STORE_MAPPING[did];
      const existing = await this.storeConfigModel.findOne({ did }).exec();

      if (!existing) {
        const newStore = new this.storeConfigModel({
          did: oldStore.did || did,
          storeName: oldStore.name,
          address: oldStore.address,
          tradingHours: oldStore.tradingHours,
          googleMapsLink: oldStore.googleMapsLink || '',
          contactPhoneNumber: oldStore.contactPhoneNumber || '',
          actionNotes: oldStore.actionNotes || '',
          bookingLink:
            oldStore.bookingLink || 'https://misterminit.co/pages/car-keys',
          staffContacts: [
            {
              name: 'Store Contact',
              mobile: oldStore.staffContact,
              email: '',
            },
          ],
          isActive: true,
        });
        await newStore.save();
        results.push({ did, status: 'inserted' });
      } else {
        existing.storeName = oldStore.name || existing.storeName;
        existing.address = oldStore.address || existing.address;
        existing.tradingHours = oldStore.tradingHours || existing.tradingHours;
        if (oldStore.googleMapsLink && !existing.googleMapsLink) {
          existing.googleMapsLink = oldStore.googleMapsLink;
        }
        existing.contactPhoneNumber =
          oldStore.contactPhoneNumber || existing.contactPhoneNumber || '';
        existing.actionNotes =
          oldStore.actionNotes || existing.actionNotes || '';
        existing.bookingLink =
          oldStore.bookingLink ||
          existing.bookingLink ||
          'https://misterminit.co/pages/car-keys';
        await existing.save();
        results.push({ did, status: 'updated' });
      }
    }
    return { migrated: results.length, details: results };
  }
}
