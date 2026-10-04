# RabbitMQ 使用指南（从零看本仓库）

本文面向 MQ 知识约等于 0 的读者。所有概念都对照
`apps/agentic-rag-business-service` 里已经落地的代码，不讲用不到的抽象。

决策背景见 [ADR-0007](../architecture/decisions/0007-use-rabbitmq.md) 和
[ADR-0016](../architecture/decisions/0016-use-elasticsearch-for-rag-chunks.md)。
本文只讲：**它是什么、这条链路怎么跑、你怎么用。**

## 为什么需要 MQ

文档发布如果同步做完「写库 + 分块 + Embedding + 写 ES」，HTTP 会卡住几秒到几十秒，
Embedding 失败还会把「已发布」一起拖垮。

所以本仓库拆成两步：

1. HTTP 只把文档标成 `Published`，立刻返回。
2. 丢一条**命令**到 RabbitMQ：「请按这些文档 ID 重建 RAG 索引」。
3. 消费者自己去 Postgres / Mongo 拉正文，再分块、向量化、写入 ES。

```text
用户 PUT /documents/:id/publish
        │
        ▼
DocumentService          ① 先写库：status = Published
        │
        ▼
DocumentPipelinePublisher ② 再投递命令（只带 ID，不带正文）
        │
        ▼
    RabbitMQ broker       ③ 消息落盘排队
        │
        ▼
DocumentPipelineConsumer  ④ 解析命令
        │
        ▼
PipelineOrchestrator      ⑤ 分块 → Embedding → ES kh_chunk
```

HTTP 和 RAG 解耦：发布接口快；消费者挂了，消息还在队列里，进程起来后继续做。

## 名词对照（只记本仓库用到的）


| 名词                   | 一句话                                          | 本仓库里是谁                                    |
| -------------------- | -------------------------------------------- | ----------------------------------------- |
| Broker               | 独立跑着的中间人服务：先收下、再存好、后转出                       | Compose 里的 `agent_hub_rabbitmq`，端口 `5672` |
| Connection           | 本进程到 broker 的 TCP 连接                         | `RabbitMqService.connection`              |
| Channel              | 挂在连接上的工作通道，真正 publish / consume              | `RabbitMqService.channel`                 |
| Exchange             | 邮局分拣口。发布只打到交换机，不直写队列                         | `rag.reindex.exchange`                    |
| Routing key          | 信封上的地址标签                                     | `rag.reindex.by_ids`                      |
| Queue                | 信箱。消息在这里排队等消费者                               | `kh.rag.reindex.queue`                    |
| Binding              | 「这个地址的信进这个信箱」                                | exchange + rk → queue                     |
| Producer / Publisher | 发信的人                                         | `DocumentPipelinePublisher`               |
| `afterPublish`       | 文档已写成 Published **之后**，往 MQ 丢重建命令            | `DocumentPipelinePublisher.afterPublish`  |
| Consumer             | 取信并干活的人                                      | `DocumentPipelineConsumer`                |
| Handler              | 本进程里「这个队列名该调哪个函数」                             | `handlers` Map 里的 `handleRag`             |
| `consumeQueue`       | 给队列挂监听，相当于 `emitter.on('message', fn)`         | `RabbitMqService` 里的 `ch.consume`         |
| Ack                  | 「这封信我处理完了，可以丢掉」                              | `ch.ack(msg)`                             |
| Nack                 | 「这封信我处理失败了」                                  | `ch.nack(msg, false, false)`              |
| Persistent / Durable | 消息 / 拓扑落盘，broker 重启还在                        | `persistent: true`、`durable: true`        |
| Publisher confirm    | broker 确认「我收到了」后，publish 的 Promise 才 resolve | `channel.publish(...)`                    |
| Ready                | 还在队列里、没交给任何消费者                               | 管理台队列的 Ready 列                            |
| Unacked              | 已投给某个实例，等它 `ack` / `nack`                    | 管理台队列的 Unacked 列                          |
| Competing consumer   | 多个进程 `consume` **同一条队列**，broker 分流 Ready     | 多开几个 Nest 实例时的默认行为                        |


### Broker 为什么是「中间那个」

Publisher 和 Consumer 都是本仓库里的 Nest 代码，**彼此不直接打电话**。
中间必须有一个独立进程替它们保管消息，这个进程就叫 broker（本机是 Docker 里的 RabbitMQ）。

没有它，发布接口必须当场等到分块 / Embedding 做完；有了它，发布方把信放下就能走。

