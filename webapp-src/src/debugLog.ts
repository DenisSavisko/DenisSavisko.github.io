// ?debug: an on-screen log for chasing checkout problems on a phone, where there's no
// console to look at. Shows console output, failed Stripe/RevenueCat requests and each
// Apple Pay step, with a Copy button. Does nothing without ?debug.
import { LogLevel, Purchases } from '@revenuecat/purchases-js';

export const IS_DEBUG = new URLSearchParams(window.location.search).has('debug');

const lines: string[] = [];
let panel: HTMLPreElement | null = null;

function log(...parts: unknown[]) {
  const text = parts
    .map((p) => (p instanceof Error ? `${p.name}: ${p.message}` : typeof p === 'string' ? p : safeJSON(p)))
    .join(' ');
  lines.push(`${new Date().toISOString().slice(11, 23)} ${text}`);
  if (panel) {
    panel.textContent = lines.join('\n');
    panel.scrollTop = panel.scrollHeight;
  }
}

function safeJSON(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function watchConsole() {
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      log(`[${level}]`, ...args);
      original(...args);
    };
  }
  window.addEventListener('error', (e) => log('[uncaught]', e.message, e.filename, e.lineno));
  window.addEventListener('unhandledrejection', (e) => log('[unhandled rejection]', e.reason));
}

function watchRequests() {
  const isInteresting = (url: string) => /stripe\.com|revenuecat\.com|rcbilling/.test(url);
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    try {
      const response = await originalFetch(input, init);
      if (isInteresting(url)) {
        const body = response.ok ? '' : (await response.clone().text()).slice(0, 400);
        log('[fetch]', init?.method ?? 'GET', url.split('?')[0], response.status, body);
      }
      return response;
    } catch (error) {
      if (isInteresting(url)) log('[fetch failed]', url.split('?')[0], error);
      throw error;
    }
  };
}

/// Logs every step of the Apple Pay sheet: which one fires last tells where it stops.
function watchApplePay() {
  const session = (window as unknown as { ApplePaySession?: { prototype: object; supportsVersion?: unknown } })
    .ApplePaySession;
  if (!session) {
    log('[apple pay] ApplePaySession not available on this page');
    return;
  }
  const proto = session.prototype as Record<string, unknown>;
  for (const method of ['begin', 'abort', 'completeMerchantValidation', 'completePayment', 'completePaymentMethodSelection']) {
    const original = proto[method];
    if (typeof original !== 'function') continue;
    proto[method] = function (this: unknown, ...args: unknown[]) {
      log(`[apple pay] ${method}`, method === 'completeMerchantValidation' ? '(session received)' : args[0] ?? '');
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    };
  }
  for (const handler of ['onvalidatemerchant', 'onpaymentauthorized', 'onpaymentmethodselected', 'oncancel']) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, handler);
    if (!descriptor?.set) continue;
    Object.defineProperty(proto, handler, {
      ...descriptor,
      set(this: unknown, fn: unknown) {
        const wrapped =
          typeof fn === 'function'
            ? (event: unknown) => {
                log(`[apple pay] ${handler.slice(2)}`);
                return (fn as (e: unknown) => unknown).call(this, event);
              }
            : fn;
        descriptor.set!.call(this, wrapped);
      },
    });
  }
}

function showPanel() {
  const container = document.createElement('div');
  container.style.cssText =
    'position:fixed;left:8px;right:8px;bottom:calc(env(safe-area-inset-bottom) + 8px);z-index:2147483647;pointer-events:none;background:rgba(0,0,0,.8);color:#fff;border-radius:12px;padding:8px;font:11px/1.35 ui-monospace,monospace;';
  const copy = document.createElement('button');
  copy.textContent = 'Copy log';
  copy.style.cssText = 'color:#4af;font-weight:600;margin-bottom:4px;pointer-events:auto;';
  copy.onclick = () => {
    void navigator.clipboard.writeText(lines.join('\n')).then(() => (copy.textContent = 'Copied'));
  };
  panel = document.createElement('pre');
  panel.style.cssText = 'max-height:22vh;overflow:auto;white-space:pre-wrap;word-break:break-all;margin:0;';
  panel.textContent = lines.join('\n');
  container.append(copy, panel);
  document.body.append(container);
}

if (IS_DEBUG) {
  watchConsole();
  watchRequests();
  watchApplePay();
  Purchases.setLogLevel(LogLevel.Verbose);
  log('debug on', navigator.userAgent);
  if (document.body) showPanel();
  else window.addEventListener('DOMContentLoaded', showPanel);
}
