const CONFIG = Object.assign({ supportEmail: 'slava.plekhanov.2002@gmail.com', supportVk: 'https://vk.com/bread1996', telegramUrl: 'https://t.me/SellerMoney_Pro_bot', supabaseUrl: 'https://hulwoicinxwnighvexex.supabase.co', supabaseAnonKey: 'sb_publishable_nZ0iaxmDVPmglkrvNWxejA_FIiHi8Lp', publicBaseUrl: 'https://sellermoney-pro.pages.dev' }, window.SELLERMONEY_CONFIG || {});
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
const fmtRub = (n) => `${n >= 0 ? '+' : '-'}${Math.abs(Math.round(n)).toLocaleString('ru-RU')} ₽`;
const fmtPlainRub = (n) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
const fmtPct = (n) => `${Number.isFinite(n) ? n.toFixed(1) : '0.0'}%`;
let supabaseClient = null;
let currentUser = null;
let currentCalc = null;
let products = [];

const MARKET_DEFAULTS = {
  wildberries: { commission: 18, acquiring: 2, logistics: 110, storage: 18, returnLogistics: 90 },
  ozon: { commission: 16, acquiring: 2.2, logistics: 130, storage: 22, returnLogistics: 95 },
  yandex: { commission: 14, acquiring: 2, logistics: 125, storage: 20, returnLogistics: 85 }
};
const CATEGORY_DEFAULTS = {
  clothes: { commissionMod: 0, returns: 7, ads: 10 },
  electronics: { commissionMod: -4, returns: 5, ads: 8 },
  beauty: { commissionMod: 2, returns: 4, ads: 12 },
  home: { commissionMod: -1, returns: 6, ads: 9 },
  custom: { commissionMod: 0, returns: 7, ads: 10 }
};
const PLAN_LIMITS = { free: 3, start: 25, pro: 300, business: 999999 };

function toast(message, ms = 3600) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), ms);
}

function initSupabase() {
  const url = CONFIG.supabaseUrl || localStorage.getItem('SM_SUPABASE_URL') || '';
  const key = CONFIG.supabaseAnonKey || localStorage.getItem('SM_SUPABASE_ANON_KEY') || '';
  if (url && key && window.supabase) {
    supabaseClient = window.supabase.createClient(url, key);
  }
}

async function loadSession() {
  if (!supabaseClient) return;
  const { data } = await supabaseClient.auth.getUser();
  currentUser = data?.user || null;
  updateAuthUi();
  if (currentUser) await loadProducts();
}

function updateAuthUi() {
  const btn = $('#openAuthBtn');
  if (!btn) return;
  btn.textContent = currentUser ? 'Кабинет' : 'Войти';
}

function valuesFromForm() {
  const form = $('#calcForm');
  const fd = new FormData(form);
  const val = (name) => Number(String(fd.get(name) || '0').replace(',', '.')) || 0;
  return {
    title: String(fd.get('title') || 'Новый товар').trim(),
    marketplace: fd.get('marketplace'),
    category: fd.get('category'),
    price: val('price'), cost: val('cost'), packaging: val('packaging'), logistics: val('logistics'),
    storage: val('storage'), returnLogistics: val('returnLogistics'), commission: val('commission'), acquiring: val('acquiring'),
    ads: val('ads'), returns: val('returns'), taxMode: fd.get('taxMode'), salesPerMonth: val('salesPerMonth')
  };
}

function calculate(input) {
  const price = Math.max(0, input.price || 0);
  const percentCosts = price * ((input.commission + input.acquiring + input.ads) / 100);
  const returnCost = (input.returns / 100) * (input.returnLogistics + input.logistics * 0.35 + input.packaging * 0.2);
  const fixed = input.cost + input.packaging + input.logistics + input.storage + returnCost;
  const beforeTax = price - fixed - percentCosts;
  let tax = 0;
  if (input.taxMode === 'usn6') tax = price * 0.06;
  if (input.taxMode === 'usn15') tax = Math.max(beforeTax, 0) * 0.15;
  const profit = beforeTax - tax;
  const margin = price > 0 ? (profit / price) * 100 : 0;
  const baseInvest = input.cost + input.packaging + input.logistics;
  const roi = baseInvest > 0 ? (profit / baseInvest) * 100 : 0;
  const monthly = profit * input.salesPerMonth;
  const breakeven = solveBreakeven(input);
  const maxAds = Math.max(0, (price - fixed - tax - price * ((input.commission + input.acquiring) / 100)) / price * 100);
  let status = 'good';
  if (profit < 0 || margin < 0) status = 'bad'; else if (margin < 8) status = 'warn';
  const recommendation = makeRecommendation(input, { profit, margin, roi, breakeven, maxAds, monthly, status });
  return { ...input, profit, margin, roi, monthly, breakeven, maxAds, status, recommendation, fixed, tax, returnCost };
}