```mermaid
sequenceDiagram
  participant Publisher as Publisher<br/>afterPublish(documentId)
  participant Broker as Broker<br/>agent_hub_rabbitmq :5672
  participant Consumer as Consumer<br/>handleRag(msg)

  Publisher->>Broker: 1. 收 publish(...)
  Note over Broker: 2. 存 durable 队列（落盘）
  Broker->>Consumer: 3. 转 deliver
  Consumer-->>Broker: ack / nack
  Note over Broker: 处理完才从队列删掉
```

把它想成邮局，不要想成「两边代码之间的函数调用」：

| 生活里 | 本仓库 |
| --- | --- |
| 你把信投进邮筒就走 | Publisher `publish` 返回，HTTP 已经 200 |
| 邮局分拣、暂存 | Exchange 按 routing key 放进 Queue |
| 邮递员送到收件人 | broker 投递给已订阅的 Consumer |
| 签收后邮局才销号 | `ack` 之后这条消息才从队列删除 |

Consumer 当时挂了也没关系：信还在邮局（队列）里，进程起来会接着送。
**两边不同时在线，消息也不会丢。** 路由表不在这三步里，对照见「两张表：路由 vs 队列」。

## 本仓库拓扑

启动时 `assertTopology` 在 broker 上铺这三条边（没有就创建，有就复用）：

```text
DocumentPipelinePublisher.publish()
        │
        │  exchange = rag.reindex.exchange   (topic, durable)
        │  routingKey = rag.reindex.by_ids
        ▼
┌─────────────────────────────────────────┐
│  rag.reindex.exchange                   │
│  bind: rag.reindex.by_ids               │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  kh.rag.reindex.queue   (durable)       │
└─────────────────┬───────────────────────┘
                  │  deliver 到某个已 consume 的进程
                  ▼
            该进程查 handlers，调 handleRag
```

队列名带 `kh.` 前缀，避免本机同时跑其他项目时撞名。

常量定义：

```8:15:apps/agentic-rag-business-service/src/infrastructure/rabbitmq/constants/rabbitmq.constants.ts
const RAG_REINDEX_EXCHANGE = 'rag.reindex.exchange';

/** 本服务消费的队列 */
const RAG_REINDEX_QUEUE = 'kh.rag.reindex.queue';

/** 路由键：按文档 ID 重建 */
const RAG_RK_BY_IDS = 'rag.reindex.by_ids';
```

## 代码落在哪

按依赖方向拆开，不是少了 consumer 文件：

```text
src/infrastructure/rabbitmq/          管道 + 对外投递
  rabbitmq.service.ts                 连接 / 拓扑 / publish / consume / ack
  document-pipeline.publisher.ts      组消息、打到交换机
  rabbitmq.health-indicator.ts        /health/ready 用
  constants/rabbitmq.constants.ts     交换机、队列、路由键

src/infrastructure/embedding/         通义千问向量客户端
  embedding.service.ts                embed / embedBatch（key / model 来自 env）

src/modules/document/                 HTTP 发布
  document.service.ts                 先写库，再调用 publisher

src/modules/pipeline/                 消费后的业务
  document-pipeline.consumer.ts       解析消息，交给编排器
  pipeline.orchestrator.ts            清旧块 → 分块 → Embedding → ES

packages/contracts/src/rag-reindex.ts 消息信封（Zod v1）
```

```text
DocumentService  ──调用──►  Publisher  ──publish──►  RabbitMQ
                                                        │
PipelineConsumer  ◄──consume────────────────────────────┘
        │
        └──► Orchestrator ──► 分块 / Embedding / ES
```

Document 不能反向依赖 Pipeline，否则 HTTP 发布模块会拖上 Embedding。
Consumer 必须知道 Orchestrator，所以放在 `modules/pipeline`。
基础设施只认「队列名 + 回调」，所以中间要有一张路由表，而不是让 `RabbitMqService` import 编排器。

## 两张表：路由 vs 队列

`handlers` 是 **队列名 → 处理函数** 的路由表，不是消息列表。
当前永远只有一行：`kh.rag.reindex.queue → handleRag`。流量再大，这张表也不变长。

| | `handlers` Map | `kh.rag.reindex.queue` |
| --- | --- | --- |
| 在哪 | 每个 Nest 进程自己的内存 | 共用的 broker |
| 存什么 | 函数指针 | 消息（文档 ID 等） |
| 谁读写 | `registerHandler` 写入；`consume` 回调里查 | publish 入列；ack 出列 |
| 多实例 | A、B 各一份，互不可见 | 只有这一条，大家抢 |
| 进程重启 | Nest 再 register 一遍 | durable，没 ack 的还在 |

