import { z } from 'zod';
export const toolInput = z.discriminatedUnion('tool', [
  z
    .object({
      tool: z.literal('file.write'),
      rootId: z.string(),
      path: z.string().min(1).max(500),
      content: z.string().max(24000),
    })
    .strict(),
  z
    .object({
      tool: z.literal('file.delete'),
      rootId: z.string(),
      path: z.string().min(1).max(500),
    })
    .strict(),
  z.object({ tool: z.literal('browser.read'), url: z.string().max(2000) }).strict(),
]);
export type ToolInput = z.infer<typeof toolInput>;
export const toolRegistry = [
  {
    id: 'file.read',
    inputParameters: { rootId: '허용한 폴더 ID', path: '상대 파일/폴더 경로' },
    outputFormat: '텍스트 또는 파일 목록',
    environment: 'Linux',
    supportStatus: 'available',
    name: '텍스트 읽기 · 목록',
    permission: '폴더 읽기',
    risk: '읽기',
    description: '허용한 폴더의 텍스트를 이 화면에서 읽습니다. AI에 자동 전송하지 않습니다.',
  },
  {
    id: 'file.write',
    inputParameters: {
      rootId: '허용한 폴더 ID',
      path: '상대 파일 경로',
      content: 'UTF-8 텍스트 24KB 이하',
    },
    outputFormat: '승인 요청과 실행 결과',
    environment: 'Linux',
    supportStatus: 'available',
    name: '텍스트 만들기 · 수정',
    permission: '폴더 수정 + 매번 승인',
    risk: '변경',
    description: '전후 내용을 확인한 뒤 파일 하나를 저장합니다.',
  },
  {
    id: 'file.delete',
    inputParameters: { rootId: '허용한 폴더 ID', path: '상대 파일 경로' },
    outputFormat: '승인 요청과 원본 복구 위치',
    environment: 'Linux',
    supportStatus: 'available',
    name: '텍스트 삭제',
    permission: '폴더 수정 + 매번 승인',
    risk: '삭제',
    description: '원본을 실행 기록에 보관하고 파일 하나를 삭제합니다.',
  },
  {
    id: 'browser.read',
    inputParameters: { url: '공개 HTTPS 주소' },
    outputFormat: '본문 · 제목 · 읽기 화면 PNG',
    environment: 'Chromium 설치 환경',
    supportStatus: 'available',
    name: '공개 웹페이지 읽기',
    permission: '웹 읽기 + 매번 승인',
    risk: '외부 연결',
    description: '공개 HTTPS 주소 한 개를 읽습니다. 로그인·폼·스크립트는 실행하지 않습니다.',
  },
] as const;
export interface FolderGrant {
  id: string;
  path: string;
  write: boolean;
}
export interface BrowserSnapshot {
  title: string;
  text: string;
  url: string;
  screenshot: string;
}
export interface ToolRun {
  id: string;
  tool: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'denied' | 'expired' | 'interrupted';
  target: string;
  rootId?: string;
  path?: string;
  before: string | null;
  after: string | null;
  fingerprint: string;
  createdAt: string;
  expiresAt: string;
  message: string;
  result?: BrowserSnapshot;
  restoreOf?: string;
  recoveryPath?: string;
}
export interface ToolState {
  roots: FolderGrant[];
  browserEnabled: boolean;
  filesSupported: boolean;
  suggestedPath: string;
  registry: typeof toolRegistry;
  runs: ToolRun[];
}
export interface FileView {
  content?: string;
  entries?: { name: string; directory: boolean }[];
  truncated?: boolean;
}
