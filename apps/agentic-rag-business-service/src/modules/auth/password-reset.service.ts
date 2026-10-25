import { Injectable } from '@nestjs/common';
import { RedisService } from '../../infrastructure/redis/redis.service';
import {
  RESET_CODE_MAX_ATTEMPTS,
  RESET_CODE_TTL_SECONDS,
} from './constants/auth.constants';

const RESET_CODE_PREFIX = 'password:reset:code:';
const RESET_ATTEMPTS_PREFIX = 'password:reset:attempts:';

/** 密码重置验证码（Redis 存储） */
@Injectable()
class PasswordResetService {
  constructor(private readonly redis: RedisService) {}

  private key(email: string): string {
    return `${RESET_CODE_PREFIX}${email.toLowerCase()}`;
  }

  private attemptsKey(email: string): string {
    return `${RESET_ATTEMPTS_PREFIX}${email.toLowerCase()}`;
  }

  /** 写入新验证码，并清零输错次数 */
  async set(email: string, code: string): Promise<void> {
    await this.redis.set(this.key(email), code, RESET_CODE_TTL_SECONDS);
    await this.redis.del(this.attemptsKey(email));
  }

  async get(email: string): Promise<string | null> {
    return this.redis.get(this.key(email));
  }

  async getTtl(email: string): Promise<number> {
    return this.redis.ttl(this.key(email));
  }

  async verify(email: string, code: string): Promise<boolean> {
    const stored = await this.get(email);
    return stored !== null && stored === code;
  }

  /**
   * 记录一次输错；累计达到 RESET_CODE_MAX_ATTEMPTS 时作废验证码（防暴力枚举 6 位码）
   * 计数与验证码同寿命，用 Redis INCR 保证并发下也只累计、不漏计
   * @returns true 表示本次已达上限、验证码已作废
   */
  async recordFailedAttempt(email: string): Promise<boolean> {
    const attempts = await this.redis.incr(
      this.attemptsKey(email),
      RESET_CODE_TTL_SECONDS,
    );
    if (attempts >= RESET_CODE_MAX_ATTEMPTS) {
      await this.delete(email);
      return true;
    }
    return false;
  }

  /** 删除验证码及输错次数 */
  async delete(email: string): Promise<void> {
    await this.redis.del(this.key(email));
    await this.redis.del(this.attemptsKey(email));
  }
}

export { PasswordResetService };