信已经进到本进程之后，才查路由表：

```mermaid
flowchart LR
  D[broker deliver] --> C[本进程 consume 收到 Buffer]
  C --> H[handlers.get 队列名]
  H --> F[handleRag → Orchestrator]
```

业务侧的 `registerHandler` 负责写表。不 ack、不跑 RAG。
真正开始收信是后面的 `ch.consume`（见下一节）。

启动完成后各管一块：左边是信，右边是路由表。TCP / channel 是管道，不必画进这张图。

```mermaid
flowchart LR
  subgraph b[Broker]
    direction TB
    Ex[交换机]
    Q[durable 队列]
    Ex --> Q
  end
  subgraph p[本进程内存]
    direction TB
    H[handlers 一行]
  end
  Q -->|deliver| H
```

## `consumeQueue` 就是事件监听（`.on`）

`consumeQueue` 里的 `ch.consume(队列, 回调)` 可以当成给这条队列做了一次
`emitter.on('message', fn)`：函数执行完就返回，回调留在 channel 上。
之后 **broker 每投来一条消息，回调再进一次**，不是 `bindConsumers` 自己 while 循环。

```text
EventEmitter          本仓库
─────────────         ─────────────────────────
emitter.on('x', fn)   ch.consume(queue, fn)     ← consumeQueue
emitter.emit('x', d)  broker 往队列投递一条消息
fn 一直挂着           回调一直挂在 channel 上
```

和进程内 `EventEmitter` 差三处：发事件的是 broker；处理完要 `ack` / 失败要 `nack`；
channel 一断这次 `.on` 就没了，重连后必须再 `consume` 一次。

真正干活的只有这一次 subscribe。另外两个函数只决定 **什么时候去 `.on`**：

| 谁 | 跑几次 | 干什么 |
| --- | --- | --- |
| `registerHandler` | 每个 Consumer 构造时一次 | 把「队列 → 函数」写入 `handlers`；channel 已在则立刻 `.on` 这一条 |
| `bindConsumers` | 每次 channel `setup` 一次（首次连上 + 每次重连） | 按表把已登记的队列都 `.on` 一遍 |
| `consumeQueue` | 上面两处内部调用 | 真正执行 `ch.consume`（ack / nack 也在这里） |
| `ch.consume` 的回调 | **每条消息一次** | `handleRag` → Orchestrator |
| `onModuleInit` | **进程里只一次** | 把 `setup` 交给连接管理器；重连不会再进这里 |

业务代码只调 `registerHandler`。不要在 Consumer 里再调 `bindConsumers` / `consumeQueue`。

重连 **不是** 再走一遍 Nest `onModuleInit`。进程还活着，模块不会重新初始化，Consumer 也不会再 `new`。
`createChannel({ setup })` 把函数交给 `amqp-connection-manager`：第一次连上调一次，之后每次重连再调，用的是新 channel。

```text
Nest 启动 → onModuleInit（仅一次）→ createChannel({ setup })
进程一直活着
  断线 → 管理器重连 → 再调 setup(新 ch) → bindConsumers
  onModuleInit / Consumer 构造函数都不会再跑
```

## 报名和开收不是同一步

写进 `handlers` 不等于已经在收信。`.on` 必须等到有 channel。

Nest **不是**「全应用所有 constructor 跑完再统一 `onModuleInit`」。
被 import 的模块会先初始化完（含它的 `onModuleInit`）。
`AppModule` / 消费者模块都 import 了 `RabbitmqModule`，所以 **消费者必然晚于 RabbitMQ init**：

```text
1. RabbitMqService.onModuleInit
   → 连上 → setup → bindConsumers
   → 本队列还没 registerHandler，bindConsumers 挂不上它
2. new DocumentPipelineConsumer
   → registerHandler 把 handleRag 写进表
   → channel 已在 → addSetup → consumeQueue
   → 这才是这条队列启动时真正的第一次 .on
```

