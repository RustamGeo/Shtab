/* ---------- облако: Supabase (вход по коду из письма, синхронизация, офлайн-очередь) ---------- */
const CFG=window.SHTAB_CONFIG||{};
let sb=null,sbUser=null,localOnly=false;
const PENDQ_K=LSK+'.pendQ';
let pendQ={};try{pendQ=JSON.parse(localStorage.getItem(PENDQ_K)||'{}')||{}}catch(e){pendQ={}}
function savePendQ(){lsSet(PENDQ_K,JSON.stringify(pendQ))}
/* ---------- сквозное шифрование: в облако уходит только шифротекст (AES-256-GCM, ключ из фразы через PBKDF2) ---------- */
const EK_K=LSK+'.ek',ITER=600000,LOCKED=Symbol('locked');
let KEY=null,CRYPT=null,cryptLock=false,colUid=null,cryptKnown=false;
const u8b64=u=>{u=new Uint8Array(u);let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s)};
const b64u8=b=>Uint8Array.from(atob(b),c=>c.charCodeAt(0));
const rnd=n=>crypto.getRandomValues(new Uint8Array(n));
async function deriveKey(phrase,salt,iter){const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(phrase.normalize('NFC')),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt:b64u8(salt),iterations:iter||ITER,hash:'SHA-256'},base,{name:'AES-GCM',length:256},true,['encrypt','decrypt'])}
async function encWith(key,kid,obj){const iv=rnd(12);const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(obj)));return{enc:1,kid,iv:u8b64(iv),ct:u8b64(ct)}}
async function decWith(key,d){const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64u8(d.iv)},key,b64u8(d.ct));return JSON.parse(new TextDecoder().decode(pt))}
async function storeKey(){try{const raw=await crypto.subtle.exportKey('raw',KEY.key);lsSet(EK_K,JSON.stringify({kid:KEY.kid,raw:u8b64(raw)}))}catch(e){}}
async function loadKey(kid){try{const o=JSON.parse(localStorage.getItem(EK_K)||'null');if(!o||o.kid!==kid)return null;return{kid,key:await crypto.subtle.importKey('raw',b64u8(o.raw),{name:'AES-GCM'},true,['encrypt','decrypt'])}}catch(e){return null}}
const e2eOn=()=>!!CRYPT;
const randPhrase=()=>{const A='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*?+=';let r='';const b=rnd(32);for(let i=0;i<32&&r.length<8;i++)if(b[i]<Math.floor(256/A.length)*A.length)r+=A[b[i]%A.length];while(r.length<8)r+=A[rnd(1)[0]%A.length];return r};
async function decRow(data){if(!data||!data.enc)return data;if(!KEY||data.kid!==KEY.kid)return LOCKED;try{return await decWith(KEY.key,data)}catch(e){return LOCKED}}
async function rawSet(id,data){const {error}=await sb.from('docs').upsert({user_id:colUid,id,data,updated_at:new Date().toISOString()},{onConflict:'user_id,id'});if(error)throw error}
async function rawDel(id){const {error}=await sb.from('docs').delete().eq('user_id',colUid).eq('id',id);if(error)throw error}
function lockE2E(){KEY=null;cryptLock=true;setSync('locked');if(!PANE)showCrypt('unlock')}
async function onCryptDoc(c){CRYPT=c||null;cryptKnown=true;
  if(!CRYPT){if(KEY||localStorage.getItem(EK_K)){KEY=null;try{localStorage.removeItem(EK_K)}catch(e){}}cryptLock=false;renderAccount();return true}
  if(KEY&&KEY.kid===CRYPT.kid){cryptLock=false;renderAccount();return true}
  const k=await loadKey(CRYPT.kid);if(k){KEY=k;cryptLock=false;renderAccount();return true}
  lockE2E();renderAccount();return false}
