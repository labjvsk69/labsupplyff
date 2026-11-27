/* =========================================================
   LabSupply Back-office (ต้นแบบ)
   ใช้ localStorage คีย์เดียวกับหน้าบ้าน (ls_reqs) เมื่ออยู่โดเมนเดียวกัน
   จึงเห็นใบเบิกจากหน้าบ้านและเปลี่ยนสถานะให้หน้าบ้านได้
   เมื่อมี Backend จริง ให้แทนที่ก้อน `store` ด้วย fetch()
   ========================================================= */
const HOSPITAL = "Sakaeo Rajanagarindra Psychiatric hospital";
const WARDS = {map: f => Wards.list().map(f)};   // รายชื่อ Ward แก้ไขได้ที่เมนู บัญชี

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad = n => String(n).padStart(2, "0");
const now = () => new Date().toISOString();
const fD = i => new Date(i).toLocaleDateString("th-TH", {day:"numeric",month:"long",year:"numeric"});
const fT = i => new Date(i).toLocaleTimeString("th-TH", {hour:"2-digit",minute:"2-digit",hour12:false}) + " น.";
const fTs = i => new Date(i).toLocaleTimeString("th-TH", {hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}) + " น.";
const fDT = i => fD(i) + " · " + fT(i);
const dayOf = i => { const d = new Date(i); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const todayStr = () => dayOf(now());
const qtyOf = a => a.reduce((s, i) => s + i.qty, 0);
const uShort = u => String(u || "").split(" ")[0];
const clone = o => JSON.parse(JSON.stringify(o));

const store = {
  g(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } },
  s(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  reqs() { return this.g("ls_reqs", []); },
  get(id) { return this.reqs().find(r => r.id === id); },
  put(r) { const a = this.reqs(), i = a.findIndex(x => x.id === r.id); i < 0 ? a.push(r) : a[i] = r; this.s("ls_reqs", a); },
  who() { return me ? me.name : ""; },
  setWho() {}
};
function genId(p) { const d = new Date(); return `${p}-${String(d.getFullYear()+543).slice(2)}${pad(d.getMonth()+1)}${pad(d.getDate())}-${String(store.reqs().length+1).padStart(3,"0")}`; }


/* ---------- state ---------- */
const A = {};            // ตัวจัดการเหตุการณ์ (ใช้ใน onclick)
let me = null;
let view = "queue", cur = null, filt = "all", qsearch = "";
let draft = null, reason = "", lastMatch = null, cam = null, lastCode = {c:"",t:0};
let hf = {q:"",from:"",to:"",ward:"",payer:"",kind:""}, histOpen = null;
let dr = {admin:"",ward:"",note:"",items:[],q:"",step:1}, derr = [];

function toast(title, msg) {
  const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "alert");
  t.innerHTML = `<b>${esc(title)}</b>${esc(msg)}`; document.body.appendChild(t); setTimeout(() => t.remove(), 4500);
}
function beep() { try { const c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(); o.frequency.value = 880; o.connect(c.destination); o.start(); setTimeout(() => { o.stop(); c.close(); }, 180); } catch {} }

/* ---------- shell ---------- */
const header = () => `<header><div class="logo">+</div><div class="grow"><b>LabSupply</b><small>${HOSPITAL}</small></div>
  <span class="badge">${me ? esc(me.name.split(" ")[0]) + " · " + LS_ROLES[me.role] : "เจ้าหน้าที่"}</span><button class="bell" aria-label="การแจ้งเตือน" onclick="A.notif()" style="position:relative">🔔${me && !me.mustChange && alertCount() ? `<i class="bdg">${alertCount() > 99 ? "99+" : alertCount()}</i>` : ""}</button></header>`;
const alertCount = () => { try { return Stock.alerts().length; } catch { return 0; } };
let alertOpen = false;
function alertPanel() {
  if (!alertOpen) return "";
  const al = Stock.alerts(), G = [["exp", "หมดอายุแล้ว"], ["near", "ใกล้หมดอายุ"], ["low", "จำนวนใกล้หมด"]];
  const canPush = "Notification" in window && Notification.permission !== "granted";
  return `<div class="card alertp"><h2>การแจ้งเตือน <span>${al.length} รายการ</span></h2>
  ${al.length ? G.map(([k, t]) => { const l = al.filter(a => a.kind === k).sort((a, b) => (a.days ?? 0) - (b.days ?? 0)); return l.length ? `<div class="agrp ${k}"><b>${t} (${l.length})</b>${l.map(a => `<div class="kv"><span>${esc(a.name)}</span><b>${esc(a.text)}</b></div>`).join("")}</div>` : ""; }).join("") : `<div class="empty">ไม่มีรายการที่ต้องแจ้งเตือน</div>`}
  <div style="display:flex;gap:8px;margin-top:10px">${al.length ? `<button class="btn sm" style="margin:0;flex:1" onclick="A.alertGo()">ไปที่สต็อก</button>` : ""}${canPush ? `<button class="btn ghost sm" style="margin:0;flex:1" onclick="A.notifPerm()">เปิดแจ้งเตือนบนเบราว์เซอร์</button>` : ""}<button class="btn ghost sm" style="margin:0;flex:1" onclick="A.notif()">ปิด</button></div></div>`;
}
function nav() {
  const on = {queue:"queue",edit:"queue",handover:"queue",direct:"queue",scan:"scan",stock:"stock",deduct:"stock",history:"history",users:"users"}[view];
  const t = [["queue","▤","ใบเบิก"],["scan","▦","สแกน"],["stock","▣","สต็อก"],["history","↺","ประวัติ"],["users","☺","บัญชี"]];
  $("#nav").innerHTML = t.map(([v,i,l]) => `<button class="${on===v?"on":""}" onclick="A.go('${v}')"><b>${i}</b>${l}</button>`).join("");
  $("#nav").style.gridTemplateColumns = "repeat(5,1fr)";
}
A.go = (v, id) => {
  A.stop(); view = v; if (v === "users") usub = ""; if (v === "stock") { sedit = null; lastBatch = null; } if (id !== undefined) cur = id; lastMatch = null;
  if (v !== "edit") draft = null;
  if (v === "scan") { const r = cur && store.get(cur); if (!r || r.status !== 1) cur = null; }
  render(); window.scrollTo(0, 0);
};
A.open = id => { const r = store.get(id); A.go(r.status === 2 ? "handover" : "edit", id); };
A.notif = () => { alertOpen = !alertOpen; render(); if (alertOpen) window.scrollTo(0, 0); };
A.alertGo = () => { alertOpen = false; ssub = "list"; sf = {dept:"", type:"", expAl:false, minAl:false, q:""}; A.go("stock"); };
A.notifPerm = async () => {
  if (!("Notification" in window)) return toast("แจ้งเตือน", "เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน");
  const p = await Notification.requestPermission();
  toast("แจ้งเตือน", p === "granted" ? "เปิดแล้ว จะเด้งเมื่อมีใบเบิกใหม่และของใกล้หมด/หมดอายุ" : "ยังไม่ได้อนุญาตการแจ้งเตือน"); render();
};
/* เด้งแจ้งเตือนสต็อกวันละครั้ง (เมื่อเปิดระบบ) */
function alertPush() {
  const n = alertCount(); if (!n) return;
  const k = "ls_alert_day", d = todayStr(); if (store.g(k, "") === d) return;
  store.s(k, d); toast("แจ้งเตือนสต็อก", `มี ${n} รายการ (หมดอายุ / ใกล้หมดอายุ / จำนวนใกล้หมด) กดกระดิ่งเพื่อดู`);
  try { if ("Notification" in window && Notification.permission === "granted") new Notification("แจ้งเตือนสต็อก", {body: `มี ${n} รายการที่ต้องตรวจสอบ`}); } catch {}
}