```mermaid
flowchart TD
  A["① new RabbitMqService<br/>channel = null"] --> B["② RabbitMqService.onModuleInit<br/>setup：拓扑 + bindConsumers"]
  B --> C["本队列还不在表里<br/>bindConsumers 挂不上它"]
  C --> D["③ new DocumentPipelineConsumer<br/>registerHandler 写入表"]
  D --> E["channel 已在：addSetup → consumeQueue<br/>从这里才开始收这条队列"]
  E --> F["就绪：能发也能收"]
  F --> G["④ 断线：连接管理器再调 setup<br/>不是再走 onModuleInit"]
  G --> H["bindConsumers 按当时表里已有的队列重新 .on"]
  H --> F
```

`registerHandler` 里那次 `consumeQueue` **不是第二套消费，而是这条队列启动时的主路径**：
第一次 `setup` 跑的时候，依赖 MQ 的消费者还没构造，**本队列不在表里**。
（表不一定全局为空：若有人在 `RabbitmqModule` 内部更早 `registerHandler`，那些队列已经能被第一次 `bindConsumers` 挂上。）
`setup` 不会为了后面的报名再自动跑一遍。若不在登记当下立刻 `.on`，这条队列会没人听。

`bindConsumers` 仍要保留：断线后旧 channel 上的 `.on` 没了，连接管理器再调 `setup` 时必须按表重新挂监听（不是 Nest 再 init 一次）。

## 多实例抢的是队列，不是路由表

每个进程都是「HTTP 发布 + 消费」（拆成两个 Railway 服务仍是后续）。
A 狂发、B 刚起来且自己没发：B 一样有路由表，一样 `consume` 成功后就会处理 A 放进队列的命令。

```mermaid
flowchart TB
  Pub[任意实例 publish] --> Ready[队列 Ready]
  Ready -->|deliver 给 A| UA[Unacked 绑在 A]
  Ready -->|deliver 给 B| UB[Unacked 绑在 B]
  UA -->|A ack| X[删除]
  UA -->|A nack 且不回队| Drop[丢掉]
  UA -->|A 进程挂了| Ready
  UB -->|B ack| X
  UB -->|B nack 且不回队| Drop
  UB -->|B 进程挂了| Ready
```

Broker 把队列拆成两列，**Unacked 绑在某个 channel 上**，另一实例拿不到：

| 消息现在在哪 | B 会不会拿到 |
| --- | --- |
| Ready（还没投出去） | 会 |
| Unacked 在 A（A 还在跑 handleRag） | 不会，直到 A ack / nack / 断线 |
| A `ack` | 删除，谁都不会再拿到 |
| A `nack(..., requeue=false)` | 不回队列；DLQ 未接则丢 |
| A 进程挂了 | Unacked 回到 Ready，B 可以接着做 |

管理台看 `kh.rag.reindex.queue` 的 Ready / Unacked 就是这两列。
当前没设 prefetch：A 可能一次囤很多 Unacked，B 加入后短期内只能吃剩下的 Ready。
扩 API 副本会同时增加消费者数，这是以后要拆进程的原因之一。

## 一条消息长什么样

消息只带标识，不带正文，避免把文档内容送进 broker。消费侧自己按 ID 去库里拉。

```12:17:packages/contracts/src/rag-reindex.ts
const RagReindexMessageV1Schema = z.object({
  schemaVersion: z.literal(1).default(1),
  taskId: z.string().uuid(),
  type: RagReindexTypeSchema,
  documentIds: z.array(z.string().min(1)).min(1),
});
```

发布时组出来的大致是：

```json
{
  "schemaVersion": 1,
  "taskId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "type": "BY_DOC_IDS",
  "documentIds": ["10001"]
}
```

`taskId` 是这次投递的幂等 / 追踪键。当前消费侧还没有按 `taskId` 去重；
ADR-0007 要求后续补「至少投递一次 + 消费幂等」。

## 发布路径（你怎么触发）

HTTP 入口：`PUT /documents/:id/publish`。

```213:243:apps/agentic-rag-business-service/src/modules/document/document.service.ts
  async publish(id: string) {
    // ...
    doc.status = DocumentStatus.Published;
    doc.publishTime = new Date();
    const saved = await this.documentRepo.save(doc);

    try {
      await this.pipelinePublisher.afterPublish(saved.id);
    } catch (error) {
      this.logger.warn(
        `发布后管线投递失败（不影响发布）：documentId=${id}, error=${message}`,
      );
    }
```

约定：**库已写下「已发布」，MQ 失败也不回滚。** 用户看到文档已发布；
RAG 索引可能稍后补，或需要重发命令。

### `afterPublish` 是什么

