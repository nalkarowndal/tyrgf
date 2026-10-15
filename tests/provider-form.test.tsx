// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ProviderForm } from '../apps/web/src/ProviderForm';
import { settingsSchema } from '../packages/shared/src/contracts';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('cloud connection requires explicit choices and masks the key input', () => {
  render(
    <ProviderForm initial={settingsSchema.parse({})} keyStatus={{}} onSaved={async () => {}} />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Google Gemini/ }));
  expect(screen.getByLabelText(/API 키 서비스에서/)).toHaveAttribute('type', 'password');
  expect(screen.getByRole('checkbox', { name: /전송하는 데 동의/ })).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: /무료 계정임을 확인/ })).not.toBeChecked();
});
it('failed connection shows recovery guidance and never claims success', async () => {
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(JSON.stringify({ error: 'API 키를 확인해 주세요.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  render(
    <ProviderForm
      initial={settingsSchema.parse({ provider: 'groq', model: 'openai/gpt-oss-20b' })}
      keyStatus={{}}
      onSaved={async () => {}}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: '연결 테스트' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('API 키를 확인해 주세요.');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
