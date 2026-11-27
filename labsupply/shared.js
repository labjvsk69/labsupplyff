/* =========================================================
   LabSupply – ส่วนที่ใช้ร่วมกันทั้งหน้าบ้านและหลังบ้าน
   1) Auth     บัญชีผู้ใช้ / เข้าสู่ระบบ / รหัสผ่าน (เก็บใน localStorage)
   2) Sig      ช่องเซ็นลายมือบนหน้าจอ (เมาส์ / นิ้ว / ปากกา)
   3) FormDoc  ฟอร์มใบเบิก-ใบส่งมอบ ดาวน์โหลดเป็น PDF

   หมายเหตุความปลอดภัย: เป็นต้นแบบที่ทำงานในเบราว์เซอร์ล้วน
   รหัสผ่านถูกเข้ารหัส (PBKDF2) แต่ข้อมูลยังอยู่ในเครื่องผู้ใช้
   ใช้งานจริงต้องย้ายไปยืนยันตัวตนที่ฝั่งเซิร์ฟเวอร์
   ========================================================= */
const LS_ROLES = {admin: "ผู้ดูแลระบบ (หลังบ้าน)", ward: "ผู้ใช้ (ผู้ขอเบิก)", staff: "เจ้าหน้าที่ (เดิม)"};

const Auth = {
  g(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } },
  s(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  users() { return this.g("ls_users", []); },
  save(u) { this.s("ls_users", u); },
  hex(b) { return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); },
  salt() { return this.hex(crypto.getRandomValues(new Uint8Array(12))); },
  async hash(pw, salt) {
    if (!(window.crypto && crypto.subtle)) throw new Error("ต้องเปิดผ่าน HTTPS (เช่น GitHub Pages) จึงจะเข้าสู่ระบบได้");
    const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
    return this.hex(await crypto.subtle.deriveBits({name:"PBKDF2", salt:new TextEncoder().encode(salt), iterations:100000, hash:"SHA-256"}, k, 256));
  },
  checkPw(p) { if (String(p || "").length < 4) throw new Error("รหัสผ่านต้องยาวอย่างน้อย 4 ตัวอักษร"); },
  /* สร้างบัญชีผู้ดูแลเริ่มต้นครั้งเดียว: lab1234 / 1234 (ลบหรือเปลี่ยนรหัสได้ที่เมนูบัญชี) */
  async ensure() {
    if (localStorage.getItem("ls_seeded")) return;
    if (!this.users().find(x => x.username === "lab1234")) await this.add({username:"lab1234", name:"ผู้ดูแลระบบ", role:"admin", password:"1234", mustChange:false});
    try { localStorage.setItem("ls_seeded", "1"); } catch {}
  },
  update(id, {name, username, role, ward = ""}) {
    username = String(username || "").trim().toLowerCase(); const u = this.users(), x = u.find(k => k.id === id);
    if (!x) throw new Error("ไม่พบบัญชี");
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error("ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - ยาว 3–30 ตัว");
    if (!String(name || "").trim()) throw new Error("กรอกชื่อ-นามสกุล");
    if (!LS_ROLES[role]) throw new Error("เลือกบทบาท");
    if (role === "ward" && !ward) throw new Error("เลือก Ward ของบัญชีผู้ใช้");
    if (u.find(k => k.id !== id && k.username === username)) throw new Error("ชื่อผู้ใช้นี้ถูกใช้แล้ว");
    if (x.role === "admin" && role !== "admin" && this.activeAdmins().length <= 1) throw new Error("ต้องมีผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 บัญชี");
    Object.assign(x, {name:name.trim(), username, role, ward:role === "ward" ? ward : ""}); this.save(u);
  },
  async add({username, name, role, ward = "", password, mustChange = true}) {
    username = String(username || "").trim().toLowerCase(); const u = this.users();
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error("ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - ยาว 3–30 ตัว");
    if (!String(name || "").trim()) throw new Error("กรอกชื่อ-นามสกุล");
    if (!LS_ROLES[role]) throw new Error("เลือกบทบาท");
    if (role === "ward" && !ward) throw new Error("เลือก Ward ของบัญชีผู้ขอเบิก");
    if (u.find(x => x.username === username)) throw new Error("ชื่อผู้ใช้นี้ถูกใช้แล้ว");
    this.checkPw(password);
    const salt = this.salt(), hash = await this.hash(password, salt);
    const u2 = this.users();   // อ่านใหม่หลัง await กันการเขียนทับกัน
    if (u2.find(x => x.username === username)) throw new Error("ชื่อผู้ใช้นี้ถูกใช้แล้ว");
    u2.push({id:"U" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), username, name:name.trim(), role, ward:role === "ward" ? ward : "", salt, hash, active:true, mustChange, createdAt:new Date().toISOString()});
    this.save(u2);
  },
  async login(username, password, roles) {
    username = String(username || "").trim().toLowerCase();
    const f = this.g("ls_fail", {}), t = f[username];
    if (t && t.until > Date.now()) throw new Error(`ลองผิดหลายครั้ง กรุณารออีก ${Math.ceil((t.until - Date.now()) / 1000)} วินาที`);
    const u = this.users().find(x => x.username === username);
    const ok = u && u.active && roles.includes(u.role) && (await this.hash(password || "", u.salt)) === u.hash;
    if (!ok) {
      const n = ((t && t.n) || 0) + 1; f[username] = n >= 5 ? {n:0, until:Date.now() + 60000} : {n, until:0}; this.s("ls_fail", f);
      throw new Error("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง หรือบัญชีนี้ไม่มีสิทธิ์เข้าหน้านี้");
    }
    delete f[username]; this.s("ls_fail", f); return u;
  },
  start(key, u) { this.s("ls_sess_" + key, {uid:u.id, exp:Date.now() + 8 * 3600e3}); },
  current(key, roles) {
    const s = this.g("ls_sess_" + key, null); if (!s || s.exp < Date.now()) return null;
    const u = this.users().find(x => x.id === s.uid); return u && u.active && roles.includes(u.role) ? u : null;
  },
  end(key) { try { localStorage.removeItem("ls_sess_" + key); } catch {} },
  async setPassword(id, pw, mustChange = false) {
    this.checkPw(pw); const salt = this.salt(), hash = await this.hash(pw, salt);
    const u = this.users(), x = u.find(k => k.id === id); if (!x) throw new Error("ไม่พบบัญชี");
    x.salt = salt; x.hash = hash; x.mustChange = mustChange; this.save(u);
  },
  async change(id, oldPw, newPw) {
    const x = this.users().find(k => k.id === id);
    if (!x || (await this.hash(oldPw || "", x.salt)) !== x.hash) throw new Error("รหัสผ่านเดิมไม่ถูกต้อง");
    if (newPw === oldPw) throw new Error("รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม");
    await this.setPassword(id, newPw, false);
  },
  admins() { return this.users().filter(x => x.role === "admin" && x.active); },
  setSig(id, url) { const u = this.users(), x = u.find(k => k.id === id); if (!x) throw new Error("ไม่พบบัญชี"); if (url) x.sig = url; else delete x.sig; this.save(u); },
  activeAdmins() { return this.users().filter(x => x.role === "admin" && x.active); },
  setActive(id, on) {
    const u = this.users(), x = u.find(k => k.id === id);
    if (!on && x.role === "admin" && this.activeAdmins().length <= 1) throw new Error("ต้องมีผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 บัญชี");
    x.active = on; this.save(u);
  },
  remove(id) {
    const x = this.users().find(k => k.id === id);
    if (x.role === "admin" && this.activeAdmins().length <= 1) throw new Error("ต้องมีผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 บัญชี");
    this.save(this.users().filter(k => k.id !== id));
  }
};

