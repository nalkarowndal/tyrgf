import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import type { Express } from 'express';
import {
  createTaskSchema,
  type AgentTask,
  type AgentStep,
} from '../../../packages/shared/src/agent';
import { registry } from '../../../packages/shared/src/contracts';
import type { ToolRun } from '../../../packages/shared/src/tools';
import { PublicError, validateProvider, type ProviderConfig } from './providers';
import type { Store } from './store';
import type { ToolService } from './tool-service';
import { planNext } from './agent-planner';
import type { SkillsStore } from './skills-store';
import { AgentCheckpoints } from './agent-checkpoints';
const empty = z.object({}).strict();
export class AgentService {
  private active = new Map<string, AbortController>();
  private closed = false;
  constructor(
    private store: Store,
    private tools: ToolService,
    private config: () => ProviderConfig,
    private skills: SkillsStore,
  ) {
    store.db.exec(
      `CREATE TABLE IF NOT EXISTS agent_tasks(id TEXT PRIMARY KEY,payload TEXT NOT NULL);CREATE TABLE IF NOT EXISTS agent_checkpoints(taskId TEXT PRIMARY KEY REFERENCES agent_tasks(id),snapshot BLOB NOT NULL);PRAGMA user_version=3;`,
    );
    for (const task of this.list(true))
      if (['running', 'awaiting_approval', 'recoverable_error'].includes(task.status)) {
        task.status = 'paused';
        task.message = '앱이 재시작되었습니다. 폴더 권한과 AI 연결을 확인한 뒤 재개하세요.';
        this.save(task);
      }
  }
  get(id: string): AgentTask {
    const r = this.store.db.prepare('SELECT payload FROM agent_tasks WHERE id=?').get(id) as
      { payload: string } | undefined;
    if (!r) throw new PublicError('작업을 찾을 수 없습니다.', 404);
    return JSON.parse(r.payload);
  }
  list(all = false): AgentTask[] {
    return (
      this.store.db
        .prepare('SELECT payload FROM agent_tasks ORDER BY rowid DESC' + (all ? '' : ' LIMIT 100'))
        .all() as { payload: string }[]
    ).map((r) => JSON.parse(r.payload));
  }
  private save(task: AgentTask) {
    if (this.closed) throw new PublicError('앱이 종료되어 작업을 중단했습니다.');
    task.updatedAt = new Date().toISOString();
    this.store.db
      .prepare(
        'INSERT INTO agent_tasks VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
      )
      .run(task.id, JSON.stringify(task));
    return task;
  }
  private connection(task: AgentTask) {
    if (task.skillId) this.skills.require(task.skillId, task.skillVersion!);
    const config = this.config();
    if (config.provider !== task.provider || config.model !== task.model)
      throw new PublicError(
        '작업을 시작한 AI와 모델로 설정을 되돌린 뒤 재개하세요. 자동으로 다른 모델을 사용하지 않습니다.',
        409,
      );
    validateProvider(config);
    if (registry[config.provider].cloud && !task.allowModelData)
      throw new PublicError('목표와 도구 결과의 외부 AI 전송 동의가 필요합니다.', 403);
    return config;
  }
  private scope(task: AgentTask, rootId = task.rootId) {
    const root = this.tools.files.root(rootId);
    if (root.path !== task.rootPath || root.identity !== task.rootIdentity)
      throw new PublicError(
        '처음 선택한 폴더와 다른 폴더입니다. 원래 폴더를 다시 허용하세요.',
        403,
      );
    task.rootId = rootId;
  }
  private available(id?: string) {
    if (this.active.has(id ?? '')) throw new PublicError('이미 실행 중인 작업입니다.', 409);
    if (this.active.size)
      throw new PublicError(
        '한 번에 한 작업만 실행할 수 있습니다. 진행 중인 작업을 잠시 멈춰 주세요.',
        429,
      );
  }
  create(body: unknown) {
    const b = createTaskSchema.parse(body),
      c = this.config();
    if (registry[c.provider].cloud && !b.allowModelData)
      throw new PublicError('목표와 읽은 도구 결과를 외부 AI에 전송하는 데 동의해 주세요.', 403);
    validateProvider(c);
    if (b.skillId) this.skills.require(b.skillId, b.skillVersion!);
    this.available();
    if (!b.rootId) throw new PublicError('먼저 작업 폴더를 선택해 주세요.', 403);
    const root = this.tools.files.root(b.rootId);
    const task: AgentTask = {
      id: randomUUID(),
      goal: b.goal,
      skillId: b.skillId,
      skillVersion: b.skillVersion,
      provider: c.provider,
      model: c.model,
      simulated: c.provider === 'mock',
      allowModelData: b.allowModelData,
      rootId: root.id,
      rootPath: root.path,
      rootIdentity: root.identity,
      status: 'running',
      phase: 'planning',
      message: '작업을 계획합니다.',
      steps: [],
      maxSteps: b.maxSteps,
      modelCalls: 0,
      retries: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      checkpointVersion: 1,
    };
    this.save(task);
    this.launch(task.id);
    return task;
  }
  resume(id: string, rootId?: string) {
    const task = this.get(id);
    if (['completed', 'cancelled', 'failed', 'needs_review'].includes(task.status))
      throw new PublicError(
        '종료되었거나 결과 확인이 필요한 작업입니다. 기록을 확인하고 새 작업을 시작하세요.',
        409,
      );
    this.available(id);
    this.connection(task);
    this.scope(task, rootId);
    task.status = 'running';
    task.message = '마지막 실행 기록부터 이어갑니다.';
    this.save(task);
    this.launch(id);
    return task;
  }
  pause(id: string, cancel = false) {
    const task = this.get(id);
    if (['completed', 'cancelled', 'failed', 'needs_review'].includes(task.status))
      throw new PublicError('이미 종료된 작업입니다.', 409);
    this.active.get(id)?.abort();
    if (task.pendingRun) {
      this.tools.stop(task.pendingRun);
      if (cancel) {
        try {
          this.tools.deny(task.pendingRun);
        } catch {
          /* already executed, receipt remains */
        }
      }
    }
    task.status = cancel ? 'cancelled' : 'paused';
    task.message = cancel
      ? '작업을 취소했습니다. 이미 완료한 파일 변경은 실행 기록에서 확인하세요.'
      : '일시중지했습니다. 완료한 단계는 다시 실행하지 않습니다.';
    return this.save(task);
  }
  approve(id: string, runId: string) {
    const task = this.get(id);
    if (task.status !== 'awaiting_approval' || task.pendingRun !== runId)
      throw new PublicError('현재 작업의 승인 요청과 일치하지 않습니다.', 409);
    this.available(id);
    this.connection(task);
    this.scope(task);
    task.status = 'running';
    task.message = '승인한 도구를 실행합니다.';
    this.save(task);
    this.launch(id, runId);
    return task;
  }
  deny(id: string, runId: string) {
    const t = this.get(id);
    if (t.status !== 'awaiting_approval' || t.pendingRun !== runId)
      throw new PublicError('현재 승인 요청과 일치하지 않습니다.', 409);
    this.tools.deny(runId);
    return this.pause(id, true);
  }
  private launch(id: string, approvedRun?: string) {
    const controller = new AbortController();
    this.active.set(id, controller);
    const timer = setTimeout(() => controller.abort(), 120000);
    void (async () => {
      try {
        if (approvedRun) {
          await this.tools.approve(approvedRun);
          controller.signal.throwIfAborted();
        }
        const state = Annotation.Root({ taskId: Annotation<string>() });
        const graph = new StateGraph(state)
          .addNode('advance', async () => {
            await this.tick(id, controller.signal);
            return { taskId: id };
          })
          .addEdge(START, 'advance')
          .addConditionalEdges('advance', () =>
            this.get(id).status === 'running' ? 'advance' : END,
          )
          .compile({ checkpointer: new AgentCheckpoints(this.store, id, () => !this.closed) });
        // Each invocation continues from the transactional task cursor. Native graph
        // checkpoints preserve supersteps; completed tool receipts remain authoritative.
        await graph.invoke(
          { taskId: id },
          { configurable: { thread_id: id }, recursionLimit: 40, signal: controller.signal },
        );
      } catch (e) {
        if (!this.closed) {
          const t = this.get(id);
          if (t.status === 'running') {
            // Count failures when they happen, independent of pause/restart status.
            t.status = controller.signal.aborted
              ? 'paused'
              : t.phase === 'verifying'
                ? 'needs_review'
                : ++t.retries >= 3
                  ? 'failed'
                  : 'recoverable_error';
            t.message = controller.signal.aborted
              ? '실행 시간이 끝났거나 중단되었습니다. 마지막 기록부터 재개할 수 있습니다.'
              : e instanceof PublicError
                ? e.message
                : '계획 또는 도구 실행에 실패했습니다. 연결과 권한을 확인하고 재개하세요.';
            if (t.status === 'failed')
              t.message = '복구 예산을 소진했습니다. 연결과 권한을 확인하고 새 작업을 시작하세요.';
            if (t.status === 'needs_review')
              t.message =
                '파일 결과를 확인할 수 없어 중단했습니다. 파일과 실행 기록을 직접 확인하세요.';
            this.save(t);
          }
        }
      } finally {
        clearTimeout(timer);
        this.active.delete(id);
      }
    })();
  }
  private uncertain(t: AgentTask, message: string) {
    t.status = 'needs_review';
    t.message = message;
    this.save(t);
  }
  private receipt(t: AgentTask, run: ToolRun) {
    if (run.status === 'succeeded') {
      if (run.tool === 'file.write') {
        t.phase = 'verifying';
        this.save(t);
        if (this.tools.files.snapshot(t.rootId, run.path!).fingerprint !== run.fingerprint) {
          this.uncertain(
            t,
            '저장 이후 파일이 바뀌었습니다. 완료로 처리하지 않았습니다. 파일과 실행 기록을 확인하세요.',
          );
          return;
        }
      }
      const action = t.pendingAction!;
      t.steps.push({
        id: run.id,
        runId: run.id,
        tool: run.tool,
        reason: action.reason,
        target: run.target,
        status: 'succeeded',
        path: run.path,
        fingerprint: run.tool === 'file.write' ? run.fingerprint : undefined,
        observation: run.result
          ? JSON.stringify({ title: run.result.title, text: run.result.text, url: run.result.url })
          : '파일 저장 결과를 실제 파일과 비교했습니다.',
      });
      delete t.pendingRun;
      delete t.pendingAction;
      t.phase = 'planning';
      this.save(t);
      return;
    }
    if (run.status === 'interrupted' || run.status === 'running') {
      this.uncertain(
        t,
        '이전 실행의 결과가 불확실합니다. 자동으로 다시 실행하지 않습니다. 도구 기록과 파일을 확인하세요.',
      );
      return;
    }
    if (run.status === 'denied') {
      t.status = 'cancelled';
      t.message = '도구 실행이 거절되어 작업을 중단했습니다.';
      this.save(t);
      return;
    }
    if (run.status === 'expired') {
      delete t.pendingRun;
      this.save(t);
      return;
    }
    if (run.status === 'failed') {
      if (run.tool === 'file.write') {
        this.uncertain(
          t,
          '파일 저장 중 오류가 발생해 결과가 불확실합니다. 자동으로 다시 실행하지 않습니다. 파일과 도구 기록의 복구 위치를 확인하세요.',
        );
        return;
      }
      t.steps.push({
        id: run.id,
        runId: run.id,
        tool: run.tool,
        target: run.target,
        status: 'failed',
        reason: t.pendingAction!.reason,
        observation: run.message,
      });
      delete t.pendingRun;
      delete t.pendingAction;
      this.save(t);
      return;
    }
    t.status = 'awaiting_approval';
    t.message = '대상과 내용을 확인한 뒤 이번 한 번만 승인하세요.';
    this.save(t);
  }
  private async tick(id: string, signal: AbortSignal) {
    await delay(5, undefined, { signal });
    signal.throwIfAborted();
    const task = this.get(id);
    if (task.status !== 'running') return;
    this.connection(task);
    this.scope(task);
    if (task.pendingRun) {
      this.receipt(task, this.tools.get(task.pendingRun));
      return;
    }
    if (!task.pendingAction) {
      if (task.modelCalls >= 12) {
        task.status = 'failed';
        task.message = '모델 호출 예산을 소진했습니다.';
        this.save(task);
        return;
      }
      task.phase = 'planning';
      task.message = '목표와 이전 결과로 다음 단계를 계획합니다.';
      task.modelCalls++;
      this.save(task);
      const skill = task.skillId
        ? this.skills.require(task.skillId, task.skillVersion!)
        : undefined;
      const action = await planNext(task, this.connection(task), signal, this.store, skill);
      signal.throwIfAborted();
      task.pendingAction = action;
      this.save(task);
    }
    const action = task.pendingAction;
    if (
      task.skillId &&
      action.tool !== 'finish' &&
      !this.skills.require(task.skillId, task.skillVersion!).tools.includes(action.tool)
    ) {
      task.status = 'failed';
      task.message = '스킬에 승인된 도구 범위를 벗어나 중단했습니다.';
      this.save(task);
      return;
    }
    signal.throwIfAborted();
    if (action.tool === 'finish') {
      task.phase = 'verifying';
      this.save(task);
      if (task.steps.filter((s) => s.status === 'succeeded').length < 2) {
        delete task.pendingAction;
        task.phase = 'planning';
        this.save(task);
        throw new PublicError(
          '두 단계 이상의 도구 결과가 없어 완료를 검증할 수 없습니다. 재개하면 다시 계획합니다.',
        );
      }
      const latest = new Map<string, AgentStep>();
      for (const step of task.steps)
        if (step.status === 'succeeded' && step.path && step.fingerprint)
          latest.set(step.path, step);
      for (const [path, step] of latest)
        if (this.tools.files.snapshot(task.rootId, path).fingerprint !== step.fingerprint) {
          this.uncertain(
            task,
            '읽거나 저장한 파일이 변경되어 결과 검증을 통과하지 못했습니다. 파일을 확인하세요.',
          );
          return;
        }
      task.status = 'completed';
      task.answer = action.answer;
      task.message = '작업을 완료했습니다.';
      task.verification = `성공한 도구 ${task.steps.filter((s) => s.status === 'succeeded').length}개와 현재 파일 ${latest.size}개의 정체성·내용을 확인했습니다. AI 답변의 의미적 정확성은 직접 검토하세요.`;
      delete task.pendingAction;
      this.save(task);
      return;
    }
    if (task.steps.length >= task.maxSteps) {
      task.status = 'failed';
      task.message = '도구 실행 예산을 소진했습니다. 더 작은 범위로 새 작업을 시작하세요.';
      delete task.pendingAction;
      this.save(task);
      return;
    }
    task.phase = 'executing';
    task.message = action.reason;
    this.save(task);
    if (action.tool === 'file.read' || action.tool === 'file.list') {
      try {
        this.store.transaction(() => {
          const { run, result, fingerprint } = this.tools.read(
            task.rootId,
            action.path,
            action.tool === 'file.read',
          );
          if (action.tool === 'file.read' && result.content === undefined)
            throw new PublicError('파일 읽기에 폴더 경로가 선택되었습니다.');
          if (action.tool === 'file.list' && !result.entries)
            throw new PublicError('폴더 목록에 파일 경로가 선택되었습니다.');
          const observation = JSON.stringify(result);
          if (observation.length > 24000)
            throw new PublicError('도구 결과가 너무 큽니다. 더 작은 파일이나 폴더를 선택하세요.');
          task.steps.push({
            id: run.id,
            runId: run.id,
            tool: action.tool,
            reason: action.reason,
            target: run.target,
            path: action.path,
            status: 'succeeded',
            observation,
            fingerprint,
          });
          delete task.pendingAction;
          this.save(task);
        });
      } catch (e) {
        task.steps.push({
          id: randomUUID(),
          tool: action.tool,
          reason: action.reason,
          target: action.path,
          status: 'failed',
          observation: e instanceof PublicError ? e.message : '도구 읽기에 실패했습니다.',
        });
        delete task.pendingAction;
        this.save(task);
      }
    } else {
      // Missing capability is recoverable after a user grants it. An invalid model
      // path is an observation for replanning, never a reason to broaden access.
      if (action.tool === 'file.write') this.tools.files.root(task.rootId, true);
      else if (!this.tools.browserEnabled)
        throw new PublicError('브라우저 메뉴에서 웹 읽기 권한을 켠 뒤 재개하세요.', 403);
      try {
        this.store.transaction(() => {
          const run = this.tools.preview(
            action.tool === 'browser.read'
              ? { tool: action.tool, url: action.url }
              : {
                  tool: action.tool,
                  rootId: task.rootId,
                  path: action.path,
                  content: action.content,
                },
          );
          task.pendingRun = run.id;
          task.status = 'awaiting_approval';
          task.message = '이 작업은 개별 승인이 필요합니다. 대상과 내용을 확인하세요.';
          this.save(task);
        });
      } catch (e) {
        task.status = 'running';
        task.steps.push({
          id: randomUUID(),
          tool: action.tool,
          target: action.tool === 'browser.read' ? action.url : action.path,
          reason: action.reason,
          status: 'failed',
          observation: e instanceof PublicError ? e.message : '도구 요청을 만들지 못했습니다.',
        });
        delete task.pendingAction;
        delete task.pendingRun;
        this.save(task);
      }
    }
  }
  mount(app: Express) {
    app.get('/api/tasks', (_req, res) => res.json(this.list()));
    app.get('/api/tasks/:id', (req, res) => res.json(this.get(req.params.id)));
    app.post('/api/tasks', (req, res) => res.status(201).json(this.create(req.body)));
    app.post('/api/tasks/:id/resume', (req, res) => {
      const b = z.object({ rootId: z.string().optional() }).strict().parse(req.body);
      res.status(202).json(this.resume(req.params.id, b.rootId));
    });
    for (const action of ['pause', 'cancel'] as const)
      app.post(`/api/tasks/:id/${action}`, (req, res) => {
        empty.parse(req.body);
        res.json(this.pause(req.params.id, action === 'cancel'));
      });
    for (const action of ['approve', 'deny'] as const)
      app.post(`/api/tasks/:id/${action}`, (req, res) => {
        const b = z.object({ runId: z.string() }).strict().parse(req.body);
        res
          .status(action === 'approve' ? 202 : 200)
          .json(
            action === 'approve'
              ? this.approve(req.params.id, b.runId)
              : this.deny(req.params.id, b.runId),
          );
      });
  }
  close() {
    this.closed = true;
    for (const [id, c] of this.active) {
      c.abort();
      const t = this.get(id);
      if (t.pendingRun) this.tools.stop(t.pendingRun);
    }
  }
}
