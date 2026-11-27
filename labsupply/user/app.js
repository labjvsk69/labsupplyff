/* =========================================================
   LabSupply Front-end (ต้นแบบ)
   ---------------------------------------------------------
   ส่วน API ด้านล่าง (api) จำลองฝั่งเซิร์ฟเวอร์ด้วย localStorage
   เมื่อมี Backend จริง ให้แทนที่ฟังก์ชันใน api ด้วย fetch()
   โดยเฉพาะ "เวลารับของ" ต้องให้เซิร์ฟเวอร์เป็นผู้ประทับเวลา
   ========================================================= */
const HOSPITAL = "Sakaeo Rajanagarindra Psychiatric hospital";
const WARDS = {map: f => Wards.list().map(f)};   // รายชื่อ Ward จัดการที่หลังบ้าน
/* รายการพัสดุอ่านจากสต็อกหลังบ้าน (แสดงเฉพาะที่ยังมีของใช้ได้) */
const CATALOG = {
  filter: f => Stock.items().map(i => ({...i, avail: Stock.usable(i.code)})).filter(i => i.avail > 0).filter(f),
  find: f => Stock.items().map(i => ({...i, avail: Stock.usable(i.code)})).find(f)
};

const api = {
  _all(){try{return JSON.parse(localStorage.getItem("ls_reqs")||"[]")}catch{return []}},
  _save(a){try{localStorage.setItem("ls_reqs",JSON.stringify(a))}catch{}},
  serverNow(){return new Date().toISOString()}, // TODO: ให้ Backend ส่งเวลาจริงมา
  list(){return this._all().filter(r=>r.type!=="admin"&&me&&r.uid===me.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))},
  get(id){return this._all().find(r=>r.id===id)},
  create(d){
    const a=this._all(), now=new Date(), be=now.getFullYear()+543;
    const seq=String(a.length+1).padStart(3,"0");
    const id=`REQ-${String(be).slice(2)}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}-${seq}`;
    const r={...d,id,status:1,createdAt:this.serverNow(),times:{1:this.serverNow()},locked:false};
    a.push(r);this._save(a);return r;
  },
  setStatus(id,s){ // เรียกโดยฝั่งเจ้าหน้าที่จัดของ
    const a=this._all(),r=a.find(x=>x.id===id);
    if(!r||r.locked||s<=r.status)return r;
    r.status=s;r.times[s]=this.serverNow();this._save(a);return r;
  },
  confirmReceive(id,name,sig){
    const a=this._all(),r=a.find(x=>x.id===id);
    if(!r||r.status!==2||r.locked||r.receivedAt)return r;
    // ผู้รับเซ็นรับของก่อน (ยังไม่ล็อก) แล้วแอดมินเลือกชื่อ+เซ็นยืนยันการจ่าย ใบเบิกจึงปิดและล็อก
    r.receiver=name;r.receiverSig=sig;r.receiverUid=me&&me.id;r.receivedAt=this.serverNow();r.times.received=r.receivedAt;
    this._save(a);return r;
  }
};

/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fD=iso=>new Date(iso).toLocaleDateString("th-TH",{day:"numeric",month:"long",year:"numeric"});
const fT=iso=>new Date(iso).toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit",hour12:false})+" น.";
const fTs=iso=>new Date(iso).toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false})+" น.";
const fDT=iso=>fD(iso)+" · "+fT(iso);
const pad=n=>String(n).padStart(2,"0");
const today=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
const totalQty=items=>items.reduce((s,i)=>s+i.qty,0);

/* ---------- state ---------- */
let view="request", trackId=null;
let step=1;
let reqForm={name:"",ward:"",date:today(),time:"09:00",items:[],q:""};
let errors={};

