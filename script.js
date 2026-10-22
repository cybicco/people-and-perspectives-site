document.getElementById('yr').textContent=new Date().getFullYear();
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.12});
document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
const cio=new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)return;cio.unobserve(e.target);
const t=+e.target.dataset.count,s=e.target.dataset.suffix||'';let n=0;const step=()=>{n+=Math.max(1,t/50);if(n>=t){e.target.textContent=t+s}else{e.target.textContent=Math.floor(n)+s;requestAnimationFrame(step)}};step()}),{threshold:.5});
document.querySelectorAll('[data-count]').forEach(el=>cio.observe(el));

const vio=new IntersectionObserver(es=>es.forEach(e=>{const v=e.target;if(e.isIntersecting){if(!v.src&&v.dataset.src){v.src=v.dataset.src}v.play().catch(()=>{})}else{v.pause()}}),{threshold:.3});
document.querySelectorAll('video[data-src]').forEach(v=>vio.observe(v));
