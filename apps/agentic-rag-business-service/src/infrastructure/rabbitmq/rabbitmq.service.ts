import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp, {
  AmqpConnectionManager,
  ChannelWrapper,
} from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';
import {
  KG_GRAPH_EXCHANGE,
  KG_GRAPH_QUEUE,
  KG_RK_BUILD_BY_IDS,
  KG_RK_DELETE,
  RAG_REINDEX_EXCHANGE,
  RAG_REINDEX_QUEUE,
  RAG_RK_BY_IDS,
  RAG_RK_DELETE,
  SEARCH_INDEX_EXCHANGE,
  SEARCH_INDEX_QUEUE,
  SEARCH_RK_INDEX,
  SEARCH_RK_DELETE,
  RABBITMQ_CONNECT_TIMEOUT_MS,
} from './constants/rabbitmq.constants';
import { errorMessage } from './helpers/error-message';
import { redactAmqpUrl } from './helpers/redact-amqp-url';
import type { MessageHandler } from './type/message-handler.types';

/**
 * RabbitMQ 连接与拓扑
 *
 * 职责：建连、声明交换机/队列、按队列分发已注册的 handler。
 * 不解析业务消息、不执行 RAG；发布与消费适配器分别在 publisher / consumer。
 *
 * 边界：
 * - 超时连不上会抛错，阻断启动（避免“看起来在跑其实丢消息”）。
 * - 消费失败 nack 且不 requeue，避免毒消息死循环；DLQ 拓扑后续补。
 */
