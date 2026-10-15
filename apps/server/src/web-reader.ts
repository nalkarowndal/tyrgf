import { lookup } from 'node:dns/promises';
import { request, type RequestOptions } from 'node:https';
import { isIP } from 'node:net';
import { existsSync } from 'node:fs';
import ipaddr from 'ipaddr.js';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import { chromium } from 'playwright-core';
import { PublicError } from './providers';
import type { BrowserSnapshot } from '../../../packages/shared/src/tools';
const blocked = () =>
  new PublicError(
    '공개 HTTPS 웹주소만 읽을 수 있습니다. 내부 주소·로그인 정보·별도 포트는 사용할 수 없습니다.',
    403,
  );
export function isPublicAddress(ip: string): boolean {
  try {
    const parsed = ipaddr.parse(ip);
    if (parsed.range() !== 'unicast') return false;
    // IPv6 only the global unicast space; reject translation and transition ranges.
    if (parsed.kind() === 'ipv6')
      return (
        parsed.match(ipaddr.parse('2000::') as ipaddr.IPv6, 3) &&
        !parsed.match(ipaddr.parse('2001::') as ipaddr.IPv6, 23) &&
        !parsed.match(ipaddr.parse('2002::') as ipaddr.IPv6, 16)
      );
    return true;
  } catch {
    return false;
  }
}
export function validatePublicUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw blocked();
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    host.endsWith('.') ||
    !host.includes('.') ||
    /(^|\.)(localhost|local|internal|test|invalid|onion)$/.test(host) ||
    (isIP(host) && !isPublicAddress(host))
  )
    throw blocked();
  return url;
}
type Dependencies = {
  resolve: (host: string) => Promise<{ address: string; family: number }[]>;
  connect: typeof request;
};
export async function fetchPublicPage(
  value: string,
  signal: AbortSignal,
  dependencies: Dependencies = {
    resolve: (host) => lookup(host, { all: true, verbatim: true }),
    connect: request,
  },
): Promise<string> {
  const url = validatePublicUrl(value),
    hostname = url.hostname.replace(/^\[|\]$/g, '');
  signal.throwIfAborted();
  // Abort bounds DNS latency too; lookup itself has no AbortSignal option.
  const addresses = await new Promise<{ address: string; family: number }[]>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    dependencies
      .resolve(hostname)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
  signal.throwIfAborted();
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address))) throw blocked();
  const chosen = addresses[0];
  return new Promise((resolve, reject) => {
    const opts: RequestOptions = {
      method: 'GET',
      agent: false,
      signal,
      servername: isIP(hostname) ? undefined : hostname,
      headers: {
        Accept: 'text/html,text/plain;q=0.8',
        'Accept-Encoding': 'identity',
        'User-Agent': 'AURA-ReadOnly/0.1',
      },
      family: chosen.family,
      lookup: ((
        _host: string,
        options: { all?: boolean },
        callback: (...args: unknown[]) => void,
      ) => {
        if (options.all) callback(null, [chosen]);
        else callback(null, chosen.address, chosen.family);
      }) as RequestOptions['lookup'],
    };
    const req = dependencies.connect(url, opts, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
        response.destroy();
        reject(
          new PublicError(
            '리다이렉트된 주소는 자동으로 열지 않습니다. 최종 공개 주소를 직접 입력하고 다시 승인하세요.',
          ),
        );
        return;
      }
      if (response.statusCode !== 200) {
        response.destroy();
        reject(
          new PublicError('사이트가 읽기를 허용하지 않았습니다. 공개 페이지 주소를 확인하세요.'),
        );
        return;
      }
      const type = response.headers['content-type'] ?? '';
      if (
        !/^(text\/html|text\/plain)(;|$)/i.test(type) ||
        (response.headers['content-encoding'] &&
          response.headers['content-encoding'] !== 'identity')
      ) {
        response.destroy();
        reject(new PublicError('압축되지 않은 HTML 또는 텍스트 페이지만 읽을 수 있습니다.'));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 1048576) {
          response.destroy();
          reject(new PublicError('페이지가 1MB보다 큽니다. 더 작은 페이지를 선택하세요.'));
        } else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        try {
          const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
          resolve(
            type.toLowerCase().startsWith('text/plain') ? `<pre>${escape(text)}</pre>` : text,
          );
        } catch {
          reject(new PublicError('UTF-8 텍스트 페이지를 선택해 주세요.'));
        }
      });
      response.on('aborted', () =>
        reject(new PublicError('페이지 전송이 중단되었습니다. 다시 시도하세요.')),
      );
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}
function escape(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
export async function renderSnapshot(
  html: string,
  url: string,
  signal: AbortSignal,
): Promise<BrowserSnapshot> {
  signal.throwIfAborted();
  if (Buffer.byteLength(html) > 1048576) throw new PublicError('페이지가 너무 큽니다.');
  const document = parse(html);
  let title = '',
    text = '';
  const stack: { node: DefaultTreeAdapterMap['node']; title: boolean }[] = [
    { node: document, title: false },
  ];
  while (stack.length && text.length < 24000) {
    const { node, title: inTitle } = stack.pop()!;
    if (
      'tagName' in node &&
      ['script', 'style', 'template', 'iframe', 'svg', 'noscript', 'head'].includes(node.tagName) &&
      node.tagName !== 'head'
    )
      continue;
    if ('nodeName' in node && node.nodeName === '#text') {
      const value = (node as DefaultTreeAdapterMap['textNode']).value;
      if (inTitle) title += value;
      else text += value + ' ';
    }
    if ('childNodes' in node)
      for (const child of [...node.childNodes].reverse())
        stack.push({
          node: child,
          title: inTitle || ('tagName' in node && node.tagName === 'title'),
        });
  }
  title = title.trim().slice(0, 200) || new URL(url).hostname;
  text = text.replace(/\s+/g, ' ').trim().slice(0, 24000);
  signal.throwIfAborted();
  // Remote HTML never enters Chromium. Only escaped extracted text is rendered.
  const browser = await chromium.launch({
    headless: true,
    timeout: 8000,
    executablePath:
      process.env.CHROMIUM_PATH ||
      (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
  });
  const abort = () => {
    void browser.close().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted();
    const context = await browser.newContext({
      javaScriptEnabled: false,
      serviceWorkers: 'block',
      acceptDownloads: false,
      offline: true,
      viewport: { width: 1100, height: 780 },
    });
    await context.route('**/*', (r) => r.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    await page.setContent(
      `<!doctype html><html lang="ko"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{font:20px/1.8 sans-serif;color:#202438;background:#fff;padding:44px;overflow-wrap:anywhere}small{color:#666}h1{font-size:32px}p{white-space:pre-wrap}</style><small>AURA · 공개 페이지 읽기 화면</small><h1>${escape(title)}</h1><p>${escape(text)}</p></html>`,
      { waitUntil: 'domcontentloaded', timeout: 5000 },
    );
    const screenshot = await page.screenshot({
      type: 'png',
      timeout: 5000,
      animations: 'disabled',
    });
    signal.throwIfAborted();
    return {
      title,
      text,
      url,
      screenshot: `data:image/png;base64,${screenshot.toString('base64')}`,
    };
  } finally {
    signal.removeEventListener('abort', abort);
    await browser.close();
  }
}
export async function readBrowser(url: string, signal: AbortSignal) {
  return renderSnapshot(await fetchPublicPage(url, signal), url, signal);
}
