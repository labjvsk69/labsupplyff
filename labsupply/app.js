/* LabSupply – หน้าเข้าสู่ระบบ (หน้าเดียวสำหรับทุกบัญชี)
   ผู้ดูแลระบบ -> admin/index.html (หลังบ้าน) | ผู้ใช้ -> user/index.html (หน้าบ้าน) */
const $ = s => document.querySelector(s);
const HOSPITAL = "Sakaeo Rajanagarindra Psychiatric hospital";
const dest = u => u.role === "ward" ? "user/index.html" : "admin/index.html";

function render() {
  $("#app").innerHTML = `<header><div class="logo">+</div><div class="grow"><b>LabSupply</b><small>${HOSPITAL}</small></div></header>
  <div class="kick">เข้าสู่ระบบ</div><h1>เข้าสู่ระบบ LabSupply</h1><p class="sub">ผู้ดูแลระบบและผู้ใช้เข้าใช้งานจากหน้านี้</p>
  <div class="card"><label for="lu">ชื่อผู้ใช้</label><input id="lu" autocomplete="username" autocapitalize="none" autofocus>
  <label for="lp">รหัสผ่าน</label><input id="lp" type="password" autocomplete="current-password" onkeydown="if(event.key==='Enter')doLogin()">
  <div class="err" id="lerr" role="alert"></div><button class="btn" id="lb" onclick="doLogin()">เข้าสู่ระบบ</button>
  <p class="note">ยังไม่มีบัญชี? ติดต่อผู้ดูแลระบบเพื่อขอสร้างบัญชี</p></div>`;
}
async function doLogin() {
  const b = $("#lb"); b.disabled = true; $("#lerr").textContent = "";
  try {
    const u = await Auth.login($("#lu").value, $("#lp").value, ["admin", "staff", "ward"]);
    Auth.start("main", u); location.href = dest(u);
  } catch (e) { $("#lerr").textContent = e.message; b.disabled = false; }
}
(async () => {
  if (typeof Auth === "undefined") { $("#app").innerHTML = '<div style="padding:24px;font-family:sans-serif"><h2>เปิดระบบไม่ได้: ไม่พบไฟล์ shared.js</h2><p>ไฟล์ shared.js ต้องอยู่โฟลเดอร์เดียวกับ index.html นี้ และต้องรักษาโครงสร้างโฟลเดอร์ตามไฟล์ zip</p></div>'; return; }
  try { await Auth.ensure(); } catch {}
  const u = Auth.current("main", ["admin", "staff", "ward"]);
  if (u) { location.replace(dest(u)); return; }
  render();
})();
