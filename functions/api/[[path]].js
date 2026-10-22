// Single API router. All times are IST (Asia/Kolkata). Bindings: DB (D1). Secrets via env vars only.
const J=(o,s=200,h={})=>new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json','cache-control':'no-store',...h}});
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const unhex=h=>new Uint8Array(h.match(/../g).map(x=>parseInt(x,16)));
async function hashPw(pw,saltHex){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unhex(saltHex),iterations:100000},k,256))}
const rnd=n=>hex(crypto.getRandomValues(new Uint8Array(n)));
const sha=async s=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
function eq(a,b){if(a.length!==b.length)return false;let r=0;for(let i=0;i<a.length;i++)r|=a.charCodeAt(i)^b.charCodeAt(i);return r===0}
const cookie=(r,n)=>((r.headers.get('cookie')||'').match(new RegExp('(?:^|; )'+n+'=([^;]*)'))||[])[1];
async function me(env,req){const t=cookie(req,'pp_sess');if(!t)return null;const h=await sha(t);return await env.DB.prepare('SELECT u.id,u.email,u.name,u.role,u.must_change FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(h,Date.now()).first()}
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
  const taken=new Set((await env.DB.prepare("SELECT start FROM bookings WHERE studio_id=? AND date=? AND status IN('pending','confirmed')").bind(studioId,date).all()).results.map(r=>r.start));
  const earliest=istNow().getTime()+st.min_notice_hours*3600000;const out=[];
  for(const x of w){for(let m=mins(x.start);m+st.slot_minutes<=mins(x.end);m+=st.slot_minutes+st.buffer_minutes){const s=hm(m);const ts=Date.parse(date+'T'+s+':00Z');if(ts<earliest||taken.has(s))continue;out.push({start:s,end:hm(m+st.slot_minutes)})}}
  return out}
const clean=(s,n=300)=>String(s??'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,n);
const emailOk=e=>/^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,}$/.test(e);
const needAdmin=u=>u&&u.role==='admin';
export async function onRequest({request,env,params}){
  if(!env.DB)return J({error:'Database not configured'},503);
  const path='/'+(params.path||[]).join('/');const m=request.method;const url=new URL(request.url);
  if(m!=='GET'&&m!=='HEAD'){const ct=request.headers.get('content-type')||'';if(!ct.includes('application/json'))return J({error:'Bad content type'},415);const o=request.headers.get('origin');if(o&&o!==url.origin)return J({error:'Bad origin'},403)}
  const body=async()=>{try{return await request.json()}catch{return{}}};
  try{
  // ---------- public ----------
  if(path==='/studios'&&m==='GET'){return J((await env.DB.prepare('SELECT id,city,name,slot_minutes FROM studios WHERE active=1 ORDER BY id').all()).results)}
  if(path==='/slots'&&m==='GET'){return J(await slots(env,+url.searchParams.get('studio'),url.searchParams.get('date')||''))}
  if(path==='/book'&&m==='POST'){
    const b=await body();const name=clean(b.name,100),email=clean(b.email,200).toLowerCase(),phone=clean(b.phone,30);
    if(!name||!emailOk(email)||phone.length<7)return J({error:'Please enter your name, a valid email and phone number.'},400);
    const recent=await env.DB.prepare("SELECT count(*) c FROM bookings WHERE email=? AND created_at>datetime('now','-1 hour')").bind(email).first();if(recent.c>=3)return J({error:'Too many requests. Please try again later.'},429);
    const ok=(await slots(env,+b.studio_id,clean(b.date,10))).find(s=>s.start===b.start);if(!ok)return J({error:'That slot is no longer available. Please pick another.'},409);
    const ref='PP'+rnd(3).toUpperCase();
    try{await env.DB.prepare('INSERT INTO bookings(ref,studio_id,date,start,end,name,email,phone,topic,channels,press) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(ref,+b.studio_id,b.date,ok.start,ok.end,name,email,phone,clean(b.topic,1000),JSON.stringify((b.channels||[]).slice(0,20).map(x=>clean(x,40))),JSON.stringify((b.press||[]).slice(0,20).map(x=>clean(x,40)))).run()}catch(e){return J({error:'That slot was just taken. Please pick another.'},409)}
    return J({ok:true,ref,date:b.date,start:ok.start,end:ok.end})}
  if(path==='/testimonials'&&m==='GET'){return J((await env.DB.prepare("SELECT author,role,body FROM testimonials WHERE status='live' ORDER BY id DESC LIMIT 12").all()).results)}
  if(path==='/blogs'&&m==='GET'){return J((await env.DB.prepare("SELECT slug,title,excerpt,cover,created_at FROM blogs WHERE status='live' ORDER BY id DESC LIMIT 30").all()).results)}
  // ---------- auth ----------
  if(path==='/login'&&m==='POST'){
    const b=await body();const email=clean(b.email,200).toLowerCase(),pw=String(b.password||'');
    let u=await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
    if(!u||!eq(await hashPw(pw,u.pass_salt),u.pass_hash)){await new Promise(r=>setTimeout(r,400));return J({error:'Incorrect email or password.'},401)}
    const tok=rnd(32);await env.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await sha(tok),u.id,Date.now()+7*864e5).run();
    await env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(Date.now()).run();
    return J({ok:true,role:u.role,must_change:u.must_change},200,{'set-cookie':`pp_sess=${tok}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`})}
  if(path==='/logout'&&m==='POST'){const t=cookie(request,'pp_sess');if(t)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha(t)).run();return J({ok:true},200,{'set-cookie':'pp_sess=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'})}
  const u=await me(env,request);
  if(path==='/me'&&m==='GET')return u?J(u):J({error:'Not signed in'},401);
  if(!u)return J({error:'Not signed in'},401);
  if(path==='/password'&&m==='POST'){const b=await body();const pw=String(b.new||'');if(pw.length<10)return J({error:'Use at least 10 characters.'},400);const row=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(u.id).first();if(!eq(await hashPw(String(b.current||''),row.pass_salt),row.pass_hash))return J({error:'Current password is incorrect.'},403);const salt=rnd(16);await env.DB.prepare('UPDATE users SET pass_hash=?,pass_salt=?,must_change=0 WHERE id=?').bind(await hashPw(pw,salt),salt,u.id).run();return J({ok:true})}
  // ---------- admin ----------
  if(path.startsWith('/admin/')){
    if(!needAdmin(u))return J({error:'Forbidden'},403);
    const p=path.slice(6);
    if(p==='/bookings'&&m==='GET')return J((await env.DB.prepare('SELECT b.*,s.city FROM bookings b JOIN studios s ON s.id=b.studio_id ORDER BY b.date DESC,b.start DESC LIMIT 300').all()).results);
    if(p==='/booking-status'&&m==='POST'){const b=await body();if(!['pending','confirmed','cancelled'].includes(b.status))return J({error:'Bad status'},400);await env.DB.prepare('UPDATE bookings SET status=? WHERE id=?').bind(b.status,+b.id).run();return J({ok:true})}
    if(p==='/studios'&&m==='GET'){const st=(await env.DB.prepare('SELECT * FROM studios ORDER BY id').all()).results;const av=(await env.DB.prepare('SELECT * FROM availability ORDER BY studio_id,dow,start').all()).results;const bl=(await env.DB.prepare("SELECT * FROM blocked WHERE date>=date('now','-1 day') ORDER BY date").all()).results;return J({studios:st,availability:av,blocked:bl})}
    if(p==='/studio'&&m==='POST'){const b=await body();const sl=+b.slot_minutes,bf=+b.buffer_minutes,nt=+b.min_notice_hours;if(!(sl>=15&&sl<=480)||!(bf>=0&&bf<=240)||!(nt>=0&&nt<=720))return J({error:'Check slot length, buffer and notice values.'},400);await env.DB.prepare('UPDATE studios SET slot_minutes=?,buffer_minutes=?,min_notice_hours=?,active=? WHERE id=?').bind(sl,bf,nt,b.active?1:0,+b.id).run();return J({ok:true})}
    if(p==='/hours'&&m==='POST'){const b=await body();const rows=(b.hours||[]).filter(h=>h.dow>=0&&h.dow<=6&&/^\d\d:\d\d$/.test(h.start)&&/^\d\d:\d\d$/.test(h.end)&&mins(h.start)<mins(h.end));const st=[env.DB.prepare('DELETE FROM availability WHERE studio_id=?').bind(+b.studio_id),...rows.map(h=>env.DB.prepare('INSERT INTO availability(studio_id,dow,start,end) VALUES(?,?,?,?)').bind(+b.studio_id,+h.dow,h.start,h.end))];await env.DB.batch(st);return J({ok:true})}
    if(p==='/block'&&m==='POST'){const b=await body();if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date||''))return J({error:'Bad date'},400);await env.DB.prepare('INSERT INTO blocked(studio_id,date,reason) VALUES(?,?,?)').bind(b.studio_id?+b.studio_id:null,b.date,clean(b.reason,100)).run();return J({ok:true})}
    if(p==='/unblock'&&m==='POST'){const b=await body();await env.DB.prepare('DELETE FROM blocked WHERE id=?').bind(+b.id).run();return J({ok:true})}
    return J({error:'Not found'},404)}
  return J({error:'Not found'},404)
  }catch(e){return J({error:'Server error'},500)}
}
