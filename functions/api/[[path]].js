// Single API router. All times are IST (Asia/Kolkata). Bindings: DB (D1). Secrets via env vars only.
const J=(o,s=200,h={})=>new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json','cache-control':'no-store',...h}});
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const unhex=h=>new Uint8Array(h.match(/../g).map(x=>parseInt(x,16)));
async function hashPw(pw,saltHex){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unhex(saltHex),iterations:100000},k,256))}
const rnd=n=>hex(crypto.getRandomValues(new Uint8Array(n)));
const sha=async s=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
function eq(a,b){if(a.length!==b.length)return false;let r=0;for(let i=0;i<a.length;i++)r|=a.charCodeAt(i)^b.charCodeAt(i);return r===0}
const cookie=(r,n)=>((r.headers.get('cookie')||'').match(new RegExp('(?:^|; )'+n+'=([^;]*)'))||[])[1];
async function me(env,req){const t=cookie(req,'pp_sess');if(!t)return null;const h=await sha(t);return await env.DB.prepare('SELECT u.id,u.email,u.name,u.role,u.must_change FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1').bind(h,Date.now()).first()}
const istNow=()=>new Date(Date.now()+19800000);
const pad=n=>String(n).padStart(2,'0');
const mins=t=>{const[a,b]=t.split(':').map(Number);return a*60+b};
const hm=m=>pad(Math.floor(m/60))+':'+pad(m%60);
async function slots(env,studioId,date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return[];
  const st=await env.DB.prepare('SELECT * FROM studios WHERE id=? AND active=1').bind(studioId).first();if(!st)return[];
  const bl=await env.DB.prepare('SELECT 1 FROM blocked WHERE date=? AND (studio_id IS NULL OR studio_id=?)').bind(date,studioId).first();if(bl)return[];
  const dow=new Date(date+'T00:00:00Z').getUTCDay();
  const w=(await env.DB.prepare('SELECT start,end FROM availability WHERE studio_id=? AND dow=? ORDER BY start').bind(studioId,dow).all()).results;
  const taken=new Set();
  const earliest=istNow().getTime()+st.min_notice_hours*3600000;const out=[];
  for(const x of w){for(let m=mins(x.start);m+st.slot_minutes<=mins(x.end);m+=st.slot_minutes+st.buffer_minutes){const s=hm(m);const ts=Date.parse(date+'T'+s+':00Z');if(ts<earliest||taken.has(s))continue;out.push({start:s,end:hm(m+st.slot_minutes)})}}
  return out}
