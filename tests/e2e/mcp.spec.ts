import { test, expect } from './fixtures';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('connects real MCP, selects permission, approves read, and disconnects on mobile', async ({
  page,
}) => {
  const folder = mkdtempSync(join(tmpdir(), 'aura-mcp-ui-'));
  writeFileSync(join(folder, 'hello.txt'), '화면에서 확인한 실제 MCP 결과');
  try {
    await page.goto('/mcp');
    const rootId = await page.evaluate(async (path) => {
      const b = await (await fetch('/api/bootstrap')).json();
      const r = await fetch('/api/tools/roots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Aura-Token': b.token },
        body: JSON.stringify({ path, write: false }),
      });
      return (await r.json()).id;
    }, folder);
    await page.reload();
    await page.getByLabel('연결할 폴더').selectOption(rootId);
    await page.getByRole('button', { name: '서버 등록', exact: true }).click();
    const card = page.locator('.mcp-server');
    await card.getByRole('button', { name: '연결 검토' }).click();
    await page.getByLabel('프로그램 실행을 확인했습니다').check();
    await page.getByRole('button', { name: '확인하고 연결 테스트' }).click();
    await expect(card.getByText('연결됨', { exact: true })).toBeVisible();
    await card.getByLabel('텍스트 파일 읽기 허용').check();
    await card.getByRole('button', { name: '도구 권한 저장' }).click();
    await card.getByLabel('실행할 도구').selectOption('project_read');
    await expect(card.getByLabel('도구 입력 JSON')).toHaveCount(0);
    await card.getByLabel('읽을 파일 경로').fill('hello.txt');
    await card.getByRole('button', { name: '실행 미리보기' }).click();
    await expect(page.getByRole('dialog')).toContainText('hello.txt');
    await page.getByRole('button', { name: '이 입력으로 한 번 실행' }).click();
    await expect(page.getByText('화면에서 확인한 실제 MCP 결과', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'docs/qa/desktop-mcp.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await card.getByRole('button', { name: '연결 해제' }).click();
    await expect(card.getByText('연결 안 됨', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'docs/qa/mobile-mcp.png', fullPage: true });
    await page.evaluate(async (id) => {
      const b = await (await fetch('/api/bootstrap')).json();
      await fetch('/api/tools/roots/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Aura-Token': b.token },
        body: JSON.stringify({ rootId: id }),
      });
    }, rootId);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