// one collection of the signed-in user's documents, with the same surface the app already uses
function makeCol(uid){
  colUid=uid;const docs=new Map();let listeners=[],ch=null,legacy=new Set(),retry=0;
  const emit=()=>{if(cryptLock)return;const arr=[...docs.entries()].map(([id,data])=>({id,data:()=>data}));for(const l of listeners)l.next({docs:arr});
    if(KEY&&legacy.size){const ids=[...legacy];legacy.clear();setTimeout(()=>{for(const id of ids)if(id==='map'||S.projects[id])persist(id)},50)}};
  async function loadAll(){const {data,error}=await sb.from('docs').select('id,data');if(error)throw error;
    const cr=data.find(r=>r.id==='crypt');if(!(await onCryptDoc(cr&&cr.data)))return;
    const next=new Map();for(const r of data){if(r.id==='crypt')continue;const v=await decRow(r.data);
      if(v===LOCKED){clearTimeout(retry);retry=setTimeout(()=>loadAll().catch(()=>{}),3000);return}   // запись другим ключом — подождём, не трогая локальные данные
      if(CRYPT&&r.data&&!r.data.enc)legacy.add(r.id);next.set(r.id,v)}
    docs.clear();for(const [k,v] of next)docs.set(k,v);emit()}
  let seq=0;
  function subscribe(){if(ch)return;
    ch=sb.channel('docs-'+uid).on('postgres_changes',{event:'*',schema:'public',table:'docs',filter:'user_id=eq.'+uid},async pl=>{
      const my=++seq;
      if(pl.eventType==='DELETE'){const id=pl.old&&pl.old.id;if(id==='crypt'){await onCryptDoc(null);return}if(id&&docs.has(id)){docs.delete(id);emit()}}
      else if(pl.new&&pl.new.id){const id=pl.new.id;if(id==='crypt'){if(await onCryptDoc(pl.new.data))loadAll().catch(()=>{});return}
        const v=await decRow(pl.new.data);if(v===LOCKED){if(CRYPT&&(!KEY||KEY.kid!==CRYPT.kid))lockE2E();return}
        if(CRYPT&&pl.new.data&&!pl.new.data.enc)legacy.add(id);docs.set(id,v);emit()}
    }).subscribe(st=>{if(st==='SUBSCRIBED')loadAll().catch(()=>{});if(st==='CHANNEL_ERROR'||st==='TIMED_OUT'){setSync('err')}})}
  return{
    doc:id=>({
      set:async body=>{if(CRYPT&&!KEY){const e=new Error('locked');e.locked=true;throw e}
        const data=KEY?await encWith(KEY.key,KEY.kid,body):body;
        const {error}=await sb.from('docs').upsert({user_id:uid,id,data,updated_at:new Date().toISOString()},{onConflict:'user_id,id'});if(error)throw error;docs.set(id,body)},
      delete:async()=>{const {error}=await sb.from('docs').delete().eq('user_id',uid).eq('id',id);if(error)throw error;docs.delete(id)}}),
    onSnapshot(next,err){const l={next};listeners.push(l);loadAll().then(subscribe).catch(e=>{listeners=listeners.filter(x=>x!==l);err&&err(e)});return()=>{listeners=listeners.filter(x=>x!==l)}},
    refresh(){return loadAll().catch(()=>{})},
    close(){try{if(ch)sb.removeChannel(ch)}catch(e){}ch=null;listeners=[]}
  };
}
function fileSaver(){return{save:async({filename,data})=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:'application/json'}));a.download=filename;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500);return{status:'saved'}}}}
async function initStore(){
  dl=fileSaver();
  try{localOnly=localStorage.getItem(LSK+'.localOnly')==='1'}catch(e){}
  if(!CFG.url||!CFG.anonKey){setSync('local');renderAccount();return}
  if(!window.supabase){setSync('err');renderAccount();toast('Не загрузилась библиотека синхронизации. Проверьте интернет и перезапустите приложение.');return}
  sb=window.supabase.createClient(CFG.url,CFG.anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'shtab-auth'}});
  let session=null;try{session=(await sb.auth.getSession()).data.session}catch(e){}
  sb.auth.onAuthStateChange((ev,ses)=>{if(ev==='SIGNED_OUT'&&sbUser){stopSync();renderAccount()}});
  if(session&&session.user)startSync(session.user);
  else{setSync('local');renderAccount();if(!localOnly&&!PANE)showAuth()}
}
function startSync(user){
  sbUser=user;localOnly=false;lsSet(LSK+'.localOnly','0');hideAuth();renderAccount();
  for(const id in pendQ)LT[id]=Math.max(LT[id]||0,pendQ[id]||0);
  col=makeCol(user.id);setSync('saving');firstSnap=true;
  resub=()=>{clearTimeout(retryT);subAlive=true;col.onSnapshot(onSnap,()=>{subAlive=false;setSync('err');retryT=setTimeout(()=>{if(col)resub()},5000)})};resub();
  for(const id in pendQ){const p=pend[id]||(pend[id]={t:0,waiting:false,busy:false,again:false});clearTimeout(p.t);p.waiting=true;p.t=setTimeout(()=>flush(id),800)}
  if(S.screen==='projects')renderProjects();
  setTimeout(maybeAskE2E,2500);
}
function stopSync(){clearTimeout(retryT);subAlive=false;if(col&&col.close)col.close();col=null;sbUser=null;setSync('local')}
let subAlive=false,retryT=0,resub=null;
function wake(){if(!col)return;if(!subAlive&&resub)resub();else col.refresh();flushAll()}
window.addEventListener('online',wake);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)wake()});

