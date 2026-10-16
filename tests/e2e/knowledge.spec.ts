import { test, expect } from '@playwright/test';
test('reviews and manages memories and creates a provenance-tracked summary draft', async ({
  page,
}) => {
  await page.goto('/memory');
  await expect(page.getByRole('heading', { name: '기억 관리', exact: true })).toBeVisible();
  await page.getByLabel('기억 제목').fill('답변 선호');
  await page.getByLabel('기억 내용').fill('답변은 세 문장으로 부탁합니다');
  await page.getByRole('button', { name: '기억 초안 저장' }).click();
  const card = page.locator('.memory-entry').filter({ hasText: '답변 선호' });
  await expect(card.getByText('검토 대기', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: '이 버전 사용 승인' }).click();
  await expect(card.getByText('다음 대화에 사용', { exact: true })).toBeVisible();
  await page.getByLabel('기억 검색').fill('답변 선호');
  await expect(card).toHaveCount(1);
  await card.getByRole('button', { name: '수정', exact: true }).click();
  await page.getByLabel('기억 내용').fill('한국어로 짧게 답해주세요');
  await page.getByRole('button', { name: '수정한 초안 저장' }).click();
  await expect(card.getByText('검토 대기', { exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '전체 내보내기' }).click();
  expect((await download).suggestedFilename()).toContain('memories');
  await page.screenshot({ path: 'docs/qa/desktop-memory.png', animations: 'disabled' });
  await page.getByLabel('기억 검색').fill('');
  await page.getByLabel('요약할 대화').selectOption({ index: 1 });
  await page.getByRole('button', { name: '요약 초안 만들기' }).click();
  await expect(page.getByText('모의 발췌', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: '기억 전체 삭제', exact: true }).click();
  await page.getByRole('button', { name: '모든 기억 삭제 확인' }).click();
  await expect(page.locator('.memory-entry')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
