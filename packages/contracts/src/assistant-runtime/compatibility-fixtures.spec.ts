/// <reference types="node" />

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as contracts from '../index';

type Application =
  'assistant-cli' | 'assistant-runtime-service' | 'user-platform-service';
type FixtureCase = {
  fixtureId: string;
  file: string;
  jsonPointer: string;
  rootSchemaExport: string;
  protocolFamily: string;
  versionClass: 'versioned-root' | 'standard-jwt' | 'diagnostic-unversioned';
  producer: Application;
  consumers: Application[];
  expectation: 'valid' | 'invalid';
  expectedIssuePath?: string;
};
type FixtureManifest = {
  fixtureSetVersion: number;
  readCompatibility: number[];
  writeVersion: number;
  applications: Application[];
  cases: FixtureCase[];
};
type FixtureDocument = { cases: Record<string, unknown> };
type SchemaResult = {
  success: boolean;
  error?: { issues: Array<{ path: PropertyKey[] }> };
};
type SchemaLike = { safeParse: (value: unknown) => SchemaResult };

const fixtureDirectory = resolve(process.cwd(), 'fixtures/assistant/v1');
const readJson = <T>(file: string): T =>
  JSON.parse(readFileSync(resolve(fixtureDirectory, file), 'utf8')) as T;
const manifest = readJson<FixtureManifest>('compatibility-manifest.json');
const documents = new Map<string, FixtureDocument>();

// Fixture 是人工冻结的线协议样本，禁止由当前 Schema 动态生成。
const fixtureValue = (fixture: FixtureCase): unknown => {
  const document = documents.get(fixture.file) ?? readJson<FixtureDocument>(fixture.file);
  documents.set(fixture.file, document);
  const expectedPointer = `/cases/${fixture.fixtureId}`;
  expect(fixture.jsonPointer).toBe(expectedPointer);
  return document.cases[fixture.fixtureId];
};

const schemaFor = (fixture: FixtureCase): SchemaLike => {
  const candidate = (contracts as Record<string, unknown>)[fixture.rootSchemaExport];
  expect(candidate, `missing export ${fixture.rootSchemaExport}`).toBeDefined();
  expect(typeof (candidate as SchemaLike).safeParse).toBe('function');
  return candidate as SchemaLike;
};

describe('Assistant v1 static compatibility fixtures', () => {
  it('keeps one closed, immutable manifest without orphan JSON cases', () => {
    expect(manifest.fixtureSetVersion).toBe(1);
    expect(manifest.readCompatibility).toEqual([1]);
    expect(manifest.writeVersion).toBe(1);
    expect(new Set(manifest.cases.map(item => item.fixtureId)).size).toBe(
      manifest.cases.length,
    );

    const referencedFiles = new Set(manifest.cases.map(item => item.file));
    const fixtureFiles = readdirSync(fixtureDirectory)
      .filter(file => file.endsWith('.json') && file !== 'compatibility-manifest.json')
      .sort();
    expect([...referencedFiles].sort()).toEqual(fixtureFiles);

    for (const file of fixtureFiles) {
      const document = readJson<FixtureDocument>(file);
      const declared = manifest.cases
        .filter(item => item.file === file)
        .map(item => item.fixtureId)
        .sort();
      expect(Object.keys(document.cases).sort()).toEqual(declared);
    }
  });

  it('assigns every fixture to known producer and consumer applications', () => {
    const applications = new Set(manifest.applications);
    for (const fixture of manifest.cases) {
      expect(applications.has(fixture.producer)).toBe(true);
      expect(fixture.consumers.length).toBeGreaterThan(0);
      expect(fixture.consumers.every(item => applications.has(item))).toBe(true);
    }
  });

  it.each(manifest.cases)('$fixtureId matches $rootSchemaExport', fixture => {
    const result = schemaFor(fixture).safeParse(fixtureValue(fixture));
    expect(result.success).toBe(fixture.expectation === 'valid');
    if (fixture.expectation === 'invalid') {
      const issuePaths = result.error?.issues.map(issue => issue.path.join('.')) ?? [];
      expect(issuePaths).toContain(fixture.expectedIssuePath);
    }
  });
});
