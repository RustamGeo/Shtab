# Сборка сайта из исходников: python3 src/build.py  (результат — в корне репозитория)
# Перед выпуском новой версии увеличьте APP_VER, чтобы приложение предложило «Обновить».
import os, re, json, shutil, sys
SP = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(SP)
SB_VER = '2.45.4'
APP_VER = 'v17'

s = open(os.path.join(SP, 'app.html')).read()
def rep(a, b, cnt=1):
    global s
    assert s.count(a) == cnt, (a[:90], s.count(a))
    s = s.replace(a, b)

# 1. storage: Supabase instead of the Claude artifact store
i = s.index('async function initStore(){')
j = s.index('\n}\n', i) + 3
s = s[:i] + open(os.path.join(SP, 'cloud.js')).read() + '\n' + s[j:]
rep("function persist(id){\n  LT[id]=Date.now();\n  cacheLocal();",
    "function persist(id){\n  LT[id]=Date.now();pendQ[id]=LT[id];savePendQ();\n  cacheLocal();")
rep("await col.doc(id).set(body);seenRemote.add(id);if(id!=='map')synced.add(id)}else{await col.doc(id).delete();seenRemote.delete(id);synced.delete(id)}cacheLocal();",
    "await col.doc(id).set(body);seenRemote.add(id);if(id!=='map')synced.add(id);if(pendQ[id]&&pendQ[id]<=body._t){delete pendQ[id];savePendQ()}}else{await col.doc(id).delete();seenRemote.delete(id);synced.delete(id);delete pendQ[id];savePendQ()}cacheLocal();")
rep("function setSync(s){const el=$('#sync');", "function setSync(s){const el=$('#sync');if(!el)return;")
rep("el.title=s==='local'?'Облако недоступно в этом окне. Данные лежат в браузере — сделайте резервную копию на вкладке «Проекты».':''}",
    "el.title=s==='local'?'Синхронизация выключена: данные лежат только на этом устройстве.':''}")
# 2. toast with custom action label (used by «Обновить»)
rep("function toast(msg,undo){", "function toast(msg,undo,label){")
rep("(undo?'<button type=\"button\">Вернуть</button>':'')", "(undo?'<button type=\"button\">'+(label||'Вернуть')+'</button>':'')")
rep("toast('Вышла новая версия',()=>{w.postMessage('skip')})", "toast('Вышла новая версия',()=>{w.postMessage('skip')},'Обновить')")
# 3. sidebar: account instead of «в отдельной вкладке»
s = re.sub(r'\s*<a class="sn-item" id="newTab".*?</a>', '', s, count=1, flags=re.S)
rep('      <div class="sync" id="sync" data-s="local">Загрузка…</div>', '      <div class="acct" id="acct"></div>\n      <div class="sync" id="sync" data-s="local">Загрузка…</div>')
rep('<div id="layer"></div>', '<div id="layer"></div>\n<div class="auth" id="auth" hidden></div>')
# 4. styles for sign-in and account
rep('/* ---------- shell: left toolbar + workspace ---------- */', """/* ---------- sign-in ---------- */
.auth{position:fixed;inset:0;z-index:60;background:var(--bg);display:grid;place-items:center;padding:24px max(16px,env(safe-area-inset-right,0px)) 24px max(16px,env(safe-area-inset-left,0px));overflow:auto}
.auth[hidden]{display:none}
.auth-card{width:100%;max-width:400px;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:28px 24px;display:flex;flex-direction:column;gap:14px;box-shadow:0 20px 60px rgba(0,0,0,.25)}
.auth-card h1{margin:4px 0 0;font-family:var(--f-display);font-weight:var(--dw);font-size:24px}
.auth-p{margin:0;color:var(--muted);font-size:14px;line-height:1.5}
.auth-f{display:flex;flex-direction:column;gap:8px}
.auth-f label{font-size:12px;color:var(--muted);font-weight:600}
.auth-f input{border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:var(--rs);padding:12px 14px;font-size:16px}
.auth-pw{display:flex;gap:6px;align-items:center}.auth-pw input{flex:1;min-width:0}.auth-pw .ghost{flex:none}
.auth-f .btn{justify-content:center;padding:12px 16px;font-size:15px;margin-top:4px}
.auth-f .btn:disabled{opacity:.6}
.auth-row{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
.auth-err{margin:0;min-height:1.2em;font-size:13px;color:var(--bad)}
.auth-skip{align-self:center;font-size:12.5px}
.acct{display:flex;flex-direction:column;gap:1px;border-top:1px solid var(--line);margin-top:6px;padding-top:6px}
.acct-mail{font-size:12px;color:var(--muted);padding:4px 10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* ---------- shell: left toolbar + workspace ---------- */""")

