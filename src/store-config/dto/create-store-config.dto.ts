import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StaffContactDto {
  @ApiProperty({
    example: 'Jane Smith',
    description: 'Name of the staff member',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: '0412345678',
    description: 'Mobile number of the staff member',
  })
  @IsString()
  @IsNotEmpty()
  mobile: string;

  @ApiPropertyOptional({
    example: 'jane@misterminit.com.au',
    description: 'Email address of the staff member',
  })
  @IsOptional()
  @IsString()
  email?: string;
}

export class CreateStoreConfigDto {
  @ApiProperty({
    example: '0872286100',
    description: 'The 3CX dial-no to match against',
  })
  @IsString()
  @IsNotEmpty()
  did: string;

  @ApiProperty({
    example: 'Mister Minit Westfield Doncaster',
    description: 'Full store name',
  })
  @IsString()
  @IsNotEmpty()
  storeName: string;

  @ApiProperty({
    example: 'Kiosk 204 Westfield, 297 Diagonal Rd, Oaklands Park SA 5046',
    description: 'Short address summary',
  })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({
    example:
      'Mon-Wed & Fri 9:00am–5:30pm, Thu 9:00am–9:00pm, Sat 9:00am–5:00pm, Sun 11:00am–5:00pm',
    description: 'Full trading hours string',
  })
  @IsString()
  @IsNotEmpty()
  tradingHours: string;

  @ApiPropertyOptional({
    example: 'https://goo.gl/maps/example',
    description: 'Store-specific Google Maps short link',
  })
  @IsOptional()
  @IsString()
  googleMapsLink?: string;

  @ApiPropertyOptional({
    type: [StaffContactDto],
    description: 'List of staff contacts for this store',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StaffContactDto)
  staffContacts?: StaffContactDto[];

  @ApiPropertyOptional({
    example: true,
    description: 'Whether this store is active in the pilot program',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