const Sig = {
  html(id, label) {
    return `<label>${label}</label><canvas class="sig" id="${id}" width="480" height="160" aria-label="${label}"></canvas>
    <div style="display:flex;justify-content:space-between;align-items:center"><small class="mini">เซ็นชื่อในกรอบด้วยนิ้วหรือปากกา</small><button type="button" class="chip" onclick="Sig.clear(document.getElementById('${id}'))">ล้างลายเซ็น</button></div>`;
  },
  init(cv) {
    if (!cv || cv._ok) return; cv._ok = true; const c = cv.getContext("2d"); let d = false;
    c.fillStyle = "#fff"; c.fillRect(0, 0, cv.width, cv.height); c.lineWidth = 2.6; c.lineCap = c.lineJoin = "round"; c.strokeStyle = "#111"; cv._dirty = false;
    const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
    cv.onpointerdown = e => { d = true; cv.setPointerCapture(e.pointerId); const [x, y] = pos(e); c.beginPath(); c.moveTo(x, y); c.lineTo(x + .1, y + .1); c.stroke(); cv._dirty = true; e.preventDefault(); };
    cv.onpointermove = e => { if (!d) return; const [x, y] = pos(e); c.lineTo(x, y); c.stroke(); e.preventDefault(); };
    cv.onpointerup = cv.onpointercancel = () => { d = false; };
  },
  initAll() { document.querySelectorAll("canvas.sig").forEach(c => this.init(c)); },
  clear(cv) { const c = cv.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, cv.width, cv.height); cv._dirty = false; },
  has(cv) { return !!(cv && cv._dirty); },
  data(cv) { return cv.toDataURL("image/png"); },
  load(cv, url) { if (!cv || !url) return; const im = new Image(); im.onload = () => { cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height); cv._dirty = true; }; im.src = url; }
};