function toast(title,msg){
  const t=document.createElement("div");t.className="toast";t.setAttribute("role","alert");
  t.innerHTML=`<b>${esc(title)}</b>${esc(msg)}`;document.body.appendChild(t);
  setTimeout(()=>t.remove(),5000);
}
function notify(r){
  toast("MEDSUPPLY · พร้อมรับของแล้ว",`ใบเบิก #${r.id} ${r.ward} พร้อมรับของได้ที่ชั้น 1`);
  try{ if("Notification" in window && Notification.permission==="granted")
    new Notification("พร้อมรับของแล้ว",{body:`ใบเบิก #${r.id} มารับได้ที่ชั้น 1`}); }catch{}
}

/* ---------- shell ---------- */
function header(){
  return `<header><div class="logo">+</div><div class="grow"><b>LabSupply</b><small>${HOSPITAL}</small></div>
  ${me?`<button class="chip" style="margin-right:6px" onclick="go('account')" title="บัญชีของฉัน">${esc(me.name.split(" ")[0])}</button>`:""}
  <button class="bell" aria-label="เปิดการแจ้งเตือน" onclick="askNotif()">🔔</button></header>`;
}
function nav(){
  const t=[["request","+","เบิกของ"],["track","◷","ติดตามสถานะ"],["history","▤","ประวัติการเบิก"]];
  $("#nav").innerHTML=t.map(([v,i,l])=>`<button class="${view===v?"on":""}" onclick="go('${v}')"><b>${i}</b>${l}</button>`).join("");
}
function go(v,id){
  view=v; if(id)trackId=id;
  if(v==="request"&&step===0){step=1}
  render(); window.scrollTo(0,0);
}
async function askNotif(){
  if(!("Notification" in window))return toast("แจ้งเตือน","เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน");
  const p=await Notification.requestPermission();
  toast("แจ้งเตือน",p==="granted"?"เปิดการแจ้งเตือนแล้ว จะเด้งเมื่อของพร้อมรับ":"ยังไม่ได้อนุญาตการแจ้งเตือน");
}

