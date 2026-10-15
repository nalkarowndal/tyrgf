import { describe, expect, it } from 'vitest';
import {
  validatePublicUrl,
  isPublicAddress,
  fetchPublicPage,
  renderSnapshot,
} from '../apps/server/src/web-reader';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import type { RequestOptions } from 'node:https';

describe('public web boundary', () => {
  it('rejects private and encoded destinations and credentials before connection', () => {
    for (const url of [
      'http://example.com',
      'file:///etc/passwd',
      'https://127.0.0.1',
      'https://2130706433',
      'https://[::ffff:127.0.0.1]',
      'https://localhost',
      'https://metadata.google.internal',
      'https://user:password@example.com',
      'https://example.com:8443',
    ])
      expect(() => validatePublicUrl(url), url).toThrow();
    expect(validatePublicUrl('https://example.com/page?q=hello').href).toBe(
      'https://example.com/page?q=hello',
    );
    for (const ip of [
      '0.0.0.0',
      '10.1.1.1',
      '127.0.0.1',
      '169.254.169.254',
      '172.16.0.1',
      '192.168.1.1',
      '100.64.0.1',
      '192.0.0.1',
      '192.0.2.1',
      '198.18.0.1',
      '224.0.0.1',
      '255.255.255.255',
      '::1',
      'fe80::1',
      'fc00::1',
      '::ffff:8.8.8.8',
      '2001:db8::1',
      '2002:7f00:1::',
    ])
      expect(isPublicAddress(ip), ip).toBe(false);
    expect(isPublicAddress('93.184.216.34')).toBe(true);
  });
  it('pins the validated DNS address while preserving TLS hostname and never follows redirects', async () => {
    let connected = 0;
    const connect = (
      url: URL,
      options: RequestOptions,
      cb: (r: Readable & { statusCode: number; headers: object }) => void,
    ) => {
      connected++;
      expect(url.hostname).toBe('example.com');
      expect(options.servername).toBe('example.com');
      const lookup = options.lookup as (
        host: string,
        opts: object,
        callback: (error: unknown, address: string, family: number) => void,
      ) => void;
      lookup('example.com', {}, (error, address, family) => {
        expect(error).toBe(null);
        expect(address).toBe('93.184.216.34');
        expect(family).toBe(4);
      });
      const req = Object.assign(new EventEmitter(), {
        end: () =>
          queueMicrotask(() =>
            cb(
              Object.assign(Readable.from(['redirect']), {
                statusCode: 302,
                headers: { location: 'https://127.0.0.1' },
              }),
            ),
          ),
        destroy: () => {},
        setTimeout: () => {},
      });
      return req;
    };
    await expect(
      fetchPublicPage('https://example.com', AbortSignal.timeout(1000), {
        resolve: async () => [{ address: '93.184.216.34', family: 4 }],
        connect: connect as never,
      }),
    ).rejects.toThrow(/리다이렉트/);
    expect(connected).toBe(1);
  });
  it('blocks mixed public/private DNS answers without making any request', async () => {
    let connected = false;
    await expect(
      fetchPublicPage('https://example.com', AbortSignal.timeout(1000), {
        resolve: async () => [
          { address: '93.184.216.34', family: 4 },
          { address: '127.0.0.1', family: 4 },
        ],
        connect: (() => {
          connected = true;
          throw Error();
        }) as never,
      }),
    ).rejects.toThrow();
    expect(connected).toBe(false);
  });
  it('renders untrusted HTML offline without executing scripts or following meta refresh', async () => {
    const result = await renderSnapshot(
      '<html><head><title>검증 페이지</title><meta http-equiv="refresh" content="0;url=http://127.0.0.1:4317/api/bootstrap"></head><body><h1>안전한 본문</h1><script>document.body.innerText="EXECUTED"</script><img src="http://127.0.0.1:4317/api/bootstrap"><iframe src="file:///etc/passwd"></iframe></body></html>',
      'https://example.com/',
      AbortSignal.timeout(15000),
    );
    expect(result.title).toBe('검증 페이지');
    expect(result.text).toContain('안전한 본문');
    expect(result.text).not.toContain('EXECUTED');
    expect(result.screenshot).toMatch(/^data:image\/png;base64,/);
  }, 20000);
});