function solveBreakeven(input) {
  let lo = 1, hi = Math.max(input.price * 3, input.cost * 4 + 1000, 1000);
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    const res = calculateNoBreakeven({ ...input, price: mid });
    if (res.profit >= 0) hi = mid; else lo = mid;
  }
  return hi;
}
function calculateNoBreakeven(input) {
  const price = Math.max(0, input.price || 0);
  const percentCosts = price * ((input.commission + input.acquiring + input.ads) / 100);
  const returnCost = (input.returns / 100) * (input.returnLogistics + input.logistics * 0.35 + input.packaging * 0.2);
  const fixed = input.cost + input.packaging + input.logistics + input.storage + returnCost;
  const beforeTax = price - fixed - percentCosts;
  let tax = 0;
  if (input.taxMode === 'usn6') tax = price * 0.06;
  if (input.taxMode === 'usn15') tax = Math.max(beforeTax, 0) * 0.15;
  return { profit: beforeTax - tax };
}

function makeRecommendation(input, r) {
  if (r.status === 'bad') return `Товар убыточный: ${fmtRub(r.profit)} с продажи. Минимальная цена без минуса — ${fmtPlainRub(r.breakeven)}. Проверьте комиссию, логистику и рекламу.`;
  if (r.status === 'warn') return `Товар почти в нуле. Не снижайте цену ниже ${fmtPlainRub(r.breakeven)} и держите рекламу не выше ${fmtPct(r.maxAds)}.`;
  if (input.ads > r.maxAds * 0.75) return `Прибыль есть, но реклама близко к опасной зоне. Максимально безопасная реклама — около ${fmtPct(r.maxAds)}.`;
  return `Цена нормальная. Скидку ниже ${fmtPlainRub(r.breakeven)} ставить нельзя. Потенциал при текущих продажах — ${fmtPlainRub(r.monthly)} в месяц.`;
}

function renderResult(r) {
  currentCalc = r;
  $('#resultTitle').textContent = r.title;
  $('#profitValue').textContent = fmtRub(r.profit);
  $('#profitValue').className = `big-profit is-${r.status}`;
  $('#marginValue').textContent = fmtPct(r.margin);
  $('#roiValue').textContent = fmtPct(r.roi);
  $('#breakevenValue').textContent = fmtPlainRub(r.breakeven);
  $('#monthlyValue').textContent = fmtPlainRub(r.monthly);
  $('#maxAdsValue').textContent = `до ${fmtPct(r.maxAds)}`;
  $('#adsBar').style.width = `${Math.min(100, Math.max(4, r.maxAds * 2))}%`;
  const status = $('#resultStatus');
  status.textContent = r.status === 'good' ? 'прибыльный' : r.status === 'warn' ? 'на грани' : 'убыточный';
  status.style.color = r.status === 'good' ? 'var(--green)' : r.status === 'warn' ? 'var(--amber)' : 'var(--red)';
  status.style.borderColor = r.status === 'good' ? 'rgba(57,255,136,.28)' : r.status === 'warn' ? 'rgba(255,176,0,.28)' : 'rgba(255,54,94,.28)';
  status.style.background = r.status === 'good' ? 'rgba(57,255,136,.12)' : r.status === 'warn' ? 'rgba(255,176,0,.12)' : 'rgba(255,54,94,.12)';
  $('#recommendationBox').textContent = r.recommendation;
}

function applyDefaults() {
  const m = $('#marketplaceSelect').value;
  const c = $('#categorySelect').value;
  const md = MARKET_DEFAULTS[m];
  const cd = CATEGORY_DEFAULTS[c];
  const form = $('#calcForm');
  form.commission.value = Math.max(0, md.commission + cd.commissionMod);
  form.acquiring.value = md.acquiring;
  form.logistics.value = md.logistics;
  form.storage.value = md.storage;
  form.returnLogistics.value = md.returnLogistics;
  form.returns.value = cd.returns;
  form.ads.value = cd.ads;
  recalc();
}

function recalc() { renderResult(calculate(valuesFromForm())); }

