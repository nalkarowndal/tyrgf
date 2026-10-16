import { z } from 'zod';
export const memoryInput = z
  .object({
    title: z.string().trim().min(1).max(100),
    category: z.string().trim().min(1).max(40),
    content: z.string().trim().min(1).max(2000),
  })
  .strict();
export interface MemoryEntry extends z.infer<typeof memoryInput> {
  id: string;
  version: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  source: {
    kind: 'user' | 'summary';
    sessionId?: string;
    throughSeq?: number;
    hash?: string;
    simulated?: boolean;
    provider?: string;
    model?: string;
  };
}
export const skillTools = z.enum(['file.list', 'file.read', 'file.write', 'browser.read']);
export const skillInput = z
  .object({
    name: z.string().trim().min(1).max(100),
    purpose: z.string().trim().min(1).max(2000),
    steps: z.array(z.string().trim().min(1).max(500)).min(1).max(8),
    tools: z.array(skillTools).min(1).max(4),
    verification: z.string().trim().min(1).max(1000),
  })
  .strict();
export interface SavedSkill extends z.infer<typeof skillInput> {
  id: string;
  version: number;
  approvedVersion: number | null;
  sourceTaskId: string;
  createdAt: string;
  updatedAt: string;
  permissions: string[];
  lastResult?: { taskId: string; status: string; message: string; version: number };
}
