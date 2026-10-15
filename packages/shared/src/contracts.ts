import { z } from 'zod';
export const providerId = z.enum(['mock', 'gemini', 'groq', 'ollama']);
export type ProviderId = z.infer<typeof providerId>;
export const registry: Record<
  ProviderId,
  {
    name: string;
    description: string;
    models: string[];
    keyUrl?: string;
    docs: string;
    cloud: boolean;
  }
> = {
  mock: {
    name: '체험용 모의 AI',
    description: '인터넷과 API 키 없이 화면과 대화 저장을 체험합니다. 실제 AI가 아닙니다.',
    models: ['aura-demo'],
    docs: '',
    cloud: false,
  },
  gemini: {
    name: 'Google Gemini',
    description:
      '긴 문서와 복잡한 질문에 적합합니다. 무료 등급에서는 입력이 서비스 개선에 사용될 수 있습니다.',
    models: ['gemini-3.8-flash', 'gemini-3.5-flash-lite'],
    keyUrl: 'https://aistudio.google.com/apikey',
    docs: 'https://ai.google.dev/gemini-api/docs/pricing',
    cloud: true,
  },
  groq: {
    name: 'Groq',
    description: '빠른 답변에 적합합니다. 계정별 무료 한도는 Groq 콘솔에서 확인하세요.',
    models: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
    keyUrl: 'https://console.groq.com/keys',
    docs: 'https://console.groq.com/docs/rate-limits',
    cloud: true,
  },
  ollama: {
    name: '내 컴퓨터 · Ollama',
    description: '설치한 로컬 모델을 사용합니다. PC 성능과 모델 크기에 따라 속도가 달라집니다.',
    models: [],
    docs: 'https://docs.ollama.com/',
    cloud: false,
  },
};
export const settingsSchema = z
  .object({
    provider: providerId.default('mock'),
    model: z.string().min(1).max(150).default('aura-demo'),
    externalConsent: z.boolean().default(false),
    freeConfirmed: z.boolean().default(false),
    ollamaUrl: z
      .enum(['http://127.0.0.1:11434', 'http://localhost:11434'])
      .default('http://127.0.0.1:11434'),
    theme: z.enum(['light', 'dark', 'system']).default('light'),
    advanced: z.boolean().default(false),
    onboarded: z.boolean().default(false),
    contextBudget: z.number().int().min(2000).max(32000).default(16000),
    hiddenMenus: z.array(z.string().max(40)).max(10).default([]),
  })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;
export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'complete' | 'streaming' | 'interrupted' | 'error';
  provider: ProviderId;
  model: string;
  createdAt: string;
  seq: number;
}
export interface Session {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}
export interface Usage {
  provider: ProviderId;
  requests: number;
  tokens: number;
  estimated: boolean;
}
export interface Bootstrap {
  token: string;
  settings: Settings;
  keyStatus: Record<string, boolean>;
  capabilities: { tools: boolean };
  usage: Usage[];
}
export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'start'; id: string }
  | { type: 'done'; status: string }
  | { type: 'error'; message: string }
  | { type: 'notice'; message: string };