const FormDoc = {
  html(r) {
    const E = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    const D = i => new Date(i).toLocaleDateString("th-TH", {day:"numeric", month:"long", year:"numeric"});
    const T = i => new Date(i).toLocaleTimeString("th-TH", {hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false}) + " น.";
    const u = x => String(x || "").split(" ")[0], td = "border:1px solid #333;padding:6px 8px";
    const total = r.items.reduce((s, i) => s + i.qty, 0), paid = r.handedAt || r.receivedAt;
    const rows = r.items.map((i, n) => `<tr><td style="${td};text-align:center">${n + 1}</td><td style="${td}">${E(i.code)}</td><td style="${td}">${E(i.name)}${(r.picked || []).filter(p => p.code === i.code).length ? `<div style="font-size:10px;color:#555;word-break:break-all">บาร์โค้ด: ${(r.picked || []).filter(p => p.code === i.code).map(p => E(p.bc)).join(", ")}</div>` : ""}</td><td style="${td};text-align:right">${i.qty}</td><td style="${td}">${E(u(i.unit))}</td></tr>`).join("");
    const sig = (img, role, name, time) => `<div style="flex:1;text-align:center;padding:0 10px"><div style="height:92px;display:flex;align-items:flex-end;justify-content:center;border-bottom:1px solid #000">${img ? `<img src="${img}" style="max-height:88px;max-width:100%">` : ""}</div><div style="margin-top:6px">( ${E(name || "................................")} )</div><div style="font-weight:700">${role}</div><div style="font-size:12px;color:#444">${time ? D(time) + " เวลา " + T(time) : "วันที่ ........................"}</div></div>`;
    const kv = (k, v) => `<div style="display:flex;gap:8px;margin:2px 0"><span style="min-width:120px;color:#333">${k}</span><b>${v}</b></div>`;
    return `<div style="width:794px;box-sizing:border-box;padding:40px 48px;background:#fff;color:#000;font-family:'Noto Sans Thai',Tahoma,sans-serif;font-size:14px;line-height:1.5">
    <div style="text-align:center"><div style="font-size:13px">โรงพยาบาลจิตเวชสระแก้วราชนครินทร์ · ${"Sakaeo Rajanagarindra Psychiatric hospital"}</div>
    <div style="font-size:22px;font-weight:700;margin:4px 0">${r.type === "admin" ? "ใบเบิกวัสดุ (แอดมินเบิกเอง)" : "ใบเบิกวัสดุ / ใบส่งมอบวัสดุ"}</div><div>เลขที่ ${E(r.id)}</div></div>
    <div style="display:flex;gap:24px;margin:18px 0 12px"><div style="flex:1">${kv(r.type === "admin" ? "ผู้เบิก" : "ผู้ขอเบิก", E(r.name))}${kv("Ward / หน่วยงาน", E(r.ward))}</div>
    <div style="flex:1">${kv(r.type === "admin" ? "วันที่เบิก" : "วันที่แจ้งเบิก", D(r.createdAt) + " " + T(r.createdAt))}${r.pickupDate ? kv("นัดรับของ", D(r.pickupDate) + " " + E(r.pickupTime) + " น.") : ""}</div></div>
    <table style="width:100%;border-collapse:collapse"><thead><tr style="background:#eee"><th style="${td};width:44px">ลำดับ</th><th style="${td};width:100px">รหัส</th><th style="${td}">รายการ</th><th style="${td};width:70px">จำนวน</th><th style="${td};width:110px">หน่วย</th></tr></thead>
    <tbody>${rows}<tr><td colspan="3" style="${td};text-align:right;font-weight:700">รวมทั้งสิ้น ${r.items.length} รายการ</td><td style="${td};text-align:right;font-weight:700">${total}</td><td style="${td}"></td></tr></tbody></table>
    ${r.note ? `<div style="margin-top:10px">หมายเหตุ: ${E(r.note)}</div>` : ""}
    <div style="margin-top:34px;display:flex">${r.type === "admin" ? `<div style="flex:1"></div>${sig(r.payerSig, "ผู้เบิก", r.name || r.payer, paid)}<div style="flex:1"></div>` : sig(r.payerSig, "ผู้จ่ายของ", r.payer, paid) + sig(r.receiverSig, "ผู้รับของ", r.receiver, r.receivedAt)}</div>
    <div style="margin-top:28px;font-size:11px;color:#555;border-top:1px solid #ccc;padding-top:8px">เอกสารสร้างโดยระบบ LabSupply · เวลาที่บันทึก ${E(r.handedAt || r.receivedAt || "")} · ข้อมูลถูกล็อก${r.type === "admin" ? "เมื่อบันทึกการเบิก" : "เมื่อผู้จ่ายยืนยัน"} ไม่สามารถแก้ไขย้อนหลังได้</div></div>`;
  },
  async download(r) {
    if (!r) return;
    const box = document.createElement("div"); box.style.cssText = "position:fixed;left:-10000px;top:0;background:#fff"; box.innerHTML = this.html(r); document.body.appendChild(box);
    try {
      if (!(window.html2canvas && window.jspdf)) throw new Error("no-lib");
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const cv = await html2canvas(box.firstElementChild, {scale:2, backgroundColor:"#fff"});
      const pdf = new window.jspdf.jsPDF("p", "mm", "a4"), W = 210, H = 297, ih = cv.height * W / cv.width, img = cv.toDataURL("image/jpeg", 0.92);
      pdf.addImage(img, "JPEG", 0, 0, W, ih);
      for (let p = 1; ih - p * H > 1; p++) { pdf.addPage(); pdf.addImage(img, "JPEG", 0, -p * H, W, ih); }
      pdf.save(`ใบเบิก-${r.id}.pdf`);
    } catch (e) { this.print(r); } finally { box.remove(); }
  },
  /* รวมหลายใบเบิกเป็น PDF ไฟล์เดียว (1 ใบเบิก = 1 หน้าขึ้นไป) ใช้ดาวน์โหลดหลักฐานรายเดือน */
  async downloadMany(list, filename, onProgress) {
    if (!list.length) return;
    const box = document.createElement("div"); box.style.cssText = "position:fixed;left:-10000px;top:0;background:#fff"; document.body.appendChild(box);
    try {
      if (!(window.html2canvas && window.jspdf)) throw new Error("no-lib");
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const pdf = new window.jspdf.jsPDF("p", "mm", "a4"), W = 210, H = 297; let first = true;
      for (let k = 0; k < list.length; k++) {
        if (onProgress) onProgress(k + 1, list.length);
        box.innerHTML = this.html(list[k]);
        const cv = await html2canvas(box.firstElementChild, {scale: 1.5, backgroundColor: "#fff"}), ih = cv.height * W / cv.width, img = cv.toDataURL("image/jpeg", 0.9);
        for (let p = 0; p === 0 || ih - p * H > 1; p++) { if (!first) pdf.addPage(); first = false; pdf.addImage(img, "JPEG", 0, -p * H, W, ih); }
      }
      pdf.save(filename || "ใบเบิก.pdf");
    } catch (e) { this.printMany(list); } finally { box.remove(); }
  },
  printMany(list) {
    const w = window.open("", "_blank"); if (!w) return alert("เบราว์เซอร์บล็อกหน้าต่างใหม่ กรุณาอนุญาต Pop-up แล้วลองอีกครั้ง");
    w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ใบเบิก ${list.length} ใบ</title><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;700&display=swap" rel="stylesheet"><style>@page{size:A4;margin:0}body{margin:0}.pg{page-break-after:always;break-after:page}</style></head><body>${list.map(r => `<div class="pg">${this.html(r)}</div>`).join("")}</body></html>`);
    w.document.close(); setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 1200);
  },
  /* สำรอง: เปิดหน้าต่างพิมพ์ แล้วเลือก "บันทึกเป็น PDF" */
  print(r) {
    const w = window.open("", "_blank");
    if (!w) return alert("เบราว์เซอร์บล็อกหน้าต่างใหม่ กรุณาอนุญาต Pop-up แล้วลองอีกครั้ง");
    w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ใบเบิก ${r.id}</title><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;700&display=swap" rel="stylesheet"><style>@page{size:A4;margin:0}body{margin:0}</style></head><body>${this.html(r)}</body></html>`);
    w.document.close(); setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 900);
  }
};

const C128=["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"];
/* =========================================================
   Ward (ชื่อวอร์ด/หน่วยงาน แก้ไขได้) – เก็บใน ls_wards
   ========================================================= */