async function saveProduct() {
  const r = currentCalc || calculate(valuesFromForm());
  const payload = {
    title: r.title,
    marketplace: r.marketplace,
    category: r.category,
    price: r.price,
    cost: r.cost,
    packaging: r.packaging,
    logistics: r.logistics,
    storage: r.storage,
    return_logistics: r.returnLogistics,
    commission_pct: r.commission,
    acquiring_pct: r.acquiring,
    ads_pct: r.ads,
    returns_pct: r.returns,
    tax_mode: r.taxMode,
    sales_per_month: r.salesPerMonth,
    profit: r.profit,
    margin: r.margin,
    roi: r.roi,
    breakeven_price: r.breakeven,
    status: r.status,
    raw: r
  };
  if (supabaseClient && currentUser) {
    const { error } = await supabaseClient.from('products').insert(payload);
    if (error) return toast(`Ошибка сохранения: ${error.message}`);
    toast('Товар сохранён в базе Supabase');
  } else {
    toast('Войдите в аккаунт, чтобы сохранить товар в кабинете.');
    $('#authModal')?.showModal();
    return;
  }
  await loadProducts();
}

async function loadProducts() {
  if (supabaseClient && currentUser) {
    const { data, error } = await supabaseClient.from('products').select('*').order('created_at', { ascending: false });
    if (!error) products = data || [];
  } else {
    products = [];
  }
  renderProducts();
}

async function deleteProduct(id) {
  if (supabaseClient && currentUser) {
    await supabaseClient.from('products').delete().eq('id', id);
  } else {
    toast('Войдите в аккаунт, чтобы управлять товарами.');
    return;
  }
  await loadProducts();
}

function renderProducts() {
  const q = ($('#productSearch')?.value || '').toLowerCase();
  const filter = $('#productFilter')?.value || 'all';
  const list = products.filter(p => (!q || p.title.toLowerCase().includes(q)) && (filter === 'all' || p.status === filter));
  $('#statTotal').textContent = products.length;
  $('#statGood').textContent = products.filter(p => p.status === 'good').length;
  $('#statWarn').textContent = products.filter(p => p.status === 'warn').length;
  $('#statBad').textContent = products.filter(p => p.status === 'bad').length;
  const table = $('#productTable');
  if (!list.length) {
    table.innerHTML = currentUser ? '<div class="product-row empty-row"><b>Портфель пуст</b><span>Сохраните первый расчёт или импортируйте CSV-файл.</span></div>' : '<div class="product-row empty-row"><b>Войдите в кабинет</b><span>После входа здесь появятся сохранённые товары и риск-статусы.</span></div>';
    return;
  }
  table.innerHTML = `<div class="product-head"><span>Товар</span><span>Маркет</span><span>Прибыль</span><span>Маржа</span><span>Безубыток</span><span></span></div>` + list.map(p => `
    <div class="product-row">
      <b>${escapeHtml(p.title)}</b>
      <span>${marketName(p.marketplace)}</span>
      <span class="is-${p.status}">${fmtRub(Number(p.profit || 0))}</span>
      <span>${fmtPct(Number(p.margin || 0))}</span>
      <span>${fmtPlainRub(Number(p.breakeven_price || 0))}</span>
      <span class="row-actions"><button class="icon-btn" data-load="${p.id}">↗</button><button class="icon-btn" data-del="${p.id}">×</button></span>
    </div>`).join('');
  $$('[data-del]').forEach(btn => btn.onclick = () => deleteProduct(btn.dataset.del));
  $$('[data-load]').forEach(btn => btn.onclick = () => loadProductIntoForm(btn.dataset.load));
}

function loadProductIntoForm(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const raw = p.raw || {};
  const form = $('#calcForm');
  form.title.value = p.title || raw.title || '';
  form.marketplace.value = p.marketplace || raw.marketplace || 'wildberries';
  form.category.value = p.category || raw.category || 'custom';
  form.price.value = p.price || raw.price || 0;
  form.cost.value = p.cost || raw.cost || 0;
  form.packaging.value = p.packaging || raw.packaging || 0;
  form.logistics.value = p.logistics || raw.logistics || 0;
  form.storage.value = p.storage || raw.storage || 0;
  form.returnLogistics.value = p.return_logistics || raw.returnLogistics || 0;
  form.commission.value = p.commission_pct || raw.commission || 0;
  form.acquiring.value = p.acquiring_pct || raw.acquiring || 0;
  form.ads.value = p.ads_pct || raw.ads || 0;
  form.returns.value = p.returns_pct || raw.returns || 0;
  form.taxMode.value = p.tax_mode || raw.taxMode || 'usn6';
  form.salesPerMonth.value = p.sales_per_month || raw.salesPerMonth || 0;
  recalc();
  location.hash = '#calculator';
}

