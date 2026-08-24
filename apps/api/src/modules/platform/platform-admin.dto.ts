import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { FederationEnvironment } from '../../generated/prisma/enums';

const clientIdPattern = /^[a-zA-Z0-9._:-]+$/;
const certificateFingerprintPattern = /^(?:[a-fA-F0-9]{64}|(?:[a-fA-F0-9]{2}:){31}[a-fA-F0-9]{2})$/;

export class FederationClientDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsString() @MinLength(3) @MaxLength(120) @Matches(clientIdPattern) clientId!: string;
  @IsEnum(FederationEnvironment) environment!: FederationEnvironment;
  @IsBoolean() isActive!: boolean;
  @IsBoolean() mtlsRequired!: boolean;
  @IsArray()
  @ArrayMaxSize(10)
  @Matches(certificateFingerprintPattern, { each: true })
  allowedCertificateFingerprints!: string[];
}

export class FederationClientCertificateDto {
  @IsBoolean() mtlsRequired!: boolean;
  @IsArray()
  @ArrayMaxSize(10)
  @Matches(certificateFingerprintPattern, { each: true })
  allowedCertificateFingerprints!: string[];
}
