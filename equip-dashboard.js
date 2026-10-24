// =====================================================================
// Sport Circle — แดชบอร์ดอุปกรณ์ฝั่งแอดมิน (6 แท็บ + ส่งออก PDF / DOCX)
// โหลดหลัง app.js : ไฟล์นี้ไม่แก้ app.js แต่ครอบ switchView / renderDashboardStats
// ต้องรัน supabase_equipment.sql หนึ่งครั้งก่อนใช้งานแท็บ 2-4
// =====================================================================
(function () {
    'use strict';

    // ---------- state ----------
    const ED = {
        tab: 1, facs: [], allFacs: [],
        eq: [], bookings: [], todayBookings: [],
        rentalsPeriod: [], rentalsOpen: [], incidentsPeriod: [], incidentsOpen: [],
        shift: null, lastShift: null, win: { rentals: [], incidents: [], bookings: [] },
        M: null, cash: null, folios: [], period: { start: '', end: '', label: '' },
        missing: false, loading: false, charts: {}, channel: null, lastLoad: 0
    };
    const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const MONTHS_S = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

    // ---------- helpers ----------
    const $ = id => document.getElementById(id);
    const num = v => Number(v || 0);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const money = n => '฿' + num(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
    const pad = n => String(n).padStart(2, '0');
    const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const digits = s => String(s || '').replace(/\D/g, '');
    const parseAddons = a => { if (typeof a === 'string') { try { a = JSON.parse(a); } catch (e) { a = []; } } return Array.isArray(a) ? a : []; };
    const maskPhone = p => { const d = digits(p); return d.length >= 9 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-XXXX` : (p && p !== '-' ? p : '-'); };
    const fmtDT = iso => { if (!iso) return '-'; const d = new Date(iso); return `${d.getDate()} ${MONTHS_S[d.getMonth()]} ${String(d.getFullYear() + 543).slice(2)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
    const fmtD = s => { if (!s) return '-'; const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s); return `${d.getDate()} ${MONTHS_S[d.getMonth()]} ${d.getFullYear() + 543}`; };
    const hash4 = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return pad4(h % 10000); };
    const pad4 = n => String(n).padStart(4, '0');
    const facName = id => (ED.allFacs.find(f => String(f.id) === String(id)) || {}).name || '-';
    const okBill = b => ['approved', 'completed'].includes(String(b.payment_status || '').toLowerCase());
    const isoStart = ymdStr => new Date(ymdStr + 'T00:00:00').toISOString();
    const isoEnd = ymdStr => new Date(ymdStr + 'T23:59:59.999').toISOString();
    const searchText = () => ($('dashSearchInput') && $('dashSearchInput').value || '').trim().toLowerCase();
    const inView = () => typeof currentView !== 'undefined' && currentView === 'dashboard';

    function toast(msg, ok) {
        let t = $('edToast');
        if (!t) { t = document.createElement('div'); t.id = 'edToast'; document.body.appendChild(t); }
        t.textContent = msg; t.className = 'ed-toast show ' + (ok === false ? 'err' : 'ok');
        clearTimeout(t._h); t._h = setTimeout(() => { t.className = 'ed-toast'; }, 3200);
    }
    const isMissingTable = err => !!err && (err.code === '42P01' || err.code === 'PGRST205' || /does not exist|schema cache|Could not find the table/i.test(err.message || ''));

    // ---------- period ----------
    function getPeriod() {
        const type = ($('dashReportPeriodType') || {}).value || 'monthly';
        const now = new Date();
        const yearSel = ($('dashReportYear') || {}).value || String(now.getFullYear());
        const monthSel = ($('dashReportMonth') || {}).value || pad(now.getMonth() + 1);
        let start = '', end = '', label = '';
        if (type === 'daily') { start = end = ($('dashRealtimeDate') || {}).value || ymd(now); label = 'วันที่ ' + fmtD(start); }
        else if (type === 'monthly') {
            const last = new Date(Number(yearSel), Number(monthSel), 0).getDate();
            start = `${yearSel}-${monthSel}-01`; end = `${yearSel}-${monthSel}-${pad(last)}`;
            label = `${MONTHS[Number(monthSel) - 1]} ${Number(yearSel) + 543}`;
        } else if (type === 'yearly') { start = `${yearSel}-01-01`; end = `${yearSel}-12-31`; label = `ปี ${Number(yearSel) + 543}`; }
        else if (type === 'custom') {
            start = ($('dashFilterStartDate') || {}).value || ''; end = ($('dashFilterEndDate') || {}).value || '';
            label = (start || end) ? `${start ? fmtD(start) : 'เริ่มต้น'} - ${end ? fmtD(end) : 'ปัจจุบัน'}` : 'ทั้งหมด';
        } else { label = 'ข้อมูลทั้งหมด'; }
        return { type, start, end, label };
    }

    // ---------- data loading ----------
    async function loadAll() {
        try {
            if (typeof FACILITIES !== 'undefined' && (!FACILITIES || !FACILITIES.length) && typeof fetchFacilities === 'function') await fetchFacilities('all');
            ED.allFacs = typeof getMyManagedFacilities === 'function' ? getMyManagedFacilities() : [];
            const sel = $('dashFilterFacility');
            if (sel) {
                const cur = sel.value || 'all';
                sel.innerHTML = '<option value="all">รวมทุกสนามในการดูแล</option>' + ED.allFacs.map(f => `<option value="${esc(f.id)}">${esc(f.name)}${f.sport ? ' (' + esc(f.sport) + ')' : ''}</option>`).join('');
                sel.value = ED.allFacs.some(f => String(f.id) === cur) ? cur : 'all';
            }
            const fid = sel ? sel.value : 'all';
            ED.facs = fid === 'all' ? ED.allFacs : ED.allFacs.filter(f => String(f.id) === String(fid));
            const ids = ED.facs.map(f => String(f.id));
            const p = ED.period = getPeriod();
            ED.missing = false;
            if (!ids.length) { ED.eq = []; ED.bookings = []; ED.todayBookings = []; ED.rentalsPeriod = []; ED.rentalsOpen = []; ED.incidentsPeriod = []; ED.incidentsOpen = []; ED.shift = ED.lastShift = null; ED.win = { rentals: [], incidents: [], bookings: [] }; return; }

            const sb = supabaseClient, today = ymd(new Date());
            let qEq = sb.from('equipment').select('*').in('facility_id', ids).order('created_at', { ascending: false });
            let qBk = sb.from('bookings').select('*').in('facility_id', ids).limit(5000);
            let qR = sb.from('equipment_rentals').select('*').in('facility_id', ids).order('rented_at', { ascending: false }).limit(3000);
            let qI = sb.from('equipment_incidents').select('*').in('facility_id', ids).order('created_at', { ascending: false }).limit(3000);
            if (p.start) { qBk = qBk.gte('date', p.start); qR = qR.gte('rented_at', isoStart(p.start)); qI = qI.gte('created_at', isoStart(p.start)); }
            if (p.end) { qBk = qBk.lte('date', p.end); qR = qR.lte('rented_at', isoEnd(p.end)); qI = qI.lte('created_at', isoEnd(p.end)); }
            const ownerKey = String((currentUser && currentUser.id) || '');
            const res = await Promise.all([
                qEq, qBk, sb.from('bookings').select('*').in('facility_id', ids).eq('date', today), qR,
                sb.from('equipment_rentals').select('*').in('facility_id', ids).eq('status', 'renting'),
                qI, sb.from('equipment_incidents').select('*').in('facility_id', ids).in('status', ['damaged', 'repairing']),
                sb.from('cash_shifts').select('*').eq('owner_key', ownerKey).order('opened_at', { ascending: false }).limit(5)
            ]);
            const [rEq, rBk, rTd, rR, rRo, rI, rIo, rSh] = res;
            [rEq, rBk, rTd].forEach(r => { if (r.error) console.error('[dash]', r.error); });
            [rR, rRo, rI, rIo, rSh].forEach(r => { if (r.error) { if (isMissingTable(r.error)) ED.missing = true; else console.error('[dash]', r.error); } });
            ED.eq = rEq.data || []; ED.bookings = rBk.data || []; ED.todayBookings = rTd.data || [];
            ED.rentalsPeriod = rR.data || []; ED.rentalsOpen = rRo.data || [];
            ED.incidentsPeriod = rI.data || []; ED.incidentsOpen = rIo.data || [];
            const shifts = rSh.data || [];
            ED.shift = shifts.find(s => s.status === 'open') || null;
            ED.lastShift = shifts.find(s => s.status === 'closed') || null;

            // ข้อมูลช่วงกะ (สำหรับสรุปเงินสด / เงินโอน)
            const ws = ED.shift ? new Date(ED.shift.opened_at).toISOString() : isoStart(today);
            ED.win = { rentals: [], incidents: [], bookings: [] };
            if (!ED.missing) {
                const [wR, wI] = await Promise.all([
                    sb.from('equipment_rentals').select('*').in('facility_id', ids).or(`rented_at.gte.${ws},returned_at.gte.${ws}`),
                    sb.from('equipment_incidents').select('*').in('facility_id', ids).gte('created_at', ws)
                ]);
                ED.win.rentals = wR.data || []; ED.win.incidents = wI.data || [];
            }
            const wB = await sb.from('bookings').select('*').in('facility_id', ids).gte('created_at', ws);
            ED.win.bookings = wB.data || [];
            ED.winStart = ws;
            ED.lastLoad = Date.now();
        } catch (e) { console.error('[dash] load failed', e); toast('โหลดข้อมูลแดชบอร์ดไม่สำเร็จ: ' + (e.message || e), false); }
    }

    // ---------- compute ----------
    function compute() {
        const now = new Date(), hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
        const M = { bookingRent: 0, bookingSale: 0, counterRent: 0, counterSale: 0, fines: 0, repairCost: 0, items: {}, bills: [], bookingRentRows: [], activeBookingRent: {} };
        const addItem = (name, type, qty, rev) => { const k = name + '|' + type; const it = M.items[k] || (M.items[k] = { name, type, qty: 0, rev: 0 }); it.qty += qty; it.rev += rev; };

        M.bills = (typeof groupBookingsIntoBills === 'function' ? groupBookingsIntoBills(ED.bookings) : []).filter(okBill);
        M.bills.forEach(b => {
            let sum = 0;
            parseAddons(b.addons).forEach(a => {
                const q = num(a.qty), rev = q * num(a.price); if (q <= 0) return; sum += rev;
                if (a.type === 'เช่า') M.bookingRent += rev; else M.bookingSale += rev;
                addItem(a.name || '-', a.type === 'เช่า' ? 'เช่า' : 'ซื้อ', q, rev);
            });
            b.addonSum = sum; b.court = Math.max(0, num(b.total_price) - sum);
        });
        ED.rentalsPeriod.forEach(r => {
            if (r.kind === 'rent') M.counterRent += num(r.amount); else M.counterSale += num(r.amount);
            addItem(r.equipment_name || '-', r.kind === 'rent' ? 'เช่า' : 'ซื้อ', num(r.qty), num(r.amount));
        });
        ED.incidentsPeriod.forEach(i => { M.fines += num(i.fine_amount); M.repairCost += num(i.repair_cost); });

        M.rentRev = M.bookingRent + M.counterRent; M.saleRev = M.bookingSale + M.counterSale;
        M.netRev = M.rentRev + M.saleRev;

        // เช่าผ่านการจองสนาม (ทุกบิลในช่วงเวลาที่เลือก + วันนี้)
        const hmToday = hm, todayYmd = ymd(now);
        const allRentBills = [...M.bills];
        (typeof groupBookingsIntoBills === 'function' ? groupBookingsIntoBills(ED.todayBookings) : []).forEach(tb => {
            if (!allRentBills.some(x => x.groupId === tb.groupId) && okBill(tb)) allRentBills.push(tb);
        });
        allRentBills.forEach(b => {
            const addons = parseAddons(b.addons).filter(a => a.type === 'เช่า' && num(a.qty) > 0); if (!addons.length) return;
            const first = b.slots[0] ? b.slots[0].start : '', last = b.slots.length ? b.slots[b.slots.length - 1].end : '';
            const isToday = b.date === todayYmd;
            const active = isToday && b.slots.some(s => s.start <= hmToday && hmToday < s.end);
            const upcoming = isToday && !active && b.slots.some(s => s.start > hmToday);
            const stLower = String(b.payment_status || '').toLowerCase();
            const state = active ? 'active' : (upcoming ? 'upcoming' : (!isToday ? (stLower === 'pending' ? 'pending' : 'period') : 'done'));
            addons.forEach(a => {
                M.bookingRentRows.push({ bill: b, a, range: `${b.date !== todayYmd ? b.date + ' ' : ''}${first} - ${last}`, state });
                if (active) M.activeBookingRent[String(a.id)] = (M.activeBookingRent[String(a.id)] || 0) + num(a.qty);
            });
        });
        M.activeBookingQty = Object.values(M.activeBookingRent).reduce((s, v) => s + v, 0);

        M.counterOpenQty = ED.rentalsOpen.reduce((s, r) => s + num(r.qty), 0);
        M.overdue = ED.rentalsOpen.filter(r => r.due_at && new Date(r.due_at) < now);
        M.depositHeld = ED.rentalsOpen.reduce((s, r) => s + num(r.deposit), 0);
        M.rentedNow = M.counterOpenQty + M.activeBookingQty;
        M.brokenQty = ED.incidentsOpen.reduce((s, i) => s + num(i.qty), 0);
        M.waitRepairQty = ED.incidentsOpen.filter(i => i.status === 'damaged').reduce((s, i) => s + num(i.qty), 0);
        M.stockSum = ED.eq.reduce((s, e) => s + num(e.stock), 0);
        M.ready = ED.eq.reduce((s, e) => s + Math.max(0, num(e.stock) - (e.type === 'เช่า' ? num(M.activeBookingRent[String(e.id)]) : 0)), 0);
        M.total = M.ready + M.rentedNow + M.brokenQty;
        M.low = ED.eq.filter(e => num(e.stock) <= thresholdOf(e));
        M.topItems = Object.values(M.items).sort((a, b) => b.qty - a.qty).slice(0, 5);
        M.todayRentCount = ED.rentalsPeriod.filter(r => r.kind === 'rent' && ymd(new Date(r.rented_at)) === ymd(now)).length + M.bookingRentRows.length;
        ED.M = M;
        ED.cash = computeCash();
        ED.folios = buildFolios();
    }
    const thresholdOf = e => (e.low_stock_threshold == null ? 3 : num(e.low_stock_threshold));

    function computeCash() {
        const ws = ED.winStart ? new Date(ED.winStart) : new Date(ymd(new Date()) + 'T00:00:00');
        let cash = 0, transfer = 0, cashRent = 0, cashWalkin = 0, cashFine = 0, refunds = 0;
        ED.win.rentals.forEach(r => {
            const m = r.payment_method === 'transfer' ? 'transfer' : 'cash';
            if (new Date(r.rented_at) >= ws) { const v = num(r.amount) + num(r.deposit); if (m === 'cash') { cash += v; cashRent += v; } else transfer += v; }
            if (r.returned_at && new Date(r.returned_at) >= ws) { const rf = num(r.deposit_refunded); if (m === 'cash') { cash -= rf; refunds += rf; } else transfer -= rf; }
        });
        ED.win.incidents.forEach(i => { const v = num(i.fine_collected); if (!v) return; if (i.fine_method === 'transfer') transfer += v; else { cash += v; cashFine += v; } });
        ED.win.bookings.forEach(b => {
            const st = String(b.payment_status || '').toLowerCase(); if (st === 'rejected') return;
            if (b.slip_url === 'walk-in') { cash += num(b.total_price); cashWalkin += num(b.total_price); }
            else if (st === 'approved' || st === 'completed') transfer += num(b.total_price);
        });
        const float = ED.shift ? num(ED.shift.float_amount) : 0;
        return { float, received: cash, expected: float + cash, transfer, cashRent, cashWalkin, cashFine, refunds, start: ws };
    }

    function buildFolios() {
        const M = ED.M, map = new Map();
        const keyOf = (phone, name, date) => (digits(phone) || String(name || '').trim() || '-') + '|' + date;
        const get = (k, name, phone, date) => { if (!map.has(k)) map.set(k, { key: k, name: name || '-', phone: phone || '-', date, facs: new Set(), court: 0, equip: 0, fines: 0, held: 0, refunded: 0, items: [], slots: [] }); return map.get(k); };
        M.bills.forEach(b => {
            const f = get(keyOf(b.customer_phone, b.customer_name, b.date), b.customer_name, b.customer_phone, b.date);
            f.facs.add(facName(b.facility_id)); f.court += b.court; f.equip += b.addonSum;
            f.slots.push(`${b.slots[0] ? b.slots[0].start : ''}-${b.slots.length ? b.slots[b.slots.length - 1].end : ''}`);
            parseAddons(b.addons).forEach(a => { if (num(a.qty) > 0) f.items.push({ name: `${a.name} (${a.type}) x${num(a.qty)}`, amount: num(a.qty) * num(a.price) }); });
        });
        const rentalKey = {};
        ED.rentalsPeriod.forEach(r => {
            const d = ymd(new Date(r.rented_at)), k = keyOf(r.customer_phone, r.customer_name, d);
            rentalKey[r.id] = k;
            const f = get(k, r.customer_name, r.customer_phone, d);
            f.facs.add(facName(r.facility_id)); f.equip += num(r.amount); f.refunded += num(r.deposit_refunded);
            if (r.status === 'renting') f.held += num(r.deposit);
            f.items.push({ name: `${r.equipment_name || '-'} (${r.kind === 'rent' ? 'เช่า' : 'ซื้อ'}) x${num(r.qty)}`, amount: num(r.amount) });
        });
        ED.incidentsPeriod.forEach(i => {
            if (!num(i.fine_amount)) return;
            const k = (i.rental_id && rentalKey[i.rental_id]) || keyOf(i.customer_phone, i.customer_name, ymd(new Date(i.created_at)));
            const f = get(k, i.customer_name, i.customer_phone, k.split('|').pop());
            f.facs.add(facName(i.facility_id)); f.fines += num(i.fine_amount);
            f.items.push({ name: `ค่าปรับ: ${i.equipment_name || ''} ${i.kind === 'lost' ? '(สูญหาย)' : i.kind === 'damaged' ? '(ชำรุด)' : ''}`.trim(), amount: num(i.fine_amount) });
        });
        return [...map.values()].map(f => {
            f.no = `FOL-${f.date.slice(2, 4)}${f.date.slice(5, 7)}${f.date.slice(8, 10)}-${hash4(f.key)}`;
            f.net = f.court + f.equip + f.fines + f.held;
            return f;
        }).sort((a, b) => b.date.localeCompare(a.date) || a.no.localeCompare(b.no));
    }

    // ---------- render: header / KPI ----------
    function renderClock() {
        const el = $('dashDateSubtitle'); if (!el) return;
        const d = new Date();
        el.textContent = `วันที่ ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear() + 543} | เวลา ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} น.`;
    }
    function renderBanner() {
        const el = $('edBanner'); if (!el) return;
        if (ED.missing) { el.style.display = 'block'; el.innerHTML = '⚠️ ยังไม่ได้สร้างตารางใหม่ใน Supabase (equipment_rentals / equipment_incidents / cash_shifts) — แท็บ 2, 3, 4 จะยังบันทึกไม่ได้ ให้เปิด Supabase › SQL Editor แล้วรันไฟล์ <b>supabase_equipment.sql</b> หนึ่งครั้ง จากนั้นกดรีเฟรชหน้านี้'; }
        else el.style.display = 'none';
    }
    function setText(id, t) { const el = $(id); if (el) el.textContent = t; }
    function renderKPIs() {
        const M = ED.M; if (!M) return;
        setText('edK1Val', money(M.netRev)); setText('edK1a', 'ค่าเช่า: ' + money(M.rentRev)); setText('edK1b', 'ซื้อขาด: ' + money(M.saleRev));
        setText('edK2Val', `${M.rentedNow.toLocaleString()} ชิ้น`);
        const od = $('edK2Badge'); if (od) { od.style.display = M.overdue.length ? 'inline-block' : 'none'; od.textContent = `เกินกำหนด ${M.overdue.length} รายการ`; }
        setText('edK2a', 'มัดจำสะสม: ' + money(M.depositHeld));
        setText('edK3Val', `${M.total.toLocaleString()} ชิ้น`); setText('edK3a', `พร้อมใช้: ${M.ready.toLocaleString()} ชิ้น`); setText('edK3b', `สต็อกต่ำ: ${M.low.length} รายการ`);
        setText('edK4Val', `${M.brokenQty.toLocaleString()} ชิ้น`); setText('edK4a', 'ค่าปรับสะสม: ' + money(M.fines)); setText('edK4b', `รอซ่อม: ${M.waitRepairQty} ชิ้น`);
    }

    // ---------- render: tabs ----------
    function tabTitle(t, hint, btn) {
        return `<div class="ed-pane-head"><div><h3>${t}</h3>${hint ? `<p>${hint}</p>` : ''}</div>${btn || ''}</div>`;
    }
    const emptyRow = (cols, msg) => `<tr><td colspan="${cols}" class="ed-empty">${msg || 'ไม่พบข้อมูล'}</td></tr>`;
    const matches = (q, ...vals) => !q || vals.some(v => String(v || '').toLowerCase().includes(q));

    function renderStock() {
        const q = searchText();
        const list = ED.eq.filter(e => matches(q, e.name, e.type, facName(e.facility_id)));
        const multi = ED.facs.length > 1;
        const maxStock = Math.max(1, ...ED.eq.map(e => num(e.stock)));
        const cards = list.map(e => {
            const th = thresholdOf(e), stock = num(e.stock), low = stock <= th, rent = e.type === 'เช่า';
            const pct = Math.max(0, Math.min(100, Math.round(stock / maxStock * 100)));
            const rentedQty = ED.M && ED.M.activeBookingRent ? num(ED.M.activeBookingRent[String(e.id)]) : 0;
            return `<div class="ed-eq-card${low ? ' low' : ''}">
        ${low ? `<div class="ed-ribbon">สต็อกต่ำ (เหลือ &lt;= ${th})</div>` : ''}
        <button class="ed-eq-del" data-act="edit-eq" data-id="${esc(e.id)}" title="แก้ไข / ลบ">✎</button>
        <span class="ed-tag ${rent ? 'rent' : 'sale'}">${rent ? 'สำหรับเช่า' : 'ซื้อขาด'}</span>
        <div class="ed-eq-name" data-act="edit-eq" data-id="${esc(e.id)}" title="แก้ไข / ลบ">${esc(e.name)}</div>
        <div class="ed-eq-price">${money(e.price)} <small>/ ${rent ? 'รอบเช่า' : 'ชิ้น'}</small>${rent && num(e.deposit) ? `<small class="ed-eq-dep">มัดจำ ${money(e.deposit)}</small>` : ''}${multi ? `<span class="ed-eq-fac">${esc(facName(e.facility_id))}</span>` : ''}</div>
        <div class="ed-stockbar" title="สต็อก ${stock} ชิ้น"><span class="${low ? 'low' : ''}" style="width:${pct}%"></span></div>
        <div class="ed-eq-foot">
          <span>คงเหลือ: <b class="${low ? 'warn' : ''}">${stock.toLocaleString()} ชิ้น</b>${rent && rentedQty ? ` <small class="ed-sub">(จองล่วงหน้า ${rentedQty})</small>` : ''}</span>
          <span class="ed-stepper"><button data-act="stock-dec" data-id="${esc(e.id)}" title="ลด">−</button><button data-act="stock-inc" data-id="${esc(e.id)}" title="เพิ่ม">+</button></span>
        </div></div>`;
        }).join('');
        const stockValue = list.reduce((s, e) => s + num(e.stock) * num(e.price), 0);
        const summary = list.length ? `<div class="ed-stock-summary"><span>อุปกรณ์ทั้งหมด: <b>${list.length} รายการ</b></span><span>สต็อกรวม: <b>${list.reduce((s, e) => s + num(e.stock), 0).toLocaleString()} ชิ้น</b></span><span>มูลค่าสต็อกรวม: <b class="green">${money(stockValue)}</b></span></div>` : '';
        $('edPane1').innerHTML = tabTitle('รายการสต็อกอุปกรณ์กีฬา และสินค้าขายหน้าร้าน', '', '<div class="ed-hint">กดปุ่ม + / − เพื่อปรับจำนวนสต็อกคงเหลือด่วน</div>') +
            summary +
            (list.length ? `<div class="ed-eq-grid">${cards}</div>` : `<div class="ed-empty-block">${ED.eq.length ? 'ไม่พบอุปกรณ์ที่ตรงกับคำค้นหา' : 'ยังไม่มีอุปกรณ์ — กดปุ่ม “+ เพิ่มอุปกรณ์ใหม่” ด้านบน'}</div>`);
    }

    function renderRentals() {
        const q = searchText(), now = new Date();
        const open = ED.rentalsOpen.filter(r => matches(q, r.customer_name, r.customer_phone, r.equipment_name, facName(r.facility_id)));
        const rows = open.map(r => {
            const late = r.due_at && new Date(r.due_at) < now;
            return `<tr><td><b>${esc(r.customer_name || '-')}</b><div class="ed-sub">${esc(maskPhone(r.customer_phone))}</div></td>
        <td>${esc(r.equipment_name || '-')}<div class="ed-sub">${esc(facName(r.facility_id))}</div></td>
        <td class="num">${num(r.qty)}</td><td>${fmtDT(r.rented_at)}</td><td>${fmtDT(r.due_at)}</td>
        <td><span class="ed-badge ${late ? 'red' : 'blue'}">${late ? 'เกินกำหนด' : 'กำลังเช่า'}</span></td>
        <td class="num">${money(r.deposit)}</td>
        <td><button class="ed-btn sm green" data-act="return" data-id="${esc(r.id)}">รับคืน</button></td></tr>`;
        }).join('');
        const bk = ED.M.bookingRentRows.filter(x => matches(q, x.bill.customer_name, x.a.name, facName(x.bill.facility_id))).map(x => {
            const st = { active: ['กำลังใช้งาน', 'blue'], upcoming: ['รอใช้งาน', 'amber'], done: ['สิ้นสุดแล้ว', 'gray'], pending: ['รออนุมัติ/ตรวจสลิป', 'amber'], period: ['ในช่วงที่เลือก', 'green'] }[x.state] || [x.state, 'gray'];
            return `<tr><td><b>${esc(x.bill.customer_name)}</b><div class="ed-sub">${esc(maskPhone(x.bill.customer_phone))}</div></td><td>${esc(x.a.name)}<div class="ed-sub">${esc(facName(x.bill.facility_id))}</div></td><td class="num">${num(x.a.qty)}</td><td>${esc(x.range)} น.</td><td><span class="ed-badge ${st[1]}">${st[0]}</span></td></tr>`;
        }).join('');
        const hist = ED.rentalsPeriod.filter(r => r.status !== 'renting' && matches(q, r.customer_name, r.equipment_name)).slice(0, 40).map(r =>
            `<tr><td>${fmtDT(r.rented_at)}</td><td>${esc(r.customer_name || '-')}</td><td>${esc(r.equipment_name || '-')}</td><td class="num">${num(r.qty)}</td><td><span class="ed-badge ${r.kind === 'rent' ? 'green' : 'purple'}">${r.kind === 'rent' ? 'คืนแล้ว' : 'ขายแล้ว'}</span></td><td class="num">${money(r.amount)}</td><td>${r.payment_method === 'transfer' ? 'โอน' : 'เงินสด'}</td></tr>`).join('');
        $('edPane2').innerHTML = tabTitle('รายการกำลังเช่า & คืนของ', 'อุปกรณ์ที่ลูกค้าเช่าหน้าร้านและยังไม่ได้คืน — กด “รับคืน” เพื่อคืนสต็อก คืนมัดจำ หรือบันทึกความเสียหาย',
            '<button class="ed-btn blue" data-act="new-rental">+ ทำรายการเช่า / ขายหน้าร้าน</button>') +
            `<div class="ed-tablewrap"><table class="ed-table"><thead><tr><th>ลูกค้า</th><th>อุปกรณ์</th><th class="num">จำนวน</th><th>เวลาเช่า</th><th>กำหนดคืน</th><th>สถานะ</th><th class="num">มัดจำ</th><th></th></tr></thead><tbody>${rows || emptyRow(8, 'ไม่มีรายการที่กำลังเช่าอยู่')}</tbody></table></div>
      <h4 class="ed-h4">เช่าพร้อมการจองสนาม (ทุกรายการในช่วงที่เลือก + วันนี้)</h4>
      <div class="ed-tablewrap"><table class="ed-table"><thead><tr><th>ลูกค้า</th><th>อุปกรณ์</th><th class="num">จำนวน</th><th>ช่วงเวลาจอง</th><th>สถานะ</th></tr></thead><tbody>${bk || emptyRow(5, 'วันนี้ไม่มีการเช่าอุปกรณ์ผ่านการจองสนาม')}</tbody></table></div>
      <h4 class="ed-h4">ประวัติเช่า/ขายหน้าร้านในช่วงเวลาที่เลือก</h4>
      <div class="ed-tablewrap"><table class="ed-table"><thead><tr><th>เวลา</th><th>ลูกค้า</th><th>อุปกรณ์</th><th class="num">จำนวน</th><th>สถานะ</th><th class="num">ยอด</th><th>ชำระ</th></tr></thead><tbody>${hist || emptyRow(7, 'ยังไม่มีประวัติ')}</tbody></table></div>`;
    }

    const INC_KIND = { damaged: 'ชำรุด', lost: 'สูญหาย', fee: 'ค่าปรับ' };
    const INC_ST = { damaged: ['รอส่งซ่อม', 'amber'], repairing: ['อยู่ระหว่างซ่อม', 'blue'], repaired: ['ซ่อมเสร็จ', 'green'], written_off: ['ตัดจำหน่าย', 'gray'], closed: ['ปิดรายการ', 'gray'] };
    function renderIncidents() {
        const q = searchText();
        const map = new Map(); ED.incidentsOpen.concat(ED.incidentsPeriod).forEach(i => map.set(i.id, i));
        const list = [...map.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).filter(i => matches(q, i.equipment_name, i.customer_name, INC_KIND[i.kind], facName(i.facility_id)));
        const rows = list.map(i => {
            const st = INC_ST[i.status] || [i.status, 'gray'];
            let act = '';
            if (i.status === 'damaged') act = `<button class="ed-btn sm amber" data-act="inc-send" data-id="${esc(i.id)}">ส่งซ่อม</button> <button class="ed-btn sm ghost" data-act="inc-off" data-id="${esc(i.id)}">ตัดจำหน่าย</button>`;
            else if (i.status === 'repairing') act = `<button class="ed-btn sm green" data-act="inc-done" data-id="${esc(i.id)}">ซ่อมเสร็จ</button> <button class="ed-btn sm ghost" data-act="inc-off" data-id="${esc(i.id)}">ตัดจำหน่าย</button>`;
            return `<tr><td>${fmtDT(i.created_at)}</td><td>${esc(i.equipment_name || '-')}<div class="ed-sub">${esc(facName(i.facility_id))}</div></td><td>${esc(i.customer_name || '-')}</td><td>${INC_KIND[i.kind] || i.kind}</td><td class="num">${num(i.qty)}</td><td><span class="ed-badge ${st[1]}">${st[0]}</span></td><td class="num">${money(i.fine_amount)}</td><td class="num">${num(i.repair_cost) ? money(i.repair_cost) : '-'}</td><td>${act}</td></tr>`;
        }).join('');
        const M = ED.M;
        $('edPane3').innerHTML = tabTitle('ชำรุด / ส่งซ่อม & ค่าปรับ', 'บันทึกอุปกรณ์เสียหาย สูญหาย ติดตามสถานะการซ่อม และค่าปรับที่เรียกเก็บจากลูกค้า',
            '<button class="ed-btn amber" data-act="new-incident">⚠ แจ้งชำรุด / สูญหาย</button>') +
            `<div class="ed-mini-grid"><div><span>รอส่งซ่อม</span><b>${M.waitRepairQty} ชิ้น</b></div><div><span>ชำรุด/ซ่อมอยู่ทั้งหมด</span><b>${M.brokenQty} ชิ้น</b></div><div><span>ค่าปรับสะสม (ช่วงที่เลือก)</span><b>${money(M.fines)}</b></div><div><span>ค่าซ่อมสะสม</span><b>${money(M.repairCost)}</b></div></div>
      <div class="ed-tablewrap"><table class="ed-table"><thead><tr><th>วันที่</th><th>อุปกรณ์</th><th>ลูกค้า</th><th>ประเภท</th><th class="num">จำนวน</th><th>สถานะ</th><th class="num">ค่าปรับ</th><th class="num">ค่าซ่อม</th><th></th></tr></thead><tbody>${rows || emptyRow(9, 'ยังไม่มีรายการชำรุด / สูญหาย')}</tbody></table></div>`;
    }

    function renderCash() {
        const C = ED.cash, sh = ED.shift, last = ED.lastShift;
        const shiftLabel = s => `${esc(s.staff_name || '-')} (${esc(s.shift_label || 'กะ')} ${pad(new Date(s.opened_at).getHours())}:${pad(new Date(s.opened_at).getMinutes())}${s.closed_at ? ' - ' + pad(new Date(s.closed_at).getHours()) + ':' + pad(new Date(s.closed_at).getMinutes()) : ' เป็นต้นไป'})`;
        let panel;
        if (sh) {
            panel = `<h4>สถานะกะปัจจุบัน</h4><p class="ed-sub2">พนักงานประจำกะ: ${shiftLabel(sh)}</p>
        <div class="ed-line"><span>เงินสดตั้งต้น (Float):</span><b>${money(C.float)}</b></div>
        <div class="ed-line"><span>รับเงินสดระหว่างกะ:</span><b>${money(C.received)}</b></div>
        <div class="ed-line sub"><span>• ค่าเช่า/ขาย + มัดจำ ${money(C.cashRent)} • จองหน้างาน ${money(C.cashWalkin)} • ค่าปรับ ${money(C.cashFine)} • คืนมัดจำ −${money(C.refunds)}</span></div>
        <div class="ed-line total"><span>รวมเงินสดต้องมีในกะ:</span><b>${money(C.expected)}</b></div>
        <button class="ed-btn-wide" data-act="close-shift">เริ่มบันทึกตรวจนับเงินส่งมอบกะ</button>`;
        } else {
            panel = `<h4>สถานะการตรวจนับเงินปิดกะล่าสุด</h4>` + (last ?
                `<p class="ed-sub2">พนักงานประจำกะ: ${shiftLabel(last)}</p>
        <div class="ed-line"><span>เงินสดตั้งต้น (Float):</span><b>${money(last.float_amount)}</b></div>
        <div class="ed-line"><span>เงินสดที่ต้องมี (ระบบคำนวณ):</span><b>${money(last.expected_cash)}</b></div>
        <div class="ed-line"><span>เงินสดที่นับได้จริง:</span><b>${money(last.counted_cash)}</b></div>
        <div class="ed-line total"><span>ผลต่าง:</span><b class="${num(last.diff) === 0 ? '' : (num(last.diff) < 0 ? 'neg' : 'pos')}">${num(last.diff) > 0 ? '+' : ''}${money(last.diff)}</b></div>` :
                '<p class="ed-sub2">ยังไม่เคยปิดกะ</p>') +
                `<button class="ed-btn-wide" data-act="open-shift">เปิดกะใหม่</button>`;
        }
        $('edPane4').innerHTML = tabTitle('สรุปช่องทางชำระเงินปัจจุบัน', sh ? `นับตั้งแต่เปิดกะ ${fmtDT(sh.opened_at)}` : 'ยังไม่ได้เปิดกะ — แสดงยอดของวันนี้') +
            `<div class="ed-cash-grid"><div class="ed-cash-left">
        <div class="ed-pay green"><div class="ic">💵</div><div class="tx"><b>เงินสดในลิ้นชัก (Cash in Drawer)</b><span>คำนวณจากระบบ</span></div><div class="amt">${money(C.expected)}</div></div>
        <div class="ed-pay blue"><div class="ic">▦</div><div class="tx"><b>เงินโอน (PromptPay / QR)</b><span>เข้าบัญชีธนาคาร</span></div><div class="amt">${money(C.transfer)}</div></div>
        <p class="ed-note">เงินสดนับรวม: ค่าเช่า/ซื้ออุปกรณ์ที่จ่ายสด + เงินมัดจำ + การจองหน้างาน + ค่าปรับที่เก็บเพิ่ม − มัดจำที่คืนเป็นเงินสด • เงินโอนนับจากสลิปที่อนุมัติแล้วและรายการที่เลือกจ่ายแบบโอน</p></div>
        <div class="ed-cash-right">${panel}</div></div>`;
    }

    function renderFolios() {
        const q = searchText();
        const list = ED.folios.filter(f => matches(q, f.name, f.phone, f.no, [...f.facs].join(' ')));
        const rows = list.map((f, i) => `<tr><td><b class="pri">${esc(f.no)}</b></td><td><b>${esc(f.name)} (${esc(maskPhone(f.phone))})</b></td><td>${esc([...f.facs].join(', '))}</td>
      <td class="num">${money(f.court)}</td><td class="num">${money(f.equip + f.fines)}</td><td class="num ${f.refunded ? 'green' : ''}">−${money(f.refunded)}</td><td class="num"><b>${money(f.net)}</b></td>
      <td><button class="ed-iconbtn" data-act="receipt" data-i="${ED.folios.indexOf(f)}" title="พิมพ์ใบเสร็จ">🖨</button></td></tr>`).join('');
        $('edPane5').innerHTML = tabTitle('รายการบิลรวมลูกค้ารายบุคคล (Consolidated Folios)', 'รวมค่าจองสนาม + ค่าเช่า/ซื้ออุปกรณ์ + ค่าปรับ + มัดจำที่ยังถือไว้ — กดเครื่องพิมพ์เพื่อออกใบเสร็จรับเงิน') +
            `<div class="ed-tablewrap"><table class="ed-table"><thead><tr><th>เลขที่ Folio</th><th>ชื่อลูกค้า / โทรศัพท์</th><th>สนามที่ใช้บริการ</th><th class="num">ค่าสนาม</th><th class="num">ค่าเช่า/ซื้ออุปกรณ์</th><th class="num">มัดจำคืนแล้ว</th><th class="num">ยอดสุทธิชำระ</th><th>ใบเสร็จ</th></tr></thead><tbody>${rows || emptyRow(8, 'ไม่พบบิลในช่วงเวลาที่เลือก')}</tbody></table></div>`;
    }

    function renderStats() {
        const M = ED.M;
        const top = M.topItems, max = top.length ? top[0].qty : 1;
        const bars = top.map(t => `<div class="ed-bar"><div class="r"><span>${esc(t.name)}</span><b>${t.qty.toLocaleString()} ${t.type === 'เช่า' ? 'ครั้ง' : 'ชิ้น'}</b></div><div class="trk"><div class="fil" style="width:${Math.max(4, Math.round(t.qty / max * 100))}%"></div></div></div>`).join('');
        $('edPane6').innerHTML = `<div class="ed-stats-grid">
      <div class="ed-stat-card"><h4>สัดส่วนรายได้แยกตามหมวดหมู่สินค้า</h4><div class="ed-chart"><canvas id="edPieRevenue"></canvas></div></div>
      <div class="ed-stat-card"><h4>สัดส่วนสถานะอุปกรณ์ทั้งหมด</h4><div class="ed-chart"><canvas id="edDonutStatus"></canvas></div></div>
      <div class="ed-stat-card"><h4>5 อันดับอุปกรณ์ที่ถูกเช่าและซื้อบ่อยที่สุด</h4>${bars || '<div class="ed-empty-block">ยังไม่มีข้อมูลการเช่า/ขาย</div>'}</div></div>`;
        if (typeof Chart === 'undefined') return;
        Object.values(ED.charts).forEach(c => { try { c.destroy(); } catch (e) { } }); ED.charts = {};
        const legend = { position: 'top', align: 'start', labels: { boxWidth: 34, boxHeight: 10, font: { family: 'Prompt, sans-serif', size: 11 } } };
        const opt = { responsive: true, maintainAspectRatio: false, plugins: { legend, tooltip: { callbacks: { label: c => ` ${c.label}: ${c.parsed.toLocaleString()}` } } } };
        ED.charts.pie = new Chart($('edPieRevenue'), { type: 'pie', data: { labels: ['ค่าเช่าอุปกรณ์', 'สินค้าขายขาด', 'ค่าปรับ/อื่นๆ'], datasets: [{ data: [M.rentRev, M.saleRev, M.fines], backgroundColor: ['#0284c7', '#10b981', '#f59e0b'], borderWidth: 1 }] }, options: opt });
        ED.charts.donut = new Chart($('edDonutStatus'), { type: 'doughnut', data: { labels: ['พร้อมใช้งาน', 'กำลังถูกเช่า', 'ชำรุด/ส่งซ่อม'], datasets: [{ data: [M.ready, M.rentedNow, M.brokenQty], backgroundColor: ['#10b981', '#0284c7', '#ef4444'], borderWidth: 1 }] }, options: Object.assign({}, opt, { cutout: '55%' }) });
    }

    const RENDER = { 1: renderStock, 2: renderRentals, 3: renderIncidents, 4: renderCash, 5: renderFolios, 6: renderStats };
    function renderTab(n) { try { if (ED.M && $('edPane' + n)) RENDER[n](); } catch (e) { console.error('[dash] render tab', n, e); } }
    function renderAll() { renderBanner(); renderKPIs(); renderTab(ED.tab); }

    async function refresh() {
        if (ED.loading) { ED.again = true; return; } // มีการโหลดอยู่ → โหลดซ้ำอีกรอบหลังเสร็จ (กันตัวกรองเปลี่ยนระหว่างโหลดแล้วข้อมูลค้าง)
        ED.loading = true;
        try { await loadAll(); compute(); renderAll(); if (window.lucide) try { lucide.createIcons(); } catch (e) { } }
        finally { ED.loading = false; }
        if (ED.again) { ED.again = false; await refresh(); }
    }

    window.switchDashTab = function (n) {
        ED.tab = Number(n) || 1;
        const allowed = ED.allowedTabs;
        document.querySelectorAll('.ed-tab-btn').forEach(b => {
            const t = Number(b.dataset.tab);
            b.style.display = (!allowed || allowed.includes(t)) ? '' : 'none';
            b.classList.toggle('active', t === ED.tab);
        });
        document.querySelectorAll('.ed-pane').forEach(p => {
            const t = Number(String(p.id).replace('edPane', ''));
            p.classList.toggle('active', p.id === 'edPane' + ED.tab);
        });
        renderTab(ED.tab);
    };
    // กลุ่มแท็บที่แต่ละหน้าเมนูเห็น: จัดการอุปกรณ์ = งานหน้าเคาน์เตอร์, สรุปบิล = งานการเงิน, สถิติ = งานผู้บริหาร
    const VIEW_TABS = { 'dash-equipment': [1, 2, 3], 'dash-folios': [4, 5], 'dash-stats': [6] };
    function applyViewTabs(view) {
        ED.allowedTabs = VIEW_TABS[view] || null;
        document.querySelectorAll('.ed-tab-btn').forEach(b => {
            const t = Number(b.dataset.tab);
            b.style.display = (!ED.allowedTabs || ED.allowedTabs.includes(t)) ? '' : 'none';
        });
    }
    window.edRender = () => renderTab(ED.tab);

    // ---------- modal ----------
    function modal(title, html, buttons, wide) {
        let ov = $('edModal');
        if (!ov) { ov = document.createElement('div'); ov.id = 'edModal'; ov.className = 'modal-overlay'; document.body.appendChild(ov); ov.addEventListener('mousedown', e => { if (e.target === ov) closeEd(); }); }
        ov.innerHTML = `<div class="modal ed-modal${wide ? ' wide' : ''}"><h3>${esc(title)}</h3><div class="ed-modal-body">${html}</div><div class="ed-modal-foot"></div></div>`;
        const foot = ov.querySelector('.ed-modal-foot');
        (buttons || []).forEach(b => { const el = document.createElement('button'); el.type = 'button'; el.className = 'ed-btn ' + (b.cls || 'ghost'); el.textContent = b.label; el.addEventListener('click', async () => { if (b.close) { closeEd(); return; } el.disabled = true; try { await b.fn(); } finally { el.disabled = false; } }); foot.appendChild(el); });
        ov.classList.add('active');
    }
    function closeEd() { const ov = $('edModal'); if (ov) ov.classList.remove('active'); }
    const v = id => { const el = $(id); return el ? el.value : ''; };
    const field = (label, inner) => `<label class="ed-f"><span>${label}</span>${inner}</label>`;
    const facOptions = (sel) => ED.facs.map(f => `<option value="${esc(f.id)}"${String(f.id) === String(sel) ? ' selected' : ''}>${esc(f.name)}</option>`).join('');

    // ---- equipment add / edit ----
    function equipmentModal(id) {
        const e = id ? ED.eq.find(x => String(x.id) === String(id)) : null;
        modal(e ? 'แก้ไขอุปกรณ์' : 'เพิ่มอุปกรณ์ใหม่',
            field('สนาม', `<select id="edf_fac">${facOptions(e ? e.facility_id : (ED.facs[0] || {}).id)}</select>`) +
            field('ชื่ออุปกรณ์ / สินค้า', `<input id="edf_name" type="text" value="${esc(e ? e.name : '')}" placeholder="เช่น ไม้แบดมินตัน Yonex">`) +
            `<div class="ed-row2">${field('ประเภท', `<select id="edf_type"><option value="เช่า"${e && e.type === 'เช่า' ? ' selected' : ''}>สำหรับเช่า</option><option value="ซื้อ"${e && e.type === 'ซื้อ' ? ' selected' : ''}>ซื้อขาด (ขายหน้าร้าน)</option></select>`)}${field('ราคา (บาท)', `<input id="edf_price" type="number" min="0" value="${e ? num(e.price) : ''}">`)}</div>` +
            `<div class="ed-row3">${field('สต็อก (ชิ้น)', `<input id="edf_stock" type="number" min="0" value="${e ? num(e.stock) : 0}">`)}${field('มัดจำ/ชิ้น (เฉพาะเช่า)', `<input id="edf_dep" type="number" min="0" value="${e ? num(e.deposit) : 0}">`)}${field('เตือนเมื่อเหลือ ≤', `<input id="edf_th" type="number" min="0" value="${e ? thresholdOf(e) : 3}">`)}</div>`,
            [{ label: 'บันทึก', cls: 'blue', fn: () => saveEquipment(e) }].concat(e ? [{ label: 'ลบ', cls: 'red', fn: () => deleteEquipment(e) }] : []).concat([{ label: 'ยกเลิก', close: true }]));
    }
    async function saveEquipment(e) {
        const name = v('edf_name').trim(), price = num(v('edf_price')), stock = Math.max(0, Math.floor(num(v('edf_stock'))));
        if (!name) { toast('กรุณากรอกชื่ออุปกรณ์', false); return; }
        if (!v('edf_fac')) { toast('กรุณาเลือกสนาม', false); return; }
        const row = { facility_id: v('edf_fac'), name, type: v('edf_type'), price, stock, deposit: v('edf_type') === 'เช่า' ? num(v('edf_dep')) : 0, low_stock_threshold: Math.max(0, Math.floor(num(v('edf_th')))) };
        const run = async r => e ? supabaseClient.from('equipment').update(r).eq('id', e.id) : supabaseClient.from('equipment').insert([Object.assign({ owner_id: (currentUser && currentUser.id) || null }, r)]);
        let res = await run(row);
        if (res.error && /deposit|low_stock_threshold/.test(res.error.message || '')) { delete row.deposit; delete row.low_stock_threshold; res = await run(row); if (!res.error) toast('บันทึกแล้ว (ยังไม่มีคอลัมน์มัดจำ/เตือนสต็อก — รัน supabase_equipment.sql)', true); }
        if (res.error) { toast('บันทึกไม่สำเร็จ: ' + res.error.message, false); return; }
        closeEd(); toast('บันทึกอุปกรณ์เรียบร้อย'); await refresh();
    }
    async function deleteEquipment(e) {
        if (!confirm(`ลบ “${e.name}” ออกจากระบบ? (ประวัติการเช่า/ขายเดิมยังอยู่)`)) return;
        const { error } = await supabaseClient.from('equipment').delete().eq('id', e.id);
        if (error) { toast('ลบไม่สำเร็จ: ' + error.message, false); return; }
        closeEd(); toast('ลบอุปกรณ์แล้ว'); await refresh();
    }
    async function adjustStock(id, delta) {
        const e = ED.eq.find(x => String(x.id) === String(id)); if (!e) return;
        const ns = Math.max(0, num(e.stock) + delta); if (ns === num(e.stock)) return;
        e.stock = ns; renderStock(); // optimistic
        const { error } = await supabaseClient.from('equipment').update({ stock: ns }).eq('id', id);
        if (error) { toast('ปรับสต็อกไม่สำเร็จ: ' + error.message, false); await refresh(); return; }
        compute(); renderKPIs();
    }
    async function shiftStock(equipmentId, delta) { // อ่านค่าล่าสุดจาก DB ก่อนเขียน
        const { data, error } = await supabaseClient.from('equipment').select('stock').eq('id', equipmentId).single();
        if (error || !data) return { error: error || new Error('ไม่พบอุปกรณ์') };
        const ns = num(data.stock) + delta; if (ns < 0) return { error: new Error('สต็อกไม่พอ (คงเหลือ ' + num(data.stock) + ')') };
        const r = await supabaseClient.from('equipment').update({ stock: ns }).eq('id', equipmentId);
        return { error: r.error, stock: ns };
    }

    // ---- new rental / sale ----
    function rentalModal() {
        const facs = ED.facs; if (!facs.length) { toast('ยังไม่มีสนามในการดูแล', false); return; }
        modal('ทำรายการเช่า / ขายอุปกรณ์หน้าร้าน',
            field('สนาม', `<select id="edr_fac">${facOptions(facs[0].id)}</select>`) + field('อุปกรณ์', '<select id="edr_eq"></select>') +
            `<div class="ed-row2">${field('จำนวน', '<input id="edr_qty" type="number" min="1" value="1">')}${field('ชำระด้วย', '<select id="edr_pay"><option value="cash">เงินสด</option><option value="transfer">โอน / QR</option></select>')}</div>` +
            `<div class="ed-row2">${field('ชื่อลูกค้า', '<input id="edr_name" type="text" placeholder="ชื่อลูกค้า">')}${field('เบอร์โทร', '<input id="edr_phone" type="tel" placeholder="08x-xxx-xxxx">')}</div>` +
            `<div class="ed-row2" id="edr_rentbox">${field('เงินมัดจำ (บาท)', '<input id="edr_dep" type="number" min="0" value="0">')}${field('กำหนดคืนใน (ชั่วโมง)', '<input id="edr_hours" type="number" min="1" value="2">')}</div>` +
            '<div class="ed-total" id="edr_total"></div>',
            [{ label: 'บันทึกรายการ', cls: 'blue', fn: saveRental }, { label: 'ยกเลิก', close: true }]);
        const fill = () => {
            const list = ED.eq.filter(e => String(e.facility_id) === v('edr_fac'));
            $('edr_eq').innerHTML = list.length ? list.map(e => `<option value="${esc(e.id)}"${num(e.stock) <= 0 ? ' disabled' : ''}>${esc(e.name)} — ${e.type === 'เช่า' ? 'เช่า' : 'ขาย'} ${money(e.price)} (เหลือ ${num(e.stock)})</option>`).join('') : '<option value="">(สนามนี้ยังไม่มีอุปกรณ์)</option>';
            upd(true);
        };
        const upd = (resetDep) => {
            const e = ED.eq.find(x => String(x.id) === v('edr_eq')); const rent = !!e && e.type === 'เช่า', q = Math.max(1, Math.floor(num(v('edr_qty'))));
            $('edr_rentbox').style.display = rent ? '' : 'none';
            if (resetDep && e) $('edr_dep').value = rent ? num(e.deposit) * q : 0;
            $('edr_total').innerHTML = e ? `ยอดรวม: <b>${money(num(e.price) * q)}</b>${rent ? ` + มัดจำ ${money(v('edr_dep'))}` : ''}` : '';
        };
        $('edr_fac').addEventListener('change', fill); $('edr_eq').addEventListener('change', () => upd(true));
        $('edr_qty').addEventListener('input', () => upd(true)); $('edr_dep').addEventListener('input', () => upd(false)); fill();
    }
    async function saveRental() {
        const e = ED.eq.find(x => String(x.id) === v('edr_eq')); const qty = Math.floor(num(v('edr_qty')));
        if (!e) { toast('กรุณาเลือกอุปกรณ์', false); return; }
        if (qty < 1) { toast('จำนวนต้องมากกว่า 0', false); return; }
        if (qty > num(e.stock)) { toast(`สต็อกไม่พอ (เหลือ ${num(e.stock)} ชิ้น)`, false); return; }
        const name = v('edr_name').trim(); if (!name) { toast('กรุณากรอกชื่อลูกค้า', false); return; }
        const rent = e.type === 'เช่า', now = new Date();
        const row = { facility_id: String(e.facility_id), equipment_id: String(e.id), equipment_name: e.name, equipment_type: e.type, kind: rent ? 'rent' : 'sale', customer_name: name, customer_phone: v('edr_phone').trim() || null, qty, unit_price: num(e.price), amount: num(e.price) * qty, deposit: rent ? num(v('edr_dep')) : 0, deposit_refunded: 0, payment_method: v('edr_pay'), rented_at: now.toISOString(), due_at: rent ? new Date(now.getTime() + Math.max(1, num(v('edr_hours'))) * 3600000).toISOString() : null, status: rent ? 'renting' : 'sold', staff_id: (currentUser && currentUser.id) || null };
        const ins = await supabaseClient.from('equipment_rentals').insert([row]).select().single();
        if (ins.error) { toast(isMissingTable(ins.error) ? 'ยังไม่ได้สร้างตารางใน Supabase — รัน supabase_equipment.sql' : 'บันทึกไม่สำเร็จ: ' + ins.error.message, false); return; }
        const st = await shiftStock(e.id, -qty);
        if (st.error) { await supabaseClient.from('equipment_rentals').delete().eq('id', ins.data.id); toast(st.error.message, false); return; }
        closeEd(); toast(rent ? 'บันทึกการเช่าแล้ว' : 'บันทึกการขายแล้ว'); await refresh();
    }

    // ---- return ----
    function returnModal(id) {
        const r = ED.rentalsOpen.find(x => String(x.id) === String(id)); if (!r) return;
        const qty = num(r.qty), dep = num(r.deposit);
        modal('รับคืนอุปกรณ์',
            `<div class="ed-info"><b>${esc(r.equipment_name)}</b> × ${qty} — ${esc(r.customer_name || '-')}<br><span>เช่าเมื่อ ${fmtDT(r.rented_at)} • มัดจำ ${money(dep)}</span></div>` +
            `<div class="ed-row3">${field('สภาพดี (ชิ้น)', `<input id="edt_good" type="number" min="0" max="${qty}" value="${qty}">`)}${field('ชำรุด (ชิ้น)', `<input id="edt_bad" type="number" min="0" max="${qty}" value="0">`)}${field('สูญหาย (ชิ้น)', `<input id="edt_lost" type="number" min="0" max="${qty}" value="0">`)}</div>` +
            `<div class="ed-row2">${field('ค่าปรับ / ค่าเสียหาย (บาท)', '<input id="edt_fine" type="number" min="0" value="0">')}${field('ถ้าค่าปรับเกินมัดจำ เก็บเพิ่มด้วย', '<select id="edt_pay"><option value="cash">เงินสด</option><option value="transfer">โอน / QR</option></select>')}</div>` +
            field('หมายเหตุ', '<input id="edt_note" type="text" placeholder="เช่น คืนช้า 30 นาที / ไม้หัก">') + '<div class="ed-total" id="edt_sum"></div>',
            [{ label: 'ยืนยันรับคืน', cls: 'green', fn: () => saveReturn(r) }, { label: 'ยกเลิก', close: true }]);
        const calc = () => { const F = num(v('edt_fine')), ded = Math.min(F, dep), refund = dep - ded, extra = F - ded; $('edt_sum').innerHTML = `หักค่าปรับจากมัดจำ ${money(ded)} • <b>คืนมัดจำ ${money(refund)}</b>${extra > 0 ? ` • <b class="neg">เก็บเพิ่ม ${money(extra)}</b>` : ''}`; };
        ['edt_fine'].forEach(i => $(i).addEventListener('input', calc)); calc();
    }
    async function saveReturn(r) {
        const qty = num(r.qty), good = Math.floor(num(v('edt_good'))), bad = Math.floor(num(v('edt_bad'))), lost = Math.floor(num(v('edt_lost')));
        if (good < 0 || bad < 0 || lost < 0 || good + bad + lost !== qty) { toast(`จำนวนสภาพดี + ชำรุด + สูญหาย ต้องรวมเป็น ${qty} ชิ้น`, false); return; }
        const dep = num(r.deposit), F = Math.max(0, num(v('edt_fine'))), ded = Math.min(F, dep), refund = dep - ded, extra = F - ded, pay = v('edt_pay'), note = v('edt_note').trim() || null;
        const now = new Date().toISOString();
        const up = await supabaseClient.from('equipment_rentals').update({ status: 'returned', returned_at: now, deposit_refunded: refund, note }).eq('id', r.id);
        if (up.error) { toast('บันทึกไม่สำเร็จ: ' + up.error.message, false); return; }
        if (good > 0) { const st = await shiftStock(r.equipment_id, good); if (st.error) toast('คืนสต็อกไม่สำเร็จ: ' + st.error.message, false); }
        const base = { facility_id: r.facility_id, equipment_id: r.equipment_id, equipment_name: r.equipment_name, rental_id: r.id, customer_name: r.customer_name, customer_phone: r.customer_phone, fine_method: pay, staff_id: (currentUser && currentUser.id) || null, note };
        const rows = [];
        if (bad > 0) rows.push(Object.assign({}, base, { kind: 'damaged', qty: bad, status: 'damaged' }));
        if (lost > 0) rows.push(Object.assign({}, base, { kind: 'lost', qty: lost, status: 'written_off', resolved_at: now }));
        if (!rows.length && F > 0) rows.push(Object.assign({}, base, { kind: 'fee', qty: 0, status: 'closed', resolved_at: now }));
        if (rows.length) { rows[0].fine_amount = F; rows[0].fine_collected = extra; for (let i = 1; i < rows.length; i++) { rows[i].fine_amount = 0; rows[i].fine_collected = 0; } const ir = await supabaseClient.from('equipment_incidents').insert(rows); if (ir.error) toast('บันทึกความเสียหายไม่สำเร็จ: ' + ir.error.message, false); }
        closeEd(); toast('รับคืนเรียบร้อย'); await refresh();
    }

    // ---- incidents ----
    function incidentModal() {
        if (!ED.eq.length) { toast('ยังไม่มีอุปกรณ์ให้แจ้ง', false); return; }
        modal('แจ้งชำรุด / สูญหาย',
            field('อุปกรณ์', `<select id="edi_eq">${ED.eq.map(e => `<option value="${esc(e.id)}">${esc(e.name)} (เหลือ ${num(e.stock)}) — ${esc(facName(e.facility_id))}</option>`).join('')}</select>`) +
            `<div class="ed-row2">${field('ประเภท', '<select id="edi_kind"><option value="damaged">ชำรุด (ส่งซ่อมได้)</option><option value="lost">สูญหาย (ตัดจำหน่าย)</option></select>')}${field('จำนวน (ชิ้น)', '<input id="edi_qty" type="number" min="1" value="1">')}</div>` +
            `<div class="ed-row2">${field('ชื่อลูกค้า (ถ้ามี)', '<input id="edi_name" type="text">')}${field('เบอร์โทร (ถ้ามี)', '<input id="edi_phone" type="tel">')}</div>` +
            `<div class="ed-row2">${field('ค่าปรับที่เรียกเก็บ (บาท)', '<input id="edi_fine" type="number" min="0" value="0">')}${field('ชำระค่าปรับด้วย', '<select id="edi_pay"><option value="cash">เงินสด</option><option value="transfer">โอน / QR</option></select>')}</div>` +
            field('หมายเหตุ', '<input id="edi_note" type="text">'),
            [{ label: 'บันทึก', cls: 'amber', fn: saveIncident }, { label: 'ยกเลิก', close: true }]);
    }
    async function saveIncident() {
        const e = ED.eq.find(x => String(x.id) === v('edi_eq')), qty = Math.floor(num(v('edi_qty'))), kind = v('edi_kind'), fine = Math.max(0, num(v('edi_fine')));
        if (!e) return; if (qty < 1) { toast('จำนวนต้องมากกว่า 0', false); return; }
        if (qty > num(e.stock)) { toast(`สต็อกไม่พอ (เหลือ ${num(e.stock)} ชิ้น)`, false); return; }
        const now = new Date().toISOString();
        const row = { facility_id: String(e.facility_id), equipment_id: String(e.id), equipment_name: e.name, customer_name: v('edi_name').trim() || null, customer_phone: v('edi_phone').trim() || null, kind, qty, fine_amount: fine, fine_collected: fine, fine_method: v('edi_pay'), status: kind === 'lost' ? 'written_off' : 'damaged', resolved_at: kind === 'lost' ? now : null, note: v('edi_note').trim() || null, staff_id: (currentUser && currentUser.id) || null };
        const ins = await supabaseClient.from('equipment_incidents').insert([row]).select().single();
        if (ins.error) { toast(isMissingTable(ins.error) ? 'ยังไม่ได้สร้างตารางใน Supabase — รัน supabase_equipment.sql' : 'บันทึกไม่สำเร็จ: ' + ins.error.message, false); return; }
        const st = await shiftStock(e.id, -qty);
        if (st.error) { await supabaseClient.from('equipment_incidents').delete().eq('id', ins.data.id); toast(st.error.message, false); return; }
        closeEd(); toast('บันทึกรายการแล้ว'); await refresh();
    }
    async function incidentAction(act, id) {
        const i = ED.incidentsOpen.concat(ED.incidentsPeriod).find(x => String(x.id) === String(id)); if (!i) return;
        const now = new Date().toISOString();
        if (act === 'inc-send') { const r = await supabaseClient.from('equipment_incidents').update({ status: 'repairing' }).eq('id', id); if (r.error) return toast(r.error.message, false); toast('บันทึกการส่งซ่อมแล้ว'); }
        else if (act === 'inc-off') { if (!confirm(`ตัดจำหน่าย ${i.equipment_name} × ${i.qty} ชิ้น ออกจากระบบถาวร?`)) return; const r = await supabaseClient.from('equipment_incidents').update({ status: 'written_off', resolved_at: now }).eq('id', id); if (r.error) return toast(r.error.message, false); toast('ตัดจำหน่ายแล้ว'); }
        else if (act === 'inc-done') {
            modal('ซ่อมเสร็จ — คืนเข้าสต็อก', `<div class="ed-info"><b>${esc(i.equipment_name)}</b> × ${num(i.qty)} ชิ้น</div>` + field('ค่าซ่อมที่จ่ายจริง (บาท)', '<input id="edd_cost" type="number" min="0" value="0">'),
                [{ label: 'ยืนยัน', cls: 'green', fn: async () => { const r = await supabaseClient.from('equipment_incidents').update({ status: 'repaired', repair_cost: Math.max(0, num(v('edd_cost'))), resolved_at: now }).eq('id', id); if (r.error) return toast(r.error.message, false); const st = await shiftStock(i.equipment_id, num(i.qty)); if (st.error) toast('คืนสต็อกไม่สำเร็จ: ' + st.error.message, false); closeEd(); toast('ซ่อมเสร็จ คืนสต็อกแล้ว'); await refresh(); } }, { label: 'ยกเลิก', close: true }]);
            return;
        }
        await refresh();
    }

    // ---- cash shift ----
    function openShiftModal() {
        if (ED.missing) { toast('ยังไม่ได้สร้างตารางใน Supabase — รัน supabase_equipment.sql', false); return; }
        const h = new Date().getHours(), nm = (currentUser && currentUser.profile && currentUser.profile.name) || '';
        modal('เปิดกะใหม่', field('ชื่อพนักงานประจำกะ', `<input id="eds_name" type="text" value="${esc(nm)}">`) + `<div class="ed-row2">${field('ชื่อกะ', `<input id="eds_label" type="text" value="${h < 12 ? 'กะเช้า' : (h < 18 ? 'กะบ่าย' : 'กะค่ำ')}">`)}${field('เงินสดตั้งต้นในลิ้นชัก (Float)', '<input id="eds_float" type="number" min="0" value="2000">')}</div>`,
            [{ label: 'เปิดกะ', cls: 'green', fn: async () => { const name = v('eds_name').trim(); if (!name) return toast('กรุณากรอกชื่อพนักงาน', false); const r = await supabaseClient.from('cash_shifts').insert([{ owner_key: String(currentUser.id), staff_id: currentUser.id, staff_name: name, shift_label: v('eds_label').trim() || 'กะ', float_amount: Math.max(0, num(v('eds_float'))), status: 'open' }]); if (r.error) return toast(r.error.message, false); closeEd(); toast('เปิดกะแล้ว'); await refresh(); } }, { label: 'ยกเลิก', close: true }]);
    }
    function closeShiftModal() {
        if (!ED.shift) { openShiftModal(); return; }
        const C = ED.cash;
        modal('ตรวจนับเงินส่งมอบกะ', `<div class="ed-info">เงินสดที่ระบบคำนวณว่าต้องมีในลิ้นชัก: <b>${money(C.expected)}</b><br><span>(Float ${money(C.float)} + รับเงินสดระหว่างกะ ${money(C.received)})</span></div>` + field('เงินสดที่นับได้จริง (บาท)', `<input id="edc_count" type="number" min="0" value="${C.expected}">`) + '<div class="ed-total" id="edc_diff"></div>' + field('หมายเหตุ', '<input id="edc_note" type="text">'),
            [{ label: 'ปิดกะ & บันทึก', cls: 'green', fn: async () => { const counted = num(v('edc_count')); const r = await supabaseClient.from('cash_shifts').update({ closed_at: new Date().toISOString(), expected_cash: C.expected, counted_cash: counted, diff: counted - C.expected, transfer_total: C.transfer, status: 'closed', note: v('edc_note').trim() || null }).eq('id', ED.shift.id); if (r.error) return toast(r.error.message, false); closeEd(); toast('ปิดกะเรียบร้อย'); await refresh(); } }, { label: 'ยกเลิก', close: true }]);
        const d = () => { const diff = num(v('edc_count')) - C.expected; $('edc_diff').innerHTML = `ผลต่าง: <b class="${diff === 0 ? '' : (diff < 0 ? 'neg' : 'pos')}">${diff > 0 ? '+' : ''}${money(diff)}</b> ${diff === 0 ? '(ตรงกัน)' : (diff < 0 ? '(เงินขาด)' : '(เงินเกิน)')}`; };
        $('edc_count').addEventListener('input', d); d();
    }

    // ---- receipt ----
    function printReceipt(i) {
        const f = ED.folios[i]; if (!f) return;
        const rows = [`<tr><td>ค่าจองสนาม ${esc([...f.facs].join(', '))} ${esc(f.slots.join(', '))}</td><td class="r">${money(f.court)}</td></tr>`].concat(f.items.map(it => `<tr><td>${esc(it.name)}</td><td class="r">${money(it.amount)}</td></tr>`));
        if (f.held) rows.push(`<tr><td>เงินมัดจำที่ยังถือไว้ (คืนเมื่อรับของคืน)</td><td class="r">${money(f.held)}</td></tr>`);
        const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(f.no)}</title><link href="https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;600&display=swap" rel="stylesheet"><style>body{font-family:Prompt,Tahoma,sans-serif;margin:0;padding:28px;color:#0f172a;font-size:14px}h1{margin:0;font-size:22px}.m{color:#475569;margin:2px 0 14px}table{width:100%;border-collapse:collapse;margin-top:10px}td{padding:8px 4px;border-bottom:1px solid #e2e8f0}.r{text-align:right;white-space:nowrap}.t td{font-weight:700;font-size:16px;border-top:2px solid #0f172a;border-bottom:none}.f{margin-top:46px;display:flex;justify-content:space-between;color:#475569}.f div{width:42%;border-top:1px solid #94a3b8;text-align:center;padding-top:6px}@media print{body{padding:10px}}</style></head><body>
      <h1>Sport Circle</h1><div class="m">ใบเสร็จรับเงิน / Receipt</div>
      <div><b>เลขที่:</b> ${esc(f.no)} &nbsp; <b>วันที่:</b> ${fmtD(f.date)}</div><div><b>ลูกค้า:</b> ${esc(f.name)} (${esc(f.phone)})</div>
      <table>${rows.join('')}<tr class="t"><td>ยอดสุทธิ</td><td class="r">${money(f.net)}</td></tr></table>
      ${f.refunded ? `<div class="m" style="margin-top:10px">* คืนเงินมัดจำให้ลูกค้าแล้ว ${money(f.refunded)}</div>` : ''}
      <div class="f"><div>ผู้รับเงิน</div><div>ลูกค้า</div></div><script>window.onload=function(){setTimeout(function(){window.print()},500)}<\/script></body></html>`;
        const w = window.open('', '_blank'); if (!w) { toast('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ — อนุญาต pop-up แล้วลองใหม่', false); return; }
        w.document.open(); w.document.write(html); w.document.close();
    }

    // ---------- report / export ----------
    function buildReport() {
        const M = ED.M, C = ED.cash, p = ED.period, now = new Date();
        const facs = ED.facs.map(f => f.name).join(', ') || '-';
        const sections = [];
        sections.push({
            title: '1. สรุปภาพรวม', cols: ['รายการ', 'มูลค่า'], rows: [
                ['รายได้อุปกรณ์สุทธิ (ตามช่วงเวลา)', money(M.netRev)], ['   • ค่าเช่า', money(M.rentRev)], ['   • ซื้อขาด', money(M.saleRev)], ['ค่าปรับสะสม', money(M.fines)], ['ค่าซ่อมสะสม', money(M.repairCost)],
                ['อุปกรณ์กำลังถูกเช่า', `${M.rentedNow} ชิ้น (เกินกำหนด ${M.overdue.length} รายการ)`], ['มัดจำสะสม', money(M.depositHeld)], ['สต็อกทั้งหมด', `${M.total} ชิ้น (พร้อมใช้ ${M.ready})`], ['สต็อกต่ำ', `${M.low.length} รายการ`], ['ชำรุด/ส่งซ่อม', `${M.brokenQty} ชิ้น (รอซ่อม ${M.waitRepairQty})`]]
        });
        sections.push({ title: '2. สต็อกอุปกรณ์ & สินค้าขาย', cols: ['สนาม', 'อุปกรณ์', 'ประเภท', 'ราคา', 'คงเหลือ'], rows: ED.eq.map(e => [facName(e.facility_id), e.name, e.type === 'เช่า' ? 'เช่า' : 'ขายขาด', money(e.price), num(e.stock) + (num(e.stock) <= thresholdOf(e) ? ' (ต่ำ)' : '')]) });
        sections.push({ title: '3. รายการกำลังเช่า (ยังไม่คืน)', cols: ['ลูกค้า', 'อุปกรณ์', 'จำนวน', 'เวลาเช่า', 'กำหนดคืน', 'สถานะ', 'มัดจำ'], rows: ED.rentalsOpen.map(r => [r.customer_name || '-', r.equipment_name || '-', num(r.qty), fmtDT(r.rented_at), fmtDT(r.due_at), r.due_at && new Date(r.due_at) < now ? 'เกินกำหนด' : 'กำลังเช่า', money(r.deposit)]) });
        sections.push({ title: '4. ชำรุด / ส่งซ่อม / ค่าปรับ', cols: ['วันที่', 'อุปกรณ์', 'ประเภท', 'จำนวน', 'สถานะ', 'ค่าปรับ', 'ค่าซ่อม'], rows: [...new Map(ED.incidentsOpen.concat(ED.incidentsPeriod).map(i => [i.id, i])).values()].map(i => [fmtDT(i.created_at), i.equipment_name || '-', INC_KIND[i.kind] || i.kind, num(i.qty), (INC_ST[i.status] || [i.status])[0], money(i.fine_amount), money(i.repair_cost)]) });
        sections.push({ title: '5. สรุปเงินสดและเงินโอน' + (ED.shift ? ' (กะปัจจุบัน)' : ' (วันนี้)'), cols: ['รายการ', 'จำนวนเงิน'], rows: [['เงินสดตั้งต้น (Float)', money(C.float)], ['รับเงินสดระหว่างกะ', money(C.received)], ['รวมเงินสดต้องมีในลิ้นชัก', money(C.expected)], ['เงินโอน (PromptPay / QR)', money(C.transfer)]].concat(ED.lastShift && !ED.shift ? [['ปิดกะล่าสุด: นับได้จริง', money(ED.lastShift.counted_cash)], ['ผลต่าง', money(ED.lastShift.diff)]] : []) });
        sections.push({ title: '6. บิลรวมลูกค้า (Folios)', cols: ['เลขที่ Folio', 'ลูกค้า', 'สนาม', 'ค่าสนาม', 'อุปกรณ์/ค่าปรับ', 'มัดจำคืน', 'สุทธิ'], rows: ED.folios.map(f => [f.no, `${f.name} (${maskPhone(f.phone)})`, [...f.facs].join(', '), money(f.court), money(f.equip + f.fines), '-' + money(f.refunded), money(f.net)]) });
        sections.push({ title: '7. อุปกรณ์ที่เช่า/ซื้อบ่อยที่สุด', cols: ['อันดับ', 'อุปกรณ์', 'ประเภท', 'จำนวน', 'รายได้'], rows: M.topItems.map((t, i) => [i + 1, t.name, t.type === 'เช่า' ? 'เช่า' : 'ซื้อ', t.qty, money(t.rev)]) });
        return { title: 'รายงานแดชบอร์ดอุปกรณ์กีฬา — Sport Circle', meta: [`ช่วงเวลา: ${p.label}`, `สนาม: ${facs}`, `ออกรายงานเมื่อ: ${fmtDT(now.toISOString())} โดย ${(currentUser && currentUser.profile && currentUser.profile.name) || (currentUser && currentUser.email) || '-'}`], sections };
    }
    const fileBase = () => `SportCircle_Equipment_${ED.period.start || 'all'}${ED.period.end && ED.period.end !== ED.period.start ? '_to_' + ED.period.end : ''}`;
    function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
    function reportHtml(R, forPrint) {
        const tbl = s => s.rows.length ? `<table><thead><tr>${s.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${s.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="nd">— ไม่มีข้อมูล —</p>';
        return `<div class="rp"><style>.rp{font-family:Prompt,Tahoma,sans-serif;color:#0f172a;font-size:11px;width:${forPrint ? 'auto' : '720px'};padding:6px}.rp h1{font-size:18px;margin:0 0 4px}.rp .mt{color:#475569;margin:1px 0}.rp h2{font-size:13px;margin:16px 0 6px;color:#075985;page-break-after:avoid}.rp table{width:100%;border-collapse:collapse}.rp th{background:#e0f2fe;text-align:left;padding:5px 6px;border:1px solid #bae6fd}.rp td{padding:4px 6px;border:1px solid #e2e8f0}.rp tr{page-break-inside:avoid}.rp .nd{color:#94a3b8}</style><h1>${esc(R.title)}</h1>${R.meta.map(m => `<div class="mt">${esc(m)}</div>`).join('')}${R.sections.map(s => `<h2>${esc(s.title)}</h2>${tbl(s)}`).join('')}</div>`;
    }
    async function exportPDF() {
        if (!ED.M) await refresh(); const R = buildReport(), html = reportHtml(R, false);
        toast('กำลังสร้างไฟล์ PDF...');
        try {
            if (typeof html2pdf === 'undefined') throw new Error('no html2pdf');
            if (document.fonts && document.fonts.ready) await document.fonts.ready;
            await html2pdf().set({ margin: [10, 10, 12, 10], filename: fileBase() + '.pdf', image: { type: 'jpeg', quality: 0.96 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', 'h2'] } }).from(html, 'string').save();
            toast('ดาวน์โหลด PDF เรียบร้อย');
        } catch (e) {
            console.warn('[pdf] fallback to print', e);
            const w = window.open('', '_blank'); if (!w) { toast('สร้าง PDF ไม่สำเร็จ และเบราว์เซอร์บล็อกหน้าต่างพิมพ์', false); return; }
            w.document.open(); w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(fileBase())}</title><link href="https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;600&display=swap" rel="stylesheet"></head><body>${reportHtml(R, true)}<script>window.onload=function(){setTimeout(function(){window.print()},600)}<\/script></body></html>`); w.document.close();
            toast('เปิดหน้าต่างพิมพ์แล้ว — เลือก “บันทึกเป็น PDF”');
        }
    }
    async function exportDOCX() {
        if (!ED.M) await refresh(); const R = buildReport();
        toast('กำลังสร้างไฟล์ DOCX...');
        try {
            const D = window.docx; if (!D || !D.Packer) throw new Error('no docx lib');
            const F = 'Tahoma';
            const run = (t, o) => new D.TextRun(Object.assign({ text: String(t == null ? '' : t), font: F, size: 20 }, o || {}));
            const cell = (t, head) => new D.TableCell({ shading: head ? { type: D.ShadingType.CLEAR, color: 'auto', fill: 'E0F2FE' } : undefined, margins: { top: 50, bottom: 50, left: 80, right: 80 }, children: [new D.Paragraph({ children: [run(t, { bold: !!head, size: 17 })] })] });
            const children = [new D.Paragraph({ children: [run(R.title, { bold: true, size: 32, color: '075985' })], spacing: { after: 120 } })];
            R.meta.forEach(m => children.push(new D.Paragraph({ children: [run(m, { color: '475569' })] })));
            R.sections.forEach(s => {
                children.push(new D.Paragraph({ children: [run(s.title, { bold: true, size: 26, color: '075985' })], spacing: { before: 280, after: 100 } }));
                if (!s.rows.length) { children.push(new D.Paragraph({ children: [run('— ไม่มีข้อมูล —', { color: '94A3B8' })] })); return; }
                children.push(new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, rows: [new D.TableRow({ tableHeader: true, children: s.cols.map(c => cell(c, true)) })].concat(s.rows.map(r => new D.TableRow({ cantSplit: true, children: r.map(c => cell(c, false)) }))) }));
            });
            const doc = new D.Document({ creator: 'Sport Circle', title: R.title, styles: { default: { document: { run: { font: F, size: 20 } } } }, sections: [{ properties: { page: { margin: { top: 850, bottom: 850, left: 850, right: 850 } } }, children }] });
            download(await D.Packer.toBlob(doc), fileBase() + '.docx');
            toast('ดาวน์โหลด DOCX เรียบร้อย');
        } catch (e) {
            console.warn('[docx] fallback to .doc', e);
            const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(R.title)}</title></head><body style="font-family:Tahoma">${reportHtml(R, true)}</body></html>`;
            download(new Blob(['\ufeff', html], { type: 'application/msword' }), fileBase() + '.doc');
            toast('ไลบรารี DOCX โหลดไม่ได้ — ส่งออกเป็น .doc (เปิดใน Word ได้) แทน', false);
        }
    }
    window.edExportPDF = exportPDF; window.edExportDOCX = exportDOCX;

    // ---------- events ----------
    function bindEvents() {
        const root = $('view-dashboard'); if (!root || root._edBound) return; root._edBound = true;
        root.addEventListener('click', async ev => {
            const t = ev.target.closest('[data-act]'); if (!t) return;
            const act = t.dataset.act, id = t.dataset.id;
            if (act === 'stock-inc') return adjustStock(id, 1);
            if (act === 'stock-dec') return adjustStock(id, -1);
            if (act === 'edit-eq') return equipmentModal(id);
            if (act === 'new-eq') return equipmentModal(null);
            if (act === 'new-rental') return rentalModal();
            if (act === 'return') return returnModal(id);
            if (act === 'new-incident') return incidentModal();
            if (act.indexOf('inc-') === 0) return incidentAction(act, id);
            if (act === 'open-shift') return openShiftModal();
            if (act === 'close-shift') return closeShiftModal();
            if (act === 'receipt') return printReceipt(Number(t.dataset.i));
            if (act === 'goto-tab') return switchDashTab(t.dataset.tab);
            if (act === 'pdf') return exportPDF();
            if (act === 'docx') return exportDOCX();
            if (act === 'refresh') return refresh();
        });
    }

    // ---------- init & hooks ----------
    function fillFilters() {
        const now = new Date(), ys = $('dashReportYear'), ms = $('dashReportMonth');
        if (ys && !ys.options.length) { for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 4; y--) ys.add(new Option(`${y} (${y + 543})`, String(y))); ys.value = String(now.getFullYear()); }
        if (ms && !ms.options.length) { MONTHS.forEach((m, i) => ms.add(new Option(m, pad(i + 1)))); ms.value = pad(now.getMonth() + 1); }
    }
    function setNav(key) {
        document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.toggle('active', a.dataset.view === key));
    }
    function subscribeRealtime() {
        if (ED.channel || typeof supabaseClient === 'undefined' || !supabaseClient.channel) return;
        let tm; const kick = () => { clearTimeout(tm); tm = setTimeout(() => { if (inView() && !($('edModal') && $('edModal').classList.contains('active'))) refresh(); }, 900); };
        try {
            let ch = supabaseClient.channel('ed-live');
            ['equipment', 'equipment_rentals', 'equipment_incidents', 'bookings', 'cash_shifts'].forEach(t => { ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, kick); });
            ED.channel = ch.subscribe();
        } catch (e) { console.warn('[dash] realtime unavailable', e); }
    }

    function init() {
        fillFilters(); bindEvents();
        const origSwitch = window.switchView;
        window.switchView = async function (view) {
            const dashTabs = { 'dash-equipment': 1, 'dash-folios': 4, 'dash-stats': 6 };
            if (dashTabs[view]) {
                applyViewTabs(view);
                await origSwitch('dashboard');
                ED.tab = dashTabs[view];
                switchDashTab(ED.tab);
                setNav(view);
                return;
            }
            await origSwitch(view);
            applyViewTabs(view === 'dashboard' ? null : view);
            if (view === 'dashboard') applyViewTabs(null); // หน้าแดชบอร์ดหลัก เห็นแท็บทั้งหมด
            if (view === 'matrix' && typeof renderMultiCourtMatrix === 'function') { try { await renderMultiCourtMatrix(); } catch (e) { console.error(e); } }
            if (view === 'dashboard') { fillFilters(); bindEvents(); subscribeRealtime(); }
        };
        window.renderDashboardStats = async function () {
            fillFilters(); bindEvents();
            if ($('edPane1')) await refresh();
            if (typeof renderMultiCourtMatrix === 'function') { try { await renderMultiCourtMatrix(); } catch (e) { console.error(e); } }
        };
        setInterval(() => { if (inView()) renderClock(); }, 1000);
        setInterval(() => { if (inView() && document.visibilityState === 'visible' && !($('edModal') && $('edModal').classList.contains('active')) && Date.now() - ED.lastLoad > 45000) refresh(); }, 15000);
        renderClock();
    }
    window.__ED = ED; // สำหรับ debug ใน console
    init();
})();