/* ---------- 1) คิวใบเบิก ---------- */
const statsHTML = () => {
  const a = store.reqs().filter(r => r.type !== "admin"), n = f => String(a.filter(f).length).padStart(2, "0");
  return [["รอจัดเตรียม", n(r => r.status === 1)], ["พร้อมรับ", n(r => r.status === 2)], ["จ่ายแล้ววันนี้", n(r => r.status === 3 && dayOf(r.receivedAt) === todayStr())]]
    .map(([l, v]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("");
};
function qlistHTML() {
  let l = store.reqs().filter(r => r.type !== "admin" && r.status < 3).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (filt !== "all") l = l.filter(r => String(r.status) === filt);
  const q = qsearch.trim().toLowerCase(); if (q) l = l.filter(r => (r.id + r.ward + r.name).toLowerCase().includes(q));
  if (!l.length) return `<div class="card empty">ไม่มีใบเบิกที่รอดำเนินการ</div>`;
  return l.map(r => `<div class="card list" onclick="A.open('${r.id}')" style="cursor:pointer">
    <h2>#${r.id}<span class="pill s${r.status}">${r.status === 1 ? "กำลังจัดเตรียม" : r.receivedAt ? "ผู้รับเซ็นแล้ว · รอยืนยันจ่าย" : "พร้อมรับ · รอผู้รับเซ็น"}</span></h2>
    <b>${esc(r.ward)}</b><div class="mini">${esc(r.name)} · นัดรับ ${r.pickupTime} น.</div>
    <div class="mini">${r.items.length} รายการ · ${qtyOf(r.items)} หน่วย</div>
    <div class="link">${r.status === 1 ? "ดู / แก้ไข →" : r.receivedAt ? "เลือกชื่อและเซ็นยืนยันจ่ายของ →" : "ดูสถานะ →"}</div></div>`).join("");
}
function vQueue() {
  const chip = (f, l) => `<button class="chip ${filt===f?"on":""}" onclick="A.flt('${f}')">${l}</button>`;
  return `<div class="kick">รายการเบิกจากวอร์ด</div><h1>รายการเบิกจากวอร์ด</h1><p class="sub">${fD(now())}</p>
  <div class="stats" id="stats">${statsHTML()}</div>
  <input type="search" placeholder="ค้นหาเลขใบเบิก / ผู้ขอ / Ward" value="${esc(qsearch)}" oninput="A.qs(this.value)">
  <div class="chips">${chip("all","ทั้งหมด")}${chip("1","กำลังจัดเตรียม")}${chip("2","พร้อมรับ")}</div>
  <div id="qlist">${qlistHTML()}</div>
  <button class="btn ghost" onclick="A.go('direct')">เบิกเอง (แอดมิน · ตัดสต็อกทันที)</button>`;
}
A.qs = v => { qsearch = v; $("#qlist").innerHTML = qlistHTML(); };
A.flt = f => { filt = f; render(); };

/* ---------- 2) ตรวจสอบและแก้ไขใบเบิก ---------- */
const itemRows = (items, fn) => items.length ? items.map((i, x) => `<div class="item"><div class="nm">${esc(i.name)}<small>${i.code} · ${esc(i.unit)}</small></div>
  <div class="qty"><button aria-label="ลด" onclick="${fn}(${x},-1)">−</button><span>${i.qty}</span><button aria-label="เพิ่ม" onclick="${fn}(${x},1)">+</button></div></div>`).join("")
  : `<div class="empty">ยังไม่มีรายการ ค้นหาด้านบนเพื่อเพิ่มสินค้า</div>`;
const suggBox = (q, items, fn) => {
  q = q.trim().toLowerCase(); if (!q) return "";
  const r = Stock.items().map(c => ({...c, n: Stock.usable(c.code)})).filter(c => (c.name + c.code).toLowerCase().includes(q) && !items.find(i => i.code === c.code));
  return r.length ? `<div class="sugg">${r.map(c => `<div onclick="${fn}('${c.code}')">${esc(c.name)}<br><small>${c.code} · ใช้ได้ ${c.n} ${esc(c.unit)}</small></div>`).join("")}</div>` : "";
};
function vEdit() {
  const r = store.get(cur); if (!r) return `<div class="card empty">ไม่พบใบเบิก</div>`;
  const ro = r.deducted || r.locked;
  if (ro) return `<div class="kick">ตรวจสอบใบเบิก</div><h1>ใบเบิก #${r.id}</h1><div class="badbox">ตัดสต็อกแล้ว ไม่สามารถแก้ไขใบเบิกได้</div>${detail(r)}<button class="btn" onclick="A.go('handover')">ไปหน้าจ่ายของ</button>`;
  if (!draft || draft.id !== r.id) { draft = clone(r); reason = ""; }
  return `<div class="kick">แก้ไขใบเบิก</div><h1>ตรวจสอบและแก้ไข</h1><p class="sub">ใบเบิก #${r.id}</p>
  <div class="status"><small>แก้ไขได้ก่อนตัดสต็อก</small><p>เมื่อตัดสต็อกแล้ว ใบเบิกจะถูกล็อก ทุกการแก้ไขจะบันทึกเหตุผลไว้เป็นหลักฐาน</p></div>
  <div class="card"><h2>ข้อมูลผู้ขอเบิก</h2>
    <label for="e-n">ชื่อ-นามสกุลผู้ขอเบิก</label><input id="e-n" value="${esc(draft.name)}" oninput="draft.name=this.value">
    <label for="e-w">Ward / หน่วยงาน</label><select id="e-w" onchange="draft.ward=this.value">${WARDS.map(w => `<option ${draft.ward===w?"selected":""}>${w}</option>`).join("")}</select>
    <div class="row"><div><label for="e-d">วันที่รับของ</label><input id="e-d" type="date" value="${draft.pickupDate}" onchange="draft.pickupDate=this.value"></div>
    <div><label for="e-t">เวลารับของ</label><input id="e-t" type="time" value="${draft.pickupTime}" onchange="draft.pickupTime=this.value"></div></div></div>
  <div class="card"><h2>รายการที่ขอเบิก <span>${draft.items.length} รายการ</span></h2>
    <input type="search" placeholder="ค้นหาเพื่อเพิ่มสินค้า" oninput="A.esug(this.value)"><div id="esug"></div>
    <div id="elist">${itemRows(draft.items, "A.eq")}</div></div>
  <div class="card"><label for="e-r">เหตุผลที่แก้ไข *</label><input id="e-r" value="${esc(reason)}" placeholder="เช่น ผู้ขอคีย์จำนวนผิด" oninput="reason=this.value"><div class="err" id="e-err"></div></div>
  <button class="btn" onclick="A.esave()">บันทึกการแก้ไข</button>
  <button class="btn ghost" onclick="A.go('scan','${r.id}')">ไปสแกนจัดของ</button>`;
}
A.esug = v => { $("#esug").innerHTML = suggBox(v, draft.items, "A.eadd"); };
A.eadd = code => { const c = Stock.item(code); draft.items.push({code:c.code,name:c.name,unit:c.unit,qty:1}); render(); };
A.eq = (i, d) => { draft.items[i].qty += d; if (draft.items[i].qty < 1) draft.items.splice(i, 1); render(); };
A.esave = () => {
  const r = store.get(cur), err = [];
  if (!draft.name.trim()) err.push("กรอกชื่อผู้ขอเบิก"); if (!draft.items.length) err.push("ต้องมีอย่างน้อย 1 รายการ"); if (!reason.trim()) err.push("ระบุเหตุผลที่แก้ไข");
  if (err.length) { $("#e-err").textContent = err.join(" · "); return; }
  r.edits = [...(r.edits || []), {at:now(),by:store.who(),reason:reason.trim(),before:{name:r.name,ward:r.ward,pickupDate:r.pickupDate,pickupTime:r.pickupTime,items:r.items}}];
  Object.assign(r, {name:draft.name.trim(),ward:draft.ward,pickupDate:draft.pickupDate,pickupTime:draft.pickupTime,items:draft.items,picked:[]});
  store.put(r); draft = null; toast("บันทึกแล้ว", `แก้ไขใบเบิก #${r.id} เรียบร้อย`); render();
};
function detail(r) {
  return `<div class="card"><h2>รายละเอียดใบเบิก<span>${r.items.length} รายการ</span></h2>
  <div class="kv"><span>ผู้ขอเบิก</span><b>${esc(r.name)}</b></div><div class="kv"><span>Ward</span><b>${esc(r.ward)}</b></div>
  <div class="kv"><span>นัดรับ</span><b>${r.pickupDate ? fD(r.pickupDate) + " · " + r.pickupTime + " น." : "-"}</b></div><hr style="border:0;border-top:1px solid var(--line)">
  ${r.items.map(i => `<div class="kv"><span>${esc(i.name)}</span><b>${i.qty} ${esc(uShort(i.unit))}</b></div>`).join("")}</div>`;
}

/* ---------- 3) สแกนบาร์โค้ด ---------- */
const need = r => qtyOf(r.items);
const pickedOf = (r, code) => (r.picked || []).filter(p => p.code === code);
function vScan() {
  const r = cur && store.get(cur);
  if (!r) {
    const l = store.reqs().filter(x => x.type !== "admin" && x.status === 1);
    return `<div class="kick">สแกนบาร์โค้ด</div><h1>เลือกใบเบิกที่จะจัดของ</h1>${l.length ? l.map(x => `<div class="card" style="cursor:pointer" onclick="A.go('scan','${x.id}')"><h2>#${x.id}<span>${x.items.length} รายการ</span></h2>${esc(x.ward)} · ${esc(x.name)}</div>`).join("") : `<div class="card empty">ไม่มีใบเบิกที่รอจัดของ</div>`}`;
  }
  return `<div class="kick">สแกนเพื่อจัดของ</div><h1>สแกนเพื่อจัดของ</h1><p class="sub">ใบเบิก #${r.id} · ${esc(r.ward)} · สแกนแล้ว <span id="prog">${(r.picked || []).length} / ${need(r)}</span> ชิ้น</p>
  <div class="cam"><video id="cv" playsinline muted></video><button class="btn sm" onclick="A.cam()">เปิดกล้องสแกน</button></div>
  <div id="match">${matchHTML()}</div>
  <div class="card"><label for="mc">สแกนไม่ได้? กรอกรหัสบาร์โค้ด (เช่น LS00000123)</label><div class="row" style="grid-template-columns:1fr auto"><input id="mc" placeholder="LS00000123" autocapitalize="characters" onkeydown="if(event.key===\'Enter\')A.code(this.value)"><button class="btn sm" onclick="A.code($('#mc').value)">ตกลง</button></div></div>
  <div class="card" id="sl">${scanListHTML(r)}</div><div id="nextbtn">${nextBtn(r)}</div>`;
}
function matchHTML() {
  if (!lastMatch) return "";
  if (lastMatch.bad) return `<div class="badbox"><b>${esc(lastMatch.bad)}</b></div>`;
  const {u, it} = lastMatch;
  return `<div class="okbox"><b>✓ เพิ่มชิ้นนี้ในใบเบิกแล้ว</b><div style="font-size:17px;font-weight:700;margin:4px 0">${esc(it.name)}</div>
  <div class="kv"><span>บาร์โค้ด</span><b>${esc(u.bc)}</b></div><div class="kv"><span>ตำแหน่ง</span><b>${esc(it.loc || "-")}</b></div><div class="kv"><span>หมดอายุ</span><b>${u.expiry ? fD(u.expiry + "T00:00:00") : "-"}</b></div></div>`;
}
const scanListHTML = r => r.items.map(i => { const ps = pickedOf(r, i.code), full = ps.length >= i.qty;
  return `<div style="padding:8px 0;border-top:1px solid var(--line)"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><div><b>${esc(i.name)}</b><div class="mini">${i.code} · ${ps.length} / ${i.qty} ${esc(i.unit)}</div></div>${full ? `<span class="ck">✓ ครบ</span>` : `<button class="chip" onclick="A.auto('${i.code}')">เลือกอัตโนมัติ</button>`}</div>
  ${ps.map(p => `<div class="mini" style="display:flex;justify-content:space-between;align-items:center;padding-top:4px"><span style="font-family:monospace">${esc(p.bc)}</span><button class="chip" style="padding:2px 9px" aria-label="เอาออก" onclick="A.unpick('${p.bc}')">✕</button></div>`).join("")}</div>`; }).join("");
const nextBtn = r => (r.picked || []).length === need(r) ? `<button class="btn" onclick="A.go('deduct','${r.id}')">ไปหน้าตัดสต็อก</button>` : ``;
function scanRefresh() { const r = store.get(cur); if (!r || !$("#match")) return; $("#match").innerHTML = matchHTML(); $("#sl").innerHTML = scanListHTML(r); $("#prog").textContent = `${(r.picked || []).length} / ${need(r)}`; $("#nextbtn").innerHTML = nextBtn(r); }
A.code = c => {
  c = String(c || "").trim().toUpperCase(); if (!c || !cur) return;
  if (c === lastCode.c && Date.now() - lastCode.t < 1500) return; lastCode = {c, t: Date.now()};
  const r = store.get(cur), u = Stock.find(c); let bad = "";
  if (!u) bad = "ไม่พบบาร์โค้ด " + c + " ในระบบ";
  else if (u.status === "issued") bad = "ชิ้นนี้ถูกจ่ายออกไปแล้ว (ใบเบิก #" + u.reqId + ")";
  else if (u.status !== "in") bad = "ชิ้นนี้ถูกตัดจำหน่ายแล้ว";
  else if (Stock.expired(u)) bad = "ชิ้นนี้หมดอายุแล้ว ห้ามจ่าย";
  else {
    const ri = r.items.find(x => x.code === u.code); r.picked = r.picked || [];
    if (!ri) bad = ((Stock.item(u.code) || {}).name || u.code) + " ไม่อยู่ในใบเบิกนี้";
    else if (r.picked.find(p => p.bc === u.bc)) bad = "สแกนชิ้นนี้ไปแล้ว";
    else if (pickedOf(r, u.code).length >= ri.qty) bad = "สินค้านี้สแกนครบจำนวนแล้ว";
    else { r.picked.push({bc: u.bc, code: u.code}); store.put(r); lastMatch = {u, it: Stock.item(u.code)}; }
  }
  if (bad) lastMatch = {bad}; beep(); scanRefresh();
};
A.auto = code => {
  const r = store.get(cur), ri = r.items.find(x => x.code === code); r.picked = r.picked || [];
  const taken = new Set(r.picked.map(p => p.bc)); let n = ri.qty - pickedOf(r, code).length;
  for (const u of Stock.fefo(code)) { if (n <= 0) break; if (taken.has(u.bc)) continue; r.picked.push({bc: u.bc, code}); n--; }
  store.put(r); lastMatch = null; if (n > 0) toast("สต็อกไม่พอ", `มีชิ้นที่ใช้ได้ไม่ครบ ขาดอีก ${n}`); scanRefresh();
};
A.unpick = bc => { const r = store.get(cur); r.picked = (r.picked || []).filter(p => p.bc !== bc); store.put(r); lastMatch = null; scanRefresh(); };
A.cam = async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return toast("เปิดกล้องไม่ได้", "ต้องเปิดผ่าน HTTPS (เช่น GitHub Pages) หรือกรอกรหัสด้วยมือ");
  try {
    A.stop(); const st = await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}}), v = $("#cv");
    cam = {st, timer: null}; v.srcObject = st; v.classList.add("on"); await v.play();
    if (!("BarcodeDetector" in window)) return toast("สแกนอัตโนมัติไม่รองรับ", "เบราว์เซอร์นี้ไม่รองรับ ให้กรอกรหัสด้วยมือ (แนะนำ Chrome บน Android)");
    const det = new BarcodeDetector({formats:["ean_13","ean_8","code_128","code_39","upc_a","qr_code"]});
    cam.timer = setInterval(async () => { try { const c = await det.detect(v); if (c.length) A.code(c[0].rawValue); } catch {} }, 350);
  } catch { toast("เปิดกล้องไม่ได้", "ตรวจสอบสิทธิ์การใช้กล้อง หรือกรอกรหัสด้วยมือ"); }
};
A.stop = () => { if (cam) { clearInterval(cam.timer); cam.st.getTracks().forEach(t => t.stop()); cam = null; } };

/* ---------- 4) ตรวจสอบและตัดสต็อก ---------- */
function vDeduct() {
  const r = store.get(cur); if (!r) return `<div class="card empty">ไม่พบใบเบิก</div>`;
  if (r.deducted) return `<div class="kick">ตัดสต็อกแล้ว</div><h1>ตัดสต็อกเรียบร้อย</h1>${detail(r)}<button class="btn" onclick="A.go('handover')">ไปหน้าจ่ายของ</button>`;
  if ((r.picked || []).length < need(r)) return `<div class="kick">ตัดสต็อก</div><h1>ยังสแกนไม่ครบ</h1><div class="badbox">สแกนพัสดุให้ครบทุกชิ้นก่อน (${(r.picked || []).length} / ${need(r)})</div><button class="btn" onclick="A.go('scan')">กลับไปสแกน</button>`;
  let bad = false;
  const cards = r.items.map(i => { const ps = pickedOf(r, i.code), have = Stock.usable(i.code);
    const ok = ps.length === i.qty && ps.every(p => { const u = Stock.find(p.bc); return u && u.status === "in" && !Stock.expired(u); }); if (!ok) bad = true;
    return `<div class="card"><h2>${esc(i.name)}<span class="${ok ? "ck" : "low"}">${ok ? "✓" : "ตรวจสอบไม่ผ่าน"}</span></h2><div class="mini">${i.code}</div>
    <div class="nums"><div>คงเหลือ<b>${have}</b></div><div>นำออก<b>${i.qty}</b></div><div class="af">หลังจ่าย<b>${have - i.qty}</b></div></div>
    <div class="mini" style="margin-top:6px;font-family:monospace;word-break:break-all">${ps.map(p => esc(p.bc)).join(" · ")}</div></div>`; }).join("");
  return `<div class="kick">ตรวจสอบและตัดสต็อก</div><h1>ยืนยันตัดสต็อก</h1><p class="sub">ใบเบิก #${r.id} · ${esc(r.ward)}</p>${cards}
  <div class="card"><div class="kv"><span>รวมที่นำออก</span><b>${r.items.length} รายการ · ${need(r)} ชิ้น</b></div></div>
  <button class="btn" ${bad ? "disabled" : ""} onclick="A.dosave()">ตัดสต็อกและแจ้งพร้อมรับ</button>
  `;
}
A.dosave = () => {
  const r = store.get(cur), us = Stock.units(), t = now(), out = [];
  for (const i of r.items) {
    const ps = pickedOf(r, i.code), before = Stock.usable(i.code);
    for (const p of ps) { const u = us.find(x => x.bc === p.bc); if (!u || u.status !== "in" || Stock.expired(u)) return toast("ตัดสต็อกไม่ได้", `บาร์โค้ด ${p.bc} ใช้ไม่ได้แล้ว`); }
    out.push({code: i.code, name: i.name, qty: i.qty, before, after: before - i.qty, bcs: ps.map(p => p.bc)});
  }
  for (const p of r.picked) Object.assign(us.find(x => x.bc === p.bc), {status: "issued", issuedAt: t, reqId: r.id, ward: r.ward, to: r.name, issuedBy: store.who()});
  Stock.saveUnits(us); r.deducted = true; r.deductions = out; r.status = 2; r.times = r.times || {}; r.times[2] = t; store.put(r);
  toast("ตัดสต็อกแล้ว", `แจ้ง ${r.name} ว่าพร้อมรับของแล้ว`); A.go("handover");
};