/* ---------- 1) เบิกของ (3 ขั้นตอน) ---------- */
function stepBar(){
  const n=["ข้อมูลการเบิก","รายการที่ต้องเบิก","สรุปและยืนยัน"];
  return `<div class="steps" aria-hidden="true">${[1,2,3].map(i=>`<i class="${i<=step?"on":""}"></i>`).join("")}</div>
  <div class="stepname">ขั้นตอนที่ ${step} จาก 3 · ${n[step-1]}</div>`;
}
function viewRequest(){
  let h=`<div class="kick">เบิกของเข้าวอร์ด</div><h1>เบิกของเข้าวอร์ด</h1><p class="sub">แจ้งเบิกง่าย ติดตามได้ ไม่ต้องรอเจ้าหน้าที่</p>`+stepBar();
  if(step===1){
    h+=`<div class="card"><h2>ข้อมูลการเบิก</h2>
    <label for="f-name">ชื่อ-นามสกุลผู้ขอเบิก *</label>
    <input id="f-name" value="${esc(reqForm.name)}" placeholder="ชื่อ-นามสกุลจริงของผู้ขอเบิก" autocomplete="off" oninput="reqForm.name=this.value">
    
    <div class="err">${errors.name||""}</div>
    <label for="f-ward">Ward / หน่วยงาน *</label>
    <input id="f-ward" value="${esc(me.ward||"")}" readonly>
    <div class="err">${errors.ward||""}</div>
    <div class="row"><div><label for="f-date">วันที่รับของ *</label><input id="f-date" type="date" min="${today()}" value="${reqForm.date}" onchange="reqForm.date=this.value"></div>
    <div><label for="f-time">เวลารับของ *</label><input id="f-time" type="time" value="${reqForm.time}" onchange="reqForm.time=this.value"></div></div>
    <div class="err">${errors.dt||""}</div>
    <div class="auto"><span>วันที่แจ้งเบิก</span><span>${fDT(new Date().toISOString())} (อัตโนมัติ)</span></div></div>
    <button class="btn" onclick="next1()">ถัดไป: เลือกรายการ</button>`;
  }
  if(step===2){
    h+=`<div class="card"><h2>รายการที่ต้องเบิก <span id="pcnt"></span></h2>
    <input id="f-q" type="search" placeholder="ค้นหาชื่อสินค้า" value="${esc(reqForm.q)}" oninput="reqForm.q=this.value;pickRefresh()">
    
    <div id="pick"></div><div class="err">${errors.items||""}</div>
    <div class="total"><span id="ptot"></span><span id="pqty"></span></div></div>
    <button class="btn" onclick="next2()">ถัดไป: ตรวจสอบสรุป</button>
    <button class="btn ghost" onclick="step=1;render()">ย้อนกลับ</button>`;
  }
  if(step===3){
    h+=`<div class="card"><h2>ข้อมูลการเบิก</h2>
    <div class="kv"><span>ผู้ขอเบิก</span><b>${esc(reqForm.name)}</b></div>
    <div class="kv"><span>Ward</span><b>${esc(reqForm.ward)}</b></div>
    <div class="kv"><span>นัดรับ</span><b>${fD(reqForm.date)} · ${reqForm.time} น.</b></div></div>
    <div class="card"><h2>รายการสินค้า <span>${reqForm.items.length} รายการ</span></h2>
    ${reqForm.items.map(i=>`<div class="kv"><span>${esc(i.name)}</span><b>${i.qty} ${esc(i.unit.split(" ")[0])}</b></div>`).join("")}
    <div class="total"><span>รวมทั้งหมด</span><span>${totalQty(reqForm.items)} หน่วย</span></div></div>
    
    <button class="btn" onclick="submitReq()">ส่งคำขอเบิก</button>
    <button class="btn ghost" onclick="step=2;render()">ย้อนกลับแก้ไข</button>`;
  }
  return h;
}
function pickRefresh(){
  const el=$("#pick"); if(!el)return;
  el.innerHTML=Pick.html({sel:reqForm.items,q:reqForm.q,uid:me.id,fn:{tog:"ptog",qty:"pqty",pin:"ppin"}});
  $("#pcnt").textContent=reqForm.items.length+" รายการ"; $("#ptot").textContent="รวม "+reqForm.items.length+" รายการ"; $("#pqty").textContent=totalQty(reqForm.items)+" หน่วย";
}
function ptog(code,on){
  if(on){const c=Stock.item(code); if(c&&!reqForm.items.find(i=>i.code===code))reqForm.items.push({code,name:c.name,unit:c.unit,qty:1});}
  else reqForm.items=reqForm.items.filter(i=>i.code!==code);
  errors.items="";pickRefresh();
}
function pqty(code,d){
  const i=reqForm.items.find(x=>x.code===code); if(!i)return; const av=Stock.usable(code);
  if(d>0&&i.qty>=av){toast("เกินจำนวนคงเหลือ","ขณะนี้เหลือ "+av+" "+i.unit);return}
  i.qty=Math.max(1,i.qty+d); pickRefresh();
}
function ppin(code){Pick.togFav(me.id,code);pickRefresh()}
function next1(){
  errors={};
  if(!reqForm.name.trim())errors.name="กรุณากรอกชื่อ-นามสกุล";
  if(!reqForm.ward)errors.ward="บัญชีนี้ยังไม่ได้กำหนด Ward กรุณาติดต่อแอดมิน";
  if(!reqForm.date||!reqForm.time)errors.dt="กรุณาระบุวันและเวลารับของ";
  if(Object.keys(errors).length)return render();
  step=2;render();
}
function next2(){
  if(!reqForm.items.length){errors.items="กรุณาเพิ่มอย่างน้อย 1 รายการ";return render()}
  errors={};step=3;render();
}
function submitReq(){
  const r=api.create({name:reqForm.name.trim(),ward:reqForm.ward,pickupDate:reqForm.date,pickupTime:reqForm.time,items:reqForm.items,uid:me.id,username:me.username});
  reqForm={name:me.name,ward:me.ward||"",date:today(),time:"09:00",items:[],q:""};step=1;
  toast("ส่งคำขอเบิกแล้ว",`เลขที่ใบเบิก #${r.id} เข้าคิวจัดของแล้ว`);
  go("track",r.id);
}