/* --- экран входа: почта и пароль --- */
let authEmail='';
function showAuth(mode){
  mode=mode==='signup'?'signup':'signin';
  const el=$('#auth');el.hidden=false;const up=mode==='signup';
  el.innerHTML=`<div class="auth-card" role="dialog" aria-modal="true" aria-labelledby="authH">
    <div class="brand"><i>Ш</i>Штаб</div>
    <h1 id="authH">${up?'Новый аккаунт':'Вход'}</h1>
    <p class="auth-p">${up?'Придумайте пароль не короче 8 символов. Потом входите с этой почтой и паролем на каждом своём устройстве — проекты будут синхронизироваться.':'Войдите своей почтой и паролем. Один раз на каждом устройстве — дальше приложение помнит вас.'}</p>
    <form id="authF" class="auth-f" data-mode="${mode}">
      <label for="aEmail">Почта</label><input id="aEmail" type="email" autocomplete="${up?'email':'username'}" placeholder="you@example.com" value="${esc(authEmail)}" required>
      <label for="aPass">Пароль</label>
      <div class="auth-pw"><input id="aPass" type="password" autocomplete="${up?'new-password':'current-password'}" minlength="${up?8:1}" required><button type="button" class="ghost" data-act="auth-eye" aria-label="Показать пароль">Показать</button></div>
      ${up?'<label for="aPass2">Пароль ещё раз</label><input id="aPass2" type="password" autocomplete="new-password" minlength="8" required>':''}
      <button class="btn" type="submit">${up?'Создать аккаунт':'Войти'}</button>
    </form>
    <p class="auth-err" id="authErr" role="alert"></p>
    <div class="auth-row">${up?'<button class="ghost" data-act="auth-signin">У меня уже есть аккаунт</button>':'<button class="ghost" data-act="auth-signup">Создать аккаунт</button>'}</div>
    <button class="ghost auth-skip" data-act="auth-local">Пока без входа — только на этом устройстве</button>
  </div>`;
  setTimeout(()=>{const i=$(authEmail?'#aPass':'#aEmail');if(i)i.focus()},50);
}
function hideAuth(){const el=$('#auth');if(el){el.hidden=true;el.innerHTML=''}}
function authErr(m){const e=$('#authErr');if(e)e.textContent=m}
function authBusy(on){document.querySelectorAll('#auth button,#auth input').forEach(b=>b.disabled=on)}
function authMsg(error){const m=(error.message||'').toLowerCase();
  if(m.includes('invalid login'))return'Неверная почта или пароль. Если аккаунта ещё нет — нажмите «Создать аккаунт».';
  if(m.includes('already registered')||m.includes('already been registered')||m.includes('user already'))return'Аккаунт с этой почтой уже есть — войдите.';
  if(m.includes('email not confirmed'))return'В Supabase включено подтверждение почты. Выключите: Authentication → Sign In / Providers → Email → Confirm email.';
  if(m.includes('signups not allowed')||m.includes('signup is disabled'))return'Регистрация новых аккаунтов закрыта в настройках Supabase.';
  if(m.includes('password')&&(m.includes('weak')||m.includes('at least')||m.includes('should')))return'Пароль слишком простой — сделайте длиннее, добавьте цифры и буквы разного регистра.';
  if(m.includes('rate')||error.status===429)return'Слишком много попыток подряд. Подождите минуту.';
  if(m.includes('fetch')||m.includes('network'))return'Нет связи с сервером. Проверьте интернет.';
  return'Не получилось: '+error.message}