function marketName(m) { return m === 'wildberries' ? 'WB' : m === 'ozon' ? 'Ozon' : m === 'yandex' ? 'Я.Маркет' : m; }
function escapeHtml(s) { return String(s).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }

async function signIn(email, password) {
  if (!supabaseClient) return toast('Сервис авторизации временно недоступен. Напишите в поддержку.');
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return toast(error.message);
  currentUser = data.user;
  $('#authModal').close();
  toast('Вы вошли в кабинет');
  await loadProducts();
}
async function signUp(email, password) {
  if (!supabaseClient) return toast('Сервис авторизации временно недоступен. Напишите в поддержку.');
  const { error } = await supabaseClient.auth.signUp({ email, password });
  if (error) return toast(error.message);
  toast('Аккаунт создан. Проверьте email, если включено подтверждение.');
}
async function magicLink(email) {
  if (!supabaseClient) return toast('Сервис авторизации временно недоступен.');
  const { error } = await supabaseClient.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
  toast(error ? error.message : 'Ссылка для входа отправлена на email');
}

async function createCheckout(plan) {
  if (plan === 'free') return toast('Free уже доступен. Сохраните до 3 товаров бесплатно.');
  try {
    const token = supabaseClient ? (await supabaseClient.auth.getSession()).data?.session?.access_token : '';
    const email = currentUser?.email || prompt('Email для чека/доступа:');
    if (!email) return;
    const res = await fetch('/api/create-checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ plan, email })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка оплаты');
    if (data.payment_url) location.href = data.payment_url;
    if (data.payment_form) submitPaymentForm(data.payment_form);
    if (data.manual_url) { toast('Открою Telegram для подтверждения оплаты.'); window.open(data.manual_url, '_blank'); }
  } catch (e) { toast(e.message); }
}
function submitPaymentForm(form) {
  const el = document.createElement('form');
  el.method = form.method || 'POST';
  el.action = form.action;
  Object.entries(form.params).forEach(([k,v]) => { const input = document.createElement('input'); input.type = 'hidden'; input.name = k; input.value = v; el.appendChild(input); });
  document.body.appendChild(el); el.submit();
}

function runScenario() {
  const input = valuesFromForm();
  input.price = Number($('#scenarioPrice').value) || input.price;
  input.ads = Number($('#scenarioAds').value) || input.ads;
  input.returns = Number($('#scenarioReturns').value) || input.returns;
  const r = calculate(input);
  const text = r.status === 'bad' ? `Опасно: ${fmtRub(r.profit)} с продажи. Цена ${fmtPlainRub(r.price)} уводит товар в минус.` : r.status === 'warn' ? `Почти ноль: ${fmtRub(r.profit)} с продажи, маржа ${fmtPct(r.margin)}. Акцию можно включать только временно.` : `Сценарий выдерживает: ${fmtRub(r.profit)} с продажи, маржа ${fmtPct(r.margin)}.`;
  $('#scenarioOutput').textContent = text;
}

