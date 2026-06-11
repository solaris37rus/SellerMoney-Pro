import { json } from '../_shared/utils.js';
export function onRequest() { return json({ ok: true, service: 'SellerMoney Pro API', ts: new Date().toISOString() }); }