document.addEventListener('submit',async e=>{
  if(e.target.id!=='authF')return;e.preventDefault();
  const up=e.target.dataset.mode==='signup';authEmail=$('#aEmail').value.trim();const pass=$('#aPass').value;
  if(!authEmail||!pass)return;
  if(up){if(pass.length<8){authErr('Пароль должен быть не короче 8 символов');return}if(pass!==$('#aPass2').value){authErr('Пароли не совпадают');return}}
  authBusy(true);authErr('');
  let res;try{res=up?await sb.auth.signUp({email:authEmail,password:pass}):await sb.auth.signInWithPassword({email:authEmail,password:pass})}catch(err){res={error:err}}
  authBusy(false);
  const {data,error}=res||{};
  if(error){authErr(authMsg(error));return}
  if(up&&data&&data.user&&!data.session){authErr('Аккаунт создан, но Supabase ждёт подтверждения почты. Выключите Confirm email (Authentication → Sign In / Providers → Email) и войдите.');showAuth('signin');authErr('Аккаунт создан. Выключите в Supabase «Confirm email», затем войдите.');return}
  if(!data||!data.user){authErr('Не получилось войти. Попробуйте ещё раз.');return}
  startSync(data.user);toast(up?'Аккаунт создан. Добро пожаловать!':'Вы вошли как '+data.user.email);
},true);
async function signOut(){
  if(anyPending()||Object.keys(pendQ).length){flushAll();toast('Сначала дождитесь сохранения — попробуйте через пару секунд');return}
  try{await sb.auth.signOut()}catch(e){}
  stopSync();KEY=null;CRYPT=null;for(const k of ['','.map','.synced','.pendQ','.ui','.ek','.e2eAsk'])try{localStorage.removeItem(LSK+k)}catch(e){}
  location.reload();
}
function renderAccount(){
  const el=$('#acct');if(!el)return;
  const lockI='<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>';
  const cr=!sbUser?'':CRYPT?`<button class="sn-item e2e-on" data-act="e2e-menu" title="Данные в облаке зашифрованы — нажмите, чтобы сменить фразу">${lockI}<span>${cryptLock?'Нужна фраза шифрования':'Зашифровано'}</span></button>`
    :`<button class="sn-item e2e-off" data-act="e2e-setup" title="Сейчас данные в облаке не зашифрованы">${lockI}<span>Включить шифрование</span></button>`;
  if(sbUser)el.innerHTML=cr+`<div class="acct-mail" title="${esc(sbUser.email||'')}">${esc(sbUser.email||'Аккаунт')}</div><button class="sn-item" data-act="signout"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2.5H3v11h3M10.5 5 13.5 8l-3 3M13.3 8H6.5"/></svg><span>Выйти</span></button>`;
  else if(sb)el.innerHTML=`<button class="sn-item" data-act="signin"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2.5h3v11h-3M5.5 5 8.5 8l-3 3M8.3 8H1.5"/></svg><span>Войти и синхронизировать</span></button>`;
  else el.innerHTML=`<div class="acct-mail">Облако не настроено — данные только на этом устройстве</div>`;
}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-act]');if(!b)return;const a=b.dataset.act;
  if(a==='auth-signup'){const em=$('#aEmail');if(em)authEmail=em.value.trim();showAuth('signup')}
  else if(a==='auth-signin'){const em=$('#aEmail');if(em)authEmail=em.value.trim();showAuth('signin')}
  else if(a==='auth-eye'){const ins=document.querySelectorAll('#aPass,#aPass2');const show=ins[0].type==='password';ins.forEach(x=>x.type=show?'text':'password');b.textContent=show?'Скрыть':'Показать';b.setAttribute('aria-label',show?'Скрыть пароль':'Показать пароль')}
  else if(a==='auth-local'){localOnly=true;lsSet(LSK+'.localOnly','1');hideAuth();toast('Данные хранятся только на этом устройстве. Войти можно в меню слева.')}
  else if(a==='signin'){showAuth()}
  else if(a==='signout'){signOut()}
  else if(a==='e2e-setup'){if(!cryptKnown){toast('Подождите, пока загрузятся данные из облака');return}showCrypt('setup')}
  else if(a==='e2e-menu'){showCrypt(cryptLock?'unlock':'manage')}
  else if(a==='e2e-gen'){const v=randPhrase();for(const i of document.querySelectorAll('#cPass,#cPass2')){i.value=v;i.type='text'}const sh=$('#cShow');if(sh)sh.textContent=v;const w=$('#cGenOut');if(w)w.hidden=false}
  else if(a==='e2e-copy'){const v=($('#cPass')||{}).value;if(v&&navigator.clipboard)navigator.clipboard.writeText(v).then(()=>toast('Фраза скопирована — сохраните её в надёжном месте'),()=>{})}
  else if(a==='e2e-later'){lsSet(LSK+'.e2eAsk','later');hideAuth()}
  else if(a==='e2e-close'){hideAuth()}
  else if(a==='e2e-change'){showCrypt('change')}
  else if(a==='e2e-off'){showCrypt('off')}
  else if(a==='e2e-eye'){const ins=document.querySelectorAll('#cPass,#cPass2');const show=ins[0]&&ins[0].type==='password';ins.forEach(x=>x.type=show?'text':'password');b.textContent=show?'Скрыть':'Показать'}
},true);

