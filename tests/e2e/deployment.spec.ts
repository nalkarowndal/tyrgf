import { test, expect } from './fixtures';
test('explains encrypted backup boundaries and closes the local app explicitly', async ({
  page,
}) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: '설치 · 백업 · 종료' })).toBeVisible();
  await expect(
    page.getByText('백업에는 API 키와 실행 권한이 포함되지 않습니다.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: '앱 종료', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('진행 중인 응답과 작업');
  await page.getByRole('button', { name: '계속 사용' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '앱 종료', exact: true }).click();
  await page.getByRole('button', { name: '확인하고 종료' }).click();
  await expect(page.getByRole('status')).toContainText('앱을 종료했습니다');
});
