import { stripVTControlCharacters } from 'node:util';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { accessSync, constants, readFileSync, realpathSync, statSync, existsSync } from 'node:fs';
import { basename, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { mcpCatalog, type McpProfile, type McpTool } from '../../../packages/shared/src/mcp';
import { PublicError } from './providers';
export const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export const redact = (s: string, token = '') =>
  stripVTControlCharacters(token ? s.split(token).join('[인증키 숨김]') : s);
export function executable(path: string, kind: McpProfile['kind']) {
  try {
    if (!isAbsolute(path) || basename(path) !== mcpCatalog[kind].executable) throw new Error();
    const canonical = realpathSync(path),
      stat = statSync(canonical);
    if (!stat.isFile() || stat.size > 256 * 1024 * 1024) throw new Error();
    accessSync(canonical, constants.X_OK);
    return { executable: canonical, fingerprint: hash(readFileSync(canonical).toString('base64')) };
  } catch {
    throw new PublicError(
      '공식 CLI 이름의 설치된 실행 파일 절대 경로를 확인하세요. 자동 설치하지 않습니다.',
    );
  }
}
export function runtime(profile: McpProfile, dataDir: string, token: string) {
  let command = profile.executable ?? '';
  let args: string[];
  if (profile.kind === 'aura') {
    command = process.execPath;
    const compiled = fileURLToPath(new URL('./mcp-project.mjs', import.meta.url));
    args = [
      ...(existsSync(compiled)
        ? [compiled]
        : [
            '--import',
            createRequire(import.meta.url).resolve('tsx'),
            fileURLToPath(new URL('./mcp-project.ts', import.meta.url)),
          ]),
      dataDir,
      profile.rootPath!,
      profile.rootIdentity!,
    ];
  } else {
    // Canonical targets of CLI symlinks need not retain the public CLI basename.
    try {
      if (hash(readFileSync(command).toString('base64')) !== profile.fingerprint) throw new Error();
    } catch {
      throw new PublicError(
        '실행 파일이 바뀌었거나 사라졌습니다. 서버를 삭제한 뒤 다시 등록하세요.',
        409,
      );
    }
    args =
      profile.kind === 'github'
        ? ['stdio', '--read-only', '--tools', mcpCatalog.github.tools.join(',')]
        : profile.kind === 'serena'
          ? ['start-mcp-server', '--context', 'ide', '--project', profile.rootPath!]
          : ['--mcp'];
  }
  const client = new Client({ name: 'aura-agent', version: '0.1.0' }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command,
    args,
    cwd: profile.rootPath,
    env: profile.kind === 'github' ? { GITHUB_PERSONAL_ACCESS_TOKEN: token } : {},
    stderr: 'ignore',
    maxBufferSize: 1024 * 1024,
  });
  // SDK close() returns immediately after its final SIGKILL. Observe the actual
  // child close event as well, so the parent can reap it before exiting.
  const exited = new Promise<void>((resolve) => {
    transport.onclose = resolve;
  });
  return { client, transport, exited };
}
export async function discover(
  client: Client,
  kind: McpProfile['kind'],
  token: string,
  signal: AbortSignal,
): Promise<McpTool[]> {
  const all: McpTool[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const page = await client.listTools({ cursor }, { timeout: 20000, signal });
    if (++pages > 5 || all.length + page.tools.length > 50) throw new Error('Tool limit');
    for (const tool of page.tools) {
      const schema = JSON.stringify(tool.inputSchema);
      if (
        Buffer.byteLength(schema) > 16384 ||
        tool.name.length > 128 ||
        all.some((t) => t.name === tool.name)
      )
        throw new Error('Schema limit');
      // Remote refs are never fetched. Restrict nesting to keep validation work bounded.
      const check = (v: unknown, depth = 0) => {
        if (depth > 20) throw new Error('Schema depth');
        if (v && typeof v === 'object')
          for (const [k, val] of Object.entries(v)) {
            if (k === '$ref' && typeof val === 'string' && !val.startsWith('#'))
              throw new Error('Remote ref');
            check(val, depth + 1);
          }
      };
      check(tool.inputSchema);
      if (token && (schema.includes(token) || tool.name.includes(token)))
        throw new Error('Credential reflected');
      all.push({
        name: tool.name,
        description: redact(tool.description ?? '', token).slice(0, 1000),
        inputSchema: tool.inputSchema,
        hash: hash(schema),
        eligible: (mcpCatalog[kind].tools as readonly string[]).includes(tool.name),
      });
    }
    cursor = page.nextCursor;
  } while (cursor);
  return all;
}
export function validateArguments(tool: McpTool, args: Record<string, unknown>) {
  try {
    if (
      Buffer.byteLength(JSON.stringify(args)) > 16384 ||
      !new AjvJsonSchemaValidator().getValidator(tool.inputSchema)(args).valid
    )
      throw new Error();
  } catch {
    throw new PublicError(
      '도구 입력 JSON이 표시된 스키마와 맞지 않습니다. 필수 항목과 자료형을 확인하세요.',
    );
  }
}
