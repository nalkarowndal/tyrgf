import { z } from 'zod';
import type { ProviderId } from './contracts';
export const agentAction = z.discriminatedUnion('tool', [
  z
    .object({
      tool: z.literal('file.list'),
      path: z.string().max(500),
      reason: z.string().min(1).max(500),
    })
    .strict(),
  z
    .object({
      tool: z.literal('file.read'),
      path: z.string().min(1).max(500),
      reason: z.string().min(1).max(500),
    })
    .strict(),
  z
    .object({
      tool: z.literal('file.write'),
      path: z.string().min(1).max(500),
      content: z.string().max(24000),
      reason: z.string().min(1).max(500),
    })
    .strict(),
  z
    .object({
      tool: z.literal('browser.read'),
      url: z.string().max(2000),
      reason: z.string().min(1).max(500),
    })
    .strict(),
  z
    .object({
      tool: z.literal('finish'),
      answer: z.string().min(1).max(8000),
      reason: z.string().min(1).max(500),
    })
    .strict(),
]);
export type AgentAction = z.infer<typeof agentAction>;
export interface AgentStep {
  id: string;
  tool: string;
  reason: string;
  target: string;
  status: 'succeeded' | 'failed';
  observation: string;
  fingerprint?: string;
  path?: string;
  runId?: string;
}
export interface AgentTask {
  id: string;
  goal: string;
  provider: ProviderId;
  model: string;
  simulated: boolean;
  allowModelData: boolean;
  rootId: string;
  rootPath: string;
  rootIdentity: string;
  status:
    | 'running'
    | 'awaiting_approval'
    | 'paused'
    | 'recoverable_error'
    | 'needs_review'
    | 'completed'
    | 'cancelled'
    | 'failed';
  phase: 'planning' | 'executing' | 'verifying';
  message: string;
  steps: AgentStep[];
  maxSteps: number;
  modelCalls: number;
  retries: number;
  pendingAction?: AgentAction;
  pendingRun?: string;
  answer?: string;
  verification?: string;
  createdAt: string;
  updatedAt: string;
  checkpointVersion: 1;
}
export const createTaskSchema = z
  .object({
    goal: z.string().trim().min(1).max(2000),
    rootId: z.string().optional(),
    allowModelData: z.boolean().default(false),
    maxSteps: z.number().int().min(2).max(8).default(8),
  })
  .strict();