const clean=(s,n=300)=>String(s??'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,n);
const emailOk=e=>/^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,}$/.test(e);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hmac=async(key,msg)=>{const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(msg)))};
const tmpPw=()=>{const a='abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';const r=crypto.getRandomValues(new Uint8Array(14));return [...r].map(x=>a[x%a.length]).join('')};
const rupees=v=>{const n=Math.round(parseFloat(v)*100);return Number.isFinite(n)&&n>=100&&n<=100000000000?n:null};
async function markPaid(env,offerId,orderId,payId){const pay=await env.DB.prepare('SELECT * FROM payments WHERE rzp_order_id=? AND offer_id=?').bind(orderId,offerId).first();if(!pay)return false;if(pay.status==='paid')return true;const off=await env.DB.prepare('SELECT * FROM offers WHERE id=?').bind(offerId).first();if(!off)return false;const st=[env.DB.prepare("UPDATE payments SET status='paid',rzp_payment_id=?,paid_at=datetime('now') WHERE id=?").bind(payId,pay.id),env.DB.prepare("UPDATE offers SET status='paid' WHERE id=?").bind(offerId)];if(off.booking_id)st.push(env.DB.prepare("UPDATE bookings SET status=CASE WHEN status IN('approved','inquiry') THEN 'requested' ELSE status END,client_id=?,offer_id=? WHERE id=?").bind(off.client_id,offerId,off.booking_id));await env.DB.batch(st);return true}
const needAdmin=u=>u&&u.role==='admin';
export async function onRequest({request,env,params}){
  if(!env.DB)return J({error:'Database not configured'},503);
  const path='/'+(params.path||[]).join('/');const m=request.method;const url=new URL(request.url);
  if(m!=='GET'&&m!=='HEAD'&&path!=='/webhook/razorpay'){const ct=request.headers.get('content-type')||'';if(!ct.includes('application/json'))return J({error:'Bad content type'},415);const o=request.headers.get('origin');if(o&&o!==url.origin)return J({error:'Bad origin'},403)}
  const body=async()=>{try{return await request.json()}catch{return{}}};
  try{
  {const X=await pubExtra(env,path,m,body,url,request);if(X)return X}
  // ---------- public ----------
  if(path==='/studios'&&m==='GET'){return J((await env.DB.prepare('SELECT id,city,name,slot_minutes FROM studios WHERE active=1 ORDER BY id').all()).results)}
  if(path==='/slots'&&m==='GET'){return J(await slots(env,+url.searchParams.get('studio'),url.searchParams.get('date')||''))}
  if(path==='/book'&&m==='POST'){
    const b=await body();const name=clean(b.name,100),email=clean(b.email,200).toLowerCase(),phone=clean(b.phone,30);
    if(!name||!emailOk(email)||phone.length<7)return J({error:'Please enter your name, a valid email and phone number.'},400);
    const recent=await env.DB.prepare("SELECT count(*) c FROM bookings WHERE email=? AND created_at>datetime('now','-1 hour')").bind(email).first();if(recent.c>=3)return J({error:'Too many requests. Please try again later.'},429);
    const ok=(await slots(env,+b.studio_id,clean(b.date,10))).find(s=>s.start===b.start);if(!ok)return J({error:'That time is not available. Please pick another.'},409);
    const ref='PP'+rnd(3).toUpperCase();
    try{await env.DB.prepare("INSERT INTO bookings(ref,status,studio_id,date,start,end,name,email,phone,topic,channels,press) VALUES(?,'inquiry',?,?,?,?,?,?,?,?,?,?)").bind(ref,+b.studio_id,b.date,ok.start,ok.end,name,email,phone,clean(b.topic,1000),JSON.stringify((b.channels||[]).slice(0,20).map(x=>clean(x,40))),JSON.stringify((b.press||[]).slice(0,20).map(x=>clean(x,40)))).run()}catch(e){return J({error:'Something went wrong. Please try again.'},409)}
    return J({ok:true,ref,date:b.date,start:ok.start,end:ok.end})}
  if(path==='/testimonials'&&m==='GET'){return J((await env.DB.prepare("SELECT author,role,body FROM testimonials WHERE status='live' ORDER BY id DESC LIMIT 12").all()).results)}
  if(path==='/blogs'&&m==='GET'){return J((await env.DB.prepare("SELECT slug,title,excerpt,cover,created_at FROM blogs WHERE status='live' ORDER BY id DESC LIMIT 30").all()).results)}
  if(path==='/contact'&&m==='POST'){const b=await body();const name=clean(b.name,100),email=clean(b.email,200);if(!name||!emailOk(email))return J({error:'Please enter your name and a valid email.'},400);await env.DB.prepare('INSERT INTO submissions(kind,data) VALUES(?,?)').bind('contact',JSON.stringify({name,email,phone:clean(b.phone,30),message:clean(b.message,2000)})).run();return J({ok:true})}
  if(path==='/blog'&&m==='GET'){const r=await env.DB.prepare("SELECT slug,title,excerpt,body,cover,created_at FROM blogs WHERE slug=? AND status='live'").bind(clean(url.searchParams.get('slug'),120)).first();return r?J(r):J({error:'Not found'},404)}
  if(path==='/webhook/razorpay'&&m==='POST'){const raw=await request.clone().text();const sig=request.headers.get('x-razorpay-signature')||'';if(!env.RAZORPAY_WEBHOOK_SECRET||!eq(await hmac(env.RAZORPAY_WEBHOOK_SECRET,raw),sig))return J({error:'bad signature'},400);let ev;try{ev=JSON.parse(raw)}catch{return J({error:'bad json'},400)}if(ev.event==='payment.captured'||ev.event==='order.paid'){const pe=ev.payload&&ev.payload.payment&&ev.payload.payment.entity;if(pe&&pe.order_id){const pay=await env.DB.prepare('SELECT * FROM payments WHERE rzp_order_id=?').bind(pe.order_id).first();if(pay&&pe.amount===pay.amount_paise)await markPaid(env,pay.offer_id,pe.order_id,pe.id)}}return J({ok:true})}
  // ---------- auth ----------
  if(path==='/login'&&m==='POST'){
    const b=await body();const email=clean(b.email,200).toLowerCase(),pw=String(b.password||'');
    let u=await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
    if(!u||u.active===0||!eq(await hashPw(pw,u.pass_salt),u.pass_hash)){await new Promise(r=>setTimeout(r,400));return J({error:'Incorrect email or password.'},401)}
    const tok=rnd(32);await env.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await sha(tok),u.id,Date.now()+7*864e5).run();
    await env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(Date.now()).run();
    return J({ok:true,role:u.role,must_change:u.must_change},200,{'set-cookie':`pp_sess=${tok}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`})}
  if(path==='/logout'&&m==='POST'){const t=cookie(request,'pp_sess');if(t)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha(t)).run();return J({ok:true},200,{'set-cookie':'pp_sess=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'})}
  const u=await me(env,request);
  if(path==='/me'&&m==='GET')return u?J(u):J({error:'Not signed in'},401);
  if(!u)return J({error:'Not signed in'},401);
  if(u.must_change&&path!=='/password')return J({error:'Please set a new password first.'},403);
  {const X=await extra({env,u,path,m,body,url});if(X)return X}
  if(path==='/password'&&m==='POST'){const b=await body();const pw=String(b.new||'');if(pw.length<10)return J({error:'Use at least 10 characters.'},400);const row=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(u.id).first();if(!eq(await hashPw(String(b.current||''),row.pass_salt),row.pass_hash))return J({error:'Current password is incorrect.'},403);const salt=rnd(16);await env.DB.prepare('UPDATE users SET pass_hash=?,pass_salt=?,must_change=0 WHERE id=?').bind(await hashPw(pw,salt),salt,u.id).run();return J({ok:true})}
  // ---------- client ----------
  if(path.startsWith('/client/')){
    if(u.role!=='client')return J({error:'Forbidden'},403);const p=path.slice(7);
    if(p==='/offers'&&m==='GET'){const of=(await env.DB.prepare('SELECT o.*,b.ref bref,b.date bdate,b.start bstart FROM offers o LEFT JOIN bookings b ON b.id=o.booking_id WHERE o.client_id=? ORDER BY o.id DESC').bind(u.id).all()).results;const ids=of.map(o=>o.id);let pay=[],dl=[];if(ids.length){const q=ids.map(()=>'?').join(',');pay=(await env.DB.prepare(`SELECT id,offer_id,amount_paise,status,created_at,paid_at,rzp_payment_id FROM payments WHERE offer_id IN(${q}) ORDER BY id DESC`).bind(...ids).all()).results;dl=(await env.DB.prepare(`SELECT * FROM deliverables WHERE offer_id IN(${q}) ORDER BY id`).bind(...ids).all()).results}return J({offers:of.map(o=>({...o,invoice_no:'PP-INV-'+String(o.id).padStart(5,'0'),payments:pay.filter(x=>x.offer_id===o.id),deliverables:dl.filter(x=>x.offer_id===o.id)}))})}
    if(p==='/bookings'&&m==='GET'){const r=(await env.DB.prepare('SELECT b.id,b.ref,b.status,b.date,b.start,b.end,b.studio_id,b.channels,b.press,s.city FROM bookings b JOIN studios s ON s.id=b.studio_id WHERE b.client_id=? ORDER BY b.id DESC').bind(u.id).all()).results;return J({bookings:r})}
    if(p==='/finalise'&&m==='POST'){const b=await body();const bk=await env.DB.prepare("SELECT * FROM bookings WHERE id=? AND client_id=? AND status IN('approved','requested')").bind(+b.id,u.id).first();if(!bk)return J({error:'Booking not found or not ready to finalise.'},404);const d=clean(b.date,10);const ok=(await slots(env,+b.studio_id,d)).find(x=>x.start===b.start);if(!ok)return J({error:'That time is not available. Please pick another.'},409);await env.DB.prepare("UPDATE bookings SET studio_id=?,date=?,start=?,end=?,channels=?,press=?,status='requested' WHERE id=?").bind(+b.studio_id,d,ok.start,ok.end,JSON.stringify((b.channels||[]).slice(0,20).map(x=>clean(x,40))),JSON.stringify((b.press||[]).slice(0,20).map(x=>clean(x,40))),bk.id).run();return J({ok:true})}
    if(p==='/pay'&&m==='POST'){const b=await body();const o=await env.DB.prepare("SELECT * FROM offers WHERE id=? AND client_id=? AND status='sent'").bind(+b.offer_id,u.id).first();if(!o)return J({error:'Offer not available for payment.'},404);if(!env.RAZORPAY_KEY_ID||!env.RAZORPAY_KEY_SECRET)return J({error:'Online payment is not switched on yet. Please contact us.'},503);
      const r=await fetch('https://api.razorpay.com/v1/orders',{method:'POST',headers:{'content-type':'application/json',authorization:'Basic '+btoa(env.RAZORPAY_KEY_ID+':'+env.RAZORPAY_KEY_SECRET)},body:JSON.stringify({amount:o.amount_paise,currency:o.currency||'INR',receipt:'offer_'+o.id+'_'+Date.now().toString(36),notes:{offer_id:String(o.id)}})});const j=await r.json();if(!r.ok||!j.id)return J({error:'Could not start payment. Please try again.'},502);
      await env.DB.prepare('INSERT INTO payments(offer_id,rzp_order_id,amount_paise) VALUES(?,?,?)').bind(o.id,j.id,o.amount_paise).run();return J({key:env.RAZORPAY_KEY_ID,order_id:j.id,amount:o.amount_paise,currency:o.currency||'INR',name:'People & Perspectives',description:o.title,prefill:{name:u.name||'',email:u.email}})}
    if(p==='/verify'&&m==='POST'){const b=await body();const o=await env.DB.prepare('SELECT * FROM offers WHERE id=? AND client_id=?').bind(+b.offer_id,u.id).first();if(!o||!env.RAZORPAY_KEY_SECRET)return J({error:'Not found'},404);const pay=await env.DB.prepare('SELECT * FROM payments WHERE rzp_order_id=? AND offer_id=?').bind(String(b.razorpay_order_id||''),o.id).first();if(!pay)return J({error:'Unknown order'},404);const sig=await hmac(env.RAZORPAY_KEY_SECRET,pay.rzp_order_id+'|'+String(b.razorpay_payment_id||''));if(!eq(sig,String(b.razorpay_signature||'')))return J({error:'Payment could not be verified.'},400);await markPaid(env,o.id,pay.rzp_order_id,String(b.razorpay_payment_id));return J({ok:true})}
    if(p==='/testimonial'&&m==='POST'){const b=await body();const t=clean(b.body,1200);if(t.length<20)return J({error:'Please write a little more.'},400);await env.DB.prepare("INSERT INTO testimonials(client_id,author,role,body,status) VALUES(?,?,?,?,'pending')").bind(u.id,clean(b.author||u.name,100),clean(b.role,100),t).run();return J({ok:true})}
    if(p==='/invoice'&&m==='GET'){const o=await env.DB.prepare("SELECT o.*,u.name cname,u.email cemail FROM offers o JOIN users u ON u.id=o.client_id WHERE o.id=? AND o.client_id=?").bind(+url.searchParams.get('offer_id'),u.id).first();if(!o)return J({error:'Not found'},404);const pay=await env.DB.prepare("SELECT * FROM payments WHERE offer_id=? AND status='paid' ORDER BY id DESC").bind(o.id).first();const no='PP-INV-'+String(o.id).padStart(5,'0');const amt=(o.amount_paise/100).toLocaleString('en-IN',{minimumFractionDigits:2});
      return new Response(`<!doctype html><meta charset=utf-8><title>${no}</title><style>body{font:15px system-ui;max-width:720px;margin:40px auto;padding:0 20px;color:#111}h1{font-size:30px;margin:0}table{width:100%;border-collapse:collapse;margin:24px 0}td,th{padding:10px;border-bottom:1px solid #ddd;text-align:left}.r{text-align:right}.s{display:inline-block;padding:3px 12px;border-radius:99px;background:${pay?'#2BD66B':'#FFEA00'};font-weight:800}@media print{button{display:none}}</style><button onclick=print()>Print / Save as PDF</button><h1>Invoice ${no}</h1><p>People &amp; Perspectives Podcast<br>Date: ${esc(o.created_at.slice(0,10))}</p><p>Billed to: <b>${esc(o.cname||o.cemail)}</b><br>${esc(o.cemail)}</p><table><tr><th>Description</th><th class=r>Amount (${esc(o.currency)})</th></tr><tr><td><b>${esc(o.title)}</b><br>${esc(o.description||'')}</td><td class=r>${amt}</td></tr><tr><th>Total</th><th class=r>${amt}</th></tr></table><p>Status: <span class=s>${pay?'PAID':'DUE'}</span>${pay?'<br>Paid on '+esc(pay.paid_at)+' (Razorpay payment '+esc(pay.rzp_payment_id)+')':''}</p>`,{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store'}})}
    return J({error:'Not found'},404)}
  // ---------- admin ----------
  if(path.startsWith('/admin/')){
    if(!staffAllowed(u,path.slice(6),m))return J({error:'Forbidden'},403);
    const p=path.slice(6);
    if(p==='/bookings'&&m==='GET')return J((await env.DB.prepare('SELECT b.*,s.city FROM bookings b JOIN studios s ON s.id=b.studio_id ORDER BY b.date DESC,b.start DESC LIMIT 300').all()).results);
    if(p==='/booking-status'&&m==='POST'){const b=await body();if(!['inquiry','approved','declined','requested','confirmed','cancelled'].includes(b.status))return J({error:'Bad status'},400);const bk=await env.DB.prepare('SELECT * FROM bookings WHERE id=?').bind(+b.id).first();if(!bk)return J({error:'Not found'},404);
      if(b.status==='confirmed'&&!b.override){const c=await env.DB.prepare("SELECT ref,name FROM bookings WHERE studio_id=? AND date=? AND start=? AND status='confirmed' AND id<>?").bind(bk.studio_id,bk.date,bk.start,bk.id).first();if(c)return J({error:'Slot conflict with confirmed booking '+c.ref+' ('+c.name+').',conflict:true},409)}
      await env.DB.prepare('UPDATE bookings SET status=? WHERE id=?').bind(b.status,bk.id).run();return J({ok:true})}
    if(p==='/booking-edit'&&m==='POST'){const b=await body();const d=clean(b.date,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!/^\d\d:\d\d$/.test(b.start||'')||!/^\d\d:\d\d$/.test(b.end||'')||mins(b.start)>=mins(b.end))return J({error:'Check date and times.'},400);const st=await env.DB.prepare('SELECT id FROM studios WHERE id=?').bind(+b.studio_id).first();if(!st)return J({error:'Pick a studio.'},400);await env.DB.prepare('UPDATE bookings SET studio_id=?,date=?,start=?,end=?,name=?,email=?,phone=?,topic=?,admin_note=? WHERE id=?').bind(st.id,d,b.start,b.end,clean(b.name,100),clean(b.email,200).toLowerCase(),clean(b.phone,30),clean(b.topic,1000),clean(b.admin_note,1000),+b.id).run();return J({ok:true})}
    if(p==='/booking-login'&&m==='POST'){const b=await body();const bk=await env.DB.prepare('SELECT * FROM bookings WHERE id=?').bind(+b.id).first();if(!bk)return J({error:'Not found'},404);if(!['approved','requested','confirmed'].includes(bk.status))return J({error:'Approve the inquiry first.'},400);const email=bk.email.toLowerCase();let c=await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();let pw=null;if(c&&c.role!=='client')return J({error:'This email belongs to an admin account.'},409);if(!c){pw=tmpPw();const salt=rnd(16);await env.DB.prepare("INSERT INTO users(email,name,role,pass_hash,pass_salt,must_change) VALUES(?,?,'client',?,?,1)").bind(email,bk.name,await hashPw(pw,salt),salt).run();c=await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first()}await env.DB.prepare('UPDATE bookings SET client_id=? WHERE id=?').bind(c.id,bk.id).run();return J({ok:true,email,client_id:c.id,temp_password:pw,existing:!pw})}
    if(p==='/studios'&&m==='GET'){const st=(await env.DB.prepare('SELECT * FROM studios ORDER BY id').all()).results;const av=(await env.DB.prepare('SELECT * FROM availability ORDER BY studio_id,dow,start').all()).results;const bl=(await env.DB.prepare("SELECT * FROM blocked WHERE date>=date('now','-1 day') ORDER BY date").all()).results;return J({studios:st,availability:av,blocked:bl})}
    if(p==='/studio'&&m==='POST'){const b=await body();const sl=+b.slot_minutes,bf=+b.buffer_minutes,nt=+b.min_notice_hours;if(!(sl>=15&&sl<=480)||!(bf>=0&&bf<=240)||!(nt>=0&&nt<=720))return J({error:'Check slot length, buffer and notice values.'},400);await env.DB.prepare('UPDATE studios SET slot_minutes=?,buffer_minutes=?,min_notice_hours=?,active=? WHERE id=?').bind(sl,bf,nt,b.active?1:0,+b.id).run();return J({ok:true})}
    if(p==='/hours'&&m==='POST'){const b=await body();const rows=(b.hours||[]).filter(h=>h.dow>=0&&h.dow<=6&&/^\d\d:\d\d$/.test(h.start)&&/^\d\d:\d\d$/.test(h.end)&&mins(h.start)<mins(h.end));const st=[env.DB.prepare('DELETE FROM availability WHERE studio_id=?').bind(+b.studio_id),...rows.map(h=>env.DB.prepare('INSERT INTO availability(studio_id,dow,start,end) VALUES(?,?,?,?)').bind(+b.studio_id,+h.dow,h.start,h.end))];await env.DB.batch(st);return J({ok:true})}
    if(p==='/block'&&m==='POST'){const b=await body();if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date||''))return J({error:'Bad date'},400);await env.DB.prepare('INSERT INTO blocked(studio_id,date,reason) VALUES(?,?,?)').bind(b.studio_id?+b.studio_id:null,b.date,clean(b.reason,100)).run();return J({ok:true})}
    if(p==='/unblock'&&m==='POST'){const b=await body();await env.DB.prepare('DELETE FROM blocked WHERE id=?').bind(+b.id).run();return J({ok:true})}
    if(p==='/clients'&&m==='GET')return J((await env.DB.prepare("SELECT id,email,name,must_change,created_at FROM users WHERE role='client' ORDER BY id DESC").all()).results);
    if(p==='/client'&&m==='POST'){const b=await body();const email=clean(b.email,200).toLowerCase();if(!emailOk(email))return J({error:'Valid email required.'},400);const pw=tmpPw(),salt=rnd(16);try{await env.DB.prepare("INSERT INTO users(email,name,role,pass_hash,pass_salt,must_change) VALUES(?,?,'client',?,?,1)").bind(email,clean(b.name,100),await hashPw(pw,salt),salt).run()}catch{return J({error:'A user with this email already exists.'},409)}return J({ok:true,email,temp_password:pw})}
    if(p==='/client-reset'&&m==='POST'){const b=await body();const pw=tmpPw(),salt=rnd(16);await env.DB.prepare("UPDATE users SET pass_hash=?,pass_salt=?,must_change=1 WHERE id=? AND role='client'").bind(await hashPw(pw,salt),salt,+b.id).run();await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(+b.id).run();return J({ok:true,temp_password:pw})}
    if(p==='/offers'&&m==='GET'){const of=(await env.DB.prepare("SELECT o.*,u.email cemail,u.name cname,b.ref bref FROM offers o JOIN users u ON u.id=o.client_id LEFT JOIN bookings b ON b.id=o.booking_id ORDER BY o.id DESC").all()).results;const dl=(await env.DB.prepare('SELECT * FROM deliverables ORDER BY id').all()).results;const pay=(await env.DB.prepare('SELECT offer_id,status,paid_at,rzp_payment_id FROM payments ORDER BY id').all()).results;return J(of.map(o=>({...o,deliverables:dl.filter(d=>d.offer_id===o.id),payments:pay.filter(x=>x.offer_id===o.id)})))}
    if(p==='/offer'&&m==='POST'){const b=await body();const amt=rupees(b.amount);if(!amt||!clean(b.title,200))return J({error:'Title and an amount of at least 1 are required.'},400);const c=await env.DB.prepare("SELECT id FROM users WHERE id=? AND role='client'").bind(+b.client_id).first();if(!c)return J({error:'Pick a client.'},400);let bk=null;if(b.booking_ref){const r=await env.DB.prepare('SELECT id FROM bookings WHERE ref=?').bind(clean(b.booking_ref,20).toUpperCase()).first();if(!r)return J({error:'Booking reference not found.'},400);bk=r.id}await env.DB.prepare("INSERT INTO offers(client_id,booking_id,title,description,amount_paise) VALUES(?,?,?,?,?)").bind(c.id,bk,clean(b.title,200),clean(b.description,2000),amt).run();return J({ok:true})}
    if(p==='/offer-status'&&m==='POST'){const b=await body();if(b.status!=='cancelled')return J({error:'Bad status'},400);await env.DB.prepare("UPDATE offers SET status='cancelled' WHERE id=? AND status='sent'").bind(+b.id).run();return J({ok:true})}
    if(p==='/deliverable'&&m==='POST'){const b=await body();if(!['pending','in_progress','delivered'].includes(b.status||'pending'))return J({error:'Bad status'},400);const url2=clean(b.url,500);if(url2&&!/^https:\/\//.test(url2))return J({error:'Link must start with https://'},400);if(b.id)await env.DB.prepare("UPDATE deliverables SET title=?,url=?,status=?,updated_at=datetime('now') WHERE id=?").bind(clean(b.title,200),url2,b.status,+b.id).run();else await env.DB.prepare('INSERT INTO deliverables(offer_id,title,url,status) VALUES(?,?,?,?)').bind(+b.offer_id,clean(b.title,200),url2,b.status||'pending').run();return J({ok:true})}
    if(p==='/blogs'&&m==='GET')return J((await env.DB.prepare('SELECT * FROM blogs ORDER BY id DESC').all()).results);
    if(p==='/blog'&&m==='POST'){const b=await body();const slug=clean(b.slug||b.title,100).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');if(!slug||!clean(b.title,200))return J({error:'Title required.'},400);const cover=clean(b.cover,300);if(cover&&!/^(https:\/\/|\/)/.test(cover))return J({error:'Cover must be an https link or a site path.'},400);const st=b.status==='live'?'live':'draft';try{if(b.id)await env.DB.prepare('UPDATE blogs SET slug=?,title=?,excerpt=?,body=?,cover=?,status=? WHERE id=?').bind(slug,clean(b.title,200),clean(b.excerpt,400),String(b.body||'').slice(0,50000),cover,st,+b.id).run();else await env.DB.prepare('INSERT INTO blogs(slug,title,excerpt,body,cover,status) VALUES(?,?,?,?,?,?)').bind(slug,clean(b.title,200),clean(b.excerpt,400),String(b.body||'').slice(0,50000),cover,st).run()}catch{return J({error:'That URL slug is already used.'},409)}return J({ok:true})}
    if(p==='/blog-delete'&&m==='POST'){const b=await body();await env.DB.prepare('DELETE FROM blogs WHERE id=?').bind(+b.id).run();return J({ok:true})}
    if(p==='/testimonials'&&m==='GET')return J((await env.DB.prepare('SELECT * FROM testimonials ORDER BY id DESC').all()).results);
    if(p==='/testimonial-status'&&m==='POST'){const b=await body();if(!['pending','live','rejected'].includes(b.status))return J({error:'Bad status'},400);await env.DB.prepare('UPDATE testimonials SET status=? WHERE id=?').bind(b.status,+b.id).run();return J({ok:true})}
    if(p==='/submissions'&&m==='GET')return J((await env.DB.prepare('SELECT * FROM submissions ORDER BY id DESC LIMIT 200').all()).results);
    return J({error:'Not found'},404)}
  return J({error:'Not found'},404)
  }catch(e){return J({error:'Server error'},500)}
}

// ================= Phase 3 =================
const STAFF=['admin','manager','editor'];
function staffAllowed(u,p,m){
  if(!u||!STAFF.includes(u.role))return false;
  if(u.role==='admin')return true;
  if(u.role==='manager')return !/^\/(user|studio$|studios$|hours|block|blog)/.test(p)||(p==='/studios'&&m==='GET');
  return /^\/(blog|blogs|media|testimonial|testimonials|submissions)/.test(p)&&!(p==='/submissions'&&m!=='GET');
}
const OKMIME=['image/png','image/jpeg','image/webp','application/pdf'];
function magicOk(mime,data){let h;try{h=atob(data.slice(0,16))}catch{return false}
  if(mime==='image/png')return h.startsWith('\x89PNG');if(mime==='image/jpeg')return h.startsWith('\xff\xd8');if(mime==='image/webp')return h.startsWith('RIFF')&&h.slice(8,12)==='WEBP';if(mime==='application/pdf')return h.startsWith('%PDF');return false}
async function saveFile(env,kind,f,appId){
  const mime=clean(f&&f.mime,40),data=String((f&&f.data)||'');
  if(!OKMIME.includes(mime)||data.length<20||data.length>1500000||!/^[A-Za-z0-9+/]+=*$/.test(data)||!magicOk(mime,data))return null;
  const r=await env.DB.prepare('INSERT INTO files(kind,name,mime,size,data,app_id) VALUES(?,?,?,?,?,?)').bind(kind,clean(f.name,120),mime,Math.floor(data.length*3/4),data,appId||null).run();
  return r.meta.last_row_id}
const httpsList=(a,n=6)=>(Array.isArray(a)?a:[]).slice(0,n).map(x=>clean(x,300)).filter(x=>/^https?:\/\/[^\s]+\.[^\s]+$/.test(x));
const cleanHtml=h=>String(h||'').slice(0,200000).replace(/<\s*(script|style|iframe|object|embed|form|meta|link)[\s\S]*?(<\/\s*\1\s*>|$)/gi,'').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,'').replace(/(href|src)\s*=\s*("|')\s*(javascript|data|vbscript):[^"']*\2/gi,'$1=$2#$2');
const visibleSql="status='live' AND (publish_at IS NULL OR publish_at='' OR publish_at<=?)";
const istStamp=()=>istNow().toISOString().slice(0,16);
const rt=h=>Math.max(1,Math.ceil(String(h||'').replace(/<[^>]+>/g,' ').split(/\s+/).filter(Boolean).length/200));

async function pubExtra(env,path,m,body,url,request){
  if(path==='/media'&&m==='GET'){const f=await env.DB.prepare("SELECT mime,data FROM files WHERE id=? AND kind='blog'").bind(+url.searchParams.get('id')).first();if(!f)return J({error:'Not found'},404);const bin=Uint8Array.from(atob(f.data),c=>c.charCodeAt(0));return new Response(bin,{headers:{'content-type':f.mime,'cache-control':'public, max-age=86400','x-content-type-options':'nosniff'}})}
  if(path==='/blogs'&&m==='GET'){const r=(await env.DB.prepare(`SELECT slug,title,excerpt,cover,category,tags,author,created_at,publish_at,featured,body FROM blogs WHERE ${visibleSql} ORDER BY COALESCE(NULLIF(publish_at,''),created_at) DESC LIMIT 60`).bind(istStamp()).all()).results;return J(r.map(x=>{const o={...x,rt:rt(x.body)};delete o.body;return o}))}
  if(path==='/blog'&&m==='GET'){const r=await env.DB.prepare(`SELECT slug,title,excerpt,body,cover,category,tags,author,seo_desc,created_at,publish_at FROM blogs WHERE slug=? AND ${visibleSql}`).bind(clean(url.searchParams.get('slug'),120),istStamp()).first();return r?J({...r,rt:rt(r.body)}):J({error:'Not found'},404)}
  if(path==='/channels'&&m==='GET')return J((await env.DB.prepare('SELECT id,name,url,avatar,subs,section FROM channels WHERE active=1 ORDER BY sort,id').all()).results);
  if(path==='/apply'&&m==='POST'){
    const b=await body();if(b.hp)return J({ok:true});
    const kind=b.kind;if(!['studio','distribution'].includes(kind))return J({error:'Bad request'},400);
    const email=clean(b.email,200).toLowerCase(),phone=clean(b.phone,30),city=clean(b.city,80);
    if(!emailOk(email)||phone.length<7||!city)return J({error:'Please enter a valid email, phone number and city.'},400);
    if(b.consent!==true)return J({error:'Please tick the consent box to continue.'},400);
    const rec=await env.DB.prepare("SELECT count(*) c FROM applications WHERE email=? AND created_at>datetime('now','-1 hour')").bind(email).first();
    const all=await env.DB.prepare("SELECT count(*) c FROM applications WHERE kind=? AND created_at>datetime('now','-1 hour')").bind(kind).first();
    if(rec.c>=3||all.c>=40)return J({error:'Too many applications right now. Please try again later.'},429);
    let name,data,files=[];
    if(kind==='studio'){
      name=clean(b.studio_name,120);const contact=clean(b.contact_name,100),addr=clean(b.address,400),reg=clean(b.registration_no,80);
      if(!name||!contact||!addr||!reg)return J({error:'Please fill in studio name, contact person, address and registration number.'},400);
      const photos=(Array.isArray(b.photos)?b.photos:[]).slice(0,4),cert=b.certificate;
      if(!photos.length)return J({error:'Please upload at least one studio photo.'},400);
      if(!cert)return J({error:'Please upload your registration certificate.'},400);
      data={studio_name:name,contact_name:contact,address:addr,registration_no:reg,registration_type:clean(b.registration_type,60),website:clean(b.website,200),years:clean(b.years,20),setup:clean(b.setup,800),shoot_links:httpsList(b.shoot_links),about:clean(b.about,1500)};
      const ids=[];for(const p of photos){ids.push(['photo',p])}ids.push(['certificate',cert]);files=ids;
    }else{
      name=clean(b.name,120);const types=(Array.isArray(b.types)?b.types:[]).filter(t=>['Paps','Influencer','Clipper','Media channel','YouTuber','Podcaster','Other'].includes(t));
      if(!name||!types.length)return J({error:'Please enter your name or channel name and choose at least one type.'},400);
      const links=httpsList(b.links);if(!links.length)return J({error:'Please add at least one link to your channel or profile (https://...).'},400);
      data={name,types,channel:clean(b.channel,150),links,audience:clean(b.audience,150),platforms:clean(b.platforms,200),about:clean(b.about,1500)};
    }
    const r=await env.DB.prepare("INSERT INTO applications(kind,status,name,email,phone,city,data) VALUES(?,'new',?,?,?,?,?)").bind(kind,name,email,phone,city,JSON.stringify(data)).run();
    const id=r.meta.last_row_id;
    for(const [k,f] of files){const fid=await saveFile(env,k,f,id);if(!fid){await env.DB.batch([env.DB.prepare('DELETE FROM files WHERE app_id=?').bind(id),env.DB.prepare('DELETE FROM applications WHERE id=?').bind(id)]);return J({error:'One of the files could not be read. Use JPG, PNG or WebP photos and a PDF or image certificate under 1 MB.'},400)}}
    return J({ok:true,ref:'AP'+id})}
  return null}

async function extra(ctx){
  const {env,u,path,m,body,url}=ctx;const ad=u.role==='admin',mgr=ad||u.role==='manager',ed=ad||u.role==='editor';
  const JS=s=>{try{return JSON.parse(s)}catch{return null}};
  const today=istNow().toISOString().slice(0,10);
  // ---- studio dashboard ----
  if(path.startsWith('/studio/')){
    if(u.role!=='studio')return J({error:'Forbidden'},403);const p=path.slice(7);
    if(p==='/dashboard'&&m==='GET'){
      const app=await env.DB.prepare('SELECT name,city,data FROM applications WHERE user_id=?').bind(u.id).first();
      const bk=(await env.DB.prepare("SELECT b.id,b.ref,b.date,b.start,b.end,b.status,b.name,b.email,b.phone,b.topic,b.channels,b.press,b.offer_id,s.city FROM bookings b JOIN studios s ON s.id=b.studio_id WHERE b.studio_user_id=? AND b.status IN('requested','confirmed') ORDER BY b.date,b.start").bind(u.id).all()).results;
      const oids=[...new Set(bk.map(x=>x.offer_id).filter(Boolean))];let dl=[];
      if(oids.length)dl=(await env.DB.prepare(`SELECT id,offer_id,title,url,status FROM deliverables WHERE offer_id IN (${oids.map(()=>'?').join(',')})`).bind(...oids).all()).results;
      const rv=(await env.DB.prepare('SELECT r.rating,r.feedback,r.created_at,b.ref,b.date FROM studio_reviews r JOIN bookings b ON b.id=r.booking_id WHERE r.studio_user_id=? ORDER BY r.id DESC').bind(u.id).all()).results;
      const avg=rv.length?Math.round(rv.reduce((a,x)=>a+x.rating,0)/rv.length*10)/10:null;
      return J({profile:app?{name:app.name,city:app.city,...(JS(app.data)||{})}:{name:u.name},today,bookings:bk.map(x=>({...x,deliverables:dl.filter(d=>d.offer_id===x.offer_id)})),reviews:rv,avg})}
    if(p==='/deliverable'&&m==='POST'){const b=await body();const bk=await env.DB.prepare("SELECT id,offer_id FROM bookings WHERE id=? AND studio_user_id=? AND status IN('requested','confirmed')").bind(+b.booking_id,u.id).first();if(!bk)return J({error:'Booking not found.'},404);if(!bk.offer_id)return J({error:'This booking has no offer yet. Ask the team to create one before you add deliverables.'},400);
      const title=clean(b.title,200),link=clean(b.url,500),st=b.status||'pending';if(!title)return J({error:'Please add a title.'},400);if(link&&!/^https:\/\//.test(link))return J({error:'Links must start with https://'},400);if(!['pending','in_progress','delivered'].includes(st))return J({error:'Bad status'},400);
      if(b.id){const d=await env.DB.prepare('SELECT id FROM deliverables WHERE id=? AND offer_id=?').bind(+b.id,bk.offer_id).first();if(!d)return J({error:'Not found'},404);await env.DB.prepare("UPDATE deliverables SET title=?,url=?,status=?,updated_at=datetime('now') WHERE id=?").bind(title,link||null,st,d.id).run()}
      else await env.DB.prepare('INSERT INTO deliverables(offer_id,title,url,status) VALUES(?,?,?,?)').bind(bk.offer_id,title,link||null,st).run();
      return J({ok:true})}
    if(p==='/deliverable-delete'&&m==='POST'){const b=await body();const d=await env.DB.prepare('SELECT d.id FROM deliverables d JOIN bookings b ON b.offer_id=d.offer_id WHERE d.id=? AND b.studio_user_id=?').bind(+b.id,u.id).first();if(!d)return J({error:'Not found'},404);await env.DB.prepare('DELETE FROM deliverables WHERE id=?').bind(d.id).run();return J({ok:true})}
    return J({error:'Not found'},404)}
  // ---- partner dashboard ----
  if(path.startsWith('/partner/')){
    if(u.role!=='partner')return J({error:'Forbidden'},403);const p=path.slice(8);
    if(p==='/dashboard'&&m==='GET'){const app=await env.DB.prepare('SELECT name,city,data FROM applications WHERE user_id=?').bind(u.id).first();
      const assets=(await env.DB.prepare("SELECT id,title,url,notes,created_at FROM partner_assets WHERE active=1 ORDER BY id DESC LIMIT 100").all()).results;
      const posts=(await env.DB.prepare('SELECT p.id,p.asset_id,p.url,p.note,p.created_at,a.title FROM partner_posts p LEFT JOIN partner_assets a ON a.id=p.asset_id WHERE p.user_id=? ORDER BY p.id DESC LIMIT 100').bind(u.id).all()).results;
      return J({profile:app?{name:app.name,city:app.city,...(JS(app.data)||{})}:{name:u.name},assets,posts})}
    if(p==='/post'&&m==='POST'){const b=await body();const link=clean(b.url,500);if(!/^https:\/\/[^\s]+\.[^\s]+$/.test(link))return J({error:'Please paste the https:// link to your post.'},400);const a=await env.DB.prepare('SELECT id FROM partner_assets WHERE id=? AND active=1').bind(+b.asset_id).first();if(!a)return J({error:'Content not found.'},404);await env.DB.prepare('INSERT INTO partner_posts(user_id,asset_id,url,note) VALUES(?,?,?,?)').bind(u.id,a.id,link,clean(b.note,300)).run();return J({ok:true})}
    return J({error:'Not found'},404)}
  // ---- client rating ----
  if(path==='/client/reviewable'&&m==='GET'){if(u.role!=='client')return J({error:'Forbidden'},403);
    const r=(await env.DB.prepare("SELECT b.id,b.ref,b.date,b.start,s.city,COALESCE(a.name,su.name,'Studio') studio,r.rating,r.feedback FROM bookings b JOIN studios s ON s.id=b.studio_id JOIN users su ON su.id=b.studio_user_id LEFT JOIN applications a ON a.user_id=su.id LEFT JOIN studio_reviews r ON r.booking_id=b.id WHERE b.client_id=? AND b.status='confirmed' AND b.date<=? ORDER BY b.date DESC").bind(u.id,today).all()).results;return J(r)}
  if(path==='/client/review'&&m==='POST'){if(u.role!=='client')return J({error:'Forbidden'},403);const b=await body();const rating=+b.rating;if(!(rating>=1&&rating<=5)||rating%1)return J({error:'Please choose 1 to 5 stars.'},400);
    const bk=await env.DB.prepare("SELECT id,studio_user_id FROM bookings WHERE id=? AND client_id=? AND studio_user_id IS NOT NULL AND status='confirmed' AND date<=?").bind(+b.booking_id,u.id,today).first();if(!bk)return J({error:'You can rate a studio after your session has taken place.'},400);
    await env.DB.prepare("INSERT INTO studio_reviews(booking_id,studio_user_id,client_id,rating,feedback) VALUES(?,?,?,?,?) ON CONFLICT(booking_id) DO UPDATE SET rating=excluded.rating,feedback=excluded.feedback").bind(bk.id,bk.studio_user_id,u.id,rating,clean(b.feedback,1000)).run();return J({ok:true})}
  // ---- admin extras ----
  if(path.startsWith('/admin/')&&STAFF.includes(u.role)){
    const p=path.slice(6);if(!staffAllowed(u,p,m))return J({error:'Your role cannot do this.'},403);
    if(p==='/users'&&m==='GET')return J((await env.DB.prepare("SELECT id,email,name,role,active,must_change,created_at FROM users WHERE role<>'client' ORDER BY id").all()).results);
    if(p==='/user'&&m==='POST'){const b=await body();const email=clean(b.email,200).toLowerCase(),role=b.role;if(!emailOk(email))return J({error:'Valid email required.'},400);if(!['admin','manager','editor','studio','partner'].includes(role))return J({error:'Pick a role.'},400);const pw=tmpPw(),salt=rnd(16);
      try{await env.DB.prepare('INSERT INTO users(email,name,role,pass_hash,pass_salt,must_change) VALUES(?,?,?,?,?,1)').bind(email,clean(b.name,100),role,await hashPw(pw,salt),salt).run()}catch{return J({error:'A login with this email already exists.'},409)}return J({ok:true,email,password:pw})}
    if(p==='/user-reset'&&m==='POST'){const b=await body();const pw=tmpPw(),salt=rnd(16);const t=await env.DB.prepare("SELECT id,email FROM users WHERE id=? AND role<>'client'").bind(+b.id).first();if(!t)return J({error:'Not found'},404);await env.DB.batch([env.DB.prepare('UPDATE users SET pass_hash=?,pass_salt=?,must_change=1 WHERE id=?').bind(await hashPw(pw,salt),salt,t.id),env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(t.id)]);return J({ok:true,email:t.email,password:pw})}
    if(p==='/user-update'&&m==='POST'){const b=await body();const t=await env.DB.prepare("SELECT id,role FROM users WHERE id=? AND role<>'client'").bind(+b.id).first();if(!t)return J({error:'Not found'},404);if(t.id===u.id||t.id===1)return J({error:'This account cannot be changed here.'},400);
      const st=[];if(b.role!==undefined){if(!['admin','manager','editor','studio','partner'].includes(b.role))return J({error:'Bad role'},400);st.push(env.DB.prepare('UPDATE users SET role=? WHERE id=?').bind(b.role,t.id))}
      if(b.active!==undefined){st.push(env.DB.prepare('UPDATE users SET active=? WHERE id=?').bind(b.active?1:0,t.id));if(!b.active)st.push(env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(t.id))}
      if(b.name!==undefined)st.push(env.DB.prepare('UPDATE users SET name=? WHERE id=?').bind(clean(b.name,100),t.id));if(st.length)await env.DB.batch(st);return J({ok:true})}
    if(p==='/studio-users'&&m==='GET')return J((await env.DB.prepare("SELECT u.id,COALESCE(a.name,u.name,u.email) name FROM users u LEFT JOIN applications a ON a.user_id=u.id WHERE u.role='studio' AND u.active=1 ORDER BY 2").all()).results);
    if(p==='/booking-assign'&&m==='POST'){const b=await body();let sid=null;if(b.studio_user_id){const s=await env.DB.prepare("SELECT id FROM users WHERE id=? AND role='studio' AND active=1").bind(+b.studio_user_id).first();if(!s)return J({error:'Studio login not found.'},404);sid=s.id}await env.DB.prepare('UPDATE bookings SET studio_user_id=? WHERE id=?').bind(sid,+b.id).run();return J({ok:true})}
    if(p==='/applications'&&m==='GET'){const k=url.searchParams.get('kind');const rows=(await env.DB.prepare(`SELECT id,kind,status,name,email,phone,city,data,user_id,admin_note,created_at FROM applications ${k?'WHERE kind=?':''} ORDER BY id DESC LIMIT 200`).bind(...(k?[k]:[])).all()).results;
      const ids=rows.map(r=>r.id);let fl=[];if(ids.length)fl=(await env.DB.prepare(`SELECT id,app_id,kind,name,mime,size FROM files WHERE app_id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all()).results;
      return J(rows.map(r=>({...r,data:JS(r.data)||{},files:fl.filter(f=>f.app_id===r.id)})))}
    if(p==='/file'&&m==='GET'){const f=await env.DB.prepare("SELECT mime,data,name FROM files WHERE id=? AND app_id IS NOT NULL").bind(+url.searchParams.get('id')).first();if(!f)return J({error:'Not found'},404);const bin=Uint8Array.from(atob(f.data),c=>c.charCodeAt(0));return new Response(bin,{headers:{'content-type':f.mime,'content-disposition':(f.mime==='application/pdf'?'attachment':'inline')+'; filename="'+f.name.replace(/[^\w.\- ]/g,'_')+'"','cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"}})}
    if(p==='/application-status'&&m==='POST'){const b=await body();if(!['new','reviewing','approved','rejected'].includes(b.status))return J({error:'Bad status'},400);await env.DB.prepare('UPDATE applications SET status=?,admin_note=COALESCE(?,admin_note) WHERE id=?').bind(b.status,b.note===undefined?null:clean(b.note,500),+b.id).run();return J({ok:true})}
    if(p==='/application-login'&&m==='POST'){const b=await body();const a=await env.DB.prepare('SELECT * FROM applications WHERE id=?').bind(+b.id).first();if(!a)return J({error:'Not found'},404);if(a.user_id)return J({error:'A login was already created for this application.'},409);const role=a.kind==='studio'?'studio':'partner';const pw=tmpPw(),salt=rnd(16);
      try{const r=await env.DB.prepare('INSERT INTO users(email,name,role,pass_hash,pass_salt,must_change) VALUES(?,?,?,?,?,1)').bind(a.email,a.name,role,await hashPw(pw,salt),salt).run();await env.DB.prepare("UPDATE applications SET user_id=?,status='approved' WHERE id=?").bind(r.meta.last_row_id,a.id).run()}catch{return J({error:'A login with this email already exists.'},409)}
      return J({ok:true,email:a.email,password:pw,role})}
    if(p==='/reviews'&&m==='GET')return J((await env.DB.prepare("SELECT r.id,r.rating,r.feedback,r.created_at,b.ref,b.date,b.name client,COALESCE(a.name,su.name) studio FROM studio_reviews r JOIN bookings b ON b.id=r.booking_id JOIN users su ON su.id=r.studio_user_id LEFT JOIN applications a ON a.user_id=su.id ORDER BY r.id DESC LIMIT 200").all()).results);
    if(p==='/partner-assets'&&m==='GET')return J((await env.DB.prepare("SELECT a.*,(SELECT count(*) FROM partner_posts p WHERE p.asset_id=a.id) posts FROM partner_assets a ORDER BY id DESC").all()).results);
    if(p==='/partner-asset'&&m==='POST'){const b=await body();const title=clean(b.title,200),link=clean(b.url,500);if(!title||!/^https:\/\//.test(link))return J({error:'Add a title and an https:// link.'},400);await env.DB.prepare('INSERT INTO partner_assets(title,url,notes) VALUES(?,?,?)').bind(title,link,clean(b.notes,500)).run();return J({ok:true})}
    if(p==='/partner-asset-delete'&&m==='POST'){const b=await body();await env.DB.batch([env.DB.prepare('DELETE FROM partner_posts WHERE asset_id=?').bind(+b.id),env.DB.prepare('DELETE FROM partner_assets WHERE id=?').bind(+b.id)]);return J({ok:true})}
    if(p==='/partner-posts'&&m==='GET')return J((await env.DB.prepare("SELECT p.id,p.url,p.note,p.created_at,a.title,COALESCE(ap.name,u.name,u.email) partner FROM partner_posts p JOIN users u ON u.id=p.user_id LEFT JOIN applications ap ON ap.user_id=u.id LEFT JOIN partner_assets a ON a.id=p.asset_id ORDER BY p.id DESC LIMIT 200").all()).results);
    if(p==='/channels'&&m==='GET')return J((await env.DB.prepare('SELECT * FROM channels ORDER BY sort,id').all()).results);
    if(p==='/channel'&&m==='POST'){const b=await body();const name=clean(b.name,100),link=clean(b.url,300),av=clean(b.avatar,500);if(!name||!/^https:\/\/[^\s]+\.[^\s]+$/.test(link))return J({error:'Add a name and an https:// link to the channel or profile.'},400);if(av&&!/^(https:\/\/|\/)/.test(av))return J({error:'Avatar must be an https:// link or uploaded image.'},400);
      const f=[name,link,av,clean(b.subs,40),Number.isFinite(+b.sort)?+b.sort:100,b.active===false||b.active===0?0:1,b.section==='paps'?'paps':'channels'];if(b.id)await env.DB.prepare('UPDATE channels SET name=?,url=?,avatar=?,subs=?,sort=?,active=?,section=? WHERE id=?').bind(...f,+b.id).run();else await env.DB.prepare('INSERT INTO channels(name,url,avatar,subs,sort,active,section) VALUES(?,?,?,?,?,?,?)').bind(...f).run();return J({ok:true})}
    if(p==='/channel-delete'&&m==='POST'){const b=await body();await env.DB.prepare('DELETE FROM channels WHERE id=?').bind(+b.id).run();return J({ok:true})}
    if(p==='/testimonial-add'&&m==='POST'){const b=await body();const author=clean(b.author,100),text=clean(b.body,1200);if(!author||text.length<10)return J({error:'Add a name and the testimonial text.'},400);await env.DB.prepare('INSERT INTO testimonials(author,role,body,status) VALUES(?,?,?,?)').bind(author,clean(b.role,100),text,b.status==='pending'?'pending':'live').run();return J({ok:true})}
    if(p==='/media'&&m==='POST'){const b=await body();if(!['image/png','image/jpeg','image/webp'].includes(b.mime))return J({error:'Use a JPG, PNG or WebP image.'},400);const id=await saveFile(env,'blog',b,null);if(!id)return J({error:'Image could not be read or is too large (max about 1 MB).'},400);return J({ok:true,url:'/api/media?id='+id})}
    if(p==='/blogs'&&m==='GET')return J((await env.DB.prepare('SELECT id,slug,title,excerpt,body,cover,status,category,tags,author,seo_desc,publish_at,featured,created_at,updated_at FROM blogs ORDER BY id DESC').all()).results);
    if(p==='/blog'&&m==='POST'){const b=await body();const title=clean(b.title,200);const slug=clean(b.slug||title,100).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');if(!slug||!title)return J({error:'Title required.'},400);
      const f=[slug,title,clean(b.excerpt,400),cleanHtml(b.body),clean(b.cover,500),b.status==='live'?'live':'draft',clean(b.category,60),clean(b.tags,200),clean(b.author,80),clean(b.seo_desc,300),/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(b.publish_at||'')?b.publish_at:'',b.featured?1:0];
      try{if(b.id)await env.DB.prepare("UPDATE blogs SET slug=?,title=?,excerpt=?,body=?,cover=?,status=?,category=?,tags=?,author=?,seo_desc=?,publish_at=?,featured=?,updated_at=datetime('now') WHERE id=?").bind(...f,+b.id).run();else await env.DB.prepare('INSERT INTO blogs(slug,title,excerpt,body,cover,status,category,tags,author,seo_desc,publish_at,featured) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(...f).run()}catch{return J({error:'That URL slug is already used.'},409)}return J({ok:true})}
  }
  return null}
