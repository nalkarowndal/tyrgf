import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
test('agent executes a multi-tool demo with pause, immutable approval and verified result', async ({
  page,
}) => {
  const root = mkdtempSync(join(tmpdir(), 'aura-agent-ui-'));
  writeFileSync(join(root, 'notes.txt'), '프로젝트 일정: 금요일 데모');
  try {
    await page.goto('/');
    await page.evaluate(async (root) => {
      const b = await (await fetch('/api/bootstrap')).json();
      const post = (p: string, body: object) =>
        fetch('/api' + p, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Aura-Token': b.token },
          body: JSON.stringify(body),
        });
      await post('/settings', {
        onboarded: true,
        theme: 'light',
        provider: 'mock',
        model: 'aura-demo',
      });
      await post('/tools/roots', { path: root, write: true });
    }, root);
    await page.goto('/tasks');
    await expect(page.getByRole('heading', { name: '작업 관리', exact: true })).toBeVisible();
    await page.getByLabel('작업 목표').fill('파일을 읽고 보고서를 만들어 주세요');
    await page.getByRole('button', { name: '작업 시작' }).click();
    await expect(page.getByRole('heading', { name: '실행 전 확인' })).toBeVisible();
    await expect(page.getByText('모의 복합 작업', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: '일시중지', exact: true }).click();
    await expect(page.getByRole('button', { name: '작업 재개' })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: '작업 재개' }).click();
    await expect(page.getByRole('heading', { name: '실행 전 확인' })).toBeVisible();
    await page
      .locator('.agent-approval')
      .screenshot({ path: 'docs/qa/desktop-agent-approval.png', animations: 'disabled' });
    await page.getByLabel('대상과 내용을 확인하고 이번 실행을 승인합니다').check();
    await page.getByRole('button', { name: '이번 한 번 승인' }).click();
    await expect(page.getByRole('heading', { name: '검증한 작업 결과' })).toBeVisible();
    expect(readFileSync(join(root, 'aura-report.md'), 'utf8')).toContain('금요일');
    await page.reload();
    await expect(page.getByRole('heading', { name: '검증한 작업 결과' })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('heading', { name: '검증한 작업 결과' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'docs/qa/mobile-agent-result.png', animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: '스킬 초안으로 저장' }).click();
    await expect(page.getByRole('heading', { name: '스킬 관리', exact: true })).toBeVisible();
    await expect(page.getByText('검토 대기', { exact: true })).toBeVisible();
    await page.getByLabel('절차와 필요한 권한을 확인했습니다').check();
    await page.getByRole('button', { name: '현재 버전 승인' }).click();
    await expect(page.getByText('승인됨', { exact: true })).toBeVisible();
    await page.screenshot({
      path: 'docs/qa/mobile-skills.png',
      animations: 'disabled',
      fullPage: true,
    });
    await page.getByRole('link', { name: '이 스킬로 새 작업' }).click();
    await expect(page.getByLabel('재사용할 스킬')).not.toHaveValue('');
    await page.getByLabel('작업 목표').fill('승인한 절차로 다시 보고서 생성');
    await page.getByRole('button', { name: '작업 시작', exact: true }).click();
    await expect(page.getByRole('heading', { name: '실행 전 확인' })).toBeVisible();
    await page.getByRole('button', { name: '거절하고 작업 취소' }).click();
    await expect(page.getByText('취소됨', { exact: true })).toBeVisible();
  } finally {
    await page.evaluate(async (root) => {
      const b = await (await fetch('/api/bootstrap')).json();
      const state = await (await fetch('/api/tools')).json();
      for (const grant of state.roots)
        if (grant.path === root)
          await fetch('/api/tools/roots/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Aura-Token': b.token },
            body: JSON.stringify({ rootId: grant.id }),
          });
    }, root);
    rmSync(root, { recursive: true, force: true });
  }
});