const Wards = {
  DEFAULT: ["อายุรกรรมหญิง","อายุรกรรมชาย","จิตเวชเด็ก","ผู้ป่วยหนัก (ICU)","ห้องฉุกเฉิน","ห้องผ่าตัด"],
  list() { let w = Auth.g("ls_wards", null); if (!w) { w = [...this.DEFAULT]; Auth.s("ls_wards", w); } return w; },
  clean(n) { n = String(n || "").trim().replace(/\s+/g, " "); if (!n) throw new Error("กรอกชื่อ Ward"); if (n.length > 60) throw new Error("ชื่อ Ward ยาวเกินไป"); return n; },
  usage(n) { return Auth.users().filter(u => u.ward === n).length; },
  add(n) { n = this.clean(n); const w = this.list(); if (w.includes(n)) throw new Error("มี Ward ชื่อนี้อยู่แล้ว"); w.push(n); Auth.s("ls_wards", w); },
  /* เปลี่ยนชื่อ: อัปเดตบัญชีผู้ใช้และใบเบิกเดิมที่ใช้ชื่อนี้ให้ตรงกันด้วย */
  rename(old, nw) {
    nw = this.clean(nw); const w = this.list(), i = w.indexOf(old); if (i < 0) throw new Error("ไม่พบ Ward");
    if (nw !== old && w.includes(nw)) throw new Error("มี Ward ชื่อนี้อยู่แล้ว");
    w[i] = nw; Auth.s("ls_wards", w);
    const u = Auth.users(); u.forEach(x => { if (x.ward === old) x.ward = nw; }); Auth.save(u);
    const r = Auth.g("ls_reqs", []); r.forEach(x => { if (x.ward === old) x.ward = nw; }); Auth.s("ls_reqs", r);
  },
  remove(n) {
    const c = this.usage(n); if (c) throw new Error(`มี ${c} บัญชีใช้ Ward นี้อยู่ กรุณาแก้ไขบัญชีเหล่านั้นก่อน`);
    Auth.s("ls_wards", this.list().filter(x => x !== n));
  }
};

/* แผนก (Chemistry, Hematology ...) : จัดกลุ่มรายการสินค้า เก็บใน ls_depts · พัสดุแต่ละรายการมีฟิลด์ dept */
const Depts = {
  DEFAULT: ["Chemistry", "Hematology", "Immunology", "Microbiology"],
  list() { let d = Auth.g("ls_depts", null); if (!d) { d = [...this.DEFAULT]; Auth.s("ls_depts", d); } return d; },
  clean(n) { n = String(n || "").trim().replace(/\s+/g, " "); if (!n) throw new Error("กรอกชื่อแผนก"); if (n.length > 40) throw new Error("ชื่อแผนกยาวเกินไป"); return n; },
  usage(n) { return Stock.items().filter(i => (i.dept || "") === n).length; },
  add(n) { n = this.clean(n); const d = this.list(); if (d.includes(n)) throw new Error("มีแผนกชื่อนี้อยู่แล้ว"); d.push(n); Auth.s("ls_depts", d); },
  rename(old, nw) {
    nw = this.clean(nw); const d = this.list(), i = d.indexOf(old); if (i < 0) throw new Error("ไม่พบแผนก"); if (nw !== old && d.includes(nw)) throw new Error("มีแผนกชื่อนี้อยู่แล้ว");
    d[i] = nw; Auth.s("ls_depts", d); const it = Stock.all(); it.forEach(x => { if (x.dept === old) x.dept = nw; }); Stock.saveItems(it);
  },
  remove(n) { const c = this.usage(n); if (c) throw new Error(`แผนกนี้ยังมี ${c} รายการ กรุณาย้ายรายการไปแผนกอื่นก่อน`); Auth.s("ls_depts", this.list().filter(x => x !== n)); },
  /* จัดกลุ่มรายการตามแผนก (ตามลำดับแผนก, รายการที่ไม่มีแผนกไว้ท้ายสุด) */
  groups(items) { const g = this.list().map(n => ({dept: n, items: items.filter(i => i.dept === n)})); const rest = items.filter(i => !i.dept || !this.list().includes(i.dept)); if (rest.length) g.push({dept: "", items: rest}); return g.filter(x => x.items.length); },
  label(n) { return n || "ไม่ระบุแผนก"; }
};

/* ประเภทพัสดุ (Reagent, Cassette, Strip ...) : เลือกจากรายการ เพิ่ม/แก้ไข/ลบได้ที่สต็อก › ตั้งค่า · เก็บใน ls_types */
const Types = {
  DEFAULT: ["Reagent", "Cassette", "Strip"],
  list() { let t = Auth.g("ls_types", null); if (!t) { t = [...this.DEFAULT]; Stock.all().forEach(i => { if (i.type && !t.includes(i.type)) t.push(i.type); }); Auth.s("ls_types", t); } return t; },
  clean(n) { n = String(n || "").trim().replace(/\s+/g, " "); if (!n) throw new Error("กรอกชื่อประเภท"); if (n.length > 40) throw new Error("ชื่อประเภทยาวเกินไป"); return n; },
  usage(n) { return Stock.items().filter(i => (i.type || "") === n).length; },
  add(n) { n = this.clean(n); const t = this.list(); if (t.includes(n)) throw new Error("มีประเภทชื่อนี้อยู่แล้ว"); t.push(n); Auth.s("ls_types", t); },
  rename(old, nw) {
    nw = this.clean(nw); const t = this.list(), i = t.indexOf(old); if (i < 0) throw new Error("ไม่พบประเภท"); if (nw !== old && t.includes(nw)) throw new Error("มีประเภทชื่อนี้อยู่แล้ว");
    t[i] = nw; Auth.s("ls_types", t); const it = Stock.all(); it.forEach(x => { if (x.type === old) x.type = nw; }); Stock.saveItems(it);
  },
  remove(n) { const c = this.usage(n); if (c) throw new Error(`ประเภทนี้ยังมี ${c} รายการ กรุณาย้ายรายการไปประเภทอื่นก่อน`); Auth.s("ls_types", this.list().filter(x => x !== n)); }
};

/* =========================================================
   สต็อกแบบ 1 ชิ้น = 1 บาร์โค้ด
   ls_items : รายการพัสดุ {code,name,unit,loc}
   ls_units : รายชิ้น {bc,code,importAt,expiry,status:"in|issued|disposed",by,batch,
                       issuedAt,reqId,ward,to,issuedBy, disposedAt,disposedBy,reason}
   ========================================================= */
