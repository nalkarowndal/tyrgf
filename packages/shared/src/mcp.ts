export const mcpCatalog = {
  aura: {
    name: 'AURA 프로젝트 MCP',
    description: '허용한 폴더의 목록·텍스트 읽기·한 파일 안 문자열 검색. 실제 로컬 MCP 서버입니다.',
    prerequisite: 'Linux와 파일 작업에서 허용한 폴더가 필요합니다. 추가 설치나 키가 필요 없습니다.',
    url: '',
    executable: '',
    tools: ['project_list', 'project_read', 'project_search'],
  },
  github: {
    name: 'GitHub MCP',
    description: '저장소 파일, 이슈, PR을 조회합니다. 외부 서비스로 요청이 전송됩니다.',
    prerequisite:
      '공식 github-mcp-server 실행 파일을 미리 설치하고 최소 읽기 권한 PAT를 준비하세요. 요금·네트워크 조건은 GitHub 계정에 따릅니다.',
    url: 'https://github.com/github/github-mcp-server',
    executable: 'github-mcp-server',
    tools: [
      'get_file_contents',
      'search_repositories',
      'list_issues',
      'issue_read',
      'list_pull_requests',
      'pull_request_read',
    ],
  },
  serena: {
    name: 'Serena',
    description: '프로젝트의 파일과 코드 심볼을 조회합니다.',
    prerequisite:
      'serena CLI와 프로젝트 언어 서버를 미리 설치하세요. 프로젝트 인덱스·캐시가 생성될 수 있습니다.',
    url: 'https://github.com/oraios/serena',
    executable: 'serena',
    tools: [
      'list_dir',
      'find_file',
      'read_file',
      'get_symbols_overview',
      'find_symbol',
      'search_for_pattern',
      'find_referencing_symbols',
    ],
  },
  repomix: {
    name: 'Repomix',
    description: '파일과 폴더를 조회합니다. 파일을 생성하는 코드 패킹은 아직 지원하지 않습니다.',
    prerequisite:
      'repomix CLI와 Node.js를 미리 설치하세요. 조회 도구를 제공하는 버전이 필요합니다.',
    url: 'https://github.com/yamadashy/repomix',
    executable: 'repomix',
    tools: ['file_system_read_file', 'file_system_read_directory'],
  },
} as const;
export type McpKind = keyof typeof mcpCatalog;
export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  hash: string;
  eligible: boolean;
};
export type McpProfile = {
  id: string;
  kind: McpKind;
  rootId?: string;
  rootPath?: string;
  rootIdentity?: string;
  executable?: string;
  fingerprint?: string;
};
export type McpServer = McpProfile & {
  status: 'disconnected' | 'connecting' | 'connected';
  generation: string;
  tools: McpTool[];
  allowedTools: string[];
  message: string;
  version?: string;
};
export type McpRun = {
  id: string;
  serverId: string;
  serverName: string;
  generation: string;
  tool: string;
  schemaHash: string;
  arguments: Record<string, unknown>;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'expired' | 'interrupted' | 'denied';
  createdAt: string;
  expiresAt: string;
  result: string;
};
export type McpState = { servers: McpServer[]; runs: McpRun[] };
