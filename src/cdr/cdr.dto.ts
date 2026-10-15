import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateCdrDto {
  @IsOptional()
  @IsString()
  timestamp?: string;

  @IsNotEmpty()
  @IsString()
  callid: string;

  @IsOptional()
  @IsString()
  duration?: string;

  @IsOptional()
  @IsString()
  'time-start'?: string;

  @IsOptional()
  @IsString()
  'time-answered'?: string;

  @IsOptional()
  @IsString()
  'time-end'?: string;

  @IsOptional()
  @IsString()
  'reason-terminated'?: string;

  @IsOptional()
  @IsString()
  'from-no'?: string;

  @IsOptional()
  @IsString()
  'from-dn'?: string;

  @IsOptional()
  @IsString()
  'dial-no'?: string;

  @IsOptional()
  @IsString()
  'to-no'?: string;

  @IsOptional()
  @IsString()
  'to-dn'?: string;

  @IsOptional()
  @IsString()
  'reason-changed'?: string;

  @IsOptional()
  @IsString()
  'final-number'?: string;

  @IsOptional()
  @IsString()
  'final-dn'?: string;

  @IsOptional()
  @IsString()
  chain?: string;

  @IsOptional()
  @IsString()
  'from-type'?: string;

  @IsOptional()
  @IsString()
  'to-type'?: string;

  @IsOptional()
  @IsString()
  'final-type'?: string;

  @IsOptional()
  @IsString()
  'from-dispname'?: string;

  @IsOptional()
  @IsString()
  'missed-queue-calls'?: string;
}