const Stock = {
  all() { return Auth.g("ls_items", []); }, items() { return this.all().filter(i => !i.deleted); }, saveItems(a) { Auth.s("ls_items", a); },
  units() { return Auth.g("ls_units", []); }, saveUnits(a) { Auth.s("ls_units", a); },
  today() { const d = new Date(), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; },
  expired(u) { return !!u.expiry && u.expiry < this.today(); },
  item(code) { return this.all().find(i => i.code === code); },
  find(bc) { bc = String(bc || "").trim().toUpperCase(); return this.units().find(u => u.bc === bc); },
  inStock(code) { return this.units().filter(u => u.code === code && u.status === "in"); },
  usableUnits(code) { return this.inStock(code).filter(u => !this.expired(u)); },
  expiredUnits(code) { return this.inStock(code).filter(u => this.expired(u)); },
  usable(code) { return this.usableUnits(code).length; },
  /* ใกล้หมดอายุก่อน (FEFO) – ชิ้นไม่มีวันหมดอายุไว้ท้ายสุด */
  fefo(code) { return this.usableUnits(code).sort((a, b) => (a.expiry || "9999").localeCompare(b.expiry || "9999") || a.bc.localeCompare(b.bc)); },
  nextCode() { const n = this.all().map(i => parseInt(String(i.code).replace(/\D/g, ""), 10) || 0); return "SUP-" + String(Math.max(0, ...n) + 1).padStart(3, "0"); },
  /* วันแจ้งเตือนก่อนหมดอายุของแต่ละรายการ (ค่าเริ่มต้น 30 วัน · 0 = ไม่แจ้งเตือน) */
  expDays(i) { return i && i.expDays != null ? i.expDays : 30; },
  /* รายการแจ้งเตือน: ของหมดอายุ · ใกล้หมดอายุ (ตามวันที่ตั้งของแต่ละรายการ) · จำนวนเหลือน้อย (ตามขั้นต่ำของแต่ละรายการ) */
  alerts() {
    const out = [], today = new Date(this.today() + "T00:00:00");
    this.items().forEach(i => {
      const expN = this.expiredUnits(i.code).length, usable = this.usable(i.code), ed = this.expDays(i);
      if (expN) out.push({kind: "exp", code: i.code, name: i.name, text: `หมดอายุแล้ว ${expN} ${i.unit}`});
      if (ed > 0) this.lots(i.code).forEach(l => {
        const n = l.inStock.filter(u => !this.expired(u)).length; if (!n || !l.expiry) return;
        const d = Math.round((new Date(l.expiry + "T00:00:00") - today) / 864e5);
        if (d >= 0 && d <= ed) out.push({kind: "near", code: i.code, name: i.name, text: `Lot ${l.lot || "-"} ใกล้หมดอายุ อีก ${d} วัน (${n} ${i.unit})`, days: d});
      });
      if (i.min > 0 && usable <= i.min) out.push({kind: "low", code: i.code, name: i.name, text: `เหลือ ${usable} ${i.unit} (ขั้นต่ำ ${i.min})`});
    });
    return out;
  },
  addItem({name, unit, loc, dept, type, note, min, expDays}) {
    name = String(name || "").trim(); unit = String(unit || "").trim();
    if (!name) throw new Error("กรอกชื่อพัสดุ"); if (!unit) throw new Error("กรอกหน่วยนับ (เช่น กล่อง, ขวด, ห่อ)");
    const items = this.all(); if (items.find(i => !i.deleted && i.name === name)) throw new Error("มีรายการชื่อนี้อยู่แล้ว ให้เลือก \"รายการเดิม\" แทน");
    const it = {code: this.nextCode(), name, unit, loc: String(loc || "").trim(), dept: String(dept || ""), type: String(type || "").trim(), note: String(note || "").trim(), min: Math.max(0, parseInt(min, 10) || 0), expDays: expDays === undefined || expDays === "" ? 30 : Math.max(0, parseInt(expDays, 10) || 0)}; items.push(it); this.saveItems(items); return it;
  },
  updateItem(code, {name, unit, loc, dept, type, note, min, expDays}) {
    const items = this.all(), it = items.find(i => i.code === code); if (!it) throw new Error("ไม่พบรายการ");
    name = String(name || "").trim(); unit = String(unit || "").trim(); if (!name || !unit) throw new Error("ชื่อและหน่วยนับห้ามว่าง");
    if (items.find(i => i.code !== code && !i.deleted && i.name === name)) throw new Error("มีรายการชื่อนี้อยู่แล้ว");
    Object.assign(it, {name, unit, loc: String(loc || "").trim()}); if (dept !== undefined) it.dept = String(dept || ""); if (type !== undefined) it.type = String(type || "").trim(); if (note !== undefined) it.note = String(note || "").trim(); if (min !== undefined) it.min = Math.max(0, parseInt(min, 10) || 0); if (expDays !== undefined) it.expDays = Math.max(0, parseInt(expDays, 10) || 0); this.saveItems(items);
  },
  /* ลบรายการ: ซ่อนจากรายการและตัดจำหน่ายชิ้นที่ยังเหลือ แต่เก็บประวัติการจ่ายไว้เพื่อสืบย้อนหลัง */
  deleteItem(code, by) {
    const items = this.all(), it = items.find(i => i.code === code); if (!it) throw new Error("ไม่พบรายการ");
    const us = this.units(), t = new Date().toISOString(); us.forEach(u => { if (u.code === code && u.status === "in") Object.assign(u, {status: "disposed", disposedAt: t, disposedBy: by || "", reason: "ลบรายการ"}); });
    it.deleted = true; it.deletedAt = t; this.saveUnits(us); this.saveItems(items);
  },
  /* ตรวจและจัดรูปข้อมูลการนำเข้า/แก้ไขล็อต */
  clean({lot, price, expiry}) {
    lot = String(lot || "").trim(); if (lot.length > 40) throw new Error("เลข Lot ยาวเกินไป (ไม่เกิน 40 ตัวอักษร)");
    let pr = null; if (price !== "" && price != null) { pr = Number(price); if (!isFinite(pr) || pr < 0) throw new Error("ราคาต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป"); pr = Math.round(pr * 100) / 100; }
    expiry = String(expiry || ""); if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) throw new Error("วันหมดอายุไม่ถูกต้อง");
    return {lot, price: pr, expiry};
  },
  /* ล็อต = การนำเข้า 1 ครั้ง (batch) : คืนรายการล็อตของพัสดุ ใหม่สุดก่อน */
  lots(code) {
    const g = {}; this.units().filter(u => u.code === code).forEach(u => { const k = u.batch || "-"; (g[k] = g[k] || []).push(u); });
    return Object.keys(g).map(k => { const us = g[k], f = us[0]; return {batch: k, lot: f.lot || "", importAt: f.importAt, expiry: f.expiry || "", price: f.price == null ? null : f.price, units: us, inStock: us.filter(u => u.status === "in")}; })
      .sort((a, b) => String(b.importAt).localeCompare(String(a.importAt)));
  },
  /* นำเข้า: สร้างบาร์โค้ดใหม่ไม่ซ้ำให้ทุกชิ้น (LS + เลข 8 หลักรันต่อเนื่อง) */
  receive({code, qty, expiry, by, lot, price}) {
    if (!this.item(code)) throw new Error("ไม่พบรายการพัสดุ");
    qty = parseInt(qty, 10); if (!(qty >= 1 && qty <= 500)) throw new Error("จำนวนนำเข้าต้องอยู่ระหว่าง 1–500 ต่อครั้ง");
    const c = this.clean({lot, price, expiry});
    let seq = Auth.g("ls_seq", 0), at = new Date().toISOString(), batch = "IN-" + at.slice(0, 10).replace(/-/g, "") + "-" + (seq + 1);
    const us = this.units(), added = [];
    for (let i = 0; i < qty; i++) { seq++; const u = {bc: "LS" + String(seq).padStart(8, "0"), code, importAt: at, expiry: c.expiry, status: "in", by: by || "", batch, lot: c.lot, price: c.price}; us.push(u); added.push(u); }
    this.saveUnits(us); Auth.s("ls_seq", seq); return added;
  },
  /* แก้ไขล็อต: เลข Lot / วันที่เพิ่ม / วันหมดอายุ / ราคา (ทั้งล็อต) และจำนวนคงเหลือ
     เพิ่มจำนวน = สร้างบาร์โค้ดใหม่ · ลดจำนวน = ตัดจำหน่ายชิ้นท้ายล็อตที่ยังไม่จ่าย */
  updateBatch(batch, {lot, importDate, expiry, price, qty, by}) {
    const us = this.units(), mine = us.filter(u => (u.batch || "-") === batch); if (!mine.length) throw new Error("ไม่พบล็อต");
    const c = this.clean({lot, price, expiry});
    if (importDate && !/^\d{4}-\d{2}-\d{2}$/.test(importDate)) throw new Error("วันที่เพิ่มไม่ถูกต้อง");
    const at = importDate ? new Date(importDate + "T12:00:00").toISOString() : mine[0].importAt;
    const q = parseInt(qty, 10); if (!(q >= 0 && q <= 5000)) throw new Error("จำนวนต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป");
    mine.forEach(u => { u.lot = c.lot; u.importAt = at; u.expiry = c.expiry; u.price = c.price; });
    const inS = mine.filter(u => u.status === "in"), added = [], t = new Date().toISOString();
    if (q > inS.length) {
      if (q - inS.length > 500) throw new Error("เพิ่มได้ไม่เกิน 500 ชิ้นต่อครั้ง");
      let seq = Auth.g("ls_seq", 0); for (let i = inS.length; i < q; i++) { seq++; const u = {bc: "LS" + String(seq).padStart(8, "0"), code: mine[0].code, importAt: at, expiry: c.expiry, status: "in", by: by || "", batch: mine[0].batch, lot: c.lot, price: c.price}; us.push(u); added.push(u.bc); }
      Auth.s("ls_seq", seq);
    } else if (q < inS.length) {
      inS.sort((a, b) => b.bc.localeCompare(a.bc)).slice(0, inS.length - q).forEach(u => Object.assign(u, {status: "disposed", disposedAt: t, disposedBy: by || "", reason: "ปรับลดจำนวน"}));
    }
    this.saveUnits(us); return {added};
  },
  migrate() {   /* ย้ายสต็อกแบบเก่า (ตามจำนวน) เป็นรายชิ้น */
    if (localStorage.getItem("ls_items") !== null || localStorage.getItem("ls_units") !== null) return;
    const old = Auth.g("ls_stock", null); if (!old) return;
    let seq = Auth.g("ls_seq", 0); const at = new Date().toISOString(), units = [];
    const items = old.map(o => ({code: o.code, name: o.name, unit: String(o.unit || "หน่วย").split(" ")[0], loc: o.loc || ""}));
    old.forEach(o => { for (let i = 0; i < (parseInt(o.qty, 10) || 0); i++) { seq++; units.push({bc: "LS" + String(seq).padStart(8, "0"), code: o.code, importAt: at, expiry: "", status: "in", by: "ย้ายจากระบบเดิม", batch: "MIGRATE", lot: "", price: null}); } });
    this.saveItems(items); this.saveUnits(units); Auth.s("ls_seq", seq);
  }
};
try { Stock.migrate(); } catch {}

