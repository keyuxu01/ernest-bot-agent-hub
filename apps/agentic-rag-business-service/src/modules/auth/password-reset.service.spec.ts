import { beforeEach, describe, expect, it } from 'vitest';
import type { RedisService } from '../../infrastructure/redis/redis.service';
import { PasswordResetService } from './password-reset.service';

/** RedisService 的内存替身（不模拟过期） */
function memoryRedis() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => {
      store.set(key, value);
    },
    del: async (key: string) => {
      store.delete(key);
    },
    ttl: async () => -2,
    incr: async (key: string) => {
      const next = Number(store.get(key) ?? 0) + 1;
      store.set(key, String(next));
      return next;
    },
  };
}

const email = 'Alice@Example.com';
let service: PasswordResetService;

beforeEach(async () => {
  service = new PasswordResetService(memoryRedis() as unknown as RedisService);
  await service.set(email, '123456');
});

describe('PasswordResetService.recordFailedAttempt', () => {
  it('invalidates the code on the 3rd wrong attempt', async () => {
    await expect(service.recordFailedAttempt(email)).resolves.toBe(false);
    await expect(service.recordFailedAttempt(email)).resolves.toBe(false);
    await expect(service.verify(email, '123456')).resolves.toBe(true);

    await expect(service.recordFailedAttempt(email)).resolves.toBe(true);
    await expect(service.verify(email, '123456')).resolves.toBe(false);
  });

  it('resets the attempt count when a new code is issued', async () => {
    await service.recordFailedAttempt(email);
    await service.recordFailedAttempt(email);
    await service.set(email, '654321');

    await expect(service.recordFailedAttempt(email)).resolves.toBe(false);
    await expect(service.verify(email, '654321')).resolves.toBe(true);
  });

  it('counts attempts per email case-insensitively', async () => {
    await service.recordFailedAttempt('alice@example.com');
    await service.recordFailedAttempt('ALICE@EXAMPLE.COM');

    await expect(service.recordFailedAttempt(email)).resolves.toBe(true);
  });
});
