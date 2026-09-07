import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody } from '@nestjs/swagger';
import { StoreConfigService } from './store-config.service';
import { CreateStoreConfigDto } from './dto/create-store-config.dto';
import { UpdateStoreConfigDto } from './dto/update-store-config.dto';

@ApiTags('Store Config')
@Controller('store-config')
export class StoreConfigController {
  constructor(private readonly storeConfigService: StoreConfigService) {}

  @Post('migrate')
  @ApiOperation({ summary: 'Migrate existing store data from static config into MongoDB', description: 'One-time migration — reads STORE_MAPPING and inserts records that do not exist yet.' })
  migrateData() {
    return this.storeConfigService.migrateData();
  }

  @Post()
  @ApiOperation({ summary: 'Create a new store config record' })
  @ApiBody({ type: CreateStoreConfigDto })
  create(@Body() createDto: CreateStoreConfigDto) {
    return this.storeConfigService.create(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all store configs' })
  findAll() {
    return this.storeConfigService.findAll();
  }

  @Get(':did')
  @ApiOperation({ summary: 'Get a single store config by DID (3CX dial-no)' })
  @ApiParam({ name: 'did', example: '0872286100', description: 'The 3CX dial number identifying the store' })
  findOne(@Param('did') did: string) {
    return this.storeConfigService.findOneByDid(did);
  }

  @Patch(':did')
  @ApiOperation({ summary: 'Update a store config by DID' })
  @ApiParam({ name: 'did', example: '0872286100', description: 'The 3CX dial number identifying the store' })
  @ApiBody({ type: UpdateStoreConfigDto })
  update(@Param('did') did: string, @Body() updateDto: UpdateStoreConfigDto) {
    return this.storeConfigService.update(did, updateDto);
  }

  @Delete(':did')
  @ApiOperation({ summary: 'Delete a store config by DID' })
  @ApiParam({ name: 'did', example: '0872286100', description: 'The 3CX dial number identifying the store' })
  remove(@Param('did') did: string) {
    return this.storeConfigService.remove(did);
  }
}