它不是「发布文档」本身，而是 **文档已经写成 Published 之后** 要做的那一步：
往 RabbitMQ 丢一条 RAG 重建命令。

名字按时间点来：`after` + `publish` = 发布成功之后。

```text
PUT /documents/:id/publish
        │
        ▼
DocumentService.publish
        │
        ├─ ① save：status = Published     ← 文档发布在这里完成
        │
        └─ ② afterPublish(saved.id)       ← 只负责通知管线
                │
                ▼
           组 RagReindexMessageV1
           publish(rag.reindex.exchange, rag.reindex.by_ids, message)
```

它只做三件小事：

1. 用文档 ID 组一条契约消息（`taskId` + `BY_DOC_IDS` + `documentIds`）
2. 打到交换机，等 publisher confirm
3. 打日志：投递成功或失败

不写库、不分块、不碰 ES。那些是消费者收到消息以后的事。


|     | `DocumentService.publish` | `afterPublish`        |
| --- | ------------------------- | --------------------- |
| 谁调  | HTTP 发布接口                 | `publish` 在 `save` 之后 |
| 干什么 | 改文档状态                     | 发 MQ 命令               |
| 失败  | 抛给用户                      | 只打日志，**不回滚已发布**       |


所以文档能发布成功，但 RAG 索引可能还没建好：`afterPublish` 失败不影响用户看到的「已发布」。

```26:36:apps/agentic-rag-business-service/src/infrastructure/rabbitmq/document-pipeline.publisher.ts
  async afterPublish(documentId: string): Promise<void> {
    const message = RagReindexMessageV1Schema.parse({
      taskId: randomUUID(),
      type: 'BY_DOC_IDS',
      documentIds: [documentId],
    } satisfies RagReindexMessageV1Input);
    const ok = await this.rabbit.publish(
      RAG_REINDEX_EXCHANGE,
      RAG_RK_BY_IDS,
      message,
    );
```

`RabbitMqService.publish` 的关键点：

- `persistent: true`：消息落盘。
- publisher confirm：等 broker 确认才返回 `true`。
- 失败返回 `false`、不抛。DocumentService 再包一层 try/catch，发布接口仍 200。

## 消费路径（消息怎么变成 ES 向量）

`handleRag` 是路由表指向的那个函数。谁抢到这条消息，谁在自己的进程里跑它。

```18:33:apps/agentic-rag-business-service/src/modules/pipeline/document-pipeline.consumer.ts
  constructor(
    private readonly rabbit: RabbitMqService,
    private readonly orchestrator: PipelineOrchestrator,
  ) {
    this.rabbit.registerHandler(RAG_REINDEX_QUEUE, (msg) => this.handleRag(msg));
  }

  private async handleRag(msg: ConsumeMessage): Promise<void> {
    const body = RagReindexMessageV1Schema.parse(
      JSON.parse(msg.content.toString('utf8')),
    );
    await this.orchestrator.handleRagReindex(body.type, body.documentIds);
  }
```

`channel` 开了 `json: true`，只帮**发布侧**自动序列化。消费侧拿到的仍是 Buffer，
所以这里要 `JSON.parse`，再用 Zod 校验。

处理结果：


| 结果         | 代码                           | 消息去哪              |
| ---------- | ---------------------------- | ----------------- |
| handler 成功 | `ch.ack(msg)`                | broker 丢掉这条       |
| handler 抛错 | `ch.nack(msg, false, false)` | **不回队列**，避免毒消息死循环 |
| 索引还不存在     | ES `index_not_found` 被吞掉     | 当作没有旧块            |


`nack(..., requeue=false)` 且 **DLQ 还没接上**：当前失败消息会丢。
这是已知缺口，不是「处理失败会自动重试」。

编排器不再碰 MQ，只做业务：

```text
handleRagReindex
  └─ 对每个 documentId
       1. 从 Postgres + Mongo 加载
       2. deleteByDocId     清 ES 旧块
       3. chunk             Markdown 分块
       4. embedBatch        通义千问向量
       5. indexChunks       bulk 写入 kh_chunk
```

## 怎么在本地使用

### 1. 启动 broker

```bash
# 仓库根目录
docker compose up -d rabbitmq
```

默认：


| 端口      | 用途            |
| ------- | ------------- |
| `5672`  | AMQP，给 Nest 用 |
| `15672` | 管理台 UI        |


本地 URL（guest 仅适合本机）：

```bash
RABBITMQ_URL=amqp://guest:guest@localhost:5672
```

