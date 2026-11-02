/* ---------- облако: Supabase (вход по коду из письма, синхронизация, офлайн-очередь) ---------- */
const CFG=window.SHTAB_CONFIG||{};
let sb=null,sbUser=null,localOnly=false;
const PENDQ_K=LSK+'.pendQ';
let pendQ={};try{pendQ=JSON.parse(localStorage.getItem(PENDQ_K)||'{}')||{}}catch(e){pendQ={}}
function savePendQ(){lsSet(PENDQ_K,JSON.stringify(pendQ))}
// one collection of the signed-in user's documents, with the same surface the app already uses
function makeCol(uid){
  const docs=new Map();let listeners=[],ch=null;
  const emit=()=>{const arr=[...docs.entries()].map(([id,data])=>({id,data:()=>data}));for(const l of listeners)l.next({docs:arr})};
  async function loadAll(){const {data,error}=await sb.from('docs').select('id,data');if(error)throw error;docs.clear();for(const r of data)docs.set(r.id,r.data);emit()}
  function subscribe(){if(ch)return;
    ch=sb.channel('docs-'+uid).on('postgres_changes',{event:'*',schema:'public',table:'docs',filter:'user_id=eq.'+uid},pl=>{
      if(pl.eventType==='DELETE'){const id=pl.old&&pl.old.id;if(id&&docs.has(id)){docs.delete(id);emit()}}
      else if(pl.new&&pl.new.id){docs.set(pl.new.id,pl.new.data);emit()}
    }).subscribe(st=>{if(st==='SUBSCRIBED')loadAll().catch(()=>{});if(st==='CHANNEL_ERROR'||st==='TIMED_OUT'){setSync('err')}})}
  return{
    doc:id=>({
      set:async body=>{const {error}=await sb.from('docs').upsert({user_id:uid,id,data:body,updated_at:new Date().toISOString()},{onConflict:'user_id,id'});if(error)throw error;docs.set(id,body)},
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
  stopSync();for(const k of ['','.map','.synced','.pendQ','.ui'])try{localStorage.removeItem(LSK+k)}catch(e){}
  location.reload();
}
function renderAccount(){
  const el=$('#acct');if(!el)return;
  if(sbUser)el.innerHTML=`<div class="acct-mail" title="${esc(sbUser.email||'')}">${esc(sbUser.email||'Аккаунт')}</div><button class="sn-item" data-act="signout"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2.5H3v11h3M10.5 5 13.5 8l-3 3M13.3 8H6.5"/></svg><span>Выйти</span></button>`;
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
},true);

/* --- установка и обновления --- */
if('serviceWorker' in navigator&&location.protocol!=='file:'&&!PANE){
  window.addEventListener('load',()=>{navigator.serviceWorker.register('sw.js').then(reg=>{
    reg.addEventListener('updatefound',()=>{const w=reg.installing;if(!w)return;w.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller)toast('Вышла новая версия',()=>{w.postMessage('skip')})})});
  }).catch(()=>{})});
  let reloaded=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloaded)return;reloaded=true;location.reload()});
}
