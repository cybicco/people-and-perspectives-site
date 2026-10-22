// Shared helpers for dashboards and public forms (no secrets here).
window.D={
  $:s=>document.querySelector(s),
  esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  api:(p,b)=>fetch('/api'+p,b?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}:{}).then(r=>r.json().then(j=>({ok:r.ok,s:r.status,j})).catch(()=>({ok:false,s:r.status,j:{error:'Server error'}}))),
  // Resize an image File to max px and return {name,mime,data(base64)}; PDFs pass through (max ~1MB).
  file:(f,max=1400,q=.82)=>new Promise((res,rej)=>{
    if(f.type==='application/pdf'){if(f.size>1000000)return rej(new Error('PDF is over 1 MB. Please upload a smaller file or a photo of the certificate.'));const r=new FileReader();r.onload=()=>res({name:f.name,mime:f.type,data:String(r.result).split(',')[1]});r.onerror=()=>rej(new Error('Could not read file'));return r.readAsDataURL(f)}
    if(!/^image\//.test(f.type))return rej(new Error('Use a JPG, PNG, WebP or PDF file.'));
    const img=new Image(),u=URL.createObjectURL(f);img.onload=()=>{const k=Math.min(1,max/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(u);const d=c.toDataURL('image/jpeg',q);res({name:f.name.replace(/\.\w+$/,'')+'.jpg',mime:'image/jpeg',data:d.split(',')[1]})};img.onerror=()=>rej(new Error('Could not read image'));img.src=u}),
  stars:n=>'★'.repeat(n)+'☆'.repeat(5-n),
  pwBox:(e,pw,extra='')=>`<div class="card" style="margin-top:12px;border-color:var(--y)"><b>Temporary password for ${D.esc(e)}</b><br><span class="an" style="font-size:26px;color:var(--y);letter-spacing:.06em">${D.esc(pw)}</span><br><span class="muted">Shown once. Share it securely; they must change it at first sign-in. ${extra}</span></div>`,
  changePw(done){const {$,api}=D;$('#app').innerHTML=`<div class="card login"><h1 style="margin:0 0 6px">Set a new password</h1><p class="muted">Choose a new password (at least 10 characters) to continue.</p><label>Temporary password</label><input id="c" type="password" autocomplete="current-password"><label>New password</label><input id="n" type="password" autocomplete="new-password"><div class="err" id="er"></div><button class="btn" id="go" style="width:100%">Save password</button></div>`;$('#go').onclick=async()=>{const r=await api('/password',{current:$('#c').value,new:$('#n').value});r.ok?done():$('#er').textContent=r.j.error}},
  // Generic dashboard host: role, title, render(me)
  start(role,title,render){const {$,api,esc}=D;
    const login=()=>{$('#app').innerHTML=`<div class="card login"><h1 style="margin:0 0 6px">${esc(title)}</h1><p class="muted">Sign in with the login we sent you.</p><label>Email</label><input id="e" type="email" autocomplete="username"><label>Password</label><input id="p" type="password" autocomplete="current-password"><div class="err" id="er"></div><button class="btn" id="go" style="width:100%">Sign in</button></div>`;
      const go=async()=>{const r=await api('/login',{email:$('#e').value,password:$('#p').value});if(r.ok){if(r.j.role!==role){await api('/logout',{});$('#er').textContent='This login is not for this page.';return}boot()}else $('#er').textContent=r.j.error};$('#go').onclick=go;$('#p').onkeydown=e=>{if(e.key==='Enter')go()}};
    const boot=async()=>{const r=await api('/me');if(!r.ok||r.j.role!==role)return login();$('#who').innerHTML=esc(r.j.email)+' · <a href="#" id="lo">Sign out</a>';$('#lo').onclick=async e=>{e.preventDefault();await api('/logout',{});location.reload()};r.j.must_change?D.changePw(boot):render(r.j)};boot()}
};