@Injectable()
class RabbitMqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private connection: AmqpConnectionManager | null = null;
  private channel: ChannelWrapper | null = null;
  /** queue → handler；channel setup / 晚注册都读这份表 */
  private readonly handlers = new Map<string, MessageHandler>();

  constructor(private readonly config: ConfigService) {}

  /**
   * readiness：channel 已创建且至少注册了一个消费者。
   * 只判断本进程是否接好消费，不探测 broker 当前可达（断线由连接管理器重连）。
   */
  isReady(): boolean {
    return this.channel !== null && this.handlers.size > 0;
  }

  get registeredHandlerCount(): number {
    return this.handlers.size;
  }

  /**
   * 启动握手：连 broker、建 confirm channel、把 setup 交给连接管理器。
   *
   * 本方法只跑一次。之后断线由 `amqp-connection-manager` 重连并再调 `setup`，
   * **不会**再次进入 `onModuleInit`，也不会再 new Consumer。
   * 第一次 waitForConnect 超时必须抛错，阻断 Nest 启动。
   */
  async onModuleInit(): Promise<void> {
    const url = this.config.getOrThrow<string>('RABBITMQ_URL');
    // 日志只打脱敏后的 url，真实 url 只传给 connect
    const safeUrl = redactAmqpUrl(url);

    this.logger.log(
      `正在连接 RabbitMQ：${safeUrl}（超时 ${RABBITMQ_CONNECT_TIMEOUT_MS}ms）`,
    );

    // 连接管理器：断线后自己重试；事件只观测，不在这里改业务状态
    this.connection = amqp.connect([url]);
    this.connection.on('connect', (arg) => {
      const connectedUrl =
        typeof arg === 'object' && arg && 'url' in arg
          ? String((arg as { url?: string }).url ?? url)
          : url;
      this.logger.log(`RabbitMQ 已连接：${redactAmqpUrl(connectedUrl)}`);
    });
    this.connection.on('disconnect', (err) =>
      this.logger.warn(`RabbitMQ 断开：${errorMessage(err?.err ?? err)}`),
    );
    this.connection.on('connectFailed', (err) =>
      this.logger.error(
        `RabbitMQ 连接失败：${errorMessage(err?.err ?? err)}（url=${safeUrl}）`,
      ),
    );

    this.channel = this.connection.createChannel({
      // 发布时自动 JSON 序列化，消费侧仍拿 Buffer，由 handler 自己 parse
      json: true,
      // setup 不是 onModuleInit：首次连上 + 每次重连由连接管理器再调；必须可重复执行
      setup: async (ch: ConfirmChannel) => {
        this.logger.log('RabbitMQ channel setup：声明拓扑并绑定消费者');
        await this.assertTopology(ch);
        await this.bindConsumers(ch);
      },
    });

    try {
      // waitForConnect 本身永不超时；race 一个 15s 定时器，避免 broker 没起时启动挂死
      await Promise.race([
        this.channel.waitForConnect(),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(
              new Error(
                `RabbitMQ 连接超时（${RABBITMQ_CONNECT_TIMEOUT_MS}ms）：${safeUrl}。请检查服务是否启动、5672 是否可达`,
              ),
            );
          }, RABBITMQ_CONNECT_TIMEOUT_MS);
        }),
      ]);
      this.logger.log('RabbitMQ channel 就绪');
    } catch (error) {
      this.logger.error(`RabbitMQ 初始化失败：${errorMessage(error)}`);
      // 清掉半开引用，避免 destroy / isReady 看到僵尸 channel
      await this.connection.close().catch(() => undefined);
      this.connection = null;
      this.channel = null;
      throw error;
    }
  }

  /**
   * 进程退出：先关 channel 再关 connection，避免半关连接上还挂着 confirm。
   */
  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }

  /**
   * 注册队列消费者。
   *
   * 消费者模块依赖 RabbitmqModule，后者的 onModuleInit（含 setup）必然先跑完，
   * 本队列此时还没进表。登记时 channel 已在：必须立刻 addSetup / consume。
   * 重连不走 onModuleInit，走连接管理器再次调用的 setup → bindConsumers。
   */
  registerHandler(queue: string, handler: MessageHandler): void {
    this.handlers.set(queue, handler);
    if (this.channel) {
      void this.channel.addSetup(async (ch: ConfirmChannel) => {
        await this.consumeQueue(ch, queue, handler);
      });
    }
  }

  /**
   * publisher confirm 投递。
   *
   * 失败只返回 false、不抛：文档「已发布」状态不回滚（由 DocumentService 约定）。
   * `persistent: true` 让消息落盘，broker 重启后仍在。
   */
  async publish(
    exchange: string,
    routingKey: string,
    payload: unknown,
  ): Promise<boolean> {
    if (!this.channel) {
      this.logger.warn(
        `跳过发消息（channel 未就绪）：exchange=${exchange}, rk=${routingKey}`,
      );
      return false;
    }

    try {
      await this.channel.publish(exchange, routingKey, payload, {
        contentType: 'application/json',
        // persistent：deliveryMode=2，消息落盘；与 durable 队列配套，broker 重启后尽量仍在
        // 其他 Publish 选项：expiration、priority、mandatory、headers、correlationId 等见 amqplib Options.Publish
        persistent: true,
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `发消息失败：exchange=${exchange}, rk=${routingKey}, error=${errorMessage(error)}`,
      );
      return false;
    }
  }

  /**
   * 声明 RAG / Search / KG 交换机、队列与重建/删除绑定。
   *
   * 路由：`topic` + `rag.reindex.by_ids`，后续可按空间等加 routing key，不必改交换机类型。
   *
   * assertExchange 可选参数（amqplib `Options.AssertExchange`）：
   * - `durable`：broker 重启后交换机元数据仍在（本拓扑用 true）。
   * - `internal`：true 时客户端不能直接 publish 到该交换机，只能经其他交换机路由进来；默认 false。
   * - `autoDelete`：最后一个 binding 解除后自动删交换机；临时拓扑用，生产任务队列一般 false（默认）。
   * - `alternateExchange`：无法路由的消息转投的备用交换机（AE）；未设则 mandatory=false 时静默丢弃。
   * - `arguments`：插件/扩展参数（如 alternate-exchange、自定义类型参数）。
   *
   * assertQueue 可选参数（`Options.AssertQueue`）：
   * - `durable`：重启后队列定义仍在；配合 publish 的 `persistent: true` 才尽量保留未消费消息。
   * - `exclusive`：仅声明该队列的连接可用；连接断开即删，单连接临时 reply 队列场景用。
   * - `autoDelete`：最后一个消费者取消订阅后删队列；无消费者时仍保留则 false（默认）。
   * - `messageTtl` / `expires`：消息 TTL（毫秒）、空闲队列过期时间。
   * - `deadLetterExchange` / `deadLetterRoutingKey`：拒收/过期/超长时进死信交换机（DLQ 拓扑后续补）。
   * - `maxLength` / `maxPriority` / `overflow`：队列长度、优先级上限、溢出策略（reject / drop-head 等）。
   * - `queueMode`：如 `lazy` 大 backlog 落盘优先，默认 classic。
   * - `arguments`：与上类似的底层 x-* 参数入口。
   *
   * publish 侧见 {@link publish}：`persistent: true` 对应 deliveryMode=2，消息写盘，与 durable 队列配套。
   */
  private async assertTopology(ch: ConfirmChannel): Promise<void> {
    await ch.assertExchange(RAG_REINDEX_EXCHANGE, 'topic', {
      durable: true,
      // internal / autoDelete / alternateExchange 保持默认：可直发、重启后仍在、不因解绑自删
    });
    await ch.assertQueue(RAG_REINDEX_QUEUE, {
      durable: true,
      // exclusive / autoDelete 保持默认：多连接可消费、无消费者时队列仍保留
      // deadLetter* 未设：消费 nack(requeue=false) 时消息丢弃，待接 DLQ
    });
    await ch.bindQueue(RAG_REINDEX_QUEUE, RAG_REINDEX_EXCHANGE, RAG_RK_BY_IDS);
    await ch.bindQueue(RAG_REINDEX_QUEUE, RAG_REINDEX_EXCHANGE, RAG_RK_DELETE);

    // Search 独立队列承载快照写入/删除，沿用 durable + publisher confirm。
    await ch.assertExchange(SEARCH_INDEX_EXCHANGE, 'topic', { durable: true });
    await ch.assertQueue(SEARCH_INDEX_QUEUE, { durable: true });
    await ch.bindQueue(
      SEARCH_INDEX_QUEUE,
      SEARCH_INDEX_EXCHANGE,
      SEARCH_RK_INDEX,
    );
    await ch.bindQueue(
      SEARCH_INDEX_QUEUE,
      SEARCH_INDEX_EXCHANGE,
      SEARCH_RK_DELETE,
    );
    // KG 独立队列（迁自 knowledge-hub-backend `bb867d5e`）：同样 durable，建图 / 删图两条绑定
    await ch.assertExchange(KG_GRAPH_EXCHANGE, 'topic', { durable: true });
    await ch.assertQueue(KG_GRAPH_QUEUE, { durable: true });
    await ch.bindQueue(KG_GRAPH_QUEUE, KG_GRAPH_EXCHANGE, KG_RK_BUILD_BY_IDS);
    await ch.bindQueue(KG_GRAPH_QUEUE, KG_GRAPH_EXCHANGE, KG_RK_DELETE);
    this.logger.log('RabbitMQ 拓扑已声明（RAG + Search + KG）');
  }

  /** 按 handlers 表给当前 channel 挂监听。启动第一次 setup 时常为空；重连由连接管理器再调 setup，不是再走 onModuleInit。 */
  private async bindConsumers(ch: ConfirmChannel): Promise<void> {
    for (const [queue, handler] of this.handlers.entries()) {
      await this.consumeQueue(ch, queue, handler);
    }
  }

  /**
   * 订阅单队列。
   *
   * 成功 ack；失败 `nack(msg, allUpTo=false, requeue=false)`：只丢当前条且不回队列，
   * 避免毒消息死循环。DLQ 拓扑尚未接上，失败消息目前会丢，后续补死信。
   */
  private async consumeQueue(
    ch: ConfirmChannel,
    queue: string,
    handler: MessageHandler,
  ): Promise<void> {
    await ch.consume(queue, async (msg) => {
      // broker 取消消费或 channel 关闭时回调会收到 null
      if (!msg) {
        return;
      }
      try {
        await handler(msg);
        ch.ack(msg);
      } catch (error) {
        this.logger.error(`消费失败 queue=${queue}: ${errorMessage(error)}`);
        ch.nack(msg, false, false);
      }
    });
    this.logger.log(`已注册消费者：${queue}`);
  }
}

export { RabbitMqService };
