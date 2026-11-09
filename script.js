/* ===== Semka AI — логика ===== */
'use strict';

const AI_URL = 'https://text.pollinations.ai/';
const SYSTEM = 'Ты — Semka AI, дружелюбный премиум-помощник. Отвечай на русском языке, кратко и по делу.';
const MAX_ATTEMPTS = 100;
const RETRY_DELAY = 800; // мс между попытками

const LS_KEY = 'semka_chats_v1';

const $ = id => document.getElementById(id);
const messagesEl = $('messages'), inputEl = $('input');
const sidebar = $('sidebar'), overlay = $('overlay'), menuBtn = $('menuBtn');

let chats = [];        // [{id, title, msgs:[{role, text}]}]
let currentId = null;
let busy = false;

/* ---------- хранилище ---------- */
function storageOK(){
  try{ localStorage.setItem('__t','1'); localStorage.removeItem('__t'); return true; }
  catch(e){ return false; }
}
function loadChats(){
  try{ chats = JSON.parse(localStorage.getItem(LS_KEY)) || []; }catch(e){ chats = []; }
}
function saveChats(){
  try{ localStorage.setItem(LS_KEY, JSON.stringify(chats)); }catch(e){}
}

/* ---------- рендер ---------- */
function esc(t){ return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function renderList(){
  const list = $('chatList'); list.innerHTML = '';
  chats.forEach(c=>{
    const item = document.createElement('div');
    item.className = 'chat-item' + (c.id===currentId?' active':'');
    const span = document.createElement('span');
    span.textContent = c.title || 'Без названия';
    span.className = 'chat-name'; span.style.overflow='hidden'; span.style.textOverflow='ellipsis';
    const del = document.createElement('span');
    del.className='del'; del.textContent='✕'; del.title='Удалить чат';
    del.onclick = e=>{ e.stopPropagation(); removeChat(c.id); };
    item.appendChild(span); item.appendChild(del);
    item.onclick = ()=> openChat(c.id);
    list.appendChild(item);
  });
}
function renderMessages(){
  messagesEl.innerHTML = '';
  const chat = chats.find(c=>c.id===currentId);
  if(!chat || chat.msgs.length===0){
    const hero = document.createElement('div');
    hero.className='hero';
    hero.innerHTML = '<div class="hero-logo">✦ SEMKA AI ✦</div><div class="hero-text">Напиши первое сообщение — и начнём разговор</div>';
    messagesEl.appendChild(hero);
    return;
  }
  chat.msgs.forEach(m=> addBubble(m.role, m.text));
  scrollBottom();
}
function addBubble(role, text){
  const d = document.createElement('div');
  d.className = 'msg ' + role;
  d.textContent = text;
  messagesEl.appendChild(d);
  scrollBottom();
  return d;
}
function scrollBottom(){ messagesEl.scrollTop = messagesEl.scrollHeight; }
function addTyping(){
  const d = document.createElement('div');
  d.className='msg bot';
  d.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';
  messagesEl.appendChild(d); scrollBottom();
  return d;
}

/* ---------- чаты ---------- */
function newChat(){
  const c = { id: Date.now()+'_'+Math.floor(Math.random()*1e4), title:'', msgs:[] };
  chats.unshift(c); currentId = c.id;
  saveChats(); renderList(); renderMessages(); closeSidebar();
  inputEl.focus();
}
function openChat(id){
  currentId = id; renderList(); renderMessages(); closeSidebar(); inputEl.focus();
}
function removeChat(id){
  chats = chats.filter(c=>c.id!==id);
  if(currentId===id){
    currentId = chats.length ? chats[0].id : null;
    if(!currentId) newChat();
  }
  saveChats(); renderList(); renderMessages();
}

/* ---------- отправка ---------- */
async function askAI(history){
  const last = history[history.length-1];
  const sys = SYSTEM + ' Учитывай предыдущий контекст диалога.';
  const prompt = sys + '\n\nДиалог:\n' + history.slice(-20).map(m=>(m.role==='user'?'Пользователь':'Semka AI')+': '+m.text).join('\n') + '\nSemka AI:';
  const url = AI_URL + encodeURIComponent(prompt) + '?model=openai&referrer=semka-ai';
  let err = null;
  for(let attempt=1; attempt<=MAX_ATTEMPTS; attempt++){
    try{
      const res = await fetch(url);
      if(res.ok){
        const text = await res.text();
        if(text && text.trim()) return text.trim();
        throw new Error('пустой ответ');
      }
      throw new Error('HTTP '+res.status);
    }catch(e){ err = e; await sleep(RETRY_DELAY); }
  }
  throw err || new Error('не удалось достучаться');
}
const sleep = ms => new Promise(r=>setTimeout(r, ms));

async function send(){
  if(busy) return;
  const text = inputEl.value.trim();
  if(!text) return;
  if(!currentId) newChat();
  const chat = chats.find(c=>c.id===currentId);
  busy = true; $('sendBtn').disabled = true;

  chat.msgs.push({role:'user', text});
  if(!chat.title) chat.title = text.slice(0,40);
  addBubble('user', text);
  inputEl.value = ''; autosize();
  saveChats(); renderList();

  const typing = addTyping();
  try{
    const answer = await askAI(chat.msgs);
    typing.remove();
    chat.msgs.push({role:'bot', text:answer});
    addBubble('bot', answer);
  }catch(e){
    typing.remove();
    const msg = 'Прости, не смогла достучаться до ИИ после '+MAX_ATTEMPTS+' попыток. Проверь интернет и попробуй ещё раз.';
    chat.msgs.push({role:'bot', text:msg});
    addBubble('bot error', msg);
  }finally{
    saveChats(); renderList();
    busy = false; $('sendBtn').disabled = false;
  }
}

/* ---------- бэкап ---------- */
function exportChats(){
  const blob = new Blob([JSON.stringify(chats,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'semka_chats.json';
  a.click(); URL.revokeObjectURL(a.href);
}
function importChats(file){
  const r = new FileReader();
  r.onload = ()=>{
    try{
      const data = JSON.parse(r.result);
      if(Array.isArray(data)){ chats = data; currentId = chats.length? chats[0].id : null; if(!currentId) newChat(); saveChats(); renderList(); renderMessages(); }
    }catch(e){ alert('Не удалось прочитать файл чатов'); }
  };
  r.readAsText(file);
}

/* ---------- панель ---------- */
function openSidebar(){ sidebar.classList.add('open'); overlay.classList.add('show'); menuBtn.classList.add('open'); document.body.classList.add('sidebar-open'); }
function closeSidebar(){ sidebar.classList.remove('open'); overlay.classList.remove('show'); menuBtn.classList.remove('open'); document.body.classList.remove('sidebar-open'); }
function toggleSidebar(){ sidebar.classList.contains('open') ? closeSidebar() : openSidebar(); }

/* ---------- события ---------- */
menuBtn.onclick = toggleSidebar;
overlay.onclick = closeSidebar;
$('newChatBtn').onclick = newChat;
$('sendBtn').onclick = send;
inputEl.addEventListener('keydown', e=>{
  if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send(); }
});
function autosize(){ inputEl.style.height='auto'; inputEl.style.height=Math.min(inputEl.scrollHeight,140)+'px'; }
inputEl.addEventListener('input', autosize);
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeSidebar(); });
$('saveBtn').onclick = exportChats;
$('loadBtn').onclick = ()=> $('loadFile').click();
$('loadFile').onchange = e=>{ if(e.target.files[0]) importChats(e.target.files[0]); };

/* ---------- запуск ---------- */
if(!storageOK()){ $('storageWarn').classList.remove('hidden'); }
loadChats();
if(chats.length===0) newChat();
else { currentId = chats[0].id; renderList(); renderMessages(); }