/* --- окна шифрования --- */
let cryptCtx=null;
function showCrypt(mode,ctx){cryptCtx=ctx||null;const el=$('#auth');el.hidden=false;
  const pw=(lab,id,auto)=>`<label for="${id}">${lab}</label><div class="auth-pw"><input id="${id}" type="password" autocomplete="${auto}" spellcheck="false" autocapitalize="off" minlength="8" required>${id==='cPass'?'<button type="button" class="ghost" data-act="e2e-eye">Показать</button>':''}</div>`;
  const gen=`<div class="e2e-gen"><button type="button" class="btn sec" data-act="e2e-gen">Сгенерировать 8 случайных символов</button><div id="cGenOut" class="e2e-out" hidden><code id="cShow"></code><button type="button" class="ghost" data-act="e2e-copy">Скопировать</button></div></div>`;
  const T={
    setup:['Шифрование данных','Проекты, задачи и заметки будут шифроваться на устройстве, а в облако уйдёт только шифротекст. Нужна фраза-пароль: она вводится один раз на каждом устройстве и никуда не отправляется.',gen+pw('Фраза (не короче 8 символов)','cPass','new-password')+pw('Фраза ещё раз','cPass2','new-password')+'<label class="e2e-ck"><input type="checkbox" id="cAgree" required> Я записал фразу. Если её забыть, данные из облака не восстановить.</label>','Включить шифрование',true],
    change:['Новая фраза','Все данные будут перешифрованы новой фразой. На других устройствах приложение попросит ввести её.',gen+pw('Новая фраза','cPass','new-password')+pw('Новая фраза ещё раз','cPass2','new-password')+'<label class="e2e-ck"><input type="checkbox" id="cAgree" required> Я записал новую фразу.</label>','Сменить фразу',false],
    unlock:['Введите фразу шифрования','Данные в облаке зашифрованы. Введите фразу один раз — на этом устройстве приложение её запомнит.',pw('Фраза','cPass','current-password'),'Открыть',false],
    restore:['Зашифрованная копия','Эта резервная копия зашифрована. Введите фразу, которой шифровались данные, когда её скачивали.',pw('Фраза','cPass','current-password'),'Расшифровать',false],
    off:['Выключить шифрование?','Данные в облаке снова будут храниться в открытом виде. Фразу вводить больше не нужно.','','Выключить',false]};
  if(mode==='manage'){el.innerHTML=`<div class="auth-card" role="dialog" aria-modal="true" aria-labelledby="cH"><div class="brand"><i>Ш</i>Штаб</div><h1 id="cH">Шифрование включено</h1><p class="auth-p">Проекты, задачи и заметки шифруются на устройстве ключом из вашей фразы (AES-256). В облаке лежит только шифротекст.</p><div class="auth-f"><button class="btn" data-act="e2e-change">Сменить фразу</button><button class="btn sec" data-act="e2e-off">Выключить шифрование</button></div><button class="ghost auth-skip" data-act="e2e-close">Закрыть</button></div>`;return}
  const [h,p,body,btn,later]=T[mode];
  el.innerHTML=`<div class="auth-card" role="dialog" aria-modal="true" aria-labelledby="cH"><div class="brand"><i>Ш</i>Штаб</div><h1 id="cH">${h}</h1><p class="auth-p">${p}</p>
    <form id="cryptF" class="auth-f" data-mode="${mode}">${body}<button class="btn" type="submit">${btn}</button></form><p class="auth-err" id="authErr" role="alert"></p>
    ${later?'<button class="ghost auth-skip" data-act="e2e-later">Позже</button>':mode==='unlock'?'<button class="ghost auth-skip" data-act="signout">Выйти из аккаунта</button>':'<button class="ghost auth-skip" data-act="e2e-close">Отмена</button>'}</div>`;
  setTimeout(()=>{const i=$('#cPass');if(i)i.focus()},50)}
