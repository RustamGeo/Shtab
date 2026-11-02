// Test double for supabase-js v2: auth by e-mail code, a "docs" table shared by tabs, realtime via BroadcastChannel.
(function(){
  const DBK='__mockdb', SK='shtab-auth', bc=new BroadcastChannel('__mockrt');
  const off=()=>localStorage.getItem('__offline')==='1';
  const db=()=>JSON.parse(localStorage.getItem(DBK)||'{}');
  const save=d=>localStorage.setItem(DBK,JSON.stringify(d));
  const fail=()=>({data:null,error:{message:'Failed to fetch',status:0}});
  window.__mails=[];
  function createClient(url,key,opts){
    const listeners=[];
    const auth={
      async getSession(){const s=JSON.parse(localStorage.getItem(SK)||'null');return{data:{session:s},error:null}},
      onAuthStateChange(cb){listeners.push(cb);return{data:{subscription:{unsubscribe(){}}}}},
      async signInWithOtp({email}){if(off())return{error:{message:'Failed to fetch'}};window.__mails.push(email);localStorage.setItem('__lastmail',email);return{data:{},error:null}},
      async verifyOtp({email,token,type}){if(token!=='123456')return{data:{},error:{message:'Token has expired or is invalid'}};
        const user={id:'u-'+email.replace(/\W/g,''),email};const s={user,access_token:'x'};localStorage.setItem(SK,JSON.stringify(s));listeners.forEach(f=>f('SIGNED_IN',s));return{data:{user,session:s},error:null}},
      async signUp({email,password}){if(off())return{data:{},error:{message:'Failed to fetch'}};const us=JSON.parse(localStorage.getItem('__users')||'{}');if(us[email])return{data:{},error:{message:'User already registered'}};us[email]=password;localStorage.setItem('__users',JSON.stringify(us));
        const user={id:'u-'+email.replace(/\W/g,''),email};const s={user,access_token:'x'};localStorage.setItem(SK,JSON.stringify(s));return{data:{user,session:s},error:null}},
      async signInWithPassword({email,password}){const us=JSON.parse(localStorage.getItem('__users')||'{}');if(us[email]!==password)return{data:{},error:{message:'Invalid login credentials',status:400}};
        const user={id:'u-'+email.replace(/\W/g,''),email};const s={user,access_token:'x'};localStorage.setItem(SK,JSON.stringify(s));return{data:{user,session:s},error:null}},
      async signOut(){localStorage.removeItem(SK);listeners.forEach(f=>f('SIGNED_OUT',null));return{error:null}}
    };
    const uid=()=>{const s=JSON.parse(localStorage.getItem(SK)||'null');return s&&s.user.id};
    function from(t){
      return{
        select(){return Promise.resolve(off()?fail():{data:Object.values(db()).filter(r=>r.user_id===uid()).map(r=>({id:r.id,data:r.data})),error:null})},
        upsert(row){if(off())return Promise.resolve(fail());if(row.user_id!==uid())return Promise.resolve({error:{message:'RLS'}});
          const d=db();d[row.user_id+'/'+row.id]=row;save(d);bc.postMessage({eventType:'UPDATE',new:row});window.__ownEvt&&window.__ownEvt({eventType:'UPDATE',new:row});return Promise.resolve({error:null})},
        delete(){const f={};const q={eq(k,v){f[k]=v;return q},then(res,rej){if(off())return Promise.resolve(fail()).then(res,rej);const d=db();const k=f.user_id+'/'+f.id;delete d[k];save(d);
          bc.postMessage({eventType:'DELETE',old:{user_id:f.user_id,id:f.id}});return Promise.resolve({error:null}).then(res,rej)}};return q}
      }}
    function channel(name){let h=null;const c={on(ev,filter,fn){h=fn;return c},subscribe(cb){bc.addEventListener('message',e=>{if(h)h(e.data)});setTimeout(()=>cb&&cb(off()?'CHANNEL_ERROR':'SUBSCRIBED'),30);return c}};return c}
    return{auth,from,channel,removeChannel(){}};
  }
  window.supabase={createClient};
})();
