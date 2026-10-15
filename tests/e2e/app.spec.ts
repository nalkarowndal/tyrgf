import { test, expect } from '@playwright/test';
test('first run and durable chat with settings and responsive layouts', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: '안녕하세요! AURA와 시작해 볼까요?' }),
  ).toBeVisible();
  await page.screenshot({
    path: 'docs/qa/desktop-onboarding.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'docs/qa/mobile-onboarding.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('button', { name: '설정 시작' }).click();
  await page.screenshot({
    path: 'docs/qa/desktop-provider-setup.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: '연결 테스트', exact: true }).click();
  await expect(
    page.getByText('모의 공급자 동작을 확인했습니다. 실제 API 연결 테스트가 아닙니다.'),
  ).toBeVisible();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByText('처음에는 모든 도구 권한이 꺼져 있어요')).toBeVisible();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByRole('button', { name: 'AURA 시작하기' }).click();
  await expect(page.getByRole('heading', { name: '무엇을 함께 해볼까요?' })).toBeVisible();
  await page.screenshot({
    path: 'docs/qa/desktop-home.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('textbox', { name: '메시지' }).fill('한글 스트리밍을 확인해 주세요');
  await page.getByRole('button', { name: '메시지 보내기' }).click();
  await expect(page.getByText('실제 AI가 생성한 답변이 아닙니다.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: '답변 다시 생성' })).toBeEnabled();
  await page.reload();
  await expect(
    page.getByText('한글 스트리밍을 확인해 주세요', { exact: true }).last(),
  ).toBeVisible();
  await page.getByRole('button', { name: '대화 이름 변경' }).click();
  await page.getByRole('textbox', { name: '대화 이름' }).fill('나의 첫 대화');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('heading', { name: '나의 첫 대화' })).toBeVisible();
  await page.getByRole('button', { name: '답변 다시 생성' }).click();
  await expect(page.getByRole('button', { name: '답변 다시 생성' })).toBeEnabled();
  await page.screenshot({
    path: 'docs/qa/desktop-chat.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('link', { name: '설정', exact: true }).click();
  await page.getByLabel('화면 테마').selectOption('dark');
  await page.getByRole('button', { name: '일반 설정 저장' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'AI 연결', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '연결 설정 저장', exact: true }).click();
  await expect(page.getByText('AI 연결 설정을 저장했습니다.')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('.settings-page').evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({
    path: 'docs/qa/desktop-settings-dark.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.screenshot({
    path: 'docs/qa/tablet-settings.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.settings-page').evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({
    path: 'docs/qa/mobile-settings.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: '메뉴 열기' }).click();
  await page.getByRole('button', { name: '새 대화 +' }).click();
  await expect(page.getByRole('heading', { name: '무엇을 함께 해볼까요?' })).toBeVisible();
  await page.screenshot({
    path: 'docs/qa/mobile-home-dark.png',
    fullPage: true,
    animations: 'disabled',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('editing and streaming state stay within their conversation', async ({ page }) => {
  await page.goto('/');
  const ids = await page.evaluate(async () => {
    const { token } = await (await fetch('/api/bootstrap')).json();
    const post = async (path: string, body: object) => {
      const r = await fetch('/api' + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Aura-Token': token },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`Fixture request failed: ${path} (${r.status})`);
      if (path.endsWith('/reply')) await r.text();
      return r;
    };
    await post('/settings', { onboarded: true, provider: 'mock', model: 'aura-demo' });
    const a = await (await post('/sessions', {})).json();
    const b = await (await post('/sessions', {})).json();
    await post('/sessions/' + a.id + '/reply', { text: '대화 A의 질문' });
    await post('/sessions/' + b.id + '/reply', { text: '대화 B의 질문' });
    await post('/sessions/' + a.id + '/rename', { title: '대화 A' });
    await post('/sessions/' + b.id + '/rename', { title: '대화 B' });
    return { a: a.id, b: b.id };
  });
  await page.goto('/chat/' + ids.a);
  await page.getByRole('button', { name: '수정', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '메시지' })).toHaveValue('대화 A의 질문');
  await page.getByRole('link', { name: '대화 B', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '메시지' })).toHaveValue('');
  await expect(
    page.getByText('질문을 수정하면 이후 대화가 새 답변으로 바뀝니다.', { exact: false }),
  ).toHaveCount(0);
  await page.getByRole('link', { name: '대화 A', exact: true }).click();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route('**/api/sessions/' + ids.a + '/reply', async (route) => {
    await gate;
    try {
      await route.continue();
    } catch {
      /* aborted by navigation */
    }
  });
  await page.getByRole('textbox', { name: '메시지' }).fill('대화 A의 진행 중 질문');
  await page.getByRole('button', { name: '메시지 보내기' }).click();
  await expect(page.getByRole('button', { name: '응답 중단' })).toBeVisible();
  await page.getByRole('link', { name: '대화 B', exact: true }).click();
  await expect(page.getByRole('heading', { name: '대화 B', exact: true })).toBeVisible();
  await expect(page.locator('.messages')).not.toContainText('대화 A의 진행 중 질문');
  release();
  await page.unrouteAll({ behavior: 'wait' });
  await expect(page.getByRole('textbox', { name: '메시지' })).toBeEnabled();
});

test('connection errors recover and text attachments can be edited, searched and deleted', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { token } = await (await fetch('/api/bootstrap')).json();
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Aura-Token': token },
      body: JSON.stringify({
        onboarded: true,
        provider: 'mock',
        model: 'aura-demo',
        theme: 'light',
      }),
    });
  });
  await page.goto('/settings');
  await page.getByRole('button', { name: /Groq 무료 등급/ }).click();
  await page.getByRole('button', { name: '연결 테스트', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('외부 전송 동의와 무료 계정 확인');
  await page.screenshot({
    path: 'docs/qa/connection-error.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: /체험용 모의 AI 키 없이/ }).click();
  await page.getByRole('button', { name: '연결 테스트', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('실제 API 연결 테스트가 아닙니다.');
  await page.getByRole('button', { name: '새 대화 +' }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: '메모.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('첨부 문서의 내용입니다.', 'utf8'),
  });
  await page.getByRole('textbox', { name: '메시지' }).fill('첨부를 확인해 주세요');
  await page.getByRole('button', { name: '메시지 보내기' }).click();
  await expect(page.getByRole('button', { name: '답변 다시 생성' })).toBeEnabled();
  await expect(page.locator('.message.user')).toContainText('첨부 문서의 내용입니다.');
  await page.getByRole('button', { name: '수정', exact: true }).click();
  await page.getByRole('textbox', { name: '메시지' }).fill('수정된 유일한 질문');
  await page.getByRole('button', { name: '메시지 보내기' }).click();
  await expect(page.getByRole('button', { name: '답변 다시 생성' })).toBeEnabled();
  await expect(page.locator('.message.user')).toHaveCount(1);
  await expect(page.locator('.message.user')).toContainText('수정된 유일한 질문');
  await page.getByRole('textbox', { name: '대화 검색' }).fill('수정된 유일한 질문');
  await expect(page.locator('.conversation-list a')).toHaveCount(1);
  await page.getByRole('button', { name: '대화 삭제' }).click();
  await page.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(page.getByRole('heading', { name: '무엇을 함께 해볼까요?' })).toBeVisible();
  await expect(page.getByText('찾는 대화가 없어요.')).toBeVisible();
});