async function reencryptAll(){IX=null;for(const id of [...Object.keys(S.projects),'map'])persist(id);flushAll()}
async function setPhrase(phrase,mode){
  {const {data,error}=await sb.from('docs').select('id,data');if(error)throw error;const cr=data.find(r=>r.id==='crypt');if(mode==='setup'&&cr){await onCryptDoc(cr.data);throw new Error('шифрование уже включено на другом устройстве — введите его фразу')}if(mode==='change'&&(!cr||!KEY||cr.data.kid!==KEY.kid))throw new Error('фраза уже изменилась на другом устройстве')}
 const salt=u8b64(rnd(16)),kid='k'+u8b64(rnd(9)).replace(/[^a-z0-9]/gi,'').slice(0,10);const key=await deriveKey(phrase,salt,ITER);
  const check=await encWith(key,kid,{ok:'shtab'});const c={v:1,alg:'AES-256-GCM',kdf:'PBKDF2-SHA256',iter:ITER,salt,kid,check};
  await rawSet('crypt',c);CRYPT=c;KEY={key,kid};cryptLock=false;await storeKey();renderAccount();await reencryptAll()}
document.addEventListener('submit',async e=>{if(e.target.id!=='cryptF')return;e.preventDefault();const mode=e.target.dataset.mode;const ph=($('#cPass')||{}).value||'';
  const busy=on=>document.querySelectorAll('#auth button,#auth input').forEach(b=>b.disabled=on);
  try{
    if(mode==='setup'||mode==='change'){if(ph.length<8){authErr('Фраза должна быть не короче 8 символов');return}if(ph!==$('#cPass2').value){authErr('Фразы не совпадают');return}
      if(!$('#cAgree').checked){authErr('Отметьте, что фраза записана');return}busy(true);authErr('Шифрую…');await setPhrase(ph,mode);hideAuth();toast(mode==='setup'?'Шифрование включено. Данные в облаке теперь зашифрованы.':'Фраза изменена, данные перешифрованы')}
    else if(mode==='unlock'){if(!CRYPT)return hideAuth();busy(true);authErr('Проверяю…');const key=await deriveKey(ph,CRYPT.salt,CRYPT.iter);
      try{await decWith(key,CRYPT.check)}catch(x){busy(false);authErr('Неверная фраза');return}
      KEY={key,kid:CRYPT.kid};cryptLock=false;await storeKey();hideAuth();renderAccount();setSync('saving');if(col){col.refresh();flushAll()}toast('Данные расшифрованы')}
    else if(mode==='restore'){const d=cryptCtx;busy(true);authErr('Расшифровываю…');let data;try{data=await decWith(await deriveKey(ph,d.enc.salt,d.enc.iter),d.enc)}catch(x){busy(false);authErr('Неверная фраза');return}
      hideAuth();if(!data||!data.projects||!data.map||!data.map.root){toast('Это не файл копии Штаба');return}S.restoreAsk={name:d._name||'копия',n:Object.keys(data.projects).length,data};S.screen='projects';render()}
    else if(mode==='off'){busy(true);await rawDel('crypt');CRYPT=null;KEY=null;try{localStorage.removeItem(EK_K)}catch(x){}renderAccount();hideAuth();await reencryptAll();toast('Шифрование выключено')}
  }catch(err){busy(false);authErr(err&&err.message&&/fetch|network/i.test(err.message)?'Нет связи с сервером. Попробуйте, когда появится интернет.':'Не получилось: '+(err&&err.message||err))}
},true);
// зашифрованная резервная копия — тем же ключом, что и облако
async function encryptBackup(json){if(!KEY||!CRYPT)return null;const e=await encWith(KEY.key,KEY.kid,JSON.parse(json));return JSON.stringify({app:'shtab',version:1,exported:new Date().toISOString(),enc:Object.assign(e,{salt:CRYPT.salt,iter:CRYPT.iter})})}
function decryptBackup(d,name){d._name=name;showCrypt('restore',d)}
function maybeAskE2E(){if(PANE||CRYPT||cryptLock||!sbUser)return;if(!cryptKnown){setTimeout(maybeAskE2E,2000);return}try{if(localStorage.getItem(LSK+'.e2eAsk'))return}catch(e){}lsSet(LSK+'.e2eAsk','shown');setTimeout(()=>{if(!CRYPT&&!cryptLock&&$('#auth').hidden)showCrypt('setup')},1500)}

/* --- установка и обновления --- */
if('serviceWorker' in navigator&&location.protocol!=='file:'&&!PANE){
  window.addEventListener('load',()=>{navigator.serviceWorker.register('sw.js').then(reg=>{
    reg.addEventListener('updatefound',()=>{const w=reg.installing;if(!w)return;w.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller)toast('Вышла новая версия',()=>{w.postMessage('skip')})})});
  }).catch(()=>{})});
  let reloaded=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloaded)return;reloaded=true;location.reload()});
}
