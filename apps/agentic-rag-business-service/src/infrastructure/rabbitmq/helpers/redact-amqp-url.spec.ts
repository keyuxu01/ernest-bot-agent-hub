import { describe, expect, it } from 'vitest';
import { redactAmqpUrl } from './redact-amqp-url';

describe('redactAmqpUrl', () => {
  it('hides the password in an AMQP URL', () => {
    expect(redactAmqpUrl('amqp://guest:s3cret@localhost:5672')).toBe(
      'amqp://guest:***@localhost:5672',
    );
  });

  it('leaves URLs without credentials unchanged', () => {
    expect(redactAmqpUrl('amqp://localhost:5672')).toBe('amqp://localhost:5672');
  });
});
