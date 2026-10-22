document.getElementById('yr').textContent=new Date().getFullYear();
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.12});
document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
const cio=new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)return;cio.unobserve(e.target);
const t=+e.target.dataset.count,s=e.target.dataset.suffix||'';let n=0;const step=()=>{n+=Math.max(1,t/50);if(n>=t){e.target.textContent=t+s}else{e.target.textContent=Math.floor(n)+s;requestAnimationFrame(step)}};step()}),{threshold:.5});
document.querySelectorAll('[data-count]').forEach(el=>cio.observe(el));

const vio=new IntersectionObserver(es=>es.forEach(e=>{const v=e.target;if(e.isIntersecting){if(!v.src&&v.dataset.src){v.src=v.dataset.src}v.play().catch(()=>{})}else{v.pause()}}),{threshold:.3});
document.querySelectorAll('video[data-src]').forEach(v=>vio.observe(v));
// kinetic text
document.querySelectorAll('.kin').forEach(el=>{let i=0;const walk=n=>{[...n.childNodes].forEach(c=>{if(c.nodeType===3){const f=document.createDocumentFragment();[...c.textContent].forEach(ch=>{if(ch===' '){f.append(' ');return}const s=document.createElement('span');s.className='ch';s.style.setProperty('--i',i++);s.textContent=ch;f.append(s)});c.replaceWith(f)}else if(c.nodeType===1)walk(c)})};walk(el)});
// progress, parallax, big text, cursor glow
const prog=document.getElementById('prog'),glow=document.getElementById('glow'),hl=document.querySelector('.hero-logo'),bt=document.querySelector('.big .bt'),mq=document.querySelector('.marquee');
addEventListener('scroll',()=>{const y=scrollY,m=document.documentElement.scrollHeight-innerHeight;prog.style.width=(y/m*100)+'%';
if(hl)hl.style.transform=`translateY(${y*.12}px) rotate(${y*.01}deg)`;
if(bt){const r=bt.parentElement.getBoundingClientRect();bt.style.transform=`translateX(${-(r.top)*.6}px)`}
if(mq)mq.style.transform=`rotate(${-1.5+Math.sin(y/300)*.8}deg)`},{passive:true});
addEventListener('pointermove',e=>{glow.style.left=e.clientX+'px';glow.style.top=e.clientY+'px'},{passive:true});
// tilt cards
document.querySelectorAll('.tilt,.lcard,.pcard').forEach(c=>{c.addEventListener('pointermove',e=>{const r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;c.style.transform=`perspective(600px) rotateY(${x*14}deg) rotateX(${-y*14}deg) scale(1.04)`});c.addEventListener('pointerleave',()=>{c.style.transform=''})});

// word-reveal headings
document.querySelectorAll('section h2').forEach(h=>{if(h.querySelector('.w'))return;let k=0;h.innerHTML=h.textContent.split(' ').map(w=>`<span class="w"><i style="--k:${k++}">${w}</i></span>`).join(' ')});
// magnetic buttons
document.querySelectorAll('.btn').forEach(b=>{b.addEventListener('pointermove',e=>{const r=b.getBoundingClientRect();b.style.transform=`translate(${(e.clientX-r.left-r.width/2)*.2}px,${(e.clientY-r.top-r.height/2)*.3}px)`});b.addEventListener('pointerleave',()=>{b.style.transform=''})});
// scroll-velocity skew on marquee + logo rows, drifting blobs
let lastY=scrollY,sk=0;const cl=['#FF2E93','#00E5FF','#FFEA00','#9B5CFF'];
document.querySelectorAll('#how,#studios,#press,#collage,#faces,#certs').forEach((s,i)=>{const b=document.createElement('div');b.className='blob';b.style.cssText=`width:320px;height:320px;background:${cl[i%4]};${i%2?'right':'left'}:-100px;top:${10+i*5}%`;s.prepend(b)});
(function loop(){const v=scrollY-lastY;lastY=scrollY;sk+=(Math.max(-8,Math.min(8,v*.25))-sk)*.1;document.querySelectorAll('.lrow').forEach(el=>{el.style.transform=`skewX(${-sk}deg)`});
document.querySelectorAll('.blob').forEach((b,i)=>{const r=b.parentElement.getBoundingClientRect();b.style.transform=`translateY(${-r.top*(.08+i*.02)}px)`});requestAnimationFrame(loop)})();
// live testimonials + blog (only rendered when admin has published content)
(async()=>{try{const c=document.getElementById('contact');if(!c)return;
const t=await (await fetch('/api/testimonials')).json();
if(t.length){const s=document.createElement('section');s.id='voices';s.className='reveal in';s.innerHTML='<h2>What guests say</h2><div class="tgrid">'+t.map(x=>`<blockquote class="tq"><p></p><footer></footer></blockquote>`).join('')+'</div>';s.querySelectorAll('.tq').forEach((q,i)=>{q.querySelector('p').textContent='\u201C'+t[i].body+'\u201D';q.querySelector('footer').textContent=t[i].author+(t[i].role?', '+t[i].role:'')});c.before(s)}
const b=await (await fetch('/api/blogs')).json();
if(b.length){const s=document.createElement('section');s.id='stories';s.className='reveal in';s.innerHTML='<h2>Latest stories</h2><div class="tgrid"></div>';const g=s.querySelector('.tgrid');b.slice(0,3).forEach(x=>{const a=document.createElement('a');a.className='tq';a.href='/blog/?s='+encodeURIComponent(x.slug);a.style.textDecoration='none';a.style.color='#fff';const h=document.createElement('p');h.style.fontWeight='800';h.textContent=x.title;const f=document.createElement('footer');f.textContent=x.excerpt||'';a.append(h,f);g.append(a)});c.before(s)}}catch(e){}})();
