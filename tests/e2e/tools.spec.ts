import { test, expect } from './fixtures';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
test('folder permission, preview, one-time approval, restore and revocation', async ({ page }) => {
  const root = mkdtempSync(join(tmpdir(), 'aura-ui-files-'));
  try {
    await page.goto('/');
    await page.evaluate(async () => {
      const b = await (await fetch('/api/bootstrap')).json();
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Aura-Token': b.token },
        body: JSON.stringify({ onboarded: true, theme: 'light' }),
      });
    });
    await page.goto('/files');
    await expect(page.getByRole('heading', { name: '파일 작업', exact: true })).toBeVisible();
    await page.getByLabel('허용할 폴더의 전체 경로').fill(root);
    await page.getByLabel('파일 생성·수정·삭제도 허용').check();
    let releasePermission!: () => void;
    const permissionGate = new Promise<void>((resolve) => {
      releasePermission = resolve;
    });
    await page.route('**/api/tools/roots', async (route) => {
      await permissionGate;
      await route.continue();
    });
    await page.getByRole('button', { name: '이 폴더 허용' }).click();
    try {
      await expect(page.getByLabel('폴더 안의 경로')).toBeDisabled();
      await expect(page.getByLabel('파일 내용')).toBeDisabled();
    } finally {
      releasePermission();
    }
    await expect(page.getByRole('status')).toContainText('폴더 권한을 허용했습니다');
    await page.getByLabel('폴더 안의 경로').fill('meeting.txt');
    await page.getByLabel('파일 내용').fill('회의 메모\n승인한 내용만 저장합니다.');
    await page.getByRole('button', { name: '저장 미리보기' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(existsSync(join(root, 'meeting.txt'))).toBe(false);
    await page.screenshot({ path: 'docs/qa/desktop-file-approval.png', animations: 'disabled' });
    await page.getByLabel('대상과 변경 내용을 확인했습니다').check();
    await page.getByRole('button', { name: '이번 한 번 승인' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(readFileSync(join(root, 'meeting.txt'), 'utf8')).toContain('회의 메모');
    await page.getByRole('button', { name: '읽기 · 목록 보기' }).click();
    await expect(page.getByLabel('파일 내용')).toHaveValue('회의 메모\n승인한 내용만 저장합니다.');
    await page.getByRole('button', { name: '삭제 미리보기' }).click();
    await page.getByLabel('대상과 변경 내용을 확인했습니다').check();
    await page.getByRole('button', { name: '이번 한 번 승인' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(existsSync(join(root, 'meeting.txt'))).toBe(false);
    await page.getByRole('button', { name: '복구 미리보기' }).first().click();
    await page.getByLabel('대상과 변경 내용을 확인했습니다').check();
    await page.getByRole('button', { name: '이번 한 번 승인' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(readFileSync(join(root, 'meeting.txt'), 'utf8')).toContain('회의 메모');
    await page.getByLabel('파일 내용').fill('변경 예정');
    await page.getByRole('button', { name: '저장 미리보기' }).click();
    writeFileSync(join(root, 'meeting.txt'), '외부 편집 보존');
    await page.getByLabel('대상과 변경 내용을 확인했습니다').check();
    await page.getByRole('button', { name: '이번 한 번 승인' }).click();
    await expect(page.getByRole('alert')).toContainText('바뀌었습니다');
    expect(readFileSync(join(root, 'meeting.txt'), 'utf8')).toBe('외부 편집 보존');
    await page.getByRole('button', { name: '권한 해제' }).click();
    await expect(page.getByText('아직 허용한 폴더가 없어요')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'docs/qa/mobile-files.png', animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('browser permission and explicit URL approval, with unsupported actions explained', async ({
  page,
}) => {
  await page.goto('/browser');
  await expect(page.getByRole('heading', { name: '공개 웹페이지 읽기' })).toBeVisible();
  await page.getByRole('button', { name: '웹 읽기 권한 켜기' }).click();
  await page.getByLabel('읽을 HTTPS 주소').fill('https://127.0.0.1');
  await page.getByRole('button', { name: '웹 읽기 미리보기' }).click();
  await expect(page.getByRole('alert')).toContainText('공개 HTTPS');
  await page.getByLabel('읽을 HTTPS 주소').fill('https://example.com/');
  await page.getByRole('button', { name: '웹 읽기 미리보기' }).click();
  await expect(page.getByRole('dialog')).toContainText('https://example.com/');
  await expect(page.getByRole('dialog')).toContainText('해당 사이트로 전송');
  await page.getByRole('button', { name: '거절하고 닫기' }).click();
  await page.getByRole('button', { name: '웹 읽기 권한 끄기' }).click();
  await page.screenshot({ path: 'docs/qa/desktop-browser-tools.png', animations: 'disabled' });
});
