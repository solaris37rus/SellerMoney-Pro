import { bad, json, supabase } from '../_shared/utils.js';
export async function onRequestGet({ request, env }) {
  try {
    const auth = request.headers.get('Authorization') || '';
    if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) return bad('Unauthorized', 401);
    const [profiles, products, payments] = await Promise.all([
      supabase(env, 'profiles?select=id,email,plan'),
      supabase(env, 'products?select=id'),
      supabase(env, 'payments?select=*&order=created_at.desc&limit=50')
    ]);
    const paid = payments.filter(p => p.status === 'succeeded');
    const mrr = paid.reduce((s,p)=>s+Number(p.amount||0),0);
    return json({ users: profiles.length, products: products.length, paid_payments: paid.length, mrr, recent_payments: payments });
  } catch(e) { return bad(e.message || 'Admin error', 500); }
}
