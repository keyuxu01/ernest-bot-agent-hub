import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { formatDatePath } from './helpers/format-date-path';
import { guessExt } from './helpers/guess-ext';
import { sanitizeBaseName } from './helpers/sanitize-base-name';
import type { UploadBytesOptions } from './type/upload-bytes.options';

/**
 * RustFS 对象存储客户端（S3 兼容 API）。
 *
 * 配置（启动时由 `validateEnvironment` 强制校验）：
 * - `RUSTFS_ENDPOINT` / `RUSTFS_REGION` / `RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY` / `RUSTFS_BUCKET` / `RUSTFS_PUBLIC_URL`
 *
 * 边界：
 * - 使用 path-style（`forcePathStyle`），适配自建 S3 兼容端点，而非虚拟托管式域名。
 * - 启动时异步 ensure bucket，失败只打 warn，不阻断 Nest 启动（Compose 冷启动常见）。
 * - 实际上传前会再 ensure；业务侧应处理上传失败，勿假设启动即等于存储已就绪。
 * - 对外 URL：`{publicBase}/{bucket}/{key}`（path-style 公开访问形态）。
 *   桶默认私有，匿名 GET 会 403；URL 只作对象定位，不代表可匿名下载。
 *
 * 本服务只负责字节上传与 URL 拼装；文档元数据落库由 Document 等 feature 负责。
 */
@Injectable()
export class RustfsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RustfsService.name);
  /** AWS SDK S3 客户端；`onModuleInit` 后可用 */
  private client!: S3Client;
  /** 目标 bucket 名（与 `RUSTFS_BUCKET` 一致） */
  private bucket = '';
  /** 对外访问基址（无尾部 `/`） */
  private publicBaseUrl = '';

  constructor(private readonly config: ConfigService) {}

  /**
   * 读取配置并创建 S3 client，再后台尝试创建 bucket。
   * 不 await ensure：避免 RustFS 尚未就绪时拖死整个应用启动。
   */
  onModuleInit(): void {
    const endpoint = this.config.getOrThrow<string>('RUSTFS_ENDPOINT');
    const accessKey = this.config.getOrThrow<string>('RUSTFS_ACCESS_KEY');
    const secretKey = this.config.getOrThrow<string>('RUSTFS_SECRET_KEY');
    // Region 对多数自建端点无实际分区含义，但 SDK 构造仍要求提供
    const region = this.config.getOrThrow<string>('RUSTFS_REGION');
    this.bucket = this.config.getOrThrow<string>('RUSTFS_BUCKET');
    this.publicBaseUrl = this.config
      .getOrThrow<string>('RUSTFS_PUBLIC_URL')
      .replace(/\/$/, '');

    this.client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      // 自建 RustFS / MinIO 等通常需要 path-style，否则 Host 会变成 bucket.endpoint
      forcePathStyle: true,
    });

    this.logger.log(
      `RustFS 已配置: endpoint=${endpoint}, bucket=${this.bucket}, public=${this.publicBaseUrl}`,
    );

    void this.ensureBucket().catch((err: unknown) => {
      this.logger.warn(
        `RustFS 初始化 bucket 失败（首次上传时会重试）: ${err instanceof Error ? err.message : err}`,
      );
    });
  }

  /** 释放 SDK 底层连接，避免进程退出时悬挂句柄 */
  onModuleDestroy(): void {
    this.client?.destroy();
  }

  /**
   * 上传字节并返回可访问 URL。
   *
   * 对象 key：`{prefix}/{YYYY}/{MM}/{DD}/{safeBase}-{uuid}{ext}`
   * - `prefix` 默认 `documents`，首尾 `/` 会被去掉
   * - 扩展名优先取 `fileName`；没有则按 `contentType` 猜测
   * - `safeBase` 经清洗，避免 key 中出现路径分隔或异常字符
   *
   * @returns path-style URL：`{publicBase}/{bucket}/{key}`
   */
  async uploadBytes(
    bytes: Buffer | Uint8Array,
    options: UploadBytesOptions,
  ): Promise<string> {
    await this.ensureBucket();

    const prefix = (options.prefix ?? 'documents').replace(/^\/+|\/+$/g, '');
    const ext = extname(options.fileName) || guessExt(options.contentType);
    const safeBase = sanitizeBaseName(options.fileName);
    const key = `${prefix}/${formatDatePath()}/${safeBase}-${randomUUID()}${ext}`;
    const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: options.contentType,
        ContentLength: body.length,
      }),
    );

    const url = `${this.publicBaseUrl}/${this.bucket}/${key}`;
    this.logger.log(
      `RustFS 上传成功: key=${key}, size=${body.length}, url=${url}`,
    );
    return url;
  }

  /**
   * 保证目标 bucket 存在：先 `HeadBucket`，失败再 `CreateBucket`。
   *
   * - Head 失败的原因可能是「不存在」或「暂不可达」，统一走创建路径；
   *   创建失败且非 already-exists 则向上抛，由调用方（上传）感知。
   * - 多实例并发创建时可能打到 already exists，视为成功。
   */
  private async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return;
    } catch {
      // 见方法 JSDoc：不区分「不存在」与「暂不可达」，统一尝试创建
    }

    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`RustFS bucket 已创建: ${this.bucket}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        !/BucketAlreadyOwnedByYou|BucketAlreadyExists|already exists/i.test(
          message,
        )
      ) {
        throw err;
      }
    }
  }
}