/* ---------- 5) สถานะและยืนยันจ่ายของ ---------- */
function vHandover() {
  const r = store.get(cur); if (!r) return `<div class="card empty">ไม่พบใบเบิก</div>`;
  const L = ["กำลังจัดเตรียม","พร้อมรับของแล้ว","จ่ายของเรียบร้อย"];
  const tl = `<ul class="tl">${L.map((l, i) => { const n = i + 1, done = r.status > n || r.status === 3, now_ = r.status === n && !done;
    return `<li class="${done ? "done" : now_ ? "now" : ""}"><div class="dot">${done ? "✓" : n}</div><div><b>${l}</b><small>${r.times && r.times[n] ? fDT(r.times[n]) : "รอดำเนินการ"}</small></div></li>`; }).join("")}</ul>`;
  let h = `<div class="kick">สถานะและการจ่ายของ</div><h1>${r.status === 3 ? "จ่ายของเรียบร้อย" : r.status === 2 ? (r.receivedAt ? "ผู้รับเซ็นแล้ว · ยืนยันการจ่าย" : "รอผู้รับมารับของและเซ็น") : "ยังไม่ได้ตัดสต็อก"}</h1><p class="sub">ใบเบิก #${r.id} · ${esc(r.ward)}</p>
  <div class="card"><h2>สถานะเดียวกับหน้าบ้าน</h2>${tl}</div>`;
  if (r.status === 1) return h + `<button class="btn" onclick="A.go('scan','${r.id}')">ไปสแกนจัดของ</button>`;
  h += `<div class="card"><h2>ตรวจสอบก่อนส่งมอบ</h2>${r.items.map(i => `<div class="kv"><span><span class="ck">✓</span> ${esc(i.name)}</span><b>${i.qty} ${esc(uShort(i.unit))}</b></div>`).join("")}</div>`;
  if (r.status === 2 && !r.receivedAt) return h + `<div class="card"><h2>รอผู้รับเซ็นรับของ</h2>
    <div class="kv"><span>ผู้ขอเบิก</span><b>${esc(r.name)}</b></div>
    </div>`;
  if (r.status === 2) return h + `<div class="card"><h2>ยืนยันการจ่ายของ</h2>
    <div class="kv"><span>ผู้ขอเบิก</span><b>${esc(r.name)}</b></div>
    <div class="kv"><span>ผู้รับของ (ลงชื่อแล้ว)</span><b>${esc(r.receiver)}</b></div><div class="kv"><span>เซ็นรับของเมื่อ</span><b>${fDT(r.receivedAt)}</b></div>
    ${r.receiverSig ? `<img alt="ลายเซ็นผู้รับของ" src="${r.receiverSig}" style="max-height:80px;background:#fff;border:1px solid var(--line);border-radius:8px;margin:6px 0">` : ""}
    ${payerPick()}<div class="err" id="pyerr"></div>
    <button class="btn" onclick="A.hand()">ยืนยันการจ่ายของ</button>
    </div>`;
  return h + proof(r);
}
let hpay = null;
A.hpay = id => { hpay = id; Payers.setLast(id); render(); };
const hAdmin = () => { const ad = Payers.list(); return ad.find(u => u.id === (hpay || Payers.last())) || ad[0]; };
function payerPick() {
  const ad = Payers.list(), sel = hAdmin();
  return `<label for="py">ชื่อผู้จ่ายของ *</label><select id="py" onchange="A.hpay(this.value)">${ad.map(u => `<option value="${u.id}" ${sel && sel.id === u.id ? "selected" : ""}>${esc(u.name)}</option>`).join("")}</select>
  ${sel && sel.sig ? `<img alt="ลายเซ็น" src="${sel.sig}" style="max-height:80px;background:#fff;border:1px solid var(--line);border-radius:8px;margin-top:6px">` : `${Sig.html("sigP","ลายเซ็นผู้จ่ายของ *")}`}`;
}
A.hand = () => {
  const ad = hAdmin(), n = ad ? ad.name : ""; if (!n) { $("#pyerr").textContent = "กรุณาเลือกชื่อผู้จ่ายของ"; return; }
  if (!ad.sig && !Sig.has($("#sigP"))) { $("#pyerr").textContent = "กรุณาเซ็นชื่อผู้จ่ายของในกรอบ"; return; }
  const r = store.get(cur); if (r.locked || r.handedAt || r.status !== 2 || !r.receivedAt) return; store.setWho(n);
  const t = now(); Object.assign(r, {payer:n,handedAt:t,payerSig:ad.sig || Sig.data($("#sigP")),handedBy:ad.id,status:3,locked:true}); r.times = r.times || {}; r.times.handed = t; r.times[3] = t; store.put(r);
  toast("ยืนยันการจ่ายของแล้ว", `บันทึกผู้จ่าย ${n} · ใบเบิกปิดและล็อกแล้ว`); render(); window.scrollTo(0, 0);
};
const proof = r => `<div class="proof"><h3>✓ หลักฐานการจ่ายของ${r.type === "admin" ? '<span class="tag">แอดมินเบิกเอง</span>' : ""}</h3>
  <div class="kv"><span>${r.type === "admin" ? "ผู้เบิก" : "ผู้จ่ายของ"}</span><b>${esc(r.payer || "-")}</b></div><div class="kv"><span>${r.type === "admin" ? "เวลาเบิก" : "เวลาจ่ายของ"}</span><b>${fDT(r.handedAt || r.receivedAt)}</b></div>
  ${r.type === "admin" ? "" : `<div class="kv"><span>ผู้ขอเบิก</span><b>${esc(r.name)}</b></div>`}${r.type === "admin" ? "" : `<div class="kv"><span>ผู้รับของ (ลงชื่อ)</span><b>${esc(r.receiver)}</b></div>`}<div class="kv"><span>เวลา${r.type === "admin" ? "นำออก" : "รับของ"}</span><b>${fTs(r.receivedAt)}</b></div>
  ${r.note ? `<div class="kv"><span>หมายเหตุ</span><b>${esc(r.note)}</b></div>` : ""}
  <div class="sigs"><div><img alt="ลายเซ็น" src="${r.payerSig || ""}"><small>${r.type === "admin" ? "ผู้เบิก" : "ผู้จ่ายของ"}</small></div>${r.type === "admin" ? "" : `<div><img alt="ลายเซ็นผู้รับของ" src="${r.receiverSig || ""}"><small>ผู้รับของ</small></div>`}</div>
  <div class="stamp"><b>TIMESTAMP · ล็อกแล้ว</b>${r.handedAt || r.receivedAt}</div>
  <button class="btn" onclick="event.stopPropagation();A.form('${r.id}')">ดาวน์โหลดฟอร์มใบเบิก (PDF)</button></div>`;

