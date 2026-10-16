import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { SafeFiles } from './safe-files';
const [dataDir, rootPath, expectedIdentity] = process.argv.slice(2);
const files = new SafeFiles(dataDir);
const grant = files.grant(rootPath, false);
if (files.root(grant.id).identity !== expectedIdentity) throw new Error('Folder changed');
const server = new McpServer({ name: 'aura-project', version: '1.0.0' });
for (const name of ['project_list', 'project_read', 'project_search'] as const) {
  server.registerTool(
    name,
    {
      description:
        name === 'project_list'
          ? '허용 폴더의 목록'
          : name === 'project_read'
            ? '허용 폴더의 텍스트 파일 읽기'
            : '한 텍스트 파일 안 문자열 검색',
      inputSchema: {
        path: z.string().max(500),
        ...(name === 'project_search' ? { query: z.string().min(1).max(200) } : {}),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ path, query }) => {
      try {
        const view = files.read(grant.id, path);
        if (name === 'project_list' ? !view.entries : view.content === undefined)
          throw new Error('Wrong type');
        const text =
          name === 'project_search'
            ? view
                .content!.split('\n')
                .flatMap((line, i) => (line.includes(String(query)) ? [`${i + 1}: ${line}`] : []))
                .slice(0, 100)
                .join('\n') || '일치하는 내용이 없습니다.'
            : (view.content ?? JSON.stringify(view));
        return { content: [{ type: 'text', text }] };
      } catch {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: '허용한 폴더 안의 일반 텍스트 파일 또는 폴더인지 확인하세요. 숨김 파일·심볼릭 링크·상위 경로는 사용할 수 없습니다.',
            },
          ],
        };
      }
    },
  );
}
await server.connect(new StdioServerTransport());
