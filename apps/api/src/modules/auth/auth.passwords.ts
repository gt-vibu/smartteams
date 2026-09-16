import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

/**
 * Credential primitives, isolated from the rest of the auth module so that callers which only
 * need to hash a password (platform onboarding, for example) gain no access to session or
 * token issuance.
 */
@Injectable()
export class PasswordService {
  private decoyHash?: Promise<string>;

  constructor(private readonly config: ConfigService) {}

  hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      memoryCost: this.config.get<number>('PASSWORD_HASH_MEMORY_COST', 19_456),
      type: argon2.argon2id,
    });
  }

  async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      // A malformed or unsupported stored hash must fail closed rather than surface a 500
      // that would tell the caller their account exists but is in a broken state.
      return false;
    }
  }

  /**
   * Burns an argon2id verification against a throwaway hash. Called when no user matched, so
   * that a missing account costs the same wall-clock time as a wrong password and the
   * account-existence timing oracle is closed. The decoy hash is computed once per process.
   */
  async verifyDecoy(password: string): Promise<false> {
    this.decoyHash ??= this.hashPassword(randomBytes(32).toString('base64url'));
    await this.verifyPassword(await this.decoyHash, password);
    return false;
  }

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