/* ---------- 2) ติดตามสถานะ ---------- */
function timeline(r){
  const L=[["กำลังจัดเตรียม","รอเจ้าหน้าที่จัดของ"],["พร้อมรับของแล้ว","รอรับของที่ชั้น 1 และเซ็นรับของ"],["จ่ายของเรียบร้อย",r.receivedAt?"รอเจ้าหน้าที่เซ็นยืนยันการจ่าย":"รอเจ้าหน้าที่ยืนยันการจ่าย"]];
  return `<ul class="tl">${L.map((l,i)=>{const n=i+1,done=r.status>n||(r.status===3&&n===3),now=r.status===n&&!done;
    return `<li class="${done?"done":now?"now":""}"><div class="dot">${done?"✓":n}</div><div><b>${l[0]}</b><small>${r.times[n]?fDT(r.times[n]):l[1]}</small></div></li>`}).join("")}</ul>`;
}
function detail(r,title="รายละเอียดใบเบิก"){
  return `<div class="card"><h2>${title}<span>${r.items.length} รายการ</span></h2>
  <div class="kv"><span>ผู้ขอเบิก</span><b>${esc(r.name)}</b></div><div class="kv"><span>Ward</span><b>${esc(r.ward)}</b></div>
  <div class="kv"><span>นัดรับ</span><b>${fD(r.pickupDate)} · ${r.pickupTime} น.</b></div><hr style="border:0;border-top:1px solid var(--line)">
  ${r.items.map(i=>`<div class="kv"><span>${esc(i.name)}</span><b>${i.qty} ${esc(i.unit.split(" ")[0])}</b></div>`).join("")}</div>`;
}
function viewTrack(){
  let r=trackId?api.get(trackId):null; if(!r||r.uid!==me.id)r=api.list().find(x=>x.status<3)||api.list()[0];
  if(!r)return `<div class="kick">ติดตามการเบิก</div><h1>ติดตามการเบิก</h1><div class="card empty">ยังไม่มีใบเบิก<br><button class="btn" onclick="go('request')">เริ่มเบิกของ</button></div>`;
  trackId=r.id;
  const S={1:["status","ขั้นตอนที่ 1 จาก 3 · ส่งคำขอสำเร็จ","กำลังจัดเตรียม","เจ้าหน้าที่ได้รับใบเบิกแล้ว เรากำลังจัดของให้ครบตามรายการ"],
           2:["status ready","ขั้นตอนที่ 2 จาก 3 · จัดเสร็จแล้ว","พร้อมรับของแล้ว",(r.receivedAt?"คุณเซ็นรับของแล้ว รอเจ้าหน้าที่เลือกชื่อและเซ็นยืนยันการจ่ายของ":"ไปรับของที่ชั้น 1 แล้วกดเซ็นรับของด้านล่าง จากนั้นเจ้าหน้าที่จะเซ็นยืนยันการจ่ายของ")],
           3:["status done","ขั้นตอนที่ 3 จาก 3 · เสร็จสมบูรณ์","รับของเรียบร้อย","บันทึกหลักฐานการรับของแล้ว ขอบคุณค่ะ"]}[r.status];
  let h=`<div class="kick">${r.status===3?"ใบรับของดิจิทัล":"ติดตามการเบิก"}</div><h1>${r.status===3?"รับของเรียบร้อย":"ติดตามการเบิก"}</h1>
  <div style="display:flex;justify-content:space-between"><span class="sub">ใบเบิก #${r.id}</span>${r.status<3?'<span class="live">อัปเดตสด</span>':""}</div>
  <div class="${S[0]}"><small>${S[1]}</small><h2>${S[2]}</h2><p>${S[3]}</p></div>
  <div class="card">${timeline(r)}</div>`;
  if(r.status===2&&r.receivedAt)h+=`<div class="card"><h2>รอเจ้าหน้าที่ยืนยันการจ่ายของ</h2><div class="kv"><span>ผู้รับของ (ลงชื่อ)</span><b>${esc(r.receiver)}</b></div><div class="kv"><span>เซ็นรับของเมื่อ</span><b>${fDT(r.receivedAt)}</b></div></div>`;
  if(r.status===2&&!r.receivedAt)h+=`<div class="card"><h2>เซ็นรับของ</h2>
    <label for="rc">ชื่อ-นามสกุลผู้รับของ *</label><input id="rc" placeholder="ชื่อผู้ที่มารับของจริง" autocomplete="off">
    ${Sig.html("sigR","ลายเซ็นผู้รับของ *")}
    <div class="err" id="rcerr"></div>
    <button class="btn" onclick="confirmRc('${r.id}')">เซ็นรับของ</button>
    </div>`;
  h+=detail(r);
  if(r.status===3)h+=`<div class="proof"><h3>✓ หลักฐานการรับของดิจิทัล</h3>
    ${r.payer?`<div class="kv"><span>ผู้จ่ายของ</span><b>${esc(r.payer)}</b></div><div class="kv"><span>เวลาจ่ายของ</span><b>${fDT(r.handedAt)}</b></div>`:""}
    <div class="kv"><span>ผู้ขอเบิก</span><b>${esc(r.name)}</b></div><div class="kv"><span>ผู้รับของ (ลงชื่อ)</span><b>${esc(r.receiver)}</b></div>
    <div class="kv"><span>วันที่รับ</span><b>${fD(r.receivedAt)}</b></div>
    <div class="kv"><span>เวลารับ</span><b>${fTs(r.receivedAt)}</b></div>
    <div class="sigs"><div><img alt="ลายเซ็นผู้จ่ายของ" src="${r.payerSig||""}"><small>ผู้จ่ายของ</small></div><div><img alt="ลายเซ็นผู้รับของ" src="${r.receiverSig||""}"><small>ผู้รับของ</small></div></div>
    <div class="stamp"><b>SERVER TIMESTAMP · ล็อกแล้ว</b>${r.handedAt||r.receivedAt}<br>ข้อมูลนี้ถูกบันทึกถาวร ไม่สามารถแก้ไขเวลาย้อนหลังได้</div></div>
    <button class="btn" onclick="dlForm('${r.id}')">ดาวน์โหลดฟอร์มใบเบิก (PDF)</button><button class="btn ghost" onclick="go('history')">ดูประวัติการเบิก</button>`;
  return h;
}
function dlForm(id){FormDoc.download(api.get(id))}
function confirmRc(id){
  const v=$("#rc").value.trim(); if(!v){$("#rcerr").textContent="กรุณากรอกชื่อ-นามสกุลผู้รับของ";return}
  if(!Sig.has($("#sigR"))){$("#rcerr").textContent="กรุณาเซ็นชื่อผู้รับของในกรอบ";return}
  api.confirmReceive(id,v,Sig.data($("#sigR")));render();window.scrollTo(0,0);
}

