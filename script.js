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
