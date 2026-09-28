// HTTP-level checks: public browsing, auth, signed webhooks, and the editorial publishing gate.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { Server } from 'node:http';
import { createCtx } from '../src/core.ts';
import { serve } from '../src/http.ts';
import { buildRouter } from '../src/routes.ts';
import { seed } from '../src/seed.ts';

const SECRET = 'test-secret';
let server: Server, base = '';

async function call(method: string, path: string, body?: unknown, token?: string, headers: Record<string, string> = {}) {
  const res = await fetch(base + path, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
  });
  return { status: res.status, body: await res.json() as any };
}

before(() => {
  const ctx = createCtx({ now: () => new Date('2026-09-28T04:30:00.000Z') });
  seed(ctx);
  server = serve(ctx, buildRouter({ dev: true, webhookSecret: SECRET }), { port: 0 });
  base = `http://localhost:${(server.address() as any).port}/api`;
});
after(() => server.close());

describe('API', () => {
  it('lets visitors browse deities, content, events and services without an account', async () => {
    assert.equal((await call('GET', '/deities')).body.length, 10);
    const content = (await call('GET', '/content?deity=shiva')).body;
    assert.ok(content.length >= 3);
    assert.ok(content.some((c: any) => c.tier === 'premium' && c.locked));
    assert.ok((await call('GET', '/events')).body.some((e: any) => e.label.text === 'Scheduled'));
    const services = (await call('GET', '/services?format=home_visit')).body;
    assert.equal(services.find((s: any) => s.code === 'satyanarayan-home').fromPrice, 312600);   // ₹3,126 as designed
    assert.equal((await call('GET', '/me')).status, 401);
  });

  it('signs in by OTP, books, and confirms only through a correctly signed webhook', async () => {
    const otp = await call('POST', '/auth/otp', { phone: '+919876543210' });
    const { token } = (await call('POST', '/auth/verify', { phone: '+919876543210', code: otp.body.devCode, name: 'Rakhi' })).body;
    assert.equal((await call('PUT', '/me/deities', { deities: ['shiva', 'ganesha'], defaultDeity: 'shiva' }, token)).status, 200);
    const svc = (await call('GET', '/services?format=private_online')).body[0];
    const held = await call('POST', '/bookings', { serviceId: svc.id, startsAt: '2026-10-01T04:00:00.000Z', platform: 'ios' }, token);
    assert.equal(held.status, 200, JSON.stringify(held.body));
    assert.equal(held.body.checkout.route, 'external_permitted');
    const payload = { providerEventId: 'pe_1', paymentId: held.body.paymentId, type: 'captured', amount: held.body.booking.total };
    const raw = JSON.stringify(payload);
    const bad = await fetch(base + '/payments/callback', { method: 'POST', body: raw, headers: { 'x-signature': 'nope' } });
    assert.equal(bad.status, 403);
    const sig = createHmac('sha256', SECRET).update(raw).digest('hex');
    const ok = await fetch(base + '/payments/callback', { method: 'POST', body: raw, headers: { 'x-signature': sig } });
    assert.equal((await ok.json() as any).booking, 'confirmed');
    const again = await fetch(base + '/payments/callback', { method: 'POST', body: raw, headers: { 'x-signature': sig } });
    assert.equal((await again.json() as any).duplicate, true);
    const mine = (await call('GET', '/me/bookings', undefined, token)).body;
    assert.equal(mine[0].status, 'confirmed');
  });

  it('publishes content only after review steps and cleared rights', async () => {
    const { token } = (await call('POST', '/auth/dev-login', { role: 'editor' })).body;
    const { id } = (await call('POST', '/cms/items', { deityId: 'shiva', title: 'Test bhajan', language: 'hi', format: 'audio', kind: 'original', durationSec: 200 }, token)).body;
    for (const to of ['draft', 'religious_review', 'recording', 'language_review', 'rights_clearance', 'metadata'])
      assert.equal((await call('POST', `/cms/items/${id}/advance`, { to }, token)).status, 200);
    await call('PUT', `/cms/items/${id}/rights/composition`, { status: 'pending' }, token);
    assert.equal((await call('POST', `/cms/items/${id}/advance`, { to: 'published' }, token)).body.error, 'rights_not_cleared');
    await call('PUT', `/cms/items/${id}/rights/composition`, { status: 'cleared', reference: 'C-17' }, token);
    assert.equal((await call('POST', `/cms/items/${id}/advance`, { to: 'published' }, token)).status, 200);
    assert.equal((await call('GET', `/content/${id}`)).status, 200);
    await call('POST', `/cms/items/${id}/unpublish`, { reason: 'Pronunciation correction' }, token);
    assert.equal((await call('GET', `/content/${id}`)).status, 404);
    // A devotee cannot use editorial endpoints.
    const dev = (await call('POST', '/auth/dev-login', { role: 'devotee' })).body.token;
    assert.equal((await call('POST', '/cms/items', { title: 'x', language: 'hi', format: 'audio', kind: 'original' }, dev)).status, 403);
  });
});