打开 [http://localhost:15672](http://localhost:15672)，账号密码默认 `guest` / `guest`。
业务服务启动成功后，能看到：

- Exchanges：`rag.reindex.exchange`
- Queues：`kh.rag.reindex.queue`
- Bindings：`rag.reindex.by_ids`

### 2. 启动业务服务

RabbitMQ 没起来时，Nest **不会带病启动**，日志类似：

```text
RabbitMQ 连接超时（15000ms）：amqp://guest:*****@localhost:5672
```

先确保 5672 可达，再：

```bash
pnpm --filter agentic-rag-business-service dev
```

就绪探针会检查「channel 已创建且至少注册了一个消费者」：

```bash
curl http://localhost:9020/health/ready
```

### 3. 发布一篇文档，观察整条链

1. 创建 / 更新一篇带正文的文档（`POST /documents` 或更新接口）。
2. 发布：

```bash
curl -X PUT http://localhost:9020/documents/<文档ID>/publish
```

1. 业务服务日志里应依次出现：

```text
发布文档：documentId=...
RAG 重建索引已投递：documentId=..., taskId=...
文档发布成功：documentId=...
[RAG] type=BY_DOC_IDS, taskId=..., documentIds=[...]
RAG 开始索引：type=BY_DOC_IDS, total=1
ES 批量索引成功：N chunks → kh_chunk
RAG 索引完成：documentId=..., chunks=N
```

1. 管理台 Queues → `kh.rag.reindex.queue`：Ready 应回到 0（被消费并 ack）。
  处理中会看到 Unacked > 0；那是已投给某个实例、还没 ack，不是积压在「没人领」。
2. Elasticsearch 里应有该文档的 `kh_chunk`。

当前 HTTP 进程**同时跑 publisher 和 consumer**（ADR-0007 里的
「Railway API / Consumer 拆成两个服务」还是后续工作）。本地一条 `dev` 就能走通。

## 失败时你会看到什么


| 现象                   | 原因                             | 怎么办                               |
| -------------------- | ------------------------------ | --------------------------------- |
| 服务起不来，报连接超时          | broker 没起或 5672 不通             | `docker compose up -d rabbitmq`   |
| 发布接口 200，但没有 RAG 日志  | 投递失败（`已投递` vs `投递失败`）          | 看 publisher 日志；文档状态不会回滚           |
| `[RAG]` 有了，ES 没有块    | Embedding / ES 失败              | 看 Orchestrator / VectorIndex 错误日志 |
| 某条消息永远消失             | handler 抛错后 nack 且不 requeue    | 修 bug 后重新 publish 该文档             |
| `/health/ready` down | channel 未建或一个 handler 都没注册     | PipelineModule 是否被 AppModule 导入   |
| 新实例起来却几乎分不到消息        | 旧实例 Unacked 囤了一大批（未设 prefetch） | 管理台看 Unacked；等旧实例 ack 或断线回 Ready  |


## 以后要加新消息怎么走

不要再复制一份 `xxx-pipeline.publisher.ts`，除非出现全新业务域。

同一条 RAG 交换机上加能力（例如按空间重建）的常规扩法：

1. 在 `packages/contracts/src/rag-reindex.ts` 给 `type` 加枚举，必要时升 schemaVersion。
2. 在 `rabbitmq.constants.ts` 加新 routing key；`assertTopology` 里 `bindQueue`。
3. Publisher 增加对应方法，或让 `afterPublish` 按场景选 rk。
4. Consumer / Orchestrator 按 `type` 分支。

跨应用的消息形状必须走 `@repo/contracts`，不要在 app 里再手写一份平行类型。

## 和 ADR 的差距（读代码时不要误判）


| ADR-0007 要求                      | 当前代码                                    |
| -------------------------------- | --------------------------------------- |
| API 与 Consumer 拆成两个 Railway 服务   | 仍在同一 Nest 进程                            |
| quorum queue + DLQ / 重试交换机       | 普通 durable 队列；nack 不重入队，无 DLQ           |
| per-consumer prefetch            | `consume` 未设 prefetch，Unacked 可能堆在先到的实例 |
| 消费幂等（event ID + idempotency key） | 有 `taskId`，消费侧尚未按它去重                    |
| 事务 outbox（写库和投递同一事务）             | 先 `save` 再 `publish`，投递失败不回滚            |


这些是已知后续，不是文档写错。本地把「发布 → 队列 → 分块 → ES」跑通，就达到当前阶段目标。