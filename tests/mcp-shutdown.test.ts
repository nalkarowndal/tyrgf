import { expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
it.runIf(process.platform === 'linux')(
  'waits for an already-disconnecting MCP child before the real app exits',
  async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aura-mcp-shutdown-')),
      root = join(dir, 'project');
    mkdirSync(root);
    const socket = createServer();
    socket.listen(0, '127.0.0.1');
    await once(socket, 'listening');
    const port = (socket.address() as { port: number }).port;
    await new Promise<void>((resolve) => socket.close(() => resolve()));
    const sdk = pathToFileURL(
      join(process.cwd(), 'node_modules/@modelcontextprotocol/sdk/dist/esm/'),
    ).href;
    const binary = join(dir, 'repomix'),
      pidPath = join(dir, 'child.pid');
    writeFileSync(
      binary,
      `#!${process.execPath}
(async()=>{const {Server}=await import(${JSON.stringify(sdk + 'server/index.js')});const {StdioServerTransport}=await import(${JSON.stringify(sdk + 'server/stdio.js')});const {ListToolsRequestSchema}=await import(${JSON.stringify(sdk + 'types.js')});const {writeFileSync}=await import('node:fs');writeFileSync(${JSON.stringify(pidPath)},String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);const server=new Server({name:'stubborn',version:'1'},{capabilities:{tools:{}}});server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[]}));await server.connect(new StdioServerTransport());})().catch(()=>process.exit(1));`,
      { mode: 0o700 },
    );
    const parent = spawn(process.execPath, ['--import', 'tsx', 'apps/server/src/index.ts'], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH, AURA_PORT: String(port), AURA_DATA_DIR: join(dir, 'data') },
      stdio: 'ignore',
    });
    let childPid = 0,
      token = '';
    const base = `http://127.0.0.1:${port}/api`;
    const post = async (path: string, body: object) => {
      const r = await fetch(base + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Aura-Token': token },
        body: JSON.stringify(body),
      });
      expect(r.ok).toBe(true);
      return r.json();
    };
    try {
      const { vi } = await import('vitest');
      await vi.waitFor(
        async () => {
          token = (await (await fetch(base + '/bootstrap')).json()).token;
        },
        { timeout: 6000 },
      );
      const grant = await post('/tools/roots', { path: root, write: false });
      const profile = await post('/mcp/servers', {
        kind: 'repomix',
        executable: binary,
        rootId: grant.id,
      });
      await post(`/mcp/servers/${profile.id}/connect`, { confirmed: true });
      childPid = Number(readFileSync(pidPath, 'utf8'));
      expect(alive(childPid)).toBe(true);
      // Start disconnect without waiting: close() must also track clients removed from live.
      const disconnect = post(`/mcp/servers/${profile.id}/disconnect`, {}).catch(() => {});
      await vi.waitFor(async () => {
        const state = await (await fetch(base + '/mcp')).json();
        expect(state.servers[0].status).toBe('disconnected');
      });
      const exited = once(parent, 'exit');
      parent.kill('SIGTERM');
      await exited;
      await disconnect;
      expect(alive(childPid)).toBe(false);
    } finally {
      if (parent.exitCode === null && parent.signalCode === null) parent.kill('SIGKILL');
      if (childPid && alive(childPid)) process.kill(childPid, 'SIGKILL');
      rmSync(dir, { recursive: true, force: true });
    }
  },
  15000,
);
