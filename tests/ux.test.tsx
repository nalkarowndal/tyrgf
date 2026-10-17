// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { HelpTooltip, FeatureExplanation } from '../apps/web/src/components';
import { api } from '../apps/web/src/api';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('opens help explicitly and Escape dismisses it without moving focus', () => {
  render(<HelpTooltip text="허용한 폴더만 읽습니다." />);
  const button = screen.getByRole('button');
  button.focus();
  fireEvent.click(button);
  expect(button).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('tooltip')).toHaveTextContent('허용한 폴더');
  fireEvent.keyDown(button, { key: 'Escape' });
  expect(button).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  expect(button).toHaveFocus();
});
it('allows structured feature explanations without nested paragraphs', () => {
  const { container } = render(
    <FeatureExplanation title="안내">
      <p>단계 하나</p>
      <p>단계 둘</p>
    </FeatureExplanation>,
  );
  expect(container.querySelector('p p')).toBeNull();
});
it('turns a network failure into Korean recovery guidance without repeating a mutation', async () => {
  const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  vi.stubGlobal('fetch', fetch);
  await expect(api('/mcp/preview', {})).rejects.toThrow('앱 서버');
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('explains invalid server responses without exposing raw HTML', async () => {
  vi.stubGlobal('fetch', async () => new Response('<html>proxy-secret</html>', { status: 502 }));
  await expect(api('/tools')).rejects.toThrow('응답');
});

import { useState } from 'react';
import { SettingsPage } from '../apps/web/src/Settings';
import { settingsSchema, type Bootstrap } from '../packages/shared/src/contracts';
function replayFixture() {
  let settings = settingsSchema.parse({ onboarded: true });
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === '/api/settings') settings = { ...settings, ...JSON.parse(String(init?.body)) };
    return new Response(
      JSON.stringify(url === '/api/providers/test' ? { message: '연결 확인' } : settings),
      { headers: { 'Content-Type': 'application/json' } },
    );
  });
  // jsdom lacks native dialog methods; focus behavior is covered in real Chromium.
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    },
  });
  function Host() {
    const [data, setData] = useState<Bootstrap>({
      token: '',
      settings,
      keyStatus: {},
      usage: [],
      capabilities: { tools: true },
    });
    return <SettingsPage data={data} refresh={async () => setData({ ...data, settings })} />;
  }
  render(<Host />);
  fireEvent.click(screen.getByRole('button', { name: '처음 설정 다시 보기' }));
  fireEvent.click(screen.getByRole('button', { name: '설정 시작' }));
}
it('replay preserves existing permission truth instead of claiming all access is off', async () => {
  replayFixture();
  fireEvent.click(
    screen.getAllByRole('button', { name: '연결 테스트' })[1] ??
      screen.getAllByRole('button', { name: '연결 테스트' })[0],
  );
  await screen.findByText('연결 확인');
  fireEvent.click(screen.getByRole('button', { name: '다음' }));
  expect(screen.queryByText('꺼짐')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '다음' }));
  fireEvent.click(screen.getByRole('button', { name: '다음' }));
  expect(screen.queryByText('모두 꺼짐')).not.toBeInTheDocument();
  expect(screen.getByText('기존 권한 유지')).toBeInTheDocument();
});
it('closing replay reconciles saved provider instead of overwriting it with the stale form', async () => {
  replayFixture();
  const choices = screen.getAllByRole('button', { name: /Google Gemini/ });
  fireEvent.click(choices.at(-1)!);
  const saves = screen.getAllByRole('button', { name: '연결 설정 저장' });
  fireEvent.click(saves.at(-1)!);
  await screen.findByText('AI 연결 설정을 저장했습니다.');
  fireEvent.click(screen.getByRole('button', { name: '닫기' }));
  expect(screen.getByRole('button', { name: /Google Gemini/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
it('reconciles a replay save that finishes after the setup window was closed', async () => {
  replayFixture();
  fireEvent.click(screen.getAllByRole('button', { name: /Google Gemini/ }).at(-1)!);
  fireEvent.click(screen.getAllByRole('button', { name: '연결 설정 저장' }).at(-1)!);
  fireEvent.click(screen.getByRole('button', { name: '닫기' }));
  const { waitFor } = await import('@testing-library/react');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /Google Gemini/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    ),
  );
});
