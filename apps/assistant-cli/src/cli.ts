#!/usr/bin/env node
import {
  DEFAULT_RUNTIME_URL,
  pingRuntime,
  resolveRuntimeBaseUrl,
  streamRuntime,
} from './runtime-client';
import { runPingDiagnostic } from './application/run-ping-diagnostic';
import { resolveCliStartup } from './application/resolve-cli-startup';

const printUsage = (): void => {
  console.log(`assistant-cli — local console for assistant-runtime-service

Usage:
  assistant-cli ping [--url <runtime-url>]
  assistant-cli stream <prompt...> [--url <runtime-url>]
  assistant-cli help

Environment:
  ASSISTANT_RUNTIME_URL   Default ${DEFAULT_RUNTIME_URL}
`);
};

const takeUrlFlag = (args: string[]): { rest: string[]; url?: string } => {
  const rest: string[] = [];
  let url: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--url') {
      url = args[index + 1];
      index += 1;
      continue;
    }
    if (token !== undefined) {
      rest.push(token);
    }
  }
  return { rest, url };
};

const main = async (): Promise<void> => {
  // pnpm may forward a literal "--" before user args.
  const argv = process.argv.slice(2).filter((token) => token !== '--');
  const { rest, url } = takeUrlFlag(argv);
  const command = rest[0] ?? 'help';
  // help 以外的所有命令都必须通过完整环境启动门，不能绕过配置校验。
  const startup =
    command === 'help' || command === '--help' || command === '-h'
      ? undefined
      : resolveCliStartup(process.env, url);
  const baseUrl = startup?.runtimeBaseUrl ?? resolveRuntimeBaseUrl(url);

  if (command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    return;
  }

  if (command === 'ping') {
    await runPingDiagnostic(baseUrl, {
      ping: pingRuntime,
      writeLine: line => console.log(line),
      isTty: process.stdout.isTTY === true,
    });
    return;
  }

  if (command === 'stream') {
    const prompt = rest.slice(1).join(' ').trim();
    if (!prompt) {
      console.error('stream requires a prompt. Example: assistant-cli stream hello');
      process.exitCode = 1;
      return;
    }
    console.log(`→ streaming from ${baseUrl}`);
    await streamRuntime(prompt, baseUrl, (chunk) => {
      process.stdout.write(chunk);
    });
    process.stdout.write('\n');
    return;
  }

  console.error(`Unknown command: ${command}`);
  printUsage();
  process.exitCode = 1;
};

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`assistant-cli failed: ${message}`);
  process.exitCode = 1;
});