/* ---------- 3) ประวัติ ---------- */
function viewHistory(){
  const L=api.list(), name={1:"กำลังจัดเตรียม",2:"พร้อมรับของ",3:"รับของแล้ว"};
  return `<div class="kick">ประวัติ</div><h1>ประวัติการเบิก</h1><p class="sub">ใบเบิกทั้งหมดในเครื่องนี้</p>
  ${L.length?L.map(r=>`<div class="card list" onclick="go('track','${r.id}')" style="cursor:pointer"><h2>#${r.id}<span class="pill s${r.status}">${name[r.status]}</span></h2>
    <div class="kv"><span>${esc(r.ward)}</span><b>${r.items.length} รายการ · ${totalQty(r.items)} หน่วย</b></div>
    <div class="kv"><span>แจ้งเบิก</span><b>${fDT(r.createdAt)}</b></div>
    ${r.receivedAt?`<div class="kv"><span>รับโดย ${esc(r.receiver)}</span><b>${fDT(r.receivedAt)}</b></div>`:""}</div>`).join("")
  :`<div class="card empty">ยังไม่มีประวัติการเบิก</div>`}`;
}

/* ---------- render ---------- */
function render(){
  const nv=document.querySelector("nav");
  if(!me||me.mustChange){
    $("#app").innerHTML=header()+(me?viewAccount(true):viewLogin()); $("#nav").innerHTML=""; nv.style.display="none"; return;
  }
  nv.style.display="";
  $("#app").innerHTML=header()+(view==="request"?viewRequest():view==="track"?viewTrack():view==="account"?viewAccount(false):viewHistory());
  nav(); if(view==="request"&&step===2)pickRefresh(); Sig.initAll();
}
// อัปเดตสถานะแบบ "สด" (ในต้นแบบ: ตรวจทุก 3 วินาที / ของจริงใช้ WebSocket หรือ Firestore)
let lastStatus=null;
setInterval(()=>{
  if(!me||view!=="track"||!trackId)return;
  const r=api.get(trackId); if(!r)return;
  const key=r.status+"|"+(r.receivedAt||"")+"|"+(r.handedAt||"");
  if(lastStatus!==null&&key!==lastStatus){ if(r.status===2&&!r.receivedAt)notify(r); render(); }
  lastStatus=key;
},3000);

