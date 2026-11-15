import { useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { ArrowRight, ArrowUpRight, Check, ChevronDown, Gift, Heart, Info, Menu, Search, Share2, SlidersHorizontal, Sparkles, X, RefreshCw, Trash2 } from 'lucide-react';
import { configured, supabase } from './supabase';
import imported from './items.json';

type Group = 'all' | 'self' | 'home' | 'sport' | 'tech' | 'hobby';
type Gift = { id:number; title:string; description:string; image:string; url:string; price:string; group:Exclude<Group,'all'>; multi:boolean };
type Booking = { id:string; gift_id:number; user_id:string; telegram:string };
const items = imported as Gift[];
const mostWantedIds = [1, 2, 7, 8, 9, 16, 20, 24, 28, 32];
const groups:{id:Exclude<Group,'all'>;label:string;subtitle:string;symbol:string;image:string;tone:string}[] = [
  {id:'self',label:'Для себя',subtitle:'Всё, что нравится',symbol:'♡',image:'/category/self.png',tone:'peach'},
  {id:'home',label:'Для дома',subtitle:'Немного уюта',symbol:'✳',image:'/category/home.png',tone:'sand'},
  {id:'sport',label:'Для спорта',subtitle:'Движение — жизнь',symbol:'↗',image:'/category/sport.png',tone:'lime'},
  {id:'tech',label:'Технологии',subtitle:'Гаджеты и штуки',symbol:'⌘',image:'/category/tech.png',tone:'lavender'},
  {id:'hobby',label:'Хобби',subtitle:'Для вдохновения',symbol:'✦',image:'/category/hobby.png',tone:'rose'}
];
function getPrice(price:string):number|null {if(price.includes('¥'))return null;const match=price.replace(/[\s\u00a0\u2009\u202f]/g,'').match(/\d+/);return match?Number(match[0]):null;}
const readError = (err:unknown) => err instanceof Error ? err.message : 'Что-то пошло не так. Попробуй ещё раз.';
function App(){
  console.log("Supabase URL:", import.meta.env.VITE_SUPABASE_URL);
  console.log("Supabase Key:", Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY));
  const [group,setGroup] = useState<Group>('all');
  const [query,setQuery] = useState('');
  const [sort,setSort] = useState('original');
  const [freeOnly,setFreeOnly] = useState(false);
  const [bookings,setBookings] = useState<Booking[]>([]);
  const [userId,setUserId] = useState<string|null>(null);
  const [connection,setConnection] = useState<'demo'|'loading'|'online'|'error'>(configured?'loading':'demo');
  const [selected,setSelected] = useState<Gift|null>(null);
  const [guide,setGuide] = useState(false);
  const [mobileMenu,setMobileMenu] = useState(false);
  const [telegram,setTelegram] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');

  async function loadBookings(){
    if(!supabase)return;
    const {data,error} = await supabase.from('gift_reservations').select('id,gift_id,user_id,telegram');
    if(error)throw error;
    setBookings((data||[]) as Booking[]);
    setConnection('online');
  }
  useEffect(()=>{
    if(!supabase)return;
    let stopped=false;
    const init=async()=>{
      try{
        const {data:{session},error:sessionError}=await supabase!.auth.getSession();
        if(sessionError)throw sessionError;
        if(session?.user){if(!stopped)setUserId(session.user.id);}
        else {
          const {data,error:authError}=await supabase!.auth.signInAnonymously();
          if(authError)throw authError;
          if(!stopped)setUserId(data.user?.id||null);
        }
        if(!stopped)await loadBookings();
      }catch(e){console.error(e);if(!stopped)setConnection('error');}
    };
    void init();
    const timer=window.setInterval(()=>{if(!stopped&&document.visibilityState==='visible')void loadBookings().catch(()=>setConnection('error'));},15000);
    const onFocus=()=>{if(!stopped)void loadBookings().catch(()=>setConnection('error'));};
    window.addEventListener('focus',onFocus);
    return ()=>{stopped=true;clearInterval(timer);window.removeEventListener('focus',onFocus);};
  },[]);
  useEffect(()=>{document.body.classList.toggle('modal-open',Boolean(selected||guide));return()=>document.body.classList.remove('modal-open');},[selected,guide]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),4200);return()=>clearTimeout(t);},[notice]);

  const counts=useMemo(()=>Object.fromEntries(groups.map(g=>[g.id,items.filter(i=>i.group===g.id).length])),[]);
  const reservationsFor=(id:number)=>bookings.filter(b=>b.gift_id===id);
  const listing=useMemo(()=>{
    let result=items.filter(item=> (group==='all'||item.group===group) && (!query.trim()||(item.title+' '+item.description).toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru'))) && (!freeOnly||(item.multi||!bookings.some(b=>b.gift_id===item.id))));
    if(sort==='cheap')result=[...result].sort((a,b)=>(getPrice(a.price)??Infinity)-(getPrice(b.price)??Infinity));
    if(sort==='expensive')result=[...result].sort((a,b)=>(getPrice(b.price)??-Infinity)-(getPrice(a.price)??-Infinity));
    return result;
  },[group,query,sort,freeOnly,bookings]);
  const selectedBookings=selected?reservationsFor(selected.id):[];
  const alreadyMine=selectedBookings.some(b=>b.user_id===userId);
  const taken=Boolean(selected&&!selected.multi&&selectedBookings.length>0);
  const canWrite=connection==='online'&&Boolean(userId)&&!busy;
  const chooseGroup=(id:Group)=>{setGroup(id);setMobileMenu(false);document.getElementById('gifts')?.scrollIntoView({behavior:'smooth'});};
  const openGift=(item:Gift)=>{setSelected(item);setError('');setTelegram('');};
  const share=async()=>{
    try{if(navigator.share)await navigator.share({title:'Мой вишлист',url:location.href});else {await navigator.clipboard.writeText(location.href);setNotice('Ссылка скопирована!');}}
    catch{/* dismissed share dialog */}
  };
  async function book(){
    if(!selected||!supabase||!canWrite||alreadyMine)return;
    const name=telegram.trim().replace(/^https?:\/\/t\.me\//i,'').replace(/^@/,'');
    if(!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(name)){setError('Введите Telegram username: от 5 до 32 символов, начиная с буквы.');return;}
    setBusy(true);setError('');
    try{
      const {error:insertError}=await supabase.from('gift_reservations').insert({gift_id:selected.id,user_id:userId,telegram:'@'+name});
      if(insertError)throw insertError;
      await loadBookings();setSelected(null);setNotice('Готово! Теперь ты в списке дарителей ♡');
    }catch(e){const text=readError(e);setError(text.includes('already_reserved')?'Этот подарок уже забронировали.':text.includes('duplicate key')?'Ты уже участвуешь в этом подарке.':text);void loadBookings().catch(()=>{});}
    finally{setBusy(false);}
  }
  async function cancel(){
    if(!selected||!supabase||!userId||busy)return;
    const mine=selectedBookings.find(b=>b.user_id===userId);if(!mine)return;
    if(!window.confirm('Отменить свою бронь?'))return;
    setBusy(true);setError('');
    try{const {error:deleteError}=await supabase.from('gift_reservations').delete().eq('id',mine.id).eq('user_id',userId);if(deleteError)throw deleteError;await loadBookings();setSelected(null);setNotice('Твоя бронь отменена.');}
    catch(e){setError(readError(e));}finally{setBusy(false);}
  }

  return <>
    <header className="site-header"><div className="shell header-inner">
      <a className="brand" href="#top" aria-label="Наверх"><span className="brand-icon">♡</span> my wishlist<span className="brand-tail">✳</span></a>
      <nav className={mobileMenu?'nav nav-open':'nav'} aria-label="Главное меню"><a href="#top" onClick={()=>setMobileMenu(false)}>Главная</a><a href="#categories" onClick={()=>setMobileMenu(false)}>Категории</a><a href="#gifts" onClick={()=>setMobileMenu(false)}>Все желания</a><button onClick={()=>{setGuide(true);setMobileMenu(false);}}><Info size={16}/> Как это работает</button></nav>
      <div className="header-actions"><button className="share-btn" onClick={()=>void share()}><Share2 size={16}/><span>Поделиться</span></button><button className="menu-btn" aria-label="Открыть меню" onClick={()=>setMobileMenu(v=>!v)}>{mobileMenu?<X/>:<Menu/>}</button></div>
    </div></header>
    <main id="top">
      <section className="hero shell"><div className="hero-copy">
        <p className="eyebrow"><span className="tiny-spark">✳</span> a little collection of my favorite things</p>
        <div className="hero-title-wrap"><h1>MY<br/><em>WISHLIST</em></h1><span className="hero-star">✳</span></div>
        <div className="paper-note"> хочу это хочу то <span>♡</span></div>
        <p className="hero-description">Здесь собрано все, чему может порадоваться моя душа!</p>
        <button className="hero-link" onClick={()=>chooseGroup('all')}>Смотреть желания <ArrowRight size={18}/></button>
        <span className="hero-doodle">↝</span>
      </div><div className="hero-art" aria-hidden="true">
        <div className="hero-polaroid"><div className="polaroid-picture"><img src="/img/img-1.jpg" alt="faaaaaa"/></div><span>22 years, swaggy and a little bit slay </span></div>
        <div className="hero-sticky"><span>life lately:</span><p>✳ больше радоваться<br/>✳ находить красивое<br/>✳ пробовать новое<br/>✳ быть собой</p></div>
        <span className="hero-art-heart">♡</span><span className="hero-art-flower">✷</span>
      </div></section>
      <section className="categories-section shell" id="categories"><div className="section-top"><div><p className="section-kicker">01 / PICK A MOOD</p><h2>Категории <span className="underline-squiggle">♡</span></h2></div><button className="text-link" onClick={()=>chooseGroup('all')}>Смотреть всё <ArrowUpRight size={17}/></button></div>
        <div className="categories-grid">{groups.map(g=><button key={g.id} className={'category-card '+g.tone} onClick={()=>chooseGroup(g.id)}><span className="category-shape">{g.symbol}</span><img src={g.image} alt="" loading="lazy"/><span className="category-info"><strong>{g.label}</strong><small>{g.subtitle}</small></span><ArrowUpRight size={19} className="category-arrow"/></button>)}</div>
      </section>
      <section className="wishes-section shell" id="gifts"><div className="section-top wishes-heading"><div><p className="section-kicker">02 / THE GOOD STUFF</p><h2>Мой вишлист <span className="asterisk">✳</span></h2><p className="section-sub">Много классных штук, которые меня радуют (или точно порадуют).</p></div><div className="count-note">{items.length} <span>желаний<br/>в коллекции</span></div></div>
        <div className="filters"><div className="filter-tabs"><button className={group==='all'?'active':''} onClick={()=>setGroup('all')}>Все <span>{items.length}</span></button>{groups.map(g=><button key={g.id} className={group===g.id?'active':''} onClick={()=>setGroup(g.id)}>{g.label} <span>{counts[g.id]}</span></button>)}</div><div className="filter-tools"><div className="search-box"><Search size={16}/><input aria-label="Поиск подарков" placeholder="Поиск по желаниям" value={query} onChange={e=>setQuery(e.target.value)}/></div><label className="sort-box"><SlidersHorizontal size={16}/><select aria-label="Сортировка" value={sort} onChange={e=>setSort(e.target.value)}><option value="original">По порядку</option><option value="cheap">Сначала дешевле</option><option value="expensive">Сначала дороже</option></select><ChevronDown size={14}/></label></div></div>
        <label className="available-toggle"><input type="checkbox" checked={freeOnly} onChange={e=>setFreeOnly(e.target.checked)}/><span>Только доступные подарки</span></label>
        {connection==='demo'&&<div className="setup-notice"><Info size={18}/><span><b>Демо-режим.</b> Карточки работают, но для настоящего бронирования нужно подключить Supabase по инструкции в README.md.</span></div>}
        {connection==='error'&&<div className="setup-notice warning"><Info size={18}/><span>Не удалось подключиться к Supabase. Проверь переменные окружения, анонимный вход и SQL-настройку.</span><button onClick={()=>void loadBookings().catch(()=>{})}><RefreshCw size={16}/></button></div>}
        {listing.length?<div className="gifts-grid">{listing.map((item,index)=>{const booked=reservationsFor(item.id);const full=!item.multi&&booked.length>0;const join=item.multi&&booked.length>0;return <article key={item.id} className="gift-card" style={{animationDelay:Math.min(index,10)*35+'ms'}}><button className="gift-picture" onClick={()=>openGift(item)} aria-label={'Открыть '+item.title}><img src={item.image} alt={item.title} loading="lazy"/><span
  className={
    'gift-flag ' +
    (full ? 'flag-blue' :
     join ? 'flag-green' :
     mostWantedIds.includes(item.id) ? 'flag-wanted' : 'flag-plain')
  }
>
  {full
    ? 'уже дарят ♡'
    : join
      ? 'можно вместе ♡'
      : mostWantedIds.includes(item.id)
        ? 'MOST WANTED ✳'
        : '♡'}
</span><span className="picture-corner"><ArrowUpRight size={19}/></span></button><div className="gift-details"><p className="gift-group">{groups.find(g=>g.id===item.group)?.label}</p><h3>{item.title}</h3><div className="gift-footer"><strong>{item.price}</strong><button className={full?'reserve-btn reserved':join?'reserve-btn joint':'reserve-btn'} onClick={()=>openGift(item)}><Gift size={16}/>{full?'Уже дарят':join?'Присоединиться':'Хочу подарить'}</button></div></div></article>;})}</div>:<div className="empty-state"><Sparkles size={30}/><h3>Ничего не нашлось</h3><p>Попробуй выбрать другую категорию или изменить запрос.</p><button onClick={()=>{setGroup('all');setQuery('');setFreeOnly(false);}}>Сбросить фильтры</button></div>}
      </section>
  <section
  className="bottom-note shell"
  style={{
    backgroundImage: `url("${import.meta.env.BASE_URL}pattern/leopard-banner-overlay.png")`,
    backgroundColor: '#e7e8f7',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  }}
> <div className="bottom-sticker">SWAGGY... ♡</div><h2>А можно и<br/><em>свой вариант!</em></h2><p>Не обязательно выбирать что-то из списка. Иногда самые классные подарки — те, которых совсем не ждёшь.</p><span className="bottom-star">✳</span></section>
    </main><footer className="footer shell"><span>made with ♡ & a little bit of chaos</span><span>my wishlist © 2026</span></footer>
    {notice&&<div className="toast" role="status"><Check size={17}/>{notice}</div>}
    {guide&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setGuide(false);}}><div className="modal guide-modal" role="dialog" aria-modal="true" aria-label="Как работает бронирование"><button className="modal-close" onClick={()=>setGuide(false)} aria-label="Закрыть"><X/></button><span className="modal-kicker">QUICK GUIDE ✳</span><h2>Как это работает?</h2><div className="guide-steps"><p><b>01.</b> Выбери подарок и открой карточку — там есть описание и ссылка на магазин.</p><p><b>02.</b> Нажми «Хочу подарить», укажи Telegram и подтверди. Бронь увидят остальные гости.</p><p><b>03.</b> Если подарок можно купить вместе, другие смогут присоединиться и написать тебе в Telegram.</p><p><b>04.</b> Свою бронь можно отменить с того же браузера. Для этого не очищай данные сайта.</p></div><p className="guide-warning">Важно: Telegram-ник будут видеть другие посетители. Не указывай его, если не хочешь делиться контактом.</p><button className="primary-action" onClick={()=>setGuide(false)}>Всё понятно <ArrowRight size={18}/></button></div></div>}
    {selected&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setSelected(null);}}><div className="modal gift-modal" role="dialog" aria-modal="true" aria-label={selected.title}><button className="modal-close" onClick={()=>!busy&&setSelected(null)} aria-label="Закрыть"><X/></button><div className="modal-image"><img src={selected.image} alt={selected.title}/></div><div className="modal-content"><span className="modal-kicker">{groups.find(g=>g.id===selected.group)?.label} / WISHLIST</span><h2>{selected.title}</h2><p className="modal-price">{selected.price}</p><div className="modal-description" dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(selected.description,{ADD_ATTR:['target']})}}/><a className="store-link" href={selected.url} target="_blank" rel="noopener noreferrer">Посмотреть в магазине <ArrowUpRight size={17}/></a>
      <div className="reservation-area"><div className="reservation-header"><Gift size={18}/><b>{selected.multi?'Совместный подарок':'Бронирование подарка'}</b></div>{selected.multi&&<p className="muted">Можно объединиться и подарить вместе. Участники смогут связаться друг с другом по Telegram.</p>}
      {!!selectedBookings.length&&<div className="participants"><span>Уже участвуют ({selectedBookings.length}):</span><div className="participant-list">{selectedBookings.map(b=><a key={b.id} href={'https://t.me/'+b.telegram.slice(1)} target="_blank" rel="noopener noreferrer">{b.telegram}{b.user_id===userId?' (ты)':''}</a>)}</div></div>}
      {alreadyMine?<><p className="my-status"><Check size={17}/> Ты уже участвуешь в этом подарке</p><button className="cancel-action" disabled={busy||!supabase} onClick={()=>void cancel()}><Trash2 size={16}/> Отменить мою бронь</button></>:taken?<div className="taken-status"><Heart size={17}/> Этот подарок уже забронирован</div>:<><label className="input-label" htmlFor="tg-name">Твой Telegram (будет виден другим гостям)</label><div className="telegram-input"><span>@</span><input id="tg-name" type="text" placeholder="username" autoComplete="off" maxLength={33} value={telegram.replace(/^@/,'')} onChange={e=>{setTelegram(e.target.value);setError('');}}/></div>{error&&<p className="form-error" role="alert">{error}</p>}<button className="primary-action" disabled={!canWrite} onClick={()=>void book()}><Gift size={18}/>{busy?'Сохраняю...':connection==='demo'?'Сначала подключи Supabase':connection==='loading'?'Подключаемся...':connection==='error'?'Ошибка подключения':selected.multi&&selectedBookings.length?'Присоединиться':'Забронировать подарок'}</button></>}
      </div></div></div></div>}
  </>;
}
export default App;
