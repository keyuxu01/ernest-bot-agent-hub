import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { normalize, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as contracts from '@repo/contracts';

type Application =
  'assistant-cli' | 'assistant-runtime-service' | 'user-platform-service';
type FixtureCase = {
  fixtureId: string;
  file: string;
  jsonPointer: string;
  rootSchemaExport: string;
  producer: Application;
  consumers: Application[];
  expectation: 'valid' | 'invalid';
  expectedIssuePath?: string;
};
type FixtureManifest = { cases: FixtureCase[] };
type FixtureDocument = { cases: Record<string, unknown> };
type SchemaResult = {
  success: boolean;
  error?: { issues: Array<{ path: PropertyKey[] }> };
};
type SchemaLike = { safeParse: (value: unknown) => SchemaResult };

const application: Application = 'user-platform-service';
const fixtureDirectory = resolve(
  process.cwd(),
  '../../packages/contracts/fixtures/assistant/v1',
);
const readJson = <T>(file: string): T =>
  JSON.parse(readFileSync(resolve(fixtureDirectory, file), 'utf8')) as T;
const manifest = readJson<FixtureManifest>('compatibility-manifest.json');
const assignedCases = manifest.cases.filter(
  fixture => fixture.producer === application || fixture.consumers.includes(application),
);
const documents = new Map<string, FixtureDocument>();

// 每个应用独立读取磁盘 JSON，避免复用 contracts 测试 helper 形成“自己证明自己”。
const fixtureValue = (fixture: FixtureCase): unknown => {
  const document = documents.get(fixture.file) ?? readJson<FixtureDocument>(fixture.file);
  documents.set(fixture.file, document);
  return document.cases[fixture.fixtureId];
};

const schemaFor = (fixture: FixtureCase): SchemaLike => {
  const candidate = (contracts as Record<string, unknown>)[fixture.rootSchemaExport];
  expect(candidate, `missing dist export ${fixture.rootSchemaExport}`).toBeDefined();
  expect(typeof (candidate as SchemaLike).safeParse).toBe('function');
  return candidate as SchemaLike;
};

describe('user-platform-service compatibility boundary', () => {
  it('loads @repo/contracts from its independently built dist entry', () => {
    // 必须命中已构建产物；源码 fallback 会掩盖发布包缺失或导出错误。
    const resolved = normalize(
      createRequire(resolve(process.cwd(), 'package.json')).resolve('@repo/contracts'),
    );
    expect(resolved).toMatch(/packages[/\\]contracts[/\\]dist[/\\]index\.js$/);
  });

  it('has explicit producer and consumer responsibilities', () => {
    expect(assignedCases.some(fixture => fixture.producer === application)).toBe(true);
    expect(assignedCases.some(fixture => fixture.consumers.includes(application))).toBe(
      true,
    );
  });

  it.each(assignedCases)('$fixtureId obeys its producer/consumer contract', fixture => {
    expect(fixture.jsonPointer).toBe(`/cases/${fixture.fixtureId}`);
    const result = schemaFor(fixture).safeParse(fixtureValue(fixture));
    expect(result.success).toBe(fixture.expectation === 'valid');
    if (fixture.expectation === 'invalid') {
      const issuePaths = result.error?.issues.map(issue => issue.path.join('.')) ?? [];
      expect(issuePaths).toContain(fixture.expectedIssuePath);
    }
  });
});