/* ---------- สต็อก: 1 ชิ้น = 1 บาร์โค้ด ---------- */
const sel = new Set();
let ssub = "list", sq = "", sopen = null, sprint = null, sedit = null, showAll = false, lastBatch = null;
let addf = {mode:"old", code:"", name:"", unit:"", loc:"", lot:"", price:"", qty:1, expiry:"", err:""};
const baht = n => n == null ? "-" : "฿" + Number(n).toLocaleString("th-TH", {minimumFractionDigits: 2, maximumFractionDigits: 2});
const UNITS = ["กล่อง", "ขวด", "ห่อ", "ชิ้น", "ถุง", "แพ็ค", "ชุด", "ม้วน", "แผง", "อัน", "ลัง", "หลอด"];
const unitList = () => `<datalist id="units">${UNITS.map(u => `<option value="${u}"></option>`).join("")}</datalist>`;
function vStock() {
  if (sedit && Stock.item(sedit)) return stockEdit(sedit);
  sedit = null;
  return `<div class="kick">สต็อกสินค้า</div><h1>สต็อกสินค้า</h1>
  <div class="row" style="margin:8px 0 12px;grid-template-columns:repeat(3,1fr)"><button class="btn ${ssub === "list" ? "" : "ghost"}" style="margin:0" onclick="A.ssub('list')">รายการพัสดุ</button><button class="btn ${ssub === "add" ? "" : "ghost"}" style="margin:0" onclick="A.ssub('add')">เพิ่มรายการ</button><button class="btn ${ssub === "set" ? "" : "ghost"}" style="margin:0" onclick="A.ssub('set')">ตั้งค่า</button></div>
  ${ssub === "set" ? deptSettings() : ssub === "add" ? stockAdd() : `${stockFilters()}<div id="slist">${stockListHTML()}</div>`}`;
}
let serr = "";
function deptSettings() {
  const l = Depts.list(), items = Stock.items();
  return `<div class="card"><h2>แผนก <span>${l.length} แผนก</span></h2>${serr ? `<div class="badbox">${esc(serr)}</div>` : ""}
  ${l.map((d, i) => `<div class="item"><div class="nm">${esc(d)}<small>${Depts.usage(d)} รายการ</small></div><button class="chip" onclick="A.depEdit(${i})">แก้ไข</button><button class="chip" onclick="A.depDel(${i})">ลบ</button></div>`).join("")}
  <label for="dn">เพิ่มแผนกใหม่</label><div class="row" style="grid-template-columns:1fr auto"><input id="dn" placeholder="เช่น Chemistry" onkeydown="if(event.key==='Enter')A.depAdd()"><button class="btn sm" onclick="A.depAdd()">เพิ่ม</button></div></div>
  <div class="card"><h2>ประเภท <span>${Types.list().length} ประเภท</span></h2>
  ${Types.list().map((t, i) => `<div class="item"><div class="nm">${esc(t)}<small>${Types.usage(t)} รายการ</small></div><button class="chip" onclick="A.typEdit(${i})">แก้ไข</button><button class="chip" onclick="A.typDel(${i})">ลบ</button></div>`).join("") || `<div class="empty">ยังไม่มีประเภท</div>`}
  <label for="tn">เพิ่มประเภทใหม่</label><div class="row" style="grid-template-columns:1fr auto"><input id="tn" placeholder="เช่น Reagent" onkeydown="if(event.key==='Enter')A.typAdd()"><button class="btn sm" onclick="A.typAdd()">เพิ่ม</button></div></div>
  <div class="card"><h2>จัดรายการสินค้าเข้าแผนก <span>${items.length} รายการ</span></h2>
  ${items.map(i => `<div class="item"><div class="nm">${esc(i.name)}<small>${i.code}</small></div><select style="width:auto;max-width:50%" onchange="A.imove('${i.code}',this.value)"><option value="">ไม่ระบุแผนก</option>${l.map(d => `<option ${i.dept === d ? "selected" : ""}>${esc(d)}</option>`).join("")}</select></div>`).join("") || `<div class="empty">ยังไม่มีรายการ</div>`}</div>`;
}
A.depAdd = () => { try { Depts.add($("#dn").value); serr = ""; } catch (e) { serr = e.message; } render(); };
A.depEdit = i => { const old = Depts.list()[i], n = window.prompt("แก้ไขชื่อแผนก", old); if (n === null) return; try { Depts.rename(old, n); serr = ""; } catch (e) { serr = e.message; } render(); };
A.depDel = i => { const d = Depts.list()[i]; if (!window.confirm(`ลบแผนก "${d}"?`)) return; try { Depts.remove(d); serr = ""; } catch (e) { serr = e.message; } render(); };
A.typAdd = () => { try { Types.add($("#tn").value); serr = ""; } catch (e) { serr = e.message; } render(); };
A.typEdit = i => { const old = Types.list()[i], n = window.prompt("แก้ไขชื่อประเภท", old); if (n === null) return; try { Types.rename(old, n); serr = ""; } catch (e) { serr = e.message; } render(); };
A.typDel = i => { const t = Types.list()[i]; if (!window.confirm(`ลบประเภท "${t}"?`)) return; try { Types.remove(t); serr = ""; } catch (e) { serr = e.message; } render(); };
A.imove = (code, d) => { try { Stock.updateItem(code, {name: Stock.item(code).name, unit: Stock.item(code).unit, loc: Stock.item(code).loc, dept: d}); serr = ""; } catch (e) { serr = e.message; } render(); };
let sf = {dept:"", type:"", expAl:false, minAl:false, q:""}, srow = null;
A.srow = code => { srow = srow === code ? null : code; document.querySelectorAll("#slist tr[data-c]").forEach(tr => tr.classList.toggle("selrow", tr.dataset.c === srow)); };
const daysLeft = d => Math.round((new Date(d + "T00:00:00") - new Date(Stock.today() + "T00:00:00")) / 864e5);
const dOf = i => Depts.list().includes(i.dept) ? i.dept : "";
const typeSel = (id, val, on) => { const l = Types.list().slice(); if (val && !l.includes(val)) l.push(val); return `<select id="${id}" ${on ? `onchange="${on}"` : ""}><option value="">ไม่ระบุประเภท</option>${l.map(t => `<option ${val === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`; };
function stockFilters() {
  const items = Stock.items(), types = Types.list();
  return `<div class="card sfil"><div class="sf-row">
  <div class="sf-f"><label for="f-d">แผนก:</label><select id="f-d" onchange="sf.dept=this.value;refreshList()"><option value="">ทั้งหมด</option>${Depts.list().map(d => `<option ${sf.dept === d ? "selected" : ""}>${esc(d)}</option>`).join("")}${items.some(i => !dOf(i)) ? `<option value="__none" ${sf.dept === "__none" ? "selected" : ""}>ไม่ระบุแผนก</option>` : ""}</select></div>
  <div class="sf-f"><label for="f-t">ประเภท:</label><select id="f-t" onchange="sf.type=this.value;refreshList()"><option value="">ทั้งหมด</option>${types.map(t => `<option ${sf.type === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div>
  <div class="sf-f"><label>Alarm:</label><div class="sf-al"><label><input type="checkbox" ${sf.expAl ? "checked" : ""} onchange="sf.expAl=this.checked;refreshList()"> Exp Alarm</label><label><input type="checkbox" ${sf.minAl ? "checked" : ""} onchange="sf.minAl=this.checked;refreshList()"> Min Alert</label></div></div>
  <div class="sf-f grow"><label for="f-q">ค้นหา (ชื่อสินค้า/Lot):</label><input id="f-q" type="search" value="${esc(sf.q)}" oninput="sf.q=this.value;refreshList()"></div>
  <div class="sf-b"><button class="bbtn bblue" onclick="render()">🔄 รีเฟรช</button><button class="bbtn bred" onclick="A.sclearF()">🗑 ล้าง Filter</button><button class="bbtn bgreen" onclick="A.sxl()">Export Excel</button></div></div></div>`;
}
A.sclearF = () => { sf = {dept:"", type:"", expAl:false, minAl:false, q:""}; render(); };
const itemCmp = (a, b) => (dOf(a) ? 0 : 1) - (dOf(b) ? 0 : 1) || dOf(a).localeCompare(dOf(b)) || (a.type || "").localeCompare(b.type || "") || a.name.localeCompare(b.name);
function stockData() {
  const q = sf.q.trim().toLowerCase();
  return Stock.items().slice().sort(itemCmp).map(i => {
    const lots = Stock.lots(i.code).filter(l => l.inStock.length).sort((a, b) => (a.expiry || "9999").localeCompare(b.expiry || "9999")), usable = Stock.usable(i.code), expN = Stock.expiredUnits(i.code).length;
    const ed = Stock.expDays(i), near = ed > 0 && lots.some(l => l.expiry && daysLeft(l.expiry) >= 0 && daysLeft(l.expiry) <= ed), low = i.min > 0 && usable <= i.min;
    return {i, lots, usable, expN, near, low, tot: Stock.inStock(i.code).length, st: expN ? "exp" : near ? "near" : low ? "low" : "ok"};
  }).filter(r => (!sf.dept || dOf(r.i) === (sf.dept === "__none" ? "" : sf.dept)) && (!sf.type || r.i.type === sf.type) && (!sf.expAl || r.expN || r.near) && (!sf.minAl || r.low)
    && (!q || (r.i.name + " " + r.i.code + " " + r.lots.map(l => l.lot).join(" ")).toLowerCase().includes(q)));
}
const ST = {ok: ["☑ ปกติ", ""], exp: ["มีของหมดอายุ", "low"], out: ["หมดสต็อก", "low"], near: ["ใกล้หมดอายุ", "warnc"], low: ["ต่ำกว่าขั้นต่ำ", "low"]};
function stockListHTML() {
  const d = stockData(); if (!d.length) return `<div class="card empty">${Stock.items().length ? "ไม่พบรายการตามเงื่อนไข" : "ยังไม่มีพัสดุ กดปุ่ม \"เพิ่มรายการ\" เพื่อนำเข้า"}</div>`;
  const rows = d.map(r => { const i = r.i, ls = r.lots.length ? r.lots : [null], st = ST[r.st];
    const lotCells = l => l ? `<td class="${l.expiry && l.expiry < Stock.today() ? "low" : ""}">${l.expiry ? l.expiry + " (" + daysLeft(l.expiry) + ")" : "-"}</td><td>${esc(l.lot || "-")}</td><td class="num">${l.price == null ? "-" : baht(l.price)}</td><td class="num">${l.inStock.length}</td>` : `<td>-</td><td>-</td><td>-</td><td class="num">0</td>`;
    const acts = `<button class="chip" title="พิมพ์บาร์โค้ด" onclick="A.sprint('${i.code}')">🖨️</button><button class="chip" title="แก้ไข" onclick="A.iedit('${i.code}')">✏️</button><button class="chip" title="ลบรายการ" onclick="A.idel('${i.code}')">🗑️</button><button class="chip ${sopen === i.code ? "on" : ""}" title="รายละเอียดรายชิ้น" onclick="A.sopen('${i.code}')">🔍</button>${r.expN ? `<button class="chip" title="ลบที่หมดอายุทั้งหมด" onclick="A.disposeExp('${i.code}')">ลบหมดอายุ</button>` : ""}`;
    const rc = `data-c="${i.code}" onclick="A.srow('${i.code}')"`, rs = srow === i.code ? " selrow" : "";
    let h = `<tr class="first${rs}" ${rc}><td>${esc(Depts.label(dOf(i)))}</td><td>${esc(i.type || "")}</td><td title="${i.code}">${esc(i.name)}</td><td class="c">${esc(i.unit)}</td><td class="num">${r.tot}</td><td class="num">${r.usable}</td>${lotCells(ls[0])}<td class="${st[1]}">${st[0]}</td><td class="act" onclick="event.stopPropagation()">${acts}</td></tr>`;
    ls.slice(1).forEach(l => { h += `<tr class="${rs.trim()}" ${rc}><td colspan="5"></td><td></td>${lotCells(l)}<td></td><td></td></tr>`; });
    if (sprint === i.code) h += `<tr><td colspan="12" class="sub">${printPanel(i)}</td></tr>`;
    if (sopen === i.code) h += `<tr><td colspan="12" class="sub">${unitTable(i)}</td></tr>`;
    return h; }).join("");
  return `<div class="mini" style="color:#d9822b;margin:6px 0">แสดงสินค้าในสต็อก: ${d.length} รายการ</div><div class="stw"><table class="stt"><thead><tr><th>แผนก</th><th>ประเภท</th><th>ชื่อสินค้า</th><th>หน่วยนับ</th><th>จำนวนรวม</th><th>เหลือ (ไม่หมดอายุ)</th><th>วันหมดอายุ</th><th>Lot</th><th>ราคา/หน่วย</th><th>จำนวน (Lot)</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
A.sxl = () => {
  const rows = stockData().flatMap(r => (r.lots.length ? r.lots : [null]).map((l, k) => ({"แผนก": Depts.label(dOf(r.i)), "ประเภท": r.i.type || "", "ชื่อสินค้า": r.i.name, "หน่วยนับ": r.i.unit, "จำนวนรวม": k ? "" : r.tot, "เหลือ (ไม่หมดอายุ)": k ? "" : r.usable, "วันหมดอายุ": l && l.expiry ? l.expiry + " (" + daysLeft(l.expiry) + ")" : "-", "Lot": l ? (l.lot || "-") : "-", "ราคา/หน่วย": l && l.price != null ? l.price : "", "จำนวน (Lot)": l ? l.inStock.length : 0, "สถานะ": k ? "" : ST[r.st][0].replace("☑ ", "")})));
  saveXlsx(rows, "รายการพัสดุ", "stock-list-" + todayStr());
};
function printPanel(i) {
  const tot = Stock.inStock(i.code).length, lots = Stock.lots(i.code).filter(l => l.inStock.length), lab = Labels.size();
  if (!tot) return `<div class="note">ไม่มีชิ้นในสต็อกให้พิมพ์</div>`;
  return `<div class="okbox" style="background:var(--bg);color:var(--ink);margin-top:10px"><b>พิมพ์บาร์โค้ด</b>
  <label for="pl-${i.code}">เลือกชุดที่จะพิมพ์</label><select id="pl-${i.code}"><option value="all">ทั้งหมดที่ยังอยู่ในสต็อก (${tot} ดวง)</option>${lots.map((l, k) => `<option value="${k}">Lot ${esc(l.lot || "-")} · นำเข้า ${fD(l.importAt)} · ${l.inStock.length} ดวง</option>`).join("")}</select>
  
  <button class="btn" onclick="A.pprint('${i.code}')">พิมพ์บาร์โค้ด (Xprinter ${lab.w} × ${lab.h} มม.)</button>
  <button class="chip" onclick="A.lsize()">ตั้งขนาดกระดาษ Xprinter</button></div>`;
}
const pickBcs = code => {
  const v = document.getElementById("pl-" + code).value, lots = Stock.lots(code).filter(l => l.inStock.length);
  return (v === "all" ? Stock.inStock(code) : lots[+v].inStock).map(u => u.bc).sort();
};
function unitTable(i) {
  const all = Stock.units().filter(u => u.code === i.code), inS = all.filter(u => u.status === "in");
  const selIn = inS.filter(u => sel.has(u.bc)), lots = Stock.lots(i.code).filter(l => showAll || l.inStock.length);
  let shown = 0, more = 0;
  const unitRow = u => {
    const ex = u.status === "in" && Stock.expired(u);
    const tag = u.status === "in" ? (ex ? `<span class="low">หมดอายุ</span>` : `<span class="ck">ในสต็อก</span>`) : u.status === "issued" ? `<b>จ่ายแล้ว</b>` : `<b>ตัดจำหน่าย</b>`;
    let trace = "";
    if (u.status === "issued") { const q = store.get(u.reqId); trace = `จ่ายให้ ${esc(u.to)} (${esc(u.ward)}) · ใบเบิก #${esc(u.reqId)} · ${fDT(u.issuedAt)}${q && q.payer ? ` · ผู้จ่าย ${esc(q.payer)}` : ""}${q && q.receiver ? ` · ผู้รับ ${esc(q.receiver)}` : q && q.status === 2 ? " · รอผู้รับยืนยัน" : ""}`; }
    if (u.status === "disposed") trace = `${esc(u.reason || "ตัดจำหน่าย")} โดย ${esc(u.disposedBy || "-")} · ${fDT(u.disposedAt)}`;
    const cb = u.status === "in" ? `<input type="checkbox" aria-label="เลือก ${esc(u.bc)}" style="width:22px;height:22px;flex:none;margin:0" ${sel.has(u.bc) ? "checked" : ""} onchange="A.stog('${u.bc}',this.checked)">` : `<span style="width:22px;flex:none"></span>`;
    return `<div style="padding:8px 0;border-top:1px solid var(--line);display:flex;gap:10px;align-items:flex-start">${cb}<div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between;gap:8px"><b style="font-family:monospace">${esc(u.bc)}</b>${tag}</div>
    <div class="mini">ราคา ${baht(u.price)} · หมดอายุ ${u.expiry ? fD(u.expiry + "T00:00:00") : "ไม่ระบุ"}${u.by ? " · โดย " + esc(u.by) : ""}</div>${trace ? `<div class="mini" style="color:var(--ink)">${trace}</div>` : ""}
    <div style="display:flex;gap:6px;margin-top:4px"><button class="chip" onclick="A.reprint('${u.bc}')">พิมพ์บาร์โค้ดซ้ำ</button>${u.status === "in" ? `<button class="chip" onclick="A.disposeOne('${u.bc}')">นำออกจากสต็อก</button>` : ""}</div></div></div>`;
  };
  const lotHtml = lots.map(l => {
    const ins = l.inStock, nSel = ins.filter(u => sel.has(u.bc)).length, allOn = ins.length > 0 && nSel === ins.length;
    let us = showAll ? l.units.slice() : ins.slice();
    us.sort((x, y) => (x.status === "in" ? 0 : 1) - (y.status === "in" ? 0 : 1) || x.bc.localeCompare(y.bc));
    const room = Math.max(0, 300 - shown), part = us.slice(0, room); shown += part.length; more += us.length - part.length;
    const bt = encodeURIComponent(l.batch).replace(/'/g, "%27");
    return `<div style="margin-top:12px;border:1px solid var(--line);border-radius:12px;padding:8px 10px;background:#fff">
    <div style="display:flex;gap:10px;align-items:center"><input type="checkbox" aria-label="เลือกทั้งล็อต" style="width:22px;height:22px;flex:none;margin:0" ${allOn ? "checked" : ""} ${ins.length ? "" : "disabled"} onchange="A.slot('${i.code}','${bt}',this.checked)">
      <div style="flex:1;min-width:0"><b>Lot ${esc(l.lot || "-")}</b><div class="mini">นำเข้า ${fD(l.importAt)} · หมดอายุ ${l.expiry ? fD(l.expiry + "T00:00:00") : "ไม่ระบุ"} · ราคา ${baht(l.price)} · ในสต็อก ${ins.length}/${l.units.length} ${esc(i.unit)}${nSel ? ` · <b>เลือก ${nSel}</b>` : ""}</div></div></div>
    <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"><button class="chip" ${ins.length ? "" : "disabled"} onclick="A.lotprint('${i.code}','${bt}')">พิมพ์ทั้ง Lot</button><button class="chip" ${ins.length ? "" : "disabled"} onclick="A.lotdel('${i.code}','${bt}')">ลบทั้ง Lot</button></div>
    ${part.map(unitRow).join("") || `<div class="empty">ไม่มีชิ้นในสต็อก</div>`}</div>`;
  }).join("");
  const bar = `<div style="position:sticky;top:0;z-index:5;background:var(--bg);padding:8px 0;border-bottom:1px solid var(--line)">
    <label class="mini" style="display:flex;gap:8px;align-items:center;margin:0 0 6px"><input type="checkbox" style="width:22px;height:22px;margin:0" ${inS.length && selIn.length === inS.length ? "checked" : ""} ${inS.length ? "" : "disabled"} onchange="A.sselAll('${i.code}',this.checked)"> เลือกทั้งหมดที่อยู่ในสต็อก (${inS.length}) · <b>เลือกแล้ว ${selIn.length}</b></label>
    <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="chip" ${selIn.length ? "" : "disabled"} onclick="A.sprintSel()">พิมพ์ที่เลือก</button><button class="chip" ${selIn.length ? "" : "disabled"} onclick="A.sdel()">นำที่เลือกออกจากสต็อก</button><button class="chip" ${selIn.length ? "" : "disabled"} onclick="A.sclear()">ล้างที่เลือก</button></div></div>`;
  return `<div style="margin-top:10px"><label class="mini" style="display:flex;gap:6px;align-items:center;margin:0 0 6px"><input type="checkbox" style="width:auto" ${showAll ? "checked" : ""} onchange="A.sall(this.checked)"> แสดงชิ้นที่จ่ายแล้ว / ตัดจำหน่ายด้วย</label>
  ${bar}${lotHtml || `<div class="empty">ไม่มีชิ้นในสต็อก</div>`}${more ? `<div class="note">แสดง 300 ชิ้นแรก (ยังมีอีก ${more} ชิ้น) · ใช้ช่องเลือกทั้งล็อตเพื่อเลือกครบทุกชิ้น</div>` : ""}</div>`;
}
const refreshList = () => {
  const el = $("#slist"); if (!el) return; const w = el.querySelector(".stw"), t = w ? w.scrollTop : 0, l = w ? w.scrollLeft : 0;
  el.innerHTML = stockListHTML(); const w2 = el.querySelector(".stw"); if (w2) { w2.scrollTop = t; w2.scrollLeft = l; }
};
A.ssub = v => { ssub = v; render(); };
A.sqf = v => { sf.q = v; refreshList(); };
A.sopen = code => { sopen = sopen === code ? null : code; sel.clear(); refreshList(); };
A.sprint = code => { sprint = sprint === code ? null : code; refreshList(); };
A.sall = b => { showAll = b; refreshList(); };
A.disposeExp = code => {
  const it = Stock.item(code), n = Stock.expiredUnits(code).length;
  if (!window.confirm(`ลบ ${it.name} ที่หมดอายุ ${n} ${it.unit} ออกจากสต็อก? (ยังเก็บประวัติการตัดจำหน่ายไว้)`)) return;
  const us = Stock.units(), t = now(); us.forEach(u => { if (u.code === code && u.status === "in" && Stock.expired(u)) Object.assign(u, {status:"disposed", disposedAt:t, disposedBy:store.who(), reason:"หมดอายุ"}); });
  Stock.saveUnits(us); toast("ลบแล้ว", `ตัดจำหน่ายที่หมดอายุ ${n} ${it.unit}`); refreshList();
};
/* นำชิ้นออกจากสต็อก (ตัดจำหน่าย เก็บประวัติไว้) */
const REASON = "สินค้ามีปัญหา / ไม่ใช้แล้ว";
function disposeUnits(bcs, reason) {
  const us = Stock.units(), set = new Set(bcs), t = now(); let n = 0;
  us.forEach(u => { if (set.has(u.bc) && u.status === "in") { Object.assign(u, {status:"disposed", disposedAt:t, disposedBy:store.who(), reason}); n++; sel.delete(u.bc); } });
  Stock.saveUnits(us); return n;
}
function askDispose(bcs, label) {
  const ins = bcs.filter(b => { const u = Stock.find(b); return u && u.status === "in"; });
  if (!ins.length) return toast("ไม่มีชิ้นให้นำออก", "ชิ้นที่เลือกไม่ได้อยู่ในสต็อกแล้ว");
  if (!window.confirm(`นำ${label} ${ins.length} ชิ้น ออกจากสต็อก?\n(ระบบเก็บประวัติเป็น "ตัดจำหน่าย" ไม่ลบทิ้งจริง)`)) return;
  const r = window.prompt("เหตุผลที่นำออก", REASON); if (r === null) return;
  const n = disposeUnits(ins, r.trim() || REASON); toast("นำออกแล้ว", `${n} ชิ้น`); refreshList();
}
A.disposeOne = bc => askDispose([bc], `ชิ้น ${bc}`);
const lotOf = (code, bt) => Stock.lots(code).find(l => l.batch === decodeURIComponent(bt));
const selBcs = () => Stock.units().filter(u => u.status === "in" && sel.has(u.bc)).map(u => u.bc).sort();
A.stog = (bc, on) => { on ? sel.add(bc) : sel.delete(bc); refreshList(); };
A.slot = (code, bt, on) => { const l = lotOf(code, bt); if (l) l.inStock.forEach(u => on ? sel.add(u.bc) : sel.delete(u.bc)); refreshList(); };
A.sselAll = (code, on) => { Stock.inStock(code).forEach(u => on ? sel.add(u.bc) : sel.delete(u.bc)); refreshList(); };
A.sclear = () => { sel.clear(); refreshList(); };
A.sprintSel = () => { const l = selBcs(); if (l.length) Labels.print(l); };
A.sdel = () => askDispose(selBcs(), "ที่เลือก");
A.lotprint = (code, bt) => { const l = lotOf(code, bt); if (l && l.inStock.length) Labels.print(l.inStock.map(u => u.bc).sort()); };
A.lotdel = (code, bt) => { const l = lotOf(code, bt); if (l) askDispose(l.inStock.map(u => u.bc), `ทั้ง Lot ${l.lot || "-"}`); };
A.idel = code => {
  const it = Stock.item(code), n = Stock.inStock(code).length;
  if (!window.confirm(`ลบรายการ "${it.name}" ออกจากสต็อก?\n${n ? `ชิ้นที่ยังเหลืออยู่ ${n} ชิ้นจะถูกตัดจำหน่าย\n` : ""}ประวัติการจ่ายของรายการนี้ยังเก็บไว้ ผู้ใช้จะไม่เห็นรายการนี้ให้เบิกอีก`)) return;
  try { Stock.deleteItem(code, store.who()); if (sopen === code) sopen = null; if (sprint === code) sprint = null; toast("ลบรายการแล้ว", it.name); } catch (e) { toast("ทำไม่ได้", e.message); }
  refreshList();
};
A.reprint = bc => Labels.print([bc]);
A.pprint = code => Labels.print(pickBcs(code));
A.lsize = () => { const c = Labels.size(), w = window.prompt("ความกว้างกระดาษ Xprinter (มม.)", c.w); if (w === null) return; const h = window.prompt("ความสูงกระดาษ Xprinter (มม.)", c.h); if (h === null) return; Labels.setSize(w, h); refreshList(); };

/* ----- แก้ไข: ข้อมูลพัสดุ + แต่ละล็อต ----- */
A.iedit = code => { sedit = code; render(); window.scrollTo(0, 0); };
A.iback = () => { sedit = null; lastBatch = null; render(); window.scrollTo(0, 0); };
function stockEdit(code) {
  const it = Stock.item(code), lots = Stock.lots(code);
  return `<div class="kick">แก้ไขพัสดุ</div><h1>${esc(it.name)}</h1><button class="chip" style="margin-bottom:10px" onclick="A.iback()">‹ กลับ</button>
  <div class="card"><h2>รายละเอียดพัสดุ <span>${it.code}</span></h2>
  <label for="i-n">ชื่อพัสดุ</label><input id="i-n" value="${esc(it.name)}">
  <label for="i-u">หน่วยนับ</label><input id="i-u" list="units" value="${esc(it.unit)}">
  <label for="i-d">แผนก</label><select id="i-d"><option value="">ไม่ระบุแผนก</option>${Depts.list().map(d => `<option ${it.dept === d ? "selected" : ""}>${esc(d)}</option>`).join("")}</select>
  <label for="i-t">ประเภท</label>${typeSel("i-t", it.type || "")}
  <div class="row"><div><label for="i-m">แจ้งเตือนเมื่อเหลือไม่เกิน (จำนวน · 0 = ไม่แจ้ง)</label><input id="i-m" type="number" min="0" value="${it.min || 0}"></div>
  <div><label for="i-x">แจ้งเตือนก่อนหมดอายุ (วัน · 0 = ไม่แจ้ง)</label><input id="i-x" type="number" min="0" value="${Stock.expDays(it)}"></div></div>
  <label for="i-l">ตำแหน่งจัดเก็บ</label><input id="i-l" value="${esc(it.loc || "")}">
  <div class="err" id="i-err"></div><button class="btn" onclick="A.isave()">บันทึกรายละเอียดพัสดุ</button></div>
  <h2 style="font-size:16px;margin:14px 0 4px">ล็อตที่นำเข้า (${lots.length})</h2>
  ${lots.map((l, k) => lotCard(l, k, it)).join("") || `<div class="card empty">ยังไม่มีการนำเข้า</div>`}
  ${lastBatch && lastBatch.code === code ? batchCard() : ""}${unitList()}`;
}
function lotCard(l, k, it) {
  const q = l.inStock.length;
  return `<div class="card"><h2>Lot ${esc(l.lot || "-")}<span class="mini">${l.units.length} ชิ้นในล็อต · จ่าย/ตัดจำหน่ายแล้ว ${l.units.length - q}</span></h2>
  <div class="row"><div><label for="ll${k}">เลข Lot</label><input id="ll${k}" value="${esc(l.lot)}"></div><div><label for="lp${k}">ราคา/${esc(it.unit)} (บาท)</label><input id="lp${k}" type="number" inputmode="decimal" step="0.01" min="0" value="${l.price == null ? "" : l.price}"></div></div>
  <div class="row"><div><label for="li${k}">วันที่เพิ่ม</label><input id="li${k}" type="date" value="${l.importAt ? dayOf(l.importAt) : ""}"></div><div><label for="le${k}">วันหมดอายุ</label><input id="le${k}" type="date" value="${l.expiry}"></div></div>
  <label for="lq${k}">จำนวนคงเหลือในล็อต (${esc(it.unit)})</label><input id="lq${k}" type="number" inputmode="numeric" min="0" value="${q}">
  
  <div class="err" id="lerr${k}"></div><button class="btn" onclick="A.lsave(${k})">บันทึกล็อตนี้</button></div>`;
}
A.isave = () => {
  try { const it = Stock.item(sedit); Stock.updateItem(sedit, {name: $("#i-n").value, unit: $("#i-u").value, loc: $("#i-l").value, dept: $("#i-d").value, type: $("#i-t").value, min: $("#i-m").value, expDays: $("#i-x").value}); toast("บันทึกแล้ว", "แก้ไขรายละเอียดพัสดุเรียบร้อย"); render(); }
  catch (e) { $("#i-err").textContent = e.message; }
};
A.lsave = k => {
  const l = Stock.lots(sedit)[k];
  try {
    const r = Stock.updateBatch(l.batch, {lot: $("#ll" + k).value, importDate: $("#li" + k).value, expiry: $("#le" + k).value, price: $("#lp" + k).value, qty: $("#lq" + k).value, by: store.who()});
    if (r.added.length) { lastBatch = {code: sedit, bcs: r.added, expiry: $("#le" + k).value}; toast("บันทึกแล้ว", `เพิ่ม ${r.added.length} ชิ้น กรุณาพิมพ์บาร์โค้ดใหม่`); }
    else { lastBatch = null; toast("บันทึกแล้ว", "แก้ไขล็อตเรียบร้อย"); }
    render();
  } catch (e) { $("#lerr" + k).textContent = e.message; }
};

/* ----- เพิ่มรายการ (นำเข้า) ----- */
function stockAdd() {
  const f = addf, dl = Depts.list(), all = Stock.items(); if (f.dept == null) f.dept = dl[0] || ""; const items = all.filter(i => (i.dept || "") === f.dept); if (f.mode === "old" && !items.find(i => i.code === f.code)) f.code = items.length ? items[0].code : "";
  const sel = items.find(i => i.code === f.code), unit = f.unit !== "" ? f.unit : (f.mode === "old" && sel ? sel.unit : "");
  return `<div class="card"><h2>นำเข้าพัสดุ</h2>
  <div class="chips" style="margin-top:0"><button class="chip ${f.mode === "old" ? "on" : ""}" onclick="A.amode('old')">รายการเดิมที่มีอยู่</button><button class="chip ${f.mode === "new" ? "on" : ""}" onclick="A.amode('new')">เพิ่มรายการใหม่</button></div>
  ${f.err ? `<div class="badbox">${esc(f.err)}</div>` : ""}
  <label for="a-d">แผนก * (เลือกแผนกก่อน)</label><select id="a-d" onchange="addf.dept=this.value;addf.code='';addf.unit='';render()">${dl.map(d => `<option ${f.dept === d ? "selected" : ""}>${esc(d)}</option>`).join("")}${all.some(i => !i.dept || !dl.includes(i.dept)) ? `<option value="" ${f.dept === "" ? "selected" : ""}>ไม่ระบุแผนก (รายการเดิม)</option>` : ""}</select>
  ${f.mode === "old" ? (items.length ? `<label for="a-c">เลือกพัสดุ</label><select id="a-c" onchange="addf.code=this.value;addf.unit='';render()">${items.map(i => `<option value="${i.code}" ${f.code === i.code ? "selected" : ""}>${esc(i.name)} (ใช้ได้ ${Stock.usable(i.code)} ${esc(i.unit)})</option>`).join("")}</select>` : `<div class="empty">ยังไม่มีรายการในแผนกนี้ ให้เลือก "เพิ่มรายการใหม่"</div>`)
   : `<label for="a-n">ชื่อพัสดุใหม่ *</label><input id="a-n" value="${esc(f.name)}" oninput="addf.name=this.value" placeholder="เช่น ถุงมือยางไม่มีแป้ง ไซซ์ M">
      <label for="a-t">ประเภท</label>${typeSel("a-t", f.type || "", "addf.type=this.value")}
      <div class="row"><div><label for="a-m">แจ้งเตือนเมื่อเหลือไม่เกิน (จำนวน · 0 = ไม่แจ้ง)</label><input id="a-m" type="number" min="0" value="${esc(f.min || "")}" oninput="addf.min=this.value" placeholder="0"></div>
      <div><label for="a-x">แจ้งเตือนก่อนหมดอายุ (วัน · 0 = ไม่แจ้ง)</label><input id="a-x" type="number" min="0" value="${esc(f.expDays ?? 30)}" oninput="addf.expDays=this.value"></div></div>
      <label for="a-l">ตำแหน่งจัดเก็บ</label><input id="a-l" value="${esc(f.loc)}" oninput="addf.loc=this.value" placeholder="เช่น ชั้น A-01">`}
  <label for="a-u">หน่วยนับ * (เลือกหรือพิมพ์เอง)</label><input id="a-u" list="units" value="${esc(unit)}" oninput="addf.unit=this.value" placeholder="เช่น กล่อง, ขวด, ห่อ">${f.mode === "old" ? `` : ""}
  <div class="row"><div><label for="a-lot">เลข Lot</label><input id="a-lot" value="${esc(f.lot)}" oninput="addf.lot=this.value" placeholder="เช่น L2411-05"></div>
  <div><label for="a-p">ราคาต่อหน่วย (บาท)</label><input id="a-p" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(f.price)}" oninput="addf.price=this.value" placeholder="0.00"></div></div>
  <div class="row"><div><label for="a-q">จำนวนที่นำเข้า${unit ? " (" + esc(unit) + ")" : ""}</label><input id="a-q" type="number" inputmode="numeric" min="1" max="500" value="${esc(f.qty)}" oninput="addf.qty=this.value"></div>
  <div><label for="a-e">วันหมดอายุ</label><input id="a-e" type="date" min="${Stock.today()}" value="${esc(f.expiry)}" onchange="addf.expiry=this.value"></div></div>
  
  <div class="auto"><span>วันที่นำเข้า</span><span>${fDT(now())} (อัตโนมัติ)</span></div>
  <button class="btn" onclick="A.aadd()">นำเข้าและสร้างบาร์โค้ด</button></div>${lastBatch ? batchCard() : ""}${unitList()}`;
}
function batchCard() {
  const b = lastBatch, it = Stock.item(b.code), lab = Labels.size(), n = b.bcs.length;
  return `<div class="okbox"><b>✓ ${esc(it.name)} · บาร์โค้ดใหม่ ${n} ดวง</b>
  <div class="kv"><span>บาร์โค้ด</span><b>${b.bcs[0]} – ${b.bcs[n - 1]}</b></div><div class="kv"><span>หมดอายุ</span><b>${b.expiry ? fD(b.expiry + "T00:00:00") : "ไม่ระบุ"}</b></div>
  
  <div class="row"><div><label for="lw">Xprinter กว้าง (มม.)</label><input id="lw" type="number" step="0.1" value="${lab.w}"></div><div><label for="lh">สูง (มม.)</label><input id="lh" type="number" step="0.1" value="${lab.h}"></div></div>
  <button class="btn" onclick="A.printBatch()">พิมพ์บาร์โค้ด ${n} ดวง (Xprinter)</button>
  <div style="display:flex;gap:8px;overflow:auto;margin-top:10px;padding:2px;background:var(--bg)">${Labels.html(b.bcs.slice(0, 1), lab.w, lab.h).replace(/page-break-after:always;break-after:page/g, "border:1px solid #bbb;flex:none")}</div>
  </div>`;
}
A.amode = m => { addf.mode = m; addf.err = ""; addf.unit = ""; render(); };
A.aadd = () => {
  const f = addf;
  try {
    if (f.mode === "new" && !f.dept) throw new Error("เลือกแผนกก่อนเพิ่มรายการใหม่"); const qty = parseInt(f.qty, 10); if (!(qty >= 1 && qty <= 500)) throw new Error("จำนวนนำเข้าต้องอยู่ระหว่าง 1–500 ต่อครั้ง");
    Stock.clean({lot: f.lot, price: f.price, expiry: f.expiry});
    const sel = Stock.items().find(i => i.code === f.code), unit = (f.unit !== "" ? f.unit : (f.mode === "old" && sel ? sel.unit : "")).trim();
    if (!unit) throw new Error("กรอกหน่วยนับ");
    let code = f.code;
    if (f.mode === "new") code = Stock.addItem({name: f.name, unit, loc: f.loc, dept: f.dept, type: f.type, min: f.min, expDays: f.expDays}).code;
    else { if (!sel) throw new Error("เลือกพัสดุ"); if (unit !== sel.unit) Stock.updateItem(code, {name: sel.name, unit, loc: sel.loc}); }
    const us = Stock.receive({code, qty, expiry: f.expiry, by: store.who(), lot: f.lot, price: f.price}); lastBatch = {code, bcs: us.map(u => u.bc), expiry: f.expiry};
    addf = {mode:"old", code, dept: f.dept, name:"", unit:"", loc:"", lot:"", price:"", qty:1, expiry:"", err:""}; toast("นำเข้าแล้ว", `สร้างบาร์โค้ด ${us.length} ดวง`);
  } catch (e) { f.err = e.message; }
  render();
};
A.printBatch = () => { Labels.setSize($("#lw").value, $("#lh").value); Labels.print(lastBatch.bcs); };

/* ---------- 6) ประวัติการนำออก + Excel ---------- */
function histRows() {
  const q = hf.q.trim().toLowerCase(), ts = r => r.receivedAt || r.createdAt;
  return store.reqs().filter(r => r.status === 3).filter(r => {
    const d = dayOf(ts(r));
    return (!hf.from || d >= hf.from) && (!hf.to || d <= hf.to) && (!hf.ward || r.ward === hf.ward) && (!hf.payer || r.payer === hf.payer)
      && (!q || (r.id + r.name + r.ward + (r.payer || "") + r.items.map(i => i.name).join(" ")).toLowerCase().includes(q));
  }).sort((a, b) => ts(b).localeCompare(ts(a)));
}
/* การนำออกจากสต็อกที่ไม่ใช่การเบิก (สินค้ามีปัญหา/ไม่ใช้แล้ว/หมดอายุ/อื่นๆ ที่ระบุเอง) : รวมชิ้นที่นำออกพร้อมกันเป็น 1 รายการต่อพัสดุ */
function disposeEvents() {
  const g = {};
  Stock.units().filter(u => u.status === "disposed" && u.disposedAt).forEach(u => { const k = [u.code, u.disposedAt, u.reason || "", u.disposedBy || ""].join("|"); (g[k] = g[k] || []).push(u); });
  return Object.entries(g).map(([k, us]) => { const f = us[0], it = Stock.all().find(i => i.code === f.code) || {};
    return {id: "DSP|" + k, code: f.code, name: it.name || f.code, unit: it.unit || "", qty: us.length, reason: f.reason || "ตัดจำหน่าย", by: f.disposedBy || "", at: f.disposedAt, bcs: us.map(u => u.bc).sort(), lots: [...new Set(us.map(u => u.lot || "-"))]}; });
}
function histAll() {
  const q = hf.q.trim().toLowerCase(), list = [];
  if (hf.kind !== "dispose") histRows().forEach(r => list.push({k: "req", r, ts: r.receivedAt || r.createdAt}));
  if (hf.kind !== "req" && !hf.ward && !hf.payer) disposeEvents().filter(e => { const d = dayOf(e.at);
    return (!hf.from || d >= hf.from) && (!hf.to || d <= hf.to) && (!q || (e.name + " " + e.reason + " " + e.by + " " + e.lots.join(" ")).toLowerCase().includes(q)); }).forEach(e => list.push({k: "disp", e, ts: e.at}));
  return list.sort((a, b) => b.ts.localeCompare(a.ts));
}
const mkey = r => dayOf(r.receivedAt || r.createdAt).slice(0, 7);
let hmon = {};
const monthOpen = (k, first) => hmon[k] === undefined ? k === first : hmon[k];
function hlistHTML() {
  const l = histAll(); if (!l.length) return `<div class="card empty">ไม่พบรายการตามเงื่อนไข</div>`;
  const groups = []; l.forEach(x => { const k = dayOf(x.ts).slice(0, 7); let g = groups[groups.length - 1]; if (!g || g.k !== k) { g = {k, rows: []}; groups.push(g); } g.rows.push(x); });
  const first = groups[0].k;
  return groups.map(g => { const open = monthOpen(g.k, first), label = new Date(g.k + "-01T00:00:00").toLocaleDateString("th-TH", {month: "long", year: "numeric"});
    return `<div class="card" style="padding:0;overflow:hidden"><div class="mhead" onclick="A.hmon('${g.k}')"><b>${label}</b><span>${g.rows.length} รายการ ${open ? "▾" : "▸"}</span></div>
    <div style="padding:10px 14px 4px">${g.rows.some(x => x.k === "req") ? `<button class="btn sm" style="width:100%;margin:0 0 8px" onclick="A.monthForms('${g.k}')">ดาวน์โหลดฟอร์มใบเบิกทั้งเดือน (${g.rows.filter(x => x.k === "req").length} ใบ · PDF)</button>` : ""}
    ${open ? g.rows.map(x => { if (x.k === "disp") return dispRow(x.e); const r = x.r, ts = x.ts;
      return `<div style="padding:10px 0;border-top:1px solid var(--line);cursor:pointer" onclick="A.hopen('${r.id}')"><div style="display:flex;justify-content:space-between;gap:8px"><b>${new Date(ts).toLocaleDateString("th-TH", {day: "numeric", month: "short", year: "numeric"})} · ${esc(r.ward)}${r.type === "admin" ? '<span class="tag">แอดมินเบิกเอง</span>' : ""}</b><span class="ck">✓ รับแล้ว</span></div>
      <div class="mini">#${r.id} · ${r.items.length} รายการ · ${qtyOf(r.items)} ชิ้น · ${r.type === "admin" ? `ผู้เบิก: ${esc(r.payer || "-")}` : `ผู้จ่าย: ${esc(r.payer || "-")} · ผู้รับ: ${esc(r.receiver || "-")}`}</div><div class="mini">รับของ ${fDT(r.receivedAt)}</div>
      ${histOpen === r.id ? detail(r) + proof(r) : ""}</div>`; }).join("") : ""}</div></div>`; }).join("");
}
function dispRow(e) {
  const open = histOpen === e.id;
  return `<div style="padding:10px 0;border-top:1px solid var(--line);cursor:pointer" onclick="A.hopen(decodeURIComponent('${encodeURIComponent(e.id).replace(/'/g, "%27")}'))"><div style="display:flex;justify-content:space-between;gap:8px"><b>${new Date(e.at).toLocaleDateString("th-TH", {day: "numeric", month: "short", year: "numeric"})} · ${esc(e.name)}<span class="tag">นำออกจากสต็อก</span></b><span class="low">${e.qty} ${esc(e.unit)}</span></div>
  <div class="mini">เหตุผล: ${esc(e.reason)} · โดย ${esc(e.by || "-")}</div><div class="mini">นำออก ${fDT(e.at)} · Lot ${esc(e.lots.join(", "))}</div>
  ${open ? `<div class="mini" style="font-family:monospace;word-break:break-all;margin-top:4px">${e.bcs.map(esc).join(" · ")}</div>` : ""}</div>`;
}
A.hmon = k => { const l = histAll(), first = l.length ? dayOf(l[0].ts).slice(0, 7) : ""; hmon[k] = !monthOpen(k, first); $("#hlist").innerHTML = hlistHTML(); };
A.monthForms = k => {
  const rows = histRows().filter(r => mkey(r) === k); if (!rows.length) return;
  toast("กำลังสร้าง PDF", `รวมฟอร์ม ${rows.length} ใบเบิก กรุณารอสักครู่`);
  FormDoc.downloadMany(rows, `forms-${k}.pdf`, (i, n) => { if (n > 20 && i % 20 === 0) toast("กำลังสร้าง PDF", `${i} / ${n}`); });
};
function vHistory() {
  const done = store.reqs().filter(r => r.status === 3), payers = [...new Set(done.map(r => r.payer).filter(Boolean))];
  return `<div class="kick">ประวัติการนำออก</div><h1>ประวัติการนำออก</h1><p class="sub">ค้นหาย้อนหลังและดาวน์โหลดเป็น Excel</p>
  <input type="search" placeholder="ค้นหาเลขใบเบิก / ชื่อ / สินค้า / เหตุผล" value="${esc(hf.q)}" oninput="A.hq(this.value)">
  <div class="row" style="margin-top:8px"><div><label for="h1">ตั้งแต่วันที่</label><input id="h1" type="date" value="${hf.from}" onchange="hf.from=this.value;render()"></div><div><label for="h2">ถึงวันที่</label><input id="h2" type="date" value="${hf.to}" onchange="hf.to=this.value;render()"></div></div>
  <div><label for="h0">แสดง</label><select id="h0" onchange="hf.kind=this.value;render()"><option value="">ทั้งหมด (เบิก + นำออกจากสต็อก)</option><option value="req" ${hf.kind === "req" ? "selected" : ""}>เฉพาะการเบิก</option><option value="dispose" ${hf.kind === "dispose" ? "selected" : ""}>เฉพาะนำออกจากสต็อก</option></select></div>
  <div class="row"><div><label for="h3">Ward</label><select id="h3" onchange="hf.ward=this.value;render()"><option value="">ทุก Ward</option>${WARDS.map(w => `<option ${hf.ward===w?"selected":""}>${w}</option>`).join("")}</select></div>
  <div><label for="h4">ผู้จ่ายของ</label><select id="h4" onchange="hf.payer=this.value;render()"><option value="">ทุกคน</option>${payers.map(p => `<option ${hf.payer===p?"selected":""}>${esc(p)}</option>`).join("")}</select></div></div>
  <div class="xl"><b>ดาวน์โหลด Excel รายเดือน / รายปี</b>
  <div class="row"><div><label for="hxm">รายเดือน (ตามวันที่นำออก)</label><input id="hxm" type="month" value="${todayStr().slice(0, 7)}"></div><div style="align-self:end"><button class="btn sm" style="margin:0;width:100%" onclick="A.xlsxMonth()">ดาวน์โหลดรายเดือน</button></div></div>
  <div class="row"><div><label for="hxy">รายปี (สต็อกคงเหลือแยกแผนก/Lot)</label><select id="hxy">${yearOpts()}</select></div><div style="align-self:end"><button class="btn sm" style="margin:0;width:100%" onclick="A.xlsxYear()">ดาวน์โหลดรายปี</button></div></div></div>
  <div class="xl"><b id="hcnt">พบ ${histAll().length} รายการ</b><button class="btn ghost" onclick="A.xlsx()">ดาวน์โหลดตามตัวกรอง (.xlsx)</button></div>
  <div id="hlist">${hlistHTML()}</div>`;
}
A.hq = v => { hf.q = v; $("#hlist").innerHTML = hlistHTML(); $("#hcnt").textContent = `พบ ${histAll().length} รายการ`; };
A.form = id => FormDoc.download(store.get(id));
A.hopen = id => { histOpen = histOpen === id ? null : id; $("#hlist").innerHTML = hlistHTML(); };
const yearOpts = () => { const y = new Date().getFullYear(), set = new Set([y]); Stock.units().forEach(u => { if (u.importAt) set.add(new Date(u.importAt).getFullYear()); }); return [...set].sort((a, b) => b - a).map(v => `<option value="${v}">${v + 543}</option>`).join(""); };
const dispRows = evs => evs.map(e => ({"วันที่นำออก": fD(e.at), "เวลา": fTs(e.at), "รหัสสินค้า": e.code, "สินค้า": e.name, "จำนวนที่นำออก": e.qty, "หน่วย": e.unit, "Lot": e.lots.join(", "), "บาร์โค้ด": e.bcs.join(" "), "เหตุผล": e.reason, "ผู้นำออก": e.by}));
function saveXlsx(rows, sheet, name, extra) {
  if (!rows.length && !(extra && extra.rows.length)) return toast("ไม่มีข้อมูล", "ไม่พบข้อมูลในช่วงที่เลือก");
  if (window.XLSX) { const wb = XLSX.utils.book_new(); if (rows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheet); if (extra && extra.rows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(extra.rows), extra.sheet); XLSX.writeFile(wb, name + ".xlsx"); return; }
  if (!rows.length) rows = extra.rows;
  const keys = Object.keys(rows[0]), csv = "\ufeff" + [keys, ...rows.map(r => keys.map(k => r[k]))].map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], {type: "text/csv;charset=utf-8"})); a.download = name + ".csv"; a.click();
  toast("ดาวน์โหลดเป็น CSV", "โหลดไลบรารี Excel ไม่สำเร็จ (ต้องต่ออินเทอร์เน็ต) จึงใช้ไฟล์ CSV แทน");
}
/* รายเดือน: 1 แถว = การนำออก 1 ครั้ง ต่อ 1 รายการ ต่อ 1 Lot · จำนวนนำออก/จำนวนทั้งหมด = ชิ้นที่นำออกครั้งนั้น / จำนวนชิ้นทั้งหมดของ Lot */
A.xlsxMonth = () => {
  const m = $("#hxm").value; if (!m) return toast("เลือกเดือน", "กรุณาเลือกเดือนที่ต้องการ");
  const all = Stock.units(), total = {}; all.forEach(u => { const k = u.code + "|" + (u.batch || "-"); total[k] = (total[k] || 0) + 1; });
  const g = {}; all.filter(u => u.status === "issued" && u.issuedAt && dayOf(u.issuedAt).slice(0, 7) === m).forEach(u => { const k = u.reqId + "|" + u.code + "|" + (u.batch || "-"); (g[k] = g[k] || []).push(u); });
  const rows = Object.values(g).sort((a, b) => a[0].issuedAt.localeCompare(b[0].issuedAt) || a[0].code.localeCompare(b[0].code)).map(a => { const f = a[0], it = Stock.item(f.code) || {};
    return {"วันที่นำออก": fD(f.issuedAt), "รหัสบาร์โค้ด": a.map(u => u.bc).sort().join(", "), "จำนวนนำออก/จำนวนทั้งหมด": `${a.length}/${total[f.code + "|" + (f.batch || "-")]}`, "รายการสินค้า": it.name || f.code, "Lot": f.lot || "-", "วันหมดอายุ": f.expiry ? fD(f.expiry + "T00:00:00") : "ไม่ระบุ", "ชื่อหน่วยงานที่เบิก": f.ward || ""}; });
  saveXlsx(rows, "รายเดือน", "issue-month-" + m, {sheet: "นำออกจากสต็อก", rows: dispRows(disposeEvents().filter(e => dayOf(e.at).slice(0, 7) === m))});
};
/* รายปี: 1 แถว = 1 Lot ของแต่ละรายการ จัดตามแผนก (Lot ที่นำเข้าในปีนั้น หรือยังมีของเหลือ) */
A.xlsxYear = () => {
  const y = +$("#hxy").value, rows = [];
  Depts.groups(Stock.items()).forEach(g => g.items.forEach(it => {
    const rem = Stock.inStock(it.code).length, ls = Stock.lots(it.code).filter(l => l.inStock.length || (l.importAt && new Date(l.importAt).getFullYear() === y));
    const row = (l, n) => ({"แผนก": Depts.label(g.dept), "รายการสินค้า": it.name, "ราคา": l && l.price != null ? l.price : "", "หน่วยนับ": it.unit, "จำนวนรวมที่เหลือ": rem, "วันหมดอายุ": l && l.expiry ? fD(l.expiry + "T00:00:00") : (l ? "ไม่ระบุ" : ""), "Lot": l ? (l.lot || "-") : "", "จำนวน Lot ที่เหลือ": n});
    if (ls.length) ls.forEach(l => rows.push(row(l, l.inStock.length))); else rows.push(row(null, 0));
  }));
  saveXlsx(rows, "รายปี", "stock-year-" + y);
};
A.xlsx = () => {
  const rows = (hf.kind === "dispose" ? [] : histRows()).flatMap(r => r.items.map(i => ({
    "เลขที่ใบเบิก": r.id, "ประเภท": r.type === "admin" ? "แอดมินเบิกเอง" : "เบิกผ่านหน้าบ้าน", "วันที่แจ้งเบิก": fDT(r.createdAt), "Ward": r.ward, "ผู้ขอเบิก": r.name,
    "รหัสสินค้า": i.code, "สินค้า": i.name, "บาร์โค้ดที่จ่าย": (r.picked || []).filter(p => p.code === i.code).map(p => p.bc).join(" "), "จำนวน": i.qty, "หน่วย": uShort(i.unit), "ผู้จ่ายของ": r.payer || "", "วันที่จ่าย": fD(r.handedAt || r.receivedAt), "เวลาจ่าย": fTs(r.handedAt || r.receivedAt), "ผู้รับของ (ลงชื่อ)": r.receiver || "", "วันที่รับ": fD(r.receivedAt), "เวลารับ": fTs(r.receivedAt),
    "หมายเหตุ": r.note || "", "แก้ไขใบเบิก (ครั้ง)": (r.edits || []).length })));
  const drows = dispRows(histAll().filter(x => x.k === "disp").map(x => x.e));
  if (!rows.length && !drows.length) return toast("ไม่มีข้อมูล", "ไม่พบรายการตามเงื่อนไข");
  const name = "issue-history-" + todayStr();
  if (window.XLSX) { const wb = XLSX.utils.book_new(); if (rows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "ประวัติการเบิก"); if (drows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(drows), "นำออกจากสต็อก"); XLSX.writeFile(wb, name + ".xlsx"); return; }
  if (!rows.length) rows = drows;
  const keys = Object.keys(rows[0]), csv = "\ufeff" + [keys, ...rows.map(r => keys.map(k => r[k]))].map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], {type:"text/csv;charset=utf-8"})); a.download = name + ".csv"; a.click();
  toast("ดาวน์โหลดเป็น CSV", "โหลดไลบรารี Excel ไม่สำเร็จ (ต้องต่ออินเทอร์เน็ต) จึงใช้ไฟล์ CSV แทน");
};