/* ---------- เข้าสู่ระบบ / บัญชี ---------- */
let me=null;
function applyMe(){ if(!me)return; reqForm.name=me.name; reqForm.ward=me.ward||""; }
function viewLogin(){ return `<div class="card empty">กำลังพาไปหน้าเข้าสู่ระบบ…</div>`; }
function viewAccount(forced){
  return `<div class="kick">บัญชีของฉัน</div><h1>${forced?"ตั้งรหัสผ่านใหม่":"บัญชีของฉัน"}</h1>
  <div class="card"><div class="kv"><span>ชื่อ</span><b>${esc(me.name)}</b></div><div class="kv"><span>ชื่อผู้ใช้</span><b>${esc(me.username)}</b></div><div class="kv"><span>Ward</span><b>${esc(me.ward||"-")}</b></div>
  ${forced?`<p class="note" style="text-align:left">กรุณาตั้งรหัสผ่านใหม่ก่อนใช้งานครั้งแรก</p>`:""}</div>
  <div class="card"><h2>เปลี่ยนรหัสผ่าน</h2>
  <label for="p0">รหัสผ่านเดิม</label><input id="p0" type="password" autocomplete="current-password">
  <label for="p1">รหัสผ่านใหม่ (อย่างน้อย 4 ตัวอักษร)</label><input id="p1" type="password" autocomplete="new-password">
  <label for="p2">ยืนยันรหัสผ่านใหม่</label><input id="p2" type="password" autocomplete="new-password">
  <div class="err" id="perr"></div><button class="btn" onclick="doChange()">บันทึกรหัสผ่านใหม่</button></div>
  <button class="btn ghost" onclick="doLogout()">ออกจากระบบ</button>`;
}
async function doChange(){
  try{ if($("#p1").value!==$("#p2").value)throw new Error("รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน");
    await Auth.change(me.id,$("#p0").value,$("#p1").value); me=Auth.users().find(x=>x.id===me.id); toast("สำเร็จ","เปลี่ยนรหัสผ่านแล้ว"); view="request"; render(); }
  catch(e){ $("#perr").textContent=e.message; }
}
function doLogout(){ Auth.end("main"); location.href="../index.html"; }
function missingLib(){document.getElementById("app").innerHTML='<div style="padding:24px;font-family:sans-serif"><h2>เปิดระบบไม่ได้: ไม่พบไฟล์ shared.js</h2><p>ไฟล์ <b>shared.js</b> ต้องอยู่ที่โฟลเดอร์หลัก (นอกโฟลเดอร์ user และ admin) และต้องรักษาโครงสร้างโฟลเดอร์ตามไฟล์ zip ห้ามนำไฟล์มารวมในโฟลเดอร์เดียว</p></div>'}
(async()=>{ if(typeof Auth==="undefined")return missingLib(); try{await Auth.ensure()}catch{} const u=Auth.current("main",["admin","staff","ward"]); if(!u){location.replace("../index.html");return} if(u.role!=="ward"){location.replace("../admin/index.html");return} me=u; applyMe(); render(); })();
