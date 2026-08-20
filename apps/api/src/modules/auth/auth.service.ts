import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';

@Injectable()
export class AuthService {
  constructor(private readonly config: ConfigService) {}

  async hashPassword(password: string) {
    return argon2.hash(password, {
      memoryCost: this.config.get<number>('PASSWORD_HASH_MEMORY_COST', 19_456),
      type: argon2.argon2id,
    });
  }

  async verifyPassword(hash: string, password: string) {
    return argon2.verify(hash, password);
  }
}
