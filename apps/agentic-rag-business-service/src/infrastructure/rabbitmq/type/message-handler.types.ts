import type { ConsumeMessage } from 'amqplib';

/** 已注册队列的消费回调；抛错由 channel 转为 nack */
type MessageHandler = (msg: ConsumeMessage) => Promise<void> | void;

export type { MessageHandler };