/* =========================================================
   บาร์โค้ด Code 128 (ชุดอักขระ B) + ฉลากสำหรับพิมพ์ด้วย Xprinter
   ========================================================= */
/* รายการเลือกเบิก (ติ๊กเลือก) แยกตามแผนก มีหมุดรายการเบิกประจำของแต่ละบัญชีไว้บนสุด
   sel = [{code,name,unit,qty}] · fn = ชื่อฟังก์ชัน onclick {tog(code,on), qty(code,delta), pin(code)} */
const Pick = {
  favs(uid) { return Auth.g("ls_fav_" + uid, []); },
  togFav(uid, code) { const f = this.favs(uid), i = f.indexOf(code); i < 0 ? f.push(code) : f.splice(i, 1); Auth.s("ls_fav_" + uid, f); },
  html({sel, q, uid, fn}) {
    const E = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c])), ql = String(q || "").trim().toLowerCase(), fav = this.favs(uid);
    const cat = Stock.items().map(i => ({...i, n: Stock.usable(i.code)})).filter(i => i.n > 0 || sel.find(s => s.code === i.code)).filter(i => !ql || (i.name + i.code).toLowerCase().includes(ql));
    const row = i => { const s = sel.find(x => x.code === i.code), pin = fav.includes(i.code);
      return `<div class="item"><input type="checkbox" style="width:24px;height:24px;flex:none;margin:0" ${s ? "checked" : ""} onchange="${fn.tog}('${i.code}',this.checked)" aria-label="เลือก ${E(i.name)}">
      <div class="nm">${E(i.name)}<small>เหลือ ${i.n} ${E(i.unit)}</small></div>
      ${s ? `<div class="qty"><button aria-label="ลด" onclick="${fn.qty}('${i.code}',-1)">−</button><span>${s.qty}</span><button aria-label="เพิ่ม" onclick="${fn.qty}('${i.code}',1)">+</button></div><small style="margin-left:2px">${E(i.unit)}</small>` : ""}
      <button class="chip ${pin ? "on" : ""}" aria-label="ปักหมุดรายการเบิกประจำ" title="ปักหมุดเป็นรายการเบิกประจำ" onclick="${fn.pin}('${i.code}')">📌</button></div>`; };
    const head = t => `<div style="font-weight:700;font-size:13px;margin:14px 0 2px;color:var(--mute)">${t}</div>`;
    const pinned = cat.filter(i => fav.includes(i.code)), rest = cat.filter(i => !fav.includes(i.code));
    return (pinned.length ? head("📌 รายการที่เบิกประจำ") + pinned.map(row).join("") : "") + Depts.groups(rest).map(g => head(E(Depts.label(g.dept))) + g.items.map(row).join("")).join("") || '<div class="empty">ไม่พบรายการที่มีของพร้อมเบิก</div>';
  }
};

