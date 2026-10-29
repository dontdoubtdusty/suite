// =====================================================================
// Big apps feedback (shared by all the Big apps: copy the same file into each repo)
//
// 1. Haptic ticks: a light buzz when you save, delete, finish or toggle something.
//    Android phones get a different pattern for each kind; iPhones get a single tick for all of them,
//    which is all Safari allows. Desktop computers get nothing.
// 2. Button squish: every button visibly presses in and springs back, even on a quick tap.
//    (iPhones drop the :active style almost instantly, so a plain tap barely showed.) Each app's CSS
//    writes its press styles as :is(:active,.prs), and this file adds .prs while a finger is down,
//    holding it for at least a moment so quick taps show too.
//
// No sound. Haptics can be switched off under Settings > Haptics; the choice is kept on this device,
// separate from each app's data, so restoring a backup or syncing doesn't change it.
//
// For apps:
//   Feedback.hap(kind)    kind: 'tick' | 'select' | 'success' | 'warn' | 'error'
//   Feedback.fromToast(m) picks a kind from a toast's message (call it at the top of the app's toast())
//   Feedback.view(cls)    HTML for the Settings row ('' on devices that can't buzz); cls is added to the .seg
// =====================================================================
(function(){
 const KEY='big-haptics';                  // '0' means off
 const IOS=/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform=='MacIntel'&&navigator.maxTouchPoints>1);
 const CAN=IOS||(!!navigator.vibrate&&matchMedia('(pointer: coarse)').matches);
 let on=true;try{on=localStorage.getItem(KEY)!=='0'}catch(e){}

 // ---------- Haptics ----------
 // Patterns in milliseconds (buzz, pause, buzz...). Rank decides which wins when two land close together,
 // e.g. a checkbox toggle followed by its "Saved" toast only buzzes once.
 const P={tick:8,select:12,success:[14,70,22],warn:[24,60,24],error:[30,50,30,50,30]};
 const RANK={tick:0,select:1,success:2,warn:2,error:3};
 let last=0,lastR=-1,sw=null;
 // iPhone trick: tapping the label of a hidden iOS switch makes the phone tick. Its events are kept
 // from reaching the app, so nothing else reacts to it.
 function iosTick(){try{if(!sw){sw=document.createElement('label');sw.setAttribute('aria-hidden','true');sw.style.display='none';
   const i=document.createElement('input');i.type='checkbox';i.setAttribute('switch','');i.tabIndex=-1;sw.appendChild(i);
   const stop=e=>e.stopPropagation();sw.addEventListener('click',stop);i.addEventListener('click',stop);i.addEventListener('change',stop);
   document.body.appendChild(sw)}sw.click()}catch(e){}}
 function hap(kind){if(!on||!CAN)return;kind=P[kind]?kind:'tick';const n=Date.now(),r=RANK[kind];
  if(n-last<500&&r<=lastR)return;last=n;lastR=r;
  if(navigator.vibrate){try{navigator.vibrate(P[kind])}catch(e){}}else if(IOS)iosTick()}

 // Toast messages already say what just happened, so they pick the buzz
 const WARN=/^(Deleted|Removed|Taken off|List cleared|Photo removed|All data erased)/i;
 const ERR=/^(Couldn|Can.t|Give it|Enter |Paste a|That doesn|There.s no|The clipboard|Still connecting|Sharing links|No recipes|Nothing to|Already|All five slots|Those are all)|is already in/i;
 const OK=/^(Done|Nice|Saved|Added|Logged|Everything is paid|Backup restored|Target set|Started|Copied|Photo added|Link added|Renamed|Won.t suggest)/i;
 function fromToast(msg){msg=String(msg||'');hap(WARN.test(msg)?'warn':ERR.test(msg)?'error':OK.test(msg)?'success':'tick')}

 // Toggles: checkboxes, and choosing a new option in a segmented control
 document.addEventListener('change',e=>{const t=e.target;if(t&&t.matches&&t.matches('input[type=checkbox],input[type=radio]'))hap('select')});
 document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('.seg button');if(b&&!b.dataset.fb&&!b.classList.contains('on'))hap('select')},true);

 // ---------- Settings row ----------
 function view(cls){if(!CAN)return'';
  return `<div class="sec">Haptics</div><div class="seg${cls?' '+cls:''}"><button type="button" class="${on?'on':''}" data-fb="1">On</button><button type="button" class="${on?'':'on'}" data-fb="0">Off</button></div>`}
 document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-fb]');if(!b)return;e.preventDefault();
  on=b.dataset.fb=='1';try{localStorage.setItem(KEY,on?'1':'0')}catch(_){}
  b.parentElement.querySelectorAll('[data-fb]').forEach(x=>x.classList.toggle('on',x.dataset.fb==b.dataset.fb));
  if(on){last=0;hap('success')}});

 // ---------- Button squish ----------
 // Mirrors :active: the pressed element and everything around it get .prs while the finger is down,
 // kept for at least MIN ms so a quick tap still shows. Moving the finger (scrolling) lets go at once.
 const MIN=110,MOVE=10;let pr=null;
 function release(now){if(!pr)return;const p=pr;pr=null;const off=()=>p.els.forEach(el=>el.classList.remove('prs'));
  const wait=now?0:MIN-(Date.now()-p.t);wait>0?setTimeout(off,wait):off()}
 document.addEventListener('pointerdown',e=>{if(e.button>0)return;release(true);const els=[];
  for(let el=e.target;el&&el.nodeType==1&&el!==document.body;el=el.parentElement)els.push(el);
  els.forEach(el=>el.classList.add('prs'));pr={els,t:Date.now(),x:e.clientX,y:e.clientY,id:e.pointerId}},{passive:true});
 document.addEventListener('pointermove',e=>{if(pr&&e.pointerId==pr.id&&Math.hypot(e.clientX-pr.x,e.clientY-pr.y)>MOVE)release(true)},{passive:true});
 document.addEventListener('pointerup',()=>release(),{passive:true});
 document.addEventListener('pointercancel',()=>release(true),{passive:true});

 window.Feedback={hap,fromToast,view,get on(){return on&&CAN}};
})();
