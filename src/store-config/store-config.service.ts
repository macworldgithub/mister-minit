import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StoreConfig, StoreConfigDocument } from './store-config.schema';
import { CreateStoreConfigDto } from './dto/create-store-config.dto';
import { UpdateStoreConfigDto } from './dto/update-store-config.dto';
import { STORE_MAPPING } from '../config/store.mapping';

@Injectable()
export class StoreConfigService {
  constructor(
    @InjectModel(StoreConfig.name) private storeConfigModel: Model<StoreConfigDocument>,
  ) {}

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

  async update(did: string, updateDto: UpdateStoreConfigDto): Promise<StoreConfig> {
    const updated = await this.storeConfigModel
      .findOneAndUpdate({ did }, updateDto, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException(`Store with did ${did} not found`);
    }
    return updated;
  }

  async remove(did: string): Promise<StoreConfig> {
    const deleted = await this.storeConfigModel.findOneAndDelete({ did }).exec();
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
          googleMapsLink: '',
          staffContacts: [
            {
              name: 'Store Contact',
              mobile: oldStore.staffContact,
              email: ''
            }
          ],
          isActive: true
        });
        await newStore.save();
        results.push({ did, status: 'inserted' });
      } else {
        results.push({ did, status: 'already_exists' });
      }
    }
    return { migrated: results.length, details: results };
  }
}