/* รายชื่อผู้จ่าย/แอดมิน (ใช้ล็อกอินร่วมกันได้) : แต่ละชื่อมีลายเซ็นของตัวเอง ไม่ผูกกับบัญชีล็อกอิน */
const Payers = {
  list() { let p = Auth.g("ls_payers", null); if (!p) { p = Auth.users().filter(u => u.role === "admin" && u.active).map(u => ({id: "P" + u.id, name: u.name, sig: u.sig || ""})); Auth.s("ls_payers", p); } return p; },
  save(p) { Auth.s("ls_payers", p); },
  add(name) { name = String(name || "").trim().replace(/\s+/g, " "); if (!name) throw new Error("กรอกชื่อ-นามสกุล"); const p = this.list(); if (p.find(x => x.name === name)) throw new Error("มีชื่อนี้อยู่แล้ว"); p.push({id: "P" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, sig: ""}); this.save(p); },
  rename(id, name) { name = String(name || "").trim().replace(/\s+/g, " "); if (!name) throw new Error("กรอกชื่อ-นามสกุล"); const p = this.list(), x = p.find(k => k.id === id); if (!x) throw new Error("ไม่พบรายชื่อ"); if (p.find(k => k.id !== id && k.name === name)) throw new Error("มีชื่อนี้อยู่แล้ว"); x.name = name; this.save(p); },
  remove(id) { this.save(this.list().filter(k => k.id !== id)); },
  setSig(id, url) { const p = this.list(), x = p.find(k => k.id === id); if (!x) throw new Error("ไม่พบรายชื่อ"); x.sig = url || ""; this.save(p); },
  last() { return Auth.g("ls_lastpayer", ""); }, setLast(id) { Auth.s("ls_lastpayer", id); }
};

