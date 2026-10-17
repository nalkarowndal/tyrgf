import { test, expect } from './fixtures';

test('production CSP blocks inline execution and outbound fetches', async ({ page }) => {
  const response = await page.goto('/help');
  expect(response?.headers()['content-security-policy']).toContain("script-src 'self'");
  const violations = await page.evaluate(async () => {
    const directives: string[] = [];
    const completed = new Promise<string[]>((resolve) => {
      document.addEventListener('securitypolicyviolation', (event) => {
        directives.push(event.effectiveDirective);
        if (directives.includes('script-src-elem') && directives.includes('connect-src'))
          resolve(directives);
      });
    });
    const script = document.createElement('script');
    script.textContent = "document.documentElement.dataset.injected = 'yes'";
    document.body.append(script);
    await fetch('https://qa.invalid/leak').catch(() => {});
    return completed;
  });
  expect(violations).toContain('connect-src');
  await expect(page.locator('html')).not.toHaveAttribute('data-injected');
});

test('stored Markdown cannot execute HTML or load remote images', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  const payload =
    '<img src=x onerror="document.body.dataset.xss=1">\n\n[bad](javascript:alert%281%29)\n\n![remote](https://qa.invalid/pixel)';
  await page.getByRole('textbox', { name: '메시지' }).fill(payload);
  await page.getByRole('button', { name: '메시지 보내기' }).click();
  await expect(page.getByRole('button', { name: '답변 다시 생성' })).toBeEnabled();
  await page.reload();
  await expect(page.locator('.message.user')).toContainText('외부 이미지 표시 안 함: remote');
  expect(
    await page
      .locator('.markdown')
      .evaluateAll((nodes) =>
        nodes.some((node) =>
          node.querySelector('img, script, iframe, [onerror], a[href^="javascript:"]'),
        ),
      ),
  ).toBe(false);
  await expect(page.locator('body')).not.toHaveAttribute('data-xss');
  expect(errors).toEqual([]);
});

test('chat network failures preserve the question and offer recovery at 320px', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.setViewportSize({ width: 320, height: 640 });
  let sends = 0;
  await page.route('**/api/sessions/*/reply', (route) => {
    sends++;
    return route.abort();
  });
  await page.getByRole('textbox', { name: '메시지' }).fill('연결 복구 후 보낼 질문');
  await page.getByRole('button', { name: '메시지 보내기' }).click();
  await expect(page.getByRole('alert')).toContainText('저장된 대화');
  await expect(page.getByRole('button', { name: '메시지 보내기' })).toBeEnabled();
  await expect(page.getByRole('textbox', { name: '메시지' })).toHaveValue('연결 복구 후 보낼 질문');
  expect(sends).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'docs/qa/mobile-chat-recovery-320.png', animations: 'disabled' });
  await page.unroute('**/api/sessions/*/reply');
  await page.getByRole('button', { name: '메시지 보내기' }).click();
  await expect(page.getByRole('button', { name: '답변 다시 생성' })).toBeEnabled();
  await expect(page.locator('.message.user')).toHaveCount(1);
  expect(await (await request.get('/api/sessions')).json()).toHaveLength(1);
});

test('new conversation explicitly discards a failed first-send draft', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.route('**/api/sessions/*/reply', (route) => route.abort());
  await page.getByRole('textbox', { name: '메시지' }).fill('보내지 못한 이전 초안');
  await page.getByRole('button', { name: '메시지 보내기' }).click();
  await expect(page.getByRole('alert')).toContainText('저장된 대화');
  await expect(page.getByRole('button', { name: '메시지 보내기' })).toBeEnabled();
  await page.getByRole('button', { name: '새 대화 +' }).click();
  await expect(page.getByRole('textbox', { name: '메시지' })).toHaveValue('');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.unroute('**/api/sessions/*/reply');
  await page.getByRole('textbox', { name: '메시지' }).fill('별개의 새 대화');
  await page.getByRole('button', { name: '메시지 보내기' }).click();
  await expect(page.getByRole('button', { name: '답변 다시 생성' })).toBeEnabled();
  expect(await (await request.get('/api/sessions')).json()).toHaveLength(2);
});
