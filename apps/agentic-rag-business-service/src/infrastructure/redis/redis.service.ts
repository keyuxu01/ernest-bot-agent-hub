import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(private readonly config: ConfigService) {
    const password = this.config.get<string>('REDIS_PASSWORD');
    this.client = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      password: password || undefined,
      db: this.config.get<number>('REDIS_DB', 0),
      maxRetriesPerRequest: 3,
    });
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds !== undefined) {
      await this.client.set(key, value, 'EX', ttlSeconds);
      return;
    }
    await this.client.set(key, value);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  /** 原子自增；首次创建时设置过期时间，返回自增后的值 */
  async incr(key: string, ttlSeconds?: number): Promise<number> {
    const value = await this.client.incr(key);
    if (value === 1 && ttlSeconds !== undefined) {
      await this.client.expire(key, ttlSeconds);
    }
    return value;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}

export { RedisService };