/* ---------- เบิกเอง (แอดมิน) : ไม่แจ้งเตือน ไม่มีสถานะจัดส่ง ตัดสต็อกทันที แต่เก็บหลักฐาน ---------- */
const dAdmin = () => { const ad = Payers.list(); return ad.find(u => u.id === (dr.admin || Payers.last())) || ad[0]; };
function vDirect() {
  const ad = Payers.list(), sel = dAdmin(), err = derr.length ? `<div class="badbox">${derr.map(esc).join("<br>")}</div>` : "";
  if (dr.step === 2) return `<div class="kick">เบิกเองโดยแอดมิน</div><h1>สรุปการเบิก</h1>${err}
  <div class="card"><h2>ข้อมูลการเบิก</h2><div class="kv"><span>แอดมินผู้เบิก</span><b>${esc(sel ? sel.name : "-")}</b></div><div class="kv"><span>Ward / หน่วยงาน</span><b>${esc(dr.ward)}</b></div>${dr.note ? `<div class="kv"><span>หมายเหตุ</span><b>${esc(dr.note)}</b></div>` : ""}</div>
  <div class="card"><h2>รายการสินค้า <span>${dr.items.length} รายการ</span></h2>${dr.items.map(i => `<div class="kv"><span>${esc(i.name)}</span><b>${i.qty} ${esc(uShort(i.unit))}</b></div>`).join("")}<div class="total"><span>รวมทั้งหมด</span><span>${qtyOf(dr.items)} หน่วย</span></div></div>
  
  <button class="btn" onclick="A.dsub()">ยืนยันการเบิก</button><button class="btn ghost" onclick="dr.step=1;derr=[];render()">ย้อนกลับแก้ไข</button>`;
  return `<div class="kick">เบิกเองโดยแอดมิน</div><h1>เบิกของ (แอดมิน)</h1><p class="sub">เลือกชื่อแอดมินและรายการ แล้วกดถัดไปเพื่อดูสรุปและยืนยัน</p>${err}
  <div class="card"><h2>ข้อมูลการเบิก</h2>
    <label for="d-a">ชื่อแอดมินผู้เบิก *</label><select id="d-a" onchange="dr.admin=this.value;Payers.setLast(this.value)">${ad.map(u => `<option value="${u.id}" ${sel && sel.id === u.id ? "selected" : ""}>${esc(u.name)}</option>`).join("")}</select>${ad.length ? "" : `<div class="mini" style="color:var(--red)">ยังไม่มีรายชื่อแอดมิน · เพิ่มที่ บัญชี › ผู้จ่าย / ลายเซ็น</div>`}
    <label for="d-w">Ward / หน่วยงานที่เบิก *</label><select id="d-w" onchange="dr.ward=this.value"><option value="">เลือก Ward</option>${WARDS.map(w => `<option ${dr.ward===w?"selected":""}>${w}</option>`).join("")}</select>
    <label for="d-note">หมายเหตุ</label><input id="d-note" value="${esc(dr.note)}" oninput="dr.note=this.value"></div>
  <div class="card"><h2>รายการสินค้า <span id="dcnt"></span></h2><input type="search" placeholder="ค้นหาชื่อสินค้า" value="${esc(dr.q)}" oninput="dr.q=this.value;dRefresh()"><div id="dpick"></div></div>
  <button class="btn" onclick="A.dnext()">ถัดไป: สรุปการเบิก</button><button class="btn ghost" onclick="A.go('queue')">ยกเลิก</button>`;
}
function dRefresh() { const el = $("#dpick"); if (!el) return; el.innerHTML = Pick.html({sel: dr.items, q: dr.q, uid: me.id, fn: {tog: "A.dtog", qty: "A.dqty", pin: "A.dpin"}}); $("#dcnt").textContent = dr.items.length + " รายการ · " + qtyOf(dr.items) + " หน่วย"; }
A.dtog = (code, on) => { if (on) { const c = Stock.item(code); if (c && !dr.items.find(i => i.code === code)) dr.items.push({code, name: c.name, unit: c.unit, qty: 1}); } else dr.items = dr.items.filter(i => i.code !== code); derr = []; dRefresh(); };
A.dqty = (code, d) => { const i = dr.items.find(x => x.code === code); if (!i) return; const av = Stock.usable(code); if (d > 0 && i.qty >= av) return toast("เกินจำนวนคงเหลือ", `ขณะนี้เหลือ ${av} ${i.unit}`); i.qty = Math.max(1, i.qty + d); dRefresh(); };
A.dpin = code => { Pick.togFav(me.id, code); dRefresh(); };
A.dnext = () => {
  derr = []; if (!dAdmin()) derr.push("เลือกชื่อแอดมิน"); if (!dr.ward) derr.push("เลือก Ward ที่เบิก"); if (!dr.items.length) derr.push("ติ๊กเลือกสินค้าอย่างน้อย 1 รายการ");
  if (!derr.length) dr.step = 2; render(); window.scrollTo(0, 0);
};
A.dsub = () => {
  const ad = dAdmin(); derr = []; if (!ad) derr.push("เลือกชื่อแอดมิน");
  const id = genId("ADM"), picked = [];
  for (const it of dr.items) { const us = Stock.fefo(it.code); if (us.length < it.qty) { derr = [`สต็อกไม่พอ: ${it.name} (ใช้ได้ ${us.length} ${it.unit})`]; dr.step = 1; return render(); } us.slice(0, it.qty).forEach(u => picked.push({bc: u.bc, code: it.code})); }
  const t = now(), all = Stock.units(), payer = ad.name;
  const out = dr.items.map(it => { const b = Stock.usable(it.code); return {code: it.code, name: it.name, qty: it.qty, before: b, after: b - it.qty, bcs: picked.filter(p => p.code === it.code).map(p => p.bc)}; });
  picked.forEach(p => Object.assign(all.find(x => x.bc === p.bc), {status: "issued", issuedAt: t, reqId: id, ward: dr.ward, to: payer, issuedBy: payer})); Stock.saveUnits(all);
  store.put({id, type:"admin", status:3, locked:true, deducted:true, deductions:out, picked, name:payer, receiver:"", ward:dr.ward, note:dr.note.trim(), payer, payerSig:ad.sig || null, receiverSig:null, createdBy:ad.id, items:dr.items, createdAt:t, handedAt:t, receivedAt:t, times:{3:t}});
  dr = {admin:"",ward:"",note:"",items:[],q:"",step:1}; histOpen = id; toast("เบิกสำเร็จ", `ตัดสต็อกและบันทึกหลักฐาน #${id}`); A.go("history");
};