const Barcode = {
  /* ลำดับค่า Code 128 (สลับ B/C อัตโนมัติเพื่อให้ตัวเลขยาวแน่นขึ้น) ยังไม่รวม checksum/stop */
  values(text) {
    const t = String(text), d = k => k < t.length && t[k] >= "0" && t[k] <= "9", ch = k => { const c = t.charCodeAt(k); if (c < 32 || c > 126) throw new Error("บาร์โค้ดรองรับเฉพาะตัวอักษร ASCII"); return c - 32; };
    let i = 0, mode = "B", run0 = 0; while (d(run0)) run0++;
    const v = []; if (run0 >= 4 && run0 % 2 === 0) { v.push(105); mode = "C"; } else v.push(104);
    while (i < t.length) {
      if (mode === "B") { let run = 0; while (d(i + run)) run++; if (run >= 4) { if (run % 2) { v.push(ch(i)); i++; } v.push(99); mode = "C"; } else { v.push(ch(i)); i++; } }
      else if (d(i) && d(i + 1)) { v.push(+(t[i] + t[i + 1])); i += 2; } else { v.push(100); mode = "B"; }
    }
    return v;
  },
  widths(text) { const v = this.values(text); let sum = v[0]; for (let i = 1; i < v.length; i++) sum += v[i] * i; v.push(sum % 103, 106); const w = []; for (const val of v) for (const c of C128[val]) w.push(+c); return w; },
  /* รูป PNG ของบาร์โค้ด (ใช้ในไฟล์ Word) – คืนค่า {bytes, w, h} */
  png(text, mw = 4, h = 150, rot = false) {
    const w = this.widths(text), mods = w.reduce((a, b) => a + b, 0) + 20; let cv = document.createElement("canvas"); cv.width = mods * mw; cv.height = h;
    const c = cv.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, cv.width, h); c.fillStyle = "#000"; let x = 10;
    w.forEach((u, i) => { if (i % 2 === 0) c.fillRect(x * mw, 0, u * mw, h); x += u; });
    if (rot) { const r = document.createElement("canvas"); r.width = cv.height; r.height = cv.width; const rc = r.getContext("2d"); rc.translate(r.width, 0); rc.rotate(Math.PI / 2); rc.drawImage(cv, 0, 0); cv = r; }
    const bin = atob(cv.toDataURL("image/png").split(",")[1]), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return {bytes, w: cv.width, h: cv.height};
  },
  svg(text, h = 40) {
    const v = this.values(text); let sum = v[0]; for (let i = 1; i < v.length; i++) sum += v[i] * i; v.push(sum % 103, 106);
    let x = 10, r = ""; for (const val of v) { const p = C128[val]; for (let i = 0; i < p.length; i++) { const w = +p[i]; if (i % 2 === 0) r += `<rect x="${x}" y="0" width="${w}" height="${h}"/>`; x += w; } }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x + 10} ${h}" preserveAspectRatio="none" shape-rendering="crispEdges" fill="#000" style="width:100%;height:100%;display:block">${r}</svg>`;
  }
};
/* ตัวสร้างไฟล์ ZIP แบบไม่บีบอัด (ไม่พึ่งไลบรารีภายนอก) ใช้ประกอบไฟล์ .docx */
const Zip = {
  t: null,
  crc(b) { if (!this.t) { this.t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; this.t[n] = c >>> 0; } } let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = this.t[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; },
  build(files) {
    const enc = new TextEncoder(), d = new Date(), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const parts = [], cen = []; let off = 0;
    for (const f of files) {
      const nm = enc.encode(f.name), data = typeof f.data === "string" ? enc.encode(f.data) : f.data, crc = this.crc(data);
      const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nm.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), nm, data);
      const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
      cen.push(new Uint8Array(ch.buffer), nm); off += 30 + nm.length + data.length;
    }
    const cs = cen.reduce((a, b) => a + b.length, 0), end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cs, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...cen, new Uint8Array(end.buffer)], {type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
  }
};
const Labels = {
  size() { return Auth.g("ls_label4", {w: 55.1, h: 26}); },
  setSize(w, h) { w = Math.min(150, Math.max(20, +w || 55.1)); h = Math.min(120, Math.max(15, +h || 26)); Auth.s("ls_label4", {w, h}); return {w, h}; },
  d(s) { return s ? new Date(s.length === 10 ? s + "T00:00:00" : s).toLocaleDateString("th-TH", {day: "2-digit", month: "2-digit", year: "2-digit"}) : "-"; },
  one(u, it, w, h) {
    const E = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
    return `<div class="lb" style="width:${w}mm;height:${h}mm;box-sizing:border-box;padding:3mm;overflow:hidden;background:#fff;color:#000;font-family:'Noto Sans Thai',Tahoma,sans-serif;display:flex;flex-direction:column;justify-content:space-between;page-break-after:always;break-after:page">
      <div style="font-size:8pt;font-weight:700;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${E(it ? it.name : u.code)}</div>
      <div style="height:${Math.round(h * 0.32)}mm">${Barcode.svg(u.bc, 40)}</div>
      <div style="text-align:center;font-family:monospace;font-size:8pt;letter-spacing:.5px">${E(u.bc)}</div>
      <div style="font-size:6.5pt;display:flex;justify-content:space-between"><span>นำเข้า ${this.d(u.importAt)}${u.lot ? " · Lot " + E(u.lot) : ""}</span><span>หมดอายุ ${this.d(u.expiry)}</span></div></div>`;
  },
  html(bcs, w, h) { const us = Stock.units(), its = Stock.all(); return bcs.map(bc => { const u = us.find(x => x.bc === bc); return u ? this.one(u, its.find(i => i.code === u.code), w, h) : ""; }).join(""); },
  /* ไฟล์ Word: หน้ากระดาษ 55.1 × 26.0 มม. ตรงกับสต็อก USER ของ Xprinter XP-350B (3124 × 1474 twips) ตั้งแนวหน้าเป็น "แนวตั้ง" (ไม่ใส่ orient=landscape) ให้ตรงกับไดรเวอร์ จะได้ไม่ถูกหมุน ระยะขอบ 0.3 ซม. ทุกด้าน เย็บกระดาษ 0 1 หน้า = 1 บาร์โค้ด เรียงรันตามลำดับที่ส่งเข้ามา */
  docx(bcs) {
    const E = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"}[c]));
    const us = Stock.units(), its = Stock.all(), media = [], rels = []; let n = 0, pages = "";
    const run = (t, o = {}) => `<w:r><w:rPr><w:rFonts w:ascii="${o.f || "Tahoma"}" w:hAnsi="${o.f || "Tahoma"}" w:cs="${o.f || "Tahoma"}"/>${o.b ? "<w:b/><w:bCs/>" : ""}<w:sz w:val="${o.z || 12}"/><w:szCs w:val="${o.z || 12}"/></w:rPr><w:t xml:space="preserve">${E(t)}</w:t></w:r>`;
    const para = (inner, line, pb = false) => `<w:p><w:pPr>${pb ? "<w:pageBreakBefore/>" : ""}<w:spacing w:before="0" w:after="0" w:line="${line}" w:lineRule="exact"/><w:jc w:val="center"/></w:pPr>${inner}</w:p>`;
    for (const bc of bcs) {
      const u = us.find(x => x.bc === bc); if (!u) continue; const it = its.find(i => i.code === u.code); n++;
      const img = Barcode.png(u.bc), cx = 1656000, cy = 324000, rid = "rIdImg" + n;
      media.push({name: `word/media/img${n}.png`, data: img.bytes}); rels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/img${n}.png"/>`);
      const pic = `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="barcode ${n}"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="img${n}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
      let nm = it ? it.name : u.code; if (nm.length > 34) nm = nm.slice(0, 33) + "…";
      pages += para(run(nm, {b: 1, z: 13}), 200, n > 1) + para(pic, 540) + para(run(u.bc, {f: "Courier New", b: 1, z: 14}), 200) + para(run(`นำเข้า ${this.d(u.importAt)}${u.lot ? "  Lot " + u.lot : ""}  หมดอายุ ${this.d(u.expiry)}`, {z: 9}), 150);
    }
    if (!n) throw new Error("ไม่มีบาร์โค้ดให้สร้างไฟล์");
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${pages}<w:sectPr><w:pgSz w:w="3124" w:h="1474"/><w:pgMar w:top="170" w:right="170" w:bottom="170" w:left="170" w:header="737" w:footer="737" w:gutter="0"/><w:vAlign w:val="center"/></w:sectPr></w:body></w:document>`;
    const files = [
      {name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`},
      {name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`},
      {name: "word/document.xml", data: doc},
      {name: "word/_rels/document.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`},
      ...media];
    return Zip.build(files);
  },
  word(bcs, filename) {
    const blob = this.docx(bcs), a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename || "barcode-labels.docx";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  },
  /* พิมพ์ผ่านไดรเวอร์เครื่องพิมพ์ (เลือก Xprinter ในหน้าต่างพิมพ์) หนึ่งสติกเกอร์ต่อหนึ่งหน้า */
  print(bcs) {
    const {w, h} = this.size(), win = window.open("", "_blank");
    if (!win) return alert("เบราว์เซอร์บล็อกหน้าต่างใหม่ กรุณาอนุญาต Pop-up แล้วลองอีกครั้ง");
    win.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>บาร์โค้ด ${bcs.length} ดวง</title><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;700&display=swap" rel="stylesheet"><style>@page{size:${w}mm ${h}mm;margin:0}html,body{margin:0;padding:0}.lb:last-child{page-break-after:auto;break-after:auto}</style></head><body>${this.html(bcs, w, h)}</body></html>`);
    win.document.close(); setTimeout(() => { try { win.focus(); win.print(); } catch {} }, 900);
  }
};
