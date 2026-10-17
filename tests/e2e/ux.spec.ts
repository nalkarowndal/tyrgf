import { test, expect, type Page } from '@playwright/test';
async function setup(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    const b = await (await fetch('/api/bootstrap')).json();
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Aura-Token': b.token },
      body: JSON.stringify({
        onboarded: true,
        advanced: false,
        theme: 'light',
        provider: 'mock',
        model: 'aura-demo',
      }),
    });
  });
  await page.goto('/help');
}
test('beginner guide, progressive menus, replayable setup and keyboard mobile navigation', async ({
  page,
}) => {
  await setup(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await expect(page.getByRole('heading', { name: '시작 안내와 도움말' })).toBeVisible();
  await expect(page.getByRole('link', { name: '외부 도구 연결', exact: true })).not.toBeVisible();
  await page.getByText('더 많은 도구', { exact: true }).click();
  await expect(page.getByRole('link', { name: '외부 도구 연결', exact: true })).toBeVisible();
  await page.getByLabel('도움말 검색').fill('기억');
  await expect(page.getByRole('heading', { name: '기억 검토와 삭제' })).toBeVisible();
  await page.getByLabel('도움말 검색').fill('없는기능123');
  await expect(page.getByText('일치하는 안내가 없습니다.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '전체 도움말 보기' }).click();
  await page.screenshot({ path: 'docs/qa/desktop-guide.png', animations: 'disabled' });
  await page.getByRole('link', { name: 'AI 연결 설정 열기', exact: true }).click();
  await expect(page.locator('#main')).toBeFocused();
  await page.getByRole('button', { name: '처음 설정 다시 보기' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '처음 설정 다시 보기' })).toBeFocused();
  await page.getByLabel('사용자 모드').selectOption('advanced');
  await page.getByRole('button', { name: '일반 설정 저장' }).click();
  await expect(page.getByText('더 많은 도구', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '외부 도구 연결', exact: true })).toBeVisible();
  await page.getByLabel('사용자 모드').selectOption('beginner');
  await page.getByLabel('화면 테마').selectOption('dark');
  await page.getByRole('button', { name: '일반 설정 저장' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/help');
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.screenshot({ path: 'docs/qa/tablet-guide-dark.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '메뉴 열기' }).click();
  const menu = page.getByRole('dialog', { name: '주 메뉴' });
  await expect(menu.getByRole('button', { name: '메뉴 닫기' })).toBeFocused();
  // Shift+Tab from the first menu link wraps to its last interactive control.
  const first = menu.locator('a').first();
  await first.focus();
  await page.keyboard.press('Shift+Tab');
  expect(await menu.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '메뉴 열기' })).toBeFocused();
  await expect(menu).toHaveCount(0);
  await page.screenshot({ path: 'docs/qa/mobile-guide-dark.png', animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('read failures offer explicit retry while connection errors retain input and focus recovery', async ({
  page,
}) => {
  await setup(page);
  await page.route('**/api/tools', (route) => route.abort());
  await page.goto('/files');
  await expect(page.getByRole('alert')).toContainText('앱 서버', { timeout: 15000 });
  await page.unroute('**/api/tools');
  await page.getByRole('button', { name: '다시 불러오기' }).click();
  await expect(page.getByRole('heading', { name: '파일 작업', exact: true })).toBeVisible();
  await page.goto('/settings');
  await page.getByRole('button', { name: /Groq/ }).click();
  await page.getByPlaceholder('API 키를 붙여넣으세요').fill('fixture-key-not-real');
  await page.route('**/api/settings', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'API 키를 확인해 주세요.' }),
    }),
  );
  await page.getByRole('button', { name: '연결 테스트', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('API 키를 확인해 주세요.');
  await page.getByRole('button', { name: '연결 정보 다시 확인' }).click();
  await expect(page.getByPlaceholder('API 키를 붙여넣으세요')).toBeFocused();
  await expect(page.getByPlaceholder('API 키를 붙여넣으세요')).toHaveValue('fixture-key-not-real');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('alert').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'docs/qa/mobile-connection-recovery.png', animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