/* ---------- แจ้งเตือนใบเบิกใหม่ ---------- */
let seen = new Set(store.reqs().map(r => r.id));
function watch() {
  if (!me) return;
  for (const r of store.reqs()) if (!seen.has(r.id)) {
    seen.add(r.id); if (r.type === "admin") continue;
    toast("ใบเบิกใหม่ #" + r.id, `${r.ward} · ${r.items.length} รายการ`); beep(); if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    try { if ("Notification" in window && Notification.permission === "granted") new Notification("มีใบเบิกใหม่", {body: `#${r.id} ${r.ward} · ${r.items.length} รายการ`}); } catch {}
  }
  if (view === "queue" && $("#stats")) { $("#stats").innerHTML = statsHTML(); $("#qlist").innerHTML = qlistHTML(); }
}
window.addEventListener("storage", watch); setInterval(watch, 3000);

/* ---------- render ---------- */
function render() {
  const nv = document.querySelector("nav");
  if (!me || me.mustChange) { $("#app").innerHTML = header() + (me ? vUsers() : ""); $("#nav").innerHTML = ""; nv.style.display = "none"; return; }
  nv.style.display = "";
  const v = {queue:vQueue, edit:vEdit, scan:vScan, deduct:vDeduct, handover:vHandover, stock:vStock, history:vHistory, direct:vDirect, users:vUsers}[view];
  $("#app").innerHTML = header() + alertPanel() + v(); $("#app").classList.toggle("wide", view === "stock" && ssub === "list" && !sedit); nav(); Sig.initAll();
  if (view === "direct" && dr.step === 1) dRefresh();
}

