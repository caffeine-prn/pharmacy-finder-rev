import { afterEach, expect, mock, test } from 'bun:test';
import { NextRequest } from 'next/server';
const writes = [];
const pharmacy = { id: 'test-id', name: 'Test Pharmacy', ykiho: 'test-ykiho', hira_staff_fetched_at: null };
const query = {
  select() { return this; }, eq() { return this; },
  async maybeSingle() { return { data: pharmacy, error: null }; },
  async order() { return { data: [], error: null }; },
  async upsert(value) { writes.push(value); return { error: null }; },
  update(value) { writes.push(value); return { eq: async () => ({ error: null }) }; },
};
mock.module('@/lib/supabase/server', () => ({ createServiceSupabase: () => ({ from: () => query }) }));
const { POST } = await import('../src/app/api/pharmacy/[id]/staff/route');
const originalFetch = globalThis.fetch;
const originalKey = process.env.DRUG_API_KEY;
afterEach(() => { globalThis.fetch = originalFetch; if (originalKey === undefined) delete process.env.DRUG_API_KEY; else process.env.DRUG_API_KEY = originalKey; writes.length = 0; });
async function requestWith(xml, status = 200) {
  process.env.DRUG_API_KEY = 'test-private-key';
  let calledUrl = '';
  globalThis.fetch = async (url) => { calledUrl = String(url); return new Response(xml, { status }); };
  const response = await POST(new NextRequest('https://example.com/api/pharmacy/test-id/staff', {method:'POST'}), {params:{id:'test-id'}});
  return {response, calledUrl, payload: await response.json()};
}
test('refresh uses the supported HIRA service and saves a valid zero result', async () => {
  const {response, calledUrl} = await requestWith('<response><header><resultCode>00</resultCode></header><body><items></items><totalCount>0</totalCount></body></response>');
  expect(calledUrl).toContain('/MadmDtlInfoService2.8/getEtcHstInfo2.8?');
  expect(response.status).toBe(200);
  expect(writes.length).toBe(1);
});
test('upstream rejection never returns the raw response or writes zero staffing', async () => {
  const {response, payload} = await requestWith('serviceKey=test-private-key', 400);
  expect(response.status).toBe(502);
  expect(JSON.stringify(payload)).not.toContain('test-private-key');
  expect(writes.length).toBe(0);
});
test('HTTP 200 gateway error does not erase existing staff', async () => {
  const {response} = await requestWith('<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>12</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>');
  expect(response.status).toBe(502);
  expect(writes.length).toBe(0);
});
test('network failure returns a controlled response and preserves data', async () => {
  process.env.DRUG_API_KEY='test-private-key';
  globalThis.fetch=async()=>{ throw new TypeError('network failed'); };
  const response=await POST(new NextRequest('https://example.com'),{params:{id:'test-id'}});
  expect(response.status).toBe(502);
  expect(writes.length).toBe(0);
});