# 5. split into head / body
k = s.index('<div class="shell" id="app">')
head_part, body_part = s[:k], s[k:]
head_part = head_part.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
html = f'''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0E0F12">
<meta name="description" content="Проекты, подпроекты, задачи и карта идей с синхронизацией между устройствами">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Штаб">
<style>:root{{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}body{{margin:0;font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}}img{{max-width:100%}}[hidden]{{display:none!important}}</style>
{head_part.strip()}
<script src="config.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@{SB_VER}/dist/umd/supabase.js"></script>
</head>
<body>
{body_part.strip()}
</body>
</html>
'''
keep_cfg = os.path.join(OUT, 'config.js')
cfg_old = open(keep_cfg).read() if os.path.exists(keep_cfg) else None  # config.js с вашими ключами не перезаписывается
os.makedirs(os.path.join(OUT, 'icons'), exist_ok=True)
os.makedirs(os.path.join(OUT, '.github', 'workflows'), exist_ok=True)
open(os.path.join(OUT, 'index.html'), 'w').write(html)

# 6. config
open(os.path.join(OUT, 'config.js'), 'w').write(cfg_old or """// Настройки подключения к Supabase.
// Возьмите оба значения в Supabase: Project Settings → API (или кнопка Connect).
// Ключ anon/publishable — публичный, его можно хранить здесь: доступ к данным защищён входом и правилами базы.
window.SHTAB_CONFIG = {
  url: '',      // например 'https://abcdefghijklmn.supabase.co'
  anonKey: ''   // длинный ключ anon (eyJ...) или publishable (sb_publishable_...)
};
""")

# 7. manifest
open(os.path.join(OUT, 'manifest.webmanifest'), 'w').write(json.dumps({
    "name": "Штаб — проекты и задачи", "short_name": "Штаб", "lang": "ru",
    "description": "Проекты, подпроекты, задачи и карта идей с синхронизацией между устройствами",
    "start_url": "./", "scope": "./", "display": "standalone", "orientation": "any",
    "background_color": "#0E0F12", "theme_color": "#0E0F12",
    "icons": [
        {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
        {"src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]
}, ensure_ascii=False, indent=2))

# 8. service worker
open(os.path.join(OUT, 'sw.js'), 'w').write(f"""// Штаб: офлайн-кэш приложения. Данные проектов в кэш не попадают — они хранятся в базе и на устройстве.
const V = 'shtab-{APP_VER}';
const SHELL = ['./', './index.html', './config.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@{SB_VER}/dist/umd/supabase.js'];
self.addEventListener('install', e => {{
  e.waitUntil(caches.open(V).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, {{ cache: 'reload' }})).catch(() => {{}})))));
}});
self.addEventListener('activate', e => {{
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
}});
self.addEventListener('message', e => {{ if (e.data === 'skip') self.skipWaiting(); }});
self.addEventListener('fetch', e => {{
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) return; // база — только по сети
  const isPage = req.mode === 'navigate' || (url.origin === location.origin && (url.pathname.endsWith('/') || url.pathname.endsWith('.html') || url.pathname.endsWith('config.js')));
  if (isPage) {{
    e.respondWith(fetch(req).then(r => {{ const c = r.clone(); caches.open(V).then(x => x.put(req, c)); return r; }})
      .catch(() => caches.match(req).then(m => m || caches.match('./index.html'))));
    return;
  }}
  e.respondWith(caches.match(req).then(m => {{
    const net = fetch(req).then(r => {{ if (r && (r.ok || r.type === 'opaque')) {{ const c = r.clone(); caches.open(V).then(x => x.put(req, c)); }} return r; }}).catch(() => m);
    return m || net;
  }}));
}});
""")

# 9. icons
from PIL import Image, ImageDraw, ImageFont
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
def icon(size, maskable=False, rounded=True, path=''):
    sc = 4; S = size * sc
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    bg = (124, 108, 242, 255)
    if maskable or not rounded: d.rectangle([0, 0, S, S], fill=bg)
    else: d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=bg)
    f = ImageFont.truetype(FONT, int(S * (0.44 if maskable else 0.56)))
    bb = d.textbbox((0, 0), 'Ш', font=f)
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    d.text(((S - w) / 2 - bb[0], (S - h) / 2 - bb[1]), 'Ш', font=f, fill=(255, 255, 255, 255))
    im = im.resize((size, size), Image.LANCZOS)
    if not rounded or maskable: im = im.convert('RGB')
    im.save(os.path.join(OUT, 'icons', path))
icon(192, path='icon-192.png'); icon(512, path='icon-512.png')
icon(512, maskable=True, path='icon-maskable-512.png'); icon(180, rounded=False, path='apple-touch-icon.png')

open(os.path.join(OUT, '.nojekyll'), 'w').write('')
for f in ['supabase.sql', 'README.md']:
    src = os.path.join(SP, 'templates', f)
    if os.path.exists(src): shutil.copy(src, os.path.join(OUT, f))
wf = os.path.join(SP, 'templates', 'keepalive.yml')
if os.path.exists(wf): shutil.copy(wf, os.path.join(OUT, '.github', 'workflows', 'keepalive.yml'))
print('built', OUT)