/* ---------- เข้าสู่ระบบ / จัดการบัญชี ---------- */
A.logout = () => { Auth.end("main"); A.stop(); location.href = "../index.html"; };
A.pwchange = async () => {
  try { if ($("#p1").value !== $("#p2").value) throw new Error("รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน");
    await Auth.change(me.id, $("#p0").value, $("#p1").value); me = Auth.users().find(x => x.id === me.id); toast("สำเร็จ", "เปลี่ยนรหัสผ่านแล้ว"); view = "queue"; render(); }
  catch (e) { $("#perr").textContent = e.message; }
};
let uf = {name:"", username:"", role:"ward", ward:"", pw:"", must:false}, uerr = "", ue = null;
let usub = "", uaddOpen = false;
const tile = (ic, t, sub, act) => `<button class="tile" onclick="${act}"><span class="ti" aria-hidden="true">${ic}</span><b>${t}</b>${sub ? `<small>${sub}</small>` : ""}</button>`;
A.usub = v => { usub = v; render(); window.scrollTo(0, 0); };
A.uaddToggle = () => { uaddOpen = !uaddOpen; uerr = ""; render(); };
function myAccountHTML() {
  return `<div class="card"><h2>ข้อมูลบัญชี</h2><div class="kv"><span>ชื่อ</span><b>${esc(me.name)}</b></div><div class="kv"><span>ชื่อผู้ใช้</span><b>${esc(me.username)}</b></div><div class="kv"><span>บทบาท</span><b>${LS_ROLES[me.role] || me.role}</b></div></div>
  <div class="card"><h2>เปลี่ยนรหัสผ่าน</h2>${me.mustChange ? `<div class="badbox">กรุณาตั้งรหัสผ่านใหม่ก่อนใช้งานครั้งแรก</div>` : ""}
  <label for="p0">รหัสผ่านเดิม</label><input id="p0" type="password" autocomplete="current-password">
  <label for="p1">รหัสผ่านใหม่ (อย่างน้อย 4 ตัวอักษร)</label><input id="p1" type="password" autocomplete="new-password">
  <label for="p2">ยืนยันรหัสผ่านใหม่</label><input id="p2" type="password" autocomplete="new-password">
  <div class="err" id="perr"></div><button class="btn" onclick="A.pwchange()">เปลี่ยนรหัสผ่าน</button></div>`;
}
function usersHTML() {
  const form = `<div class="card"><h2>เพิ่มบัญชีใหม่</h2>${uerr ? `<div class="badbox">${esc(uerr)}</div>` : ""}
    <label for="u-n">ชื่อ-นามสกุล</label><input id="u-n" value="${esc(uf.name)}" oninput="uf.name=this.value">
    <label for="u-u">ชื่อผู้ใช้ (a-z 0-9 . _ -)</label><input id="u-u" value="${esc(uf.username)}" autocapitalize="none" oninput="uf.username=this.value">
    <label for="u-r">บทบาท</label><select id="u-r" onchange="uf.role=this.value;render()">${Object.entries(LS_ROLES).filter(([k]) => k !== "staff").map(([k, v]) => `<option value="${k}" ${uf.role === k ? "selected" : ""}>${v}</option>`).join("")}</select>
    ${uf.role === "ward" ? `<label for="u-w">หน่วยงาน (Ward) ของบัญชีนี้</label><select id="u-w" onchange="uf.ward=this.value"><option value="">เลือกหน่วยงาน</option>${WARDS.map(w => `<option ${uf.ward === w ? "selected" : ""}>${w}</option>`).join("")}</select>` : ""}
    <label for="u-p">รหัสผ่านชั่วคราว (อย่างน้อย 4 ตัวอักษร)</label><input id="u-p" type="password" value="${esc(uf.pw)}" autocomplete="new-password" oninput="uf.pw=this.value">
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" style="width:auto" ${uf.must ? "checked" : ""} onchange="uf.must=this.checked"> ให้ผู้ใช้ตั้งรหัสผ่านใหม่เมื่อเข้าสู่ระบบครั้งแรก</label>
    <button class="btn" onclick="A.uadd()">สร้างบัญชี</button></div>`;
  return `<button class="btn" style="margin-top:0" onclick="A.uaddToggle()">${uaddOpen ? "ปิดแบบฟอร์ม" : "＋ เพิ่มบัญชีใหม่"}</button>${uaddOpen ? form : ""}
  ${Auth.users().sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name)).map(userCard).join("")}`;
}
function vUsers() {
  const admin = me.role === "admin" && !me.mustChange;
  if (me.mustChange) usub = "me"; else if (!admin && usub && usub !== "me") usub = "";
  const back = me.mustChange ? "" : `<button class="chip" style="margin-bottom:10px" onclick="A.usub('')">‹ กลับ</button>`;
  if (usub === "me") return `<div class="kick">บัญชี</div><h1>${me.mustChange ? "ตั้งรหัสผ่านใหม่" : "บัญชีของฉัน"}</h1>${back}${myAccountHTML()}`;
  if (usub === "users") return `<div class="kick">บัญชี</div><h1>ผู้ใช้งาน</h1>${back}${usersHTML()}`;
  if (usub === "payers") return `<div class="kick">บัญชี</div><h1>ผู้จ่าย / ลายเซ็น</h1>${back}${payersHTML()}`;
  if (usub === "wards") return `<div class="kick">บัญชี</div><h1>หน่วยงาน (Ward)</h1>${back}${wardsCard()}`;
  return `<div class="kick">บัญชี</div><h1>บัญชีและการตั้งค่า</h1><p class="sub">${esc(me.name)} · ${LS_ROLES[me.role] || me.role}</p>
  <div class="tiles">${tile("👤", "บัญชีของฉัน", "เปลี่ยนรหัสผ่าน", "A.usub('me')")}${admin ? tile("👥", "ผู้ใช้งาน", Auth.users().length + " บัญชี", "A.usub('users')") + tile("✍️", "ผู้จ่าย / ลายเซ็น", Payers.list().length + " คน", "A.usub('payers')") + tile("🏥", "หน่วยงาน", Wards.list().length + " หน่วยงาน", "A.usub('wards')") : ""}${tile("🚪", "ออกจากระบบ", "", "A.logout()")}</div>`;
}
let werr = "";
function wardsCard() {
  const l = Wards.list();
  return `<div class="card"><h2>หน่วยงาน (Ward) <span>${l.length} รายการ</span></h2>${werr ? `<div class="badbox">${esc(werr)}</div>` : ""}
  ${l.map((w, i) => `<div class="item"><div class="nm">${esc(w)}<small>${Wards.usage(w)} บัญชีใช้ชื่อนี้</small></div><button class="chip" onclick="A.wedit(${i})">แก้ไข</button><button class="chip" onclick="A.wdel(${i})">ลบ</button></div>`).join("")}
  <label for="wn">เพิ่มหน่วยงานใหม่</label><div class="row" style="grid-template-columns:1fr auto"><input id="wn" placeholder="ชื่อหน่วยงานตามโรงพยาบาลของคุณ" onkeydown="if(event.key===\'Enter\')A.wadd()"><button class="btn sm" onclick="A.wadd()">เพิ่ม</button></div>
  </div>`;
}
A.wadd = () => { try { Wards.add($("#wn").value); werr = ""; } catch (e) { werr = e.message; } render(); };
A.wedit = i => { const old = Wards.list()[i], n = window.prompt("แก้ไขชื่อ Ward", old); if (n === null) return; try { Wards.rename(old, n); werr = ""; toast("บันทึกแล้ว", "เปลี่ยนชื่อ Ward เรียบร้อย"); } catch (e) { werr = e.message; } render(); };
A.wdel = i => { const w = Wards.list()[i]; if (!window.confirm(`ลบ Ward "${w}"?`)) return; try { Wards.remove(w); werr = ""; } catch (e) { werr = e.message; } render(); };
let usigId = null, perr = "";
A.usig = id => { usigId = id; render(); };
A.usigSave = () => { const cv = $("#sigU"); if (!Sig.has(cv)) return toast("ยังไม่ได้เซ็น", "กรุณาเซ็นชื่อในกรอบก่อนบันทึก"); try { Payers.setSig(usigId, Sig.data(cv)); toast("บันทึกแล้ว", "ลายเซ็นจะขึ้นอัตโนมัติเมื่อเลือกชื่อนี้เป็นผู้จ่าย"); usigId = null; } catch (e) { toast("ทำไม่ได้", e.message); } render(); };
A.usigDel = () => { if (!window.confirm("ลบลายเซ็นนี้?")) return; Payers.setSig(usigId, ""); usigId = null; render(); };
function sigCard(u) {
  return `<div class="card" style="background:var(--bg)"><h2>ลายเซ็น ${esc(u.name)}</h2>${u.sig ? `<img alt="ลายเซ็นปัจจุบัน" src="${u.sig}" style="max-height:90px;background:#fff;border:1px solid var(--line);border-radius:8px">` : ""}${Sig.html("sigU", "เซ็นชื่อ")}
  <button class="btn" onclick="A.usigSave()">บันทึกลายเซ็น</button>${u.sig ? `<button class="btn ghost" onclick="A.usigDel()">ลบลายเซ็น</button>` : ""}<button class="btn ghost" onclick="A.usig(null)">ปิด</button></div>`;
}
function payersHTML() {
  const l = Payers.list();
  return `<div class="card"><h2>ผู้จ่าย / ชื่อแอดมิน <span>${l.length} คน</span></h2>${perr ? `<div class="badbox">${esc(perr)}</div>` : ""}
  ${l.map(p => usigId === p.id ? sigCard(p) : `<div class="item"><div class="nm">${esc(p.name)}<small>${p.sig ? "มีลายเซ็นแล้ว ✓" : "ยังไม่มีลายเซ็น"}</small></div><button class="chip" onclick="A.usig('${p.id}')">ลายเซ็น</button><button class="chip" onclick="A.pedit('${p.id}')">แก้ชื่อ</button><button class="chip" onclick="A.pdel('${p.id}')">ลบ</button></div>`).join("") || `<div class="empty">ยังไม่มีรายชื่อ</div>`}
  <label for="pn">เพิ่มชื่อผู้จ่าย</label><div class="row" style="grid-template-columns:1fr auto"><input id="pn" placeholder="ชื่อ-นามสกุล" onkeydown="if(event.key==='Enter')A.padd()"><button class="btn sm" onclick="A.padd()">เพิ่ม</button></div></div>`;
}
A.padd = () => { try { Payers.add($("#pn").value); perr = ""; } catch (e) { perr = e.message; } render(); };
A.pedit = id => { const p = Payers.list().find(x => x.id === id), n = window.prompt("แก้ไขชื่อ", p.name); if (n === null) return; try { Payers.rename(id, n); perr = ""; } catch (e) { perr = e.message; } render(); };
A.pdel = id => { const p = Payers.list().find(x => x.id === id); if (!window.confirm(`ลบ "${p.name}"? (ใบเบิกเดิมที่บันทึกแล้วไม่เปลี่ยน)`)) return; Payers.remove(id); render(); };
function userCard(u) {
  if (ue && ue.id === u.id) return `<div class="card"><h2>แก้ไขบัญชี</h2>${ue.err ? `<div class="badbox">${esc(ue.err)}</div>` : ""}
    <label for="e1">ชื่อ-นามสกุล</label><input id="e1" value="${esc(ue.name)}" oninput="ue.name=this.value">
    <label for="e2">ชื่อผู้ใช้</label><input id="e2" value="${esc(ue.username)}" autocapitalize="none" oninput="ue.username=this.value">
    <label for="e3">บทบาท</label><select id="e3" ${u.id === me.id ? "disabled" : ""} onchange="ue.role=this.value;render()">${Object.entries(LS_ROLES).filter(([k]) => k !== "staff" || ue.role === "staff").map(([k, v]) => `<option value="${k}" ${ue.role === k ? "selected" : ""}>${v}</option>`).join("")}</select>
    ${ue.role === "ward" ? `<label for="e4">Ward</label><select id="e4" onchange="ue.ward=this.value"><option value="">เลือก Ward</option>${WARDS.map(w => `<option ${ue.ward === w ? "selected" : ""}>${w}</option>`).join("")}</select>` : ""}
    <button class="btn" onclick="A.usave()">บันทึกการแก้ไข</button><button class="btn ghost" onclick="A.ucancel()">ยกเลิก</button></div>`;
  return `<div class="card"><h2>${esc(u.name)}<span class="pill ${u.active ? "s3" : ""}">${u.active ? "ใช้งาน" : "ปิดใช้งาน"}</span></h2>
    <div class="mini">${esc(u.username)} · ${LS_ROLES[u.role] || u.role}${u.ward ? " · " + esc(u.ward) : ""}${u.mustChange ? " · รอเปลี่ยนรหัสผ่าน" : ""}</div>
    <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><button class="chip" onclick="A.uedit('${u.id}')">แก้ไข</button><button class="chip" onclick="A.ureset('${u.id}')">รีเซ็ตรหัสผ่าน</button>${u.id !== me.id ? `<button class="chip" onclick="A.utoggle('${u.id}')">${u.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}</button><button class="chip" onclick="A.udel('${u.id}')">ลบ</button>` : ""}</div></div>`;
}
A.uedit = id => { const u = Auth.users().find(x => x.id === id); ue = {id, name:u.name, username:u.username, role:u.role, ward:u.ward || "", err:""}; render(); };
A.ucancel = () => { ue = null; render(); };
A.usave = () => {
  try { if (ue.id === me.id && ue.role !== me.role) throw new Error("ไม่สามารถเปลี่ยนบทบาทของบัญชีที่กำลังใช้งานอยู่");
    Auth.update(ue.id, ue); if (ue.id === me.id) me = Auth.users().find(x => x.id === me.id); toast("บันทึกแล้ว", "แก้ไขบัญชีเรียบร้อย"); ue = null; }
  catch (e) { ue.err = e.message; }
  render();
};
A.uadd = async () => {
  try { await Auth.add({name:uf.name, username:uf.username, role:uf.role, ward:uf.ward, password:uf.pw, mustChange:!!uf.must}); toast("สร้างบัญชีแล้ว", uf.username); uf = {name:"", username:"", role:"ward", ward:"", pw:"", must:false}; uerr = ""; uaddOpen = false; }
  catch (e) { uerr = e.message; }
  render();
};
A.utoggle = id => { try { const u = Auth.users().find(x => x.id === id); Auth.setActive(id, !u.active); } catch (e) { toast("ทำไม่ได้", e.message); } render(); };
A.udel = id => { const u = Auth.users().find(x => x.id === id); if (!window.confirm(`ลบบัญชี ${u.name} (${u.username})?`)) return; try { Auth.remove(id); } catch (e) { toast("ทำไม่ได้", e.message); } render(); };
A.ureset = async id => {
  const p = window.prompt("ตั้งรหัสผ่านชั่วคราวใหม่ (อย่างน้อย 4 ตัวอักษร)"); if (p === null) return;
  try { await Auth.setPassword(id, p, true); toast("รีเซ็ตแล้ว", "ผู้ใช้ต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งถัดไป"); me = Auth.users().find(x => x.id === me.id) || null; render(); }
  catch (e) { toast("ทำไม่ได้", e.message); }
};
function missingLib(){document.getElementById("app").innerHTML='<div style="padding:24px;font-family:sans-serif"><h2>เปิดระบบไม่ได้: ไม่พบไฟล์ shared.js</h2><p>ไฟล์ <b>shared.js</b> ต้องอยู่ที่โฟลเดอร์หลัก (นอกโฟลเดอร์ user และ admin) และต้องรักษาโครงสร้างโฟลเดอร์ตามไฟล์ zip ห้ามนำไฟล์มารวมในโฟลเดอร์เดียว</p></div>'}
(async () => { if (typeof Auth === "undefined") return missingLib(); try { await Auth.ensure(); } catch {} const u = Auth.current("main", ["admin", "staff", "ward"]); if (!u) { location.replace("../index.html"); return; } if (u.role === "ward") { location.replace("../user/index.html"); return; } me = u; render(); alertPush(); })();