function exportCsv() {
  if (!products.length) return toast('Нет товаров для экспорта');
  const headers = ['title','marketplace','price','cost','profit','margin','roi','breakeven_price','status'];
  const rows = [headers.join(',')].concat(products.map(p => headers.map(h => JSON.stringify(p[h] ?? '')).join(',')));
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'sellermoney-products.csv'; a.click();
}
function importCsv(file) {
  if (!supabaseClient || !currentUser) {
    toast('Войдите в аккаунт, чтобы импортировать товары.');
    $('#authModal')?.showModal();
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const lines = String(reader.result).split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) return toast('CSV пустой или содержит только заголовок');
      const [head, ...body] = lines;
      const headers = head.split(',').map(x => x.trim());
      const rows = [];
      for (const line of body) {
        const cols = parseCsvLine(line);
        const obj = Object.fromEntries(headers.map((h, i) => [h, cols[i]]));
        const input = {
          title: obj.title || obj.name || 'Импортированный товар', marketplace: obj.marketplace || 'wildberries', category: obj.category || 'custom',
          price: +obj.price || 0, cost: +obj.cost || 0, packaging: +obj.packaging || 0, logistics: +obj.logistics || 0,
          storage: +obj.storage || 0, returnLogistics: +obj.returnLogistics || +obj.return_logistics || 0, commission: +obj.commission || +obj.commission_pct || 15,
          acquiring: +obj.acquiring || +obj.acquiring_pct || 2, ads: +obj.ads || +obj.ads_pct || 8, returns: +obj.returns || +obj.returns_pct || 5, taxMode: obj.taxMode || obj.tax_mode || 'usn6', salesPerMonth: +obj.salesPerMonth || +obj.sales_per_month || 0
        };
        const r = calculate(input);
        rows.push({ title: r.title, marketplace: r.marketplace, category: r.category, price: r.price, cost: r.cost, packaging: r.packaging, logistics: r.logistics, storage: r.storage, return_logistics: r.returnLogistics, commission_pct: r.commission, acquiring_pct: r.acquiring, ads_pct: r.ads, returns_pct: r.returns, tax_mode: r.taxMode, sales_per_month: r.salesPerMonth, profit: r.profit, margin: r.margin, roi: r.roi, breakeven_price: r.breakeven, status: r.status, raw: r });
      }
      const { error } = await supabaseClient.from('products').insert(rows);
      if (error) throw error;
      toast(`Импортировано товаров: ${rows.length}`);
      await loadProducts();
    } catch (e) { toast(e.message || 'Ошибка импорта CSV'); }
  };
  reader.readAsText(file);
}
function parseCsvLine(line) {
  const res = []; let cur = '', q = false;
  for (let i=0;i<line.length;i++){const ch=line[i]; if(ch==='"'){q=!q; continue;} if(ch===','&&!q){res.push(cur);cur='';} else cur+=ch;} res.push(cur); return res;
}


async function linkTelegram() {
  if (!supabaseClient || !currentUser) {
    toast('Сначала войдите в аккаунт, затем привяжите Telegram.');
    $('#authModal')?.showModal();
    return;
  }
  try {
    const token = (await supabaseClient.auth.getSession()).data?.session?.access_token;
    const res = await fetch('/api/link-telegram', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Не удалось создать ссылку');
    window.open(data.url, '_blank');
  } catch (e) { toast(e.message || 'Ошибка привязки Telegram'); }
}

function bindEvents() {
  $('#year').textContent = new Date().getFullYear();
  $('#calcForm').addEventListener('submit', e => { e.preventDefault(); recalc(); });
  $$('#calcForm input, #calcForm select').forEach(el => el.addEventListener('input', recalc));
  $('#marketplaceSelect')?.addEventListener('change', applyDefaults);
  $('#categorySelect')?.addEventListener('change', applyDefaults);
  $('#saveProductBtn').onclick = saveProduct;
  $('#resetCalcBtn').onclick = () => { $('#calcForm').reset(); applyDefaults(); };
  $('#openAuthHeroBtn')?.addEventListener('click', () => currentUser ? location.hash = '#dashboard' : $('#authModal').showModal());
  $('#scenarioBtn').onclick = runScenario;
  $('#productSearch').addEventListener('input', renderProducts);
  $('#productFilter').addEventListener('change', renderProducts);
  $('#exportBtn').onclick = exportCsv;
  $('#importBtn').onclick = () => $('#csvFile').click();
  $('#csvFile').addEventListener('change', e => e.target.files[0] && importCsv(e.target.files[0]));
  $$('#pricing [data-plan]').forEach(btn => btn.onclick = () => createCheckout(btn.dataset.plan));
  $('#openAuthBtn').onclick = () => currentUser ? location.hash = '#dashboard' : $('#authModal').showModal();
  $('#closeAuthBtn').onclick = () => $('#authModal').close();
  $('#authForm').addEventListener('submit', e => { e.preventDefault(); const fd = new FormData(e.target); signIn(fd.get('email'), fd.get('password')); });
  $('#signupBtn').onclick = () => { const fd = new FormData($('#authForm')); signUp(fd.get('email'), fd.get('password')); };
  $('#magicBtn').onclick = () => { const email = new FormData($('#authForm')).get('email'); email ? magicLink(email) : toast('Введите email'); };
  $('#telegramLinkBtn').onclick = linkTelegram;
}

async function boot() {
  bindEvents(); initSupabase(); recalc(); await loadSession(); await loadProducts();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  if (new URLSearchParams(location.search).get('payment') === 'success') toast('Платёж получен или проверяется. Доступ активируется после подтверждения оплаты.');
}

document.addEventListener('DOMContentLoaded', boot);
