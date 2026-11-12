/* Fieldnotes English Companion V1.0
 * No API key, no third-party packages, no hidden background transmission.
 * Browser database: IndexedDB. Live providers: MyMemory, Free Dictionary, LanguageTool.
 */
(() => {
  'use strict';
  const DB = window.FieldnotesDB, API = window.FieldnotesProviders;
  const APP_VERSION = '1.0.2', SCHEMA_VERSION = 1;
  const DEFAULT_CATEGORIES = ['Engineering', 'Construction', 'Structural Engineering', 'Technical Meetings', 'Business English', 'Email Writing', 'General Conversation', 'Legal / Contract', 'Idioms & Phrasal Verbs'];
  const DEFAULTS = {id:'main',profile:'company',onlineEnabled:true,historyEnabled:false,theme:'system',fontSize:'normal',appVersion:APP_VERSION,schemaVersion:SCHEMA_VERSION};
  const STATUSES = ['New', 'Learning', 'Familiar', 'Mastered'];
  const CONTEXTS = ['General English','Engineering / Construction','Business / Workplace','Meetings / Conversation','Legal / Contract','Other'];
  const pageNames = {dictionary:'Quick Dictionary',vocabulary:'My Vocabulary',grammar:'Grammar Checker',meeting:'Meeting Mode',review:'Review Vocabulary',settings:'Settings & Backup'};
  const s = {
    page:'dictionary',prefs:{...DEFAULTS},categories:[],vocab:[],history:[],query:'',context:CONTEXTS[0],contextSentence:'',lookupResult:null,lookupError:'',lookupLoading:false,lookupSequence:0,
    grammarText:'',grammarOriginal:'',grammarSuggestions:[],grammarChecked:false,grammarLoading:false,grammarError:'',grammarDirty:false,
    vocabQuery:'',vocabCategory:'all',vocabStatus:'all',vocabSort:'newest',vocabPage:0,vocabFav:false,
    reviewIndex:0,reviewRevealed:false,reviewOnlyLearning:true,storageReady:false,
    pendingEntry:null
  };
  const root = document.getElementById('view-root');
  const modalLayer = document.getElementById('modal-layer');
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normal = v => String(v || '').trim().toLocaleLowerCase('en-GB').replace(/\s+/g,' ');
  const now = () => new Date().toISOString();
  const id = () => (crypto.randomUUID ? crypto.randomUUID() : `fn-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const date = x => x ? new Date(x).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'}) : '—';
  const catName = cid => s.categories.find(c=>c.id===cid)?.name || 'Uncategorised';
  const options = (values, active) => values.map(x=>`<option value="${esc(x)}" ${x===active?'selected':''}>${esc(x)}</option>`).join('');
  const categoriesOptions = active => `<option value="">Uncategorised</option>`+s.categories.map(c=>`<option value="${esc(c.id)}" ${c.id===active?'selected':''}>${esc(c.name)}</option>`).join('');
  const liveAllowed = () => s.prefs.profile === 'personal' && s.prefs.onlineEnabled && navigator.onLine;
  function toast(message, error=false) {
    const element=document.createElement('div'); element.className='toast'+(error?' error':'');element.textContent=message;
    document.getElementById('toast-area').append(element);
    window.setTimeout(()=>element.remove(),4200);
  }
  function banner(heading, body='',variant='') {return `<div class="banner ${variant}"><span class="banner-icon">${variant==='error'?'!':variant==='warning'?'⚠':'ⓘ'}</span><div><strong>${esc(heading)}</strong>${body?`<p>${esc(body)}</p>`:''}</div></div>`;}
  function safeText(value, max=2000){return String(value==null?'':value).trim().slice(0,max);}
  function encodeCsvCell(v){return `"${String(v==null?'':v).replaceAll('"','""')}"`;}
  async function refreshData(){
    [s.vocab,s.categories,s.history]=await Promise.all([DB.getAll('vocab'),DB.getAll('categories'),DB.getAll('history')]);
    s.vocab.sort((a,b)=>String(b.createdAt||'').localeCompare(a.createdAt||''));
    s.history.sort((a,b)=>String(b.createdAt||'').localeCompare(a.createdAt||''));
    document.getElementById('nav-vocab-count').textContent=s.vocab.length;
  }
  async function savePrefs(){s.prefs.appVersion=APP_VERSION;s.prefs.schemaVersion=SCHEMA_VERSION;await DB.put('settings',s.prefs);applyPreferences();refreshTop();}
  function applyPreferences(){
    const t=s.prefs.theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):s.prefs.theme;
    document.documentElement.dataset.theme=t;
    document.documentElement.style.setProperty('--fs',s.prefs.fontSize==='large'?'17px':s.prefs.fontSize==='small'?'13px':'15px');
    const themeColor=document.querySelector('meta[name="theme-color"]');if(themeColor)themeColor.content=t==='dark'?'#17212d':'#f7f8fb';
  }
  function refreshTop(){
    const personal=s.prefs.profile==='personal';
    const b=document.getElementById('profile-button'); b.classList.toggle('personal',personal);
    document.getElementById('profile-label').textContent=personal?'Personal Online':'Company-Safe';
    const net=document.getElementById('network-label');net.className='network-indicator'+(!navigator.onLine?' offline':'');
    net.innerHTML=`<span class="status-dot"></span>${navigator.onLine?'Browser online':'Browser offline'}`;
    document.getElementById('top-page').textContent=pageNames[s.page];
    for(const button of document.querySelectorAll('[data-page]'))button.classList.toggle('active',button.dataset.page===s.page);
  }
  function setPage(page){
    if(!pageNames[page])return;
    s.page=page;document.getElementById('sidebar').classList.remove('open');document.getElementById('sidebar-scrim')?.classList.remove('open');render();
    if(page==='dictionary'||page==='meeting')focusLookup(false);
    if(page==='grammar')document.getElementById('grammar-input')?.focus();
  }
  function render(){refreshTop();
    if(s.page==='dictionary')root.innerHTML=renderDictionary(false);
    else if(s.page==='meeting')root.innerHTML=renderDictionary(true);
    else if(s.page==='vocabulary')root.innerHTML=renderVocabulary();
    else if(s.page==='grammar')root.innerHTML=renderGrammar();
    else if(s.page==='review')root.innerHTML=renderReview();
    else if(s.page==='settings')root.innerHTML=renderSettings();
  }
  function focusLookup(select=false){const el=document.getElementById('lookup-input');if(el){el.focus();if(select)el.select();}}
  function renderDictionary(meeting){
    const controls=`<form id="lookup-form" class="search-row"><div class="search-box"><span class="search-symbol">⌕</span><input id="lookup-input" type="search" name="term" value="${esc(s.query)}" aria-label="English word or phrase" placeholder="e.g. derogation, follow up, structural integrity" maxlength="500" autocomplete="off"></div><button type="submit" class="btn btn-primary search-submit" ${s.lookupLoading?'disabled':''}>${s.lookupLoading?'<span class="spinner"></span>':'⌕'} Search</button></form>`;
    let content='';
    if(s.lookupError)content+=banner('Lookup notice',s.lookupError,'warning');
    if(s.lookupLoading)content+=banner('Searching provider','Your last result remains below until a valid response arrives.');
    if(s.lookupResult)content+=renderResult(s.lookupResult,meeting);
    else if(!s.lookupLoading)content+=`<div class="card"><div class="empty-state"><span class="empty-icon">⌕</span><strong>Look up a word or expression</strong><div>Search saved vocabulary locally, or enable Personal Online to request a live translation.</div><button class="btn" style="margin-top:15px" data-action="new-entry">＋ Add vocabulary manually</button></div></div>`;
    const recent=renderHistory();
    if(meeting)return `<div class="meeting-layout"><div class="intro-row"><div><div class="eyebrow">FOCUS WORKSPACE · LIVE MEETINGS</div><h1>Meeting Quick Mode</h1><p class="subtitle">Hear it. Type it. Understand it. Save it.</p></div><button data-page="dictionary" class="btn btn-outline">↖ Standard view</button></div><div class="card dictionary-card meeting-search"><div class="section-label">QUICK LOOKUP — ENTER TO SEARCH</div>${controls}</div>${privacyBanner()}<div class="meeting-result">${content}</div>${recent}</div>`;
    return `<div class="intro-row"><div><div class="eyebrow">YOUR PERSONAL LANGUAGE WORKSPACE</div><h1>Quick Dictionary <span style="color:var(--primary)">↗</span></h1><p class="subtitle">Understand English words and technical expressions in Traditional Chinese, without breaking your workflow.</p></div><button class="btn" data-page="meeting">◉ Meeting Quick Mode</button></div><div class="card dictionary-card"><div class="section-label">ENGLISH → TRADITIONAL CHINESE</div>${controls}<div class="context-row"><label for="context-select">Context</label><select id="context-select">${options(CONTEXTS,s.context)}</select><span>Optional context is stored only in memory; providers translate the searched text, not the context sentence.</span></div><details class="context-note"><summary class="btn-plain" style="cursor:pointer">+ Optional reference sentence (not transmitted)</summary><input id="context-sentence" value="${esc(s.contextSentence)}" placeholder="Your context sentence (for manual Copilot prompt only)" maxlength="1500"></details></div>${privacyBanner()}<div class="results-wrap">${content}</div>${recent}`;
  }
  function privacyBanner(){
    if(s.prefs.profile==='company')return banner('Company-Safe Mode is active','Only local saved vocabulary is searched. External translation, grammar API calls, Google links and public services are disabled. The approved Copilot workflow is manual.','warning');
    if(!s.prefs.onlineEnabled)return banner('Online lookup is disabled in Settings','Previously saved words remain available; enable online lookup to use third-party providers.','warning');
    if(!navigator.onLine)return banner('You appear to be offline','Local vocabulary remains available. Provider requests cannot be sent.','warning');
    return banner('Personal Online Mode','Search terms are sent only when you press Search, to MyMemory and (for single words) Free Dictionary API. Do not enter confidential workplace information.');
  }
  function renderResult(r,meeting=false){
    const translation=r.translation?`<div class="translation">${esc(r.translation)}</div>`:`<div class="translation pending">No verified Chinese translation available. Add your own meaning or open an external dictionary.</div>`;
    let extras='';
    if(r.definition)extras+=`<p class="result-def">${esc(r.definition)}</p>`;
    if(r.example)extras+=`<div class="result-example"><div class="section-label">EXAMPLE IN ENGLISH</div>${esc(r.example)}</div>`;
    if(!meeting && r.alternatives?.length)extras+=`<div class="small muted">Alternative translations: ${r.alternatives.map(esc).join(' · ')}</div>`;
    if(!meeting && r.synonyms?.length)extras+=`<div class="chip-list" style="margin-top:12px">${r.synonyms.map(v=>`<span class="chip">${esc(v)}</span>`).join('')}</div>`;
    const sourceLine=r.source||'Manual / local';
    return `<div class="card ${meeting?'meeting-card':'card-pad'}"><div class="result-head"><div><div class="result-term">${esc(r.term)}${r.ipa?`<span class="result-ipa">/${esc(r.ipa.replace(/^\/|\/$/g,''))}/</span>`:''}</div><div class="result-pos">${esc(r.pos||s.context)}</div></div><button class="btn btn-sm" data-action="pronounce" aria-label="Hear UK pronunciation">♫ UK pronunciation</button></div>${translation}<div class="translation-source">Source: ${esc(sourceLine)} · ${r.remote?'Third-party result; check accuracy and Chinese script':'Saved locally / manual entry'}${r.loadingDetail?' · Additional details unavailable':''}</div>${extras}<div class="action-row"><button class="btn btn-primary" data-action="save-result">＋ Save to Vocabulary</button><button class="btn" data-action="copy-translation" ${r.translation?'':'disabled'}>▣ Copy meaning</button>${meeting?'':`<button class="btn" data-action="prepare-copilot">◈ Copilot prompt</button>`}</div><div class="secondary-actions"><button class="btn-plain" data-action="open-google" ${s.prefs.profile==='company'?'disabled title="Disabled in Company-Safe Mode"':''}>Google Search ↗</button><button class="btn-plain" data-action="open-translate" ${s.prefs.profile==='company'?'disabled title="Disabled in Company-Safe Mode"':''}>Google Translate ↗</button>${meeting?'<button class="btn-plain" data-action="prepare-copilot">Prepare Copilot prompt ↗</button>':''}</div></div>`;
  }
  function renderHistory(){
    if(!s.prefs.historyEnabled || s.prefs.profile==='company')return `<div class="history-section"><div class="subhead"><h3>Recent searches</h3><button class="btn-plain" data-page="settings">History is off · manage settings</button></div><div class="muted small">Nothing is recorded automatically in Company-Safe Mode.</div></div>`;
    if(!s.history.length)return '<div class="history-section"><h3>Recent searches</h3><div class="muted small">Your recent searches will appear here.</div></div>';
    return `<div class="history-section"><div class="subhead"><h3>Recent searches</h3><button data-action="clear-history" class="btn-plain">Clear all</button></div><div class="history-list">${s.history.slice(0,10).map(h=>`<span class="history-wrapper"><button class="history-button" data-action="history-search" data-id="${esc(h.id)}">${esc(h.term)}</button><button class="history-delete" title="Remove history entry" aria-label="Remove ${esc(h.term)}" data-action="history-remove" data-id="${esc(h.id)}">×</button></span>`).join('')}</div></div>`;
  }
  function findLocal(term){const n=normal(term);return s.vocab.find(v=>normal(v.term)===n)||null;}
  async function lookup(term){
    term=safeText(term,500);if(!term){toast('Enter an English word or expression.',true);return;}
    s.query=term;
    const thisRequest=++s.lookupSequence;
    const local=findLocal(term);
    const previous=s.lookupResult;
    if(local)s.lookupResult=localResult(local);
    s.lookupError='';s.lookupLoading=liveAllowed();render();focusLookup();
    if(s.prefs.historyEnabled && s.prefs.profile==='personal' && term.length<=90) {
      try {const old=s.history.find(h=>normal(h.term)===normal(term));if(old)await DB.del('history',old.id);await DB.put('history',{id:id(),term,createdAt:now()});const all=await DB.getAll('history');all.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));for(const item of all.slice(40))await DB.del('history',item.id);await refreshData();}
      catch(err){toast('Search history could not be saved: '+err.message,true);}
    }
    if(!liveAllowed()){
      s.lookupLoading=false;
      if(!local){s.lookupResult=previous; s.lookupError=s.prefs.profile==='company'?'No matching saved word. Use manual entry, or select Personal Online for public/non-confidential lookups.':navigator.onLine?'Online lookup is disabled. No local entry found.':'You are offline. No matching local entry found.';}
      render();focusLookup();return;
    }
    const [trans,definition]=await Promise.allSettled([API.getTranslation(term),API.getDefinition(term)]);
    if(thisRequest!==s.lookupSequence)return;
    s.lookupLoading=false;
    const tr=trans.status==='fulfilled'?trans.value:null;
    const de=definition.status==='fulfilled'?definition.value:null;
    if(tr || de){
      s.lookupResult={term,translation:tr?.translation||local?.translation||'',source:[tr?.source,de?.source,(!tr&&local?'Saved vocabulary':'')].filter(Boolean).join(' + '),alternatives:tr?.alternatives||[],pos:de?.pos||local?.pos||'',definition:de?.definition||local?.definition||'',example:de?.example||local?.exampleEn||'',ipa:de?.ipa||'',audio:de?.audio||'',synonyms:de?.synonyms||[],remote:!!(tr||de),loadingDetail:!tr||(!de&&/^[a-z-]+$/i.test(term))};
      if(!tr)s.lookupError=`Chinese translation unavailable: ${trans.status==='rejected'?trans.reason.message:'No translation returned'}. ${local?'Showing locally saved Chinese translation.':'Enter a meaning manually or use Google Translate.'}`;
      if(!de&&definition.status==='rejected')s.lookupError+=(s.lookupError?' ':'')+'English dictionary details unavailable.';
    } else {
      s.lookupResult=local?localResult(local):previous;
      s.lookupError='Online lookup failed: '+[trans,definition].filter(v=>v.status==='rejected').map(v=>v.reason.message).join(' · ')+'. Try again or add a manual entry.';
    }
    render();focusLookup();
  }
  function localResult(v){return {term:v.term,translation:v.translation,source:v.source?`Saved vocabulary (${v.source})`:'Saved vocabulary',alternatives:v.alternativeMeanings||[],pos:v.pos,definition:v.definition,example:v.exampleEn,remote:false};}
  async function recordUpdated(){await refreshData();render();}
  async function copy(text){
    if(!text){toast('Nothing to copy.',true);return;}
    try{if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(text);else{
      const t=document.createElement('textarea');t.value=text;t.style.position='fixed';t.style.opacity='0';document.body.append(t);t.select();if(!document.execCommand('copy'))throw new Error('Clipboard permission denied');t.remove();
    }toast('Copied to clipboard.');}catch(e){toast(`Could not copy: ${e.message}`,true);}
  }
  function say(text,audio){
    if(audio && s.prefs.profile==='personal'){
      const a=new Audio(audio);a.play().catch(()=>browserSay(text));return;
    }
    browserSay(text);
  }
  function browserSay(text){
    if(!('speechSynthesis' in window)){toast('Pronunciation is not supported in this browser.',true);return;}
    speechSynthesis.cancel();const utt=new SpeechSynthesisUtterance(text);utt.lang='en-GB';utt.rate=.88;
    const british=speechSynthesis.getVoices().find(v=>v.lang.toLowerCase().startsWith('en-gb'));
    if(british)utt.voice=british;utt.onerror=()=>toast('Browser pronunciation unavailable.',true);speechSynthesis.speak(utt);
  }
  function navigateExternal(kind){
    if(s.prefs.profile==='company'){toast('External lookup is disabled in Company-Safe Mode.',true);return;}
    const term=s.query.trim();if(!term){toast('Search a word first.',true);return;}
    const url=kind==='translate'?`https://translate.google.com/?sl=en&tl=zh-TW&text=${encodeURIComponent(term)}&op=translate`:`https://www.google.com/search?q=${encodeURIComponent(term+' meaning in Traditional Chinese')}`;
    window.open(url,'_blank','noopener,noreferrer');
  }
  function filteredVocab(){
    let arr=s.vocab.filter(v=>(s.vocabCategory==='all'||v.categoryId===s.vocabCategory) && (s.vocabStatus==='all'||v.status===s.vocabStatus) && (!s.vocabFav||v.favourite));
    const q=normal(s.vocabQuery);if(q)arr=arr.filter(v=>[v.term,v.translation,v.definition,v.notes,(v.tags||[]).join(' '),catName(v.categoryId)].some(t=>normal(t).includes(q)));
    arr=arr.slice().sort((a,b)=>s.vocabSort==='az'?a.term.localeCompare(b.term):s.vocabSort==='za'?b.term.localeCompare(a.term):s.vocabSort==='oldest'?a.createdAt.localeCompare(b.createdAt):b.createdAt.localeCompare(a.createdAt));
    return arr;
  }
  function renderVocabulary(){
    const total=s.vocab.length,learn=s.vocab.filter(v=>v.status==='Learning').length,master=s.vocab.filter(v=>v.status==='Mastered').length,fav=s.vocab.filter(v=>v.favourite).length;
    return `<div class="intro-row"><div><div class="eyebrow">PERSONAL KNOWLEDGE BASE</div><h1>My Vocabulary</h1><p class="subtitle">Build a growing glossary of technical terms, workplace language and useful expressions.</p></div><button class="btn btn-primary" data-action="new-entry">＋ Add Word</button></div>
      <div class="stats-grid"><div class="stat-card"><div class="stat-label">TOTAL WORDS</div><div class="stat-value">${total}</div></div><div class="stat-card"><div class="stat-label">LEARNING</div><div class="stat-value">${learn}</div></div><div class="stat-card"><div class="stat-label">MASTERED</div><div class="stat-value">${master}</div></div><div class="stat-card"><div class="stat-label">FAVOURITES</div><div class="stat-value">${fav}</div></div></div>
      <div class="toolbar"><input id="vocab-filter" placeholder="⌕ Search word, meaning or tag..." value="${esc(s.vocabQuery)}" aria-label="Search vocabulary"><select id="vocab-category-filter" aria-label="Filter category"><option value="all">All categories</option>${s.categories.map(c=>`<option value="${esc(c.id)}" ${s.vocabCategory===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select><select id="vocab-status-filter" aria-label="Filter learning status"><option value="all">All learning stages</option>${options(STATUSES,s.vocabStatus)}</select><select id="vocab-sort" aria-label="Sort vocabulary"><option value="newest" ${s.vocabSort==='newest'?'selected':''}>Newest first</option><option value="oldest" ${s.vocabSort==='oldest'?'selected':''}>Oldest first</option><option value="az" ${s.vocabSort==='az'?'selected':''}>A to Z</option><option value="za" ${s.vocabSort==='za'?'selected':''}>Z to A</option></select><label class="toggle small"><input type="checkbox" id="vocab-favs" ${s.vocabFav?'checked':''}> Favourites</label><button class="btn" data-action="export-csv">↓ CSV</button></div>
      <div class="card" id="vocab-results">${renderVocabResults()}</div>`;
  }
  function renderVocabResults(){
    const items=filteredVocab(),pageSize=20, maxPage=Math.max(0,Math.ceil(items.length/pageSize)-1);s.vocabPage=Math.min(maxPage,s.vocabPage);
    const visible=items.slice(s.vocabPage*pageSize,(s.vocabPage+1)*pageSize);
    if(!visible.length)return `<div class="empty-state"><span class="empty-icon">▤</span><strong>${s.vocab.length?'No matching vocabulary':'Your vocabulary library is empty'}</strong><div>Try another filter, or add your first word.</div><button data-action="new-entry" class="btn btn-primary" style="margin-top:18px">＋ Add Word</button></div>`;
    const rows=visible.map(v=>`<tr><td><button class="star ${v.favourite?'on':''}" title="Toggle favourite" data-action="toggle-favourite" data-id="${esc(v.id)}">${v.favourite?'★':'☆'}</button></td><td><button class="btn-plain word-cell" data-action="view-entry" data-id="${esc(v.id)}">${esc(v.term)}</button></td><td class="word-zh">${esc(v.translation)}</td><td>${esc(catName(v.categoryId))}</td><td><span class="pill ${v.status==='Mastered'?'good':v.status==='Learning'?'warn':''}">${esc(v.status)}</span></td><td>${date(v.createdAt)}</td><td class="table-actions"><button class="btn btn-sm" data-action="edit-entry" data-id="${esc(v.id)}">Edit</button> <button class="btn btn-sm btn-danger" data-action="delete-entry" data-id="${esc(v.id)}">Delete</button></td></tr>`).join('');
    const mobile=visible.map(v=>`<div class="mobile-word-card"><div class="mobile-word-title"><button class="btn-plain word-cell" data-action="view-entry" data-id="${esc(v.id)}">${esc(v.term)}</button><button class="star ${v.favourite?'on':''}" data-action="toggle-favourite" data-id="${esc(v.id)}">${v.favourite?'★':'☆'}</button></div><div class="mobile-word-body">${esc(v.translation)}</div><div class="mobile-word-meta">${esc(catName(v.categoryId))} · ${esc(v.status)} · ${date(v.createdAt)}</div><div class="mobile-word-actions"><button class="btn btn-sm" data-action="edit-entry" data-id="${esc(v.id)}">Edit</button><button class="btn btn-sm btn-danger" data-action="delete-entry" data-id="${esc(v.id)}">Delete</button></div></div>`).join('');
    return `<div class="table-scroller"><table class="data-table"><thead><tr><th>★</th><th>English</th><th>繁體中文</th><th>Category</th><th>Status</th><th>Added</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div><div class="mobile-vocab">${mobile}</div><div class="pagination"><span>${items.length} matching · ${s.vocabPage*pageSize+1}–${Math.min(items.length,(s.vocabPage+1)*pageSize)}</span><div><button class="btn btn-sm" data-action="prev-page" ${s.vocabPage===0?'disabled':''}>← Prev</button><span>${s.vocabPage+1} / ${maxPage+1}</span><button class="btn btn-sm" data-action="next-page" ${s.vocabPage===maxPage?'disabled':''}>Next →</button></div></div>`;
  }
  function makeEntry(seed={}){
    return {id:seed.id||id(),term:seed.term||'',translation:seed.translation||'',definition:seed.definition||'',pos:seed.pos||'',exampleEn:seed.exampleEn||'',exampleZh:seed.exampleZh||'',categoryId:seed.categoryId||'',tags:seed.tags||[],notes:seed.notes||'',status:seed.status||'New',favourite:!!seed.favourite,source:seed.source||'Manual',createdAt:seed.createdAt||now(),updatedAt:now(),lastReviewedAt:seed.lastReviewedAt||null,alternativeMeanings:seed.alternativeMeanings||[]};
  }
  function entryModal(seed={},edit=false){
    const v=makeEntry(seed);
    openModal(edit?'Edit Vocabulary':'Save Vocabulary',`<form id="entry-form"><input type="hidden" id="entry-id" value="${esc(edit?v.id:'')}"><div class="field-row"><div class="field"><label for="entry-term">English word or phrase *</label><input id="entry-term" maxlength="500" required value="${esc(v.term)}" placeholder="Enter term"></div><div class="field"><label for="entry-translation">繁體中文 Translation *</label><input id="entry-translation" maxlength="2000" required value="${esc(v.translation)}" placeholder="Enter verified translation"></div></div>
      <div class="field-row"><div class="field"><label for="entry-category">Category</label><select id="entry-category">${categoriesOptions(v.categoryId)}</select></div><div class="field"><label for="entry-status">Learning status</label><select id="entry-status">${options(STATUSES,v.status)}</select></div></div>
      <div class="field-row"><div class="field"><label for="entry-pos">Part of speech</label><input id="entry-pos" maxlength="80" value="${esc(v.pos)}" placeholder="e.g. noun"></div><div class="field"><label for="entry-tags">Tags (comma separated)</label><input id="entry-tags" maxlength="500" value="${esc((v.tags||[]).join(', '))}" placeholder="e.g. standards, meetings"></div></div>
      <div class="field"><label for="entry-definition">English definition</label><textarea id="entry-definition" rows="2" maxlength="3000">${esc(v.definition)}</textarea></div><div class="field-row"><div class="field"><label for="entry-example-en">English example</label><textarea id="entry-example-en" rows="2" maxlength="3000">${esc(v.exampleEn)}</textarea></div><div class="field"><label for="entry-example-zh">Chinese example</label><textarea id="entry-example-zh" rows="2" maxlength="3000">${esc(v.exampleZh)}</textarea></div></div><div class="field"><label for="entry-notes">Personal notes</label><textarea id="entry-notes" rows="2" maxlength="5000">${esc(v.notes)}</textarea></div><label class="toggle small"><input type="checkbox" id="entry-fav" ${v.favourite?'checked':''}> Add to favourites</label><p class="help-text">Saved locally. Translation is editable and not automatically checked for accuracy.</p></form>`,`<button class="btn" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="submit-entry">${edit?'Save Changes':'Save Word'}</button>`);
  }
  function collectEntry(){
    const existingId=document.getElementById('entry-id').value;
    const existing=s.vocab.find(v=>v.id===existingId);
    const value=k=>document.getElementById(k).value.trim();
    const term=value('entry-term'),translation=value('entry-translation');
    if(!term||!translation){toast('English term and Traditional Chinese meaning are required.',true);document.getElementById(!term?'entry-term':'entry-translation').focus();return null;}
    const source=existing?.source||((s.lookupResult&&normal(s.lookupResult.term)===normal(term))?s.lookupResult.source:'Manual');
    return makeEntry({ ...existing,id:existing?.id||id(),term,translation,definition:value('entry-definition'),pos:value('entry-pos'),exampleEn:value('entry-example-en'),exampleZh:value('entry-example-zh'),categoryId:value('entry-category'),tags:[...new Set(value('entry-tags').split(',').map(x=>x.trim()).filter(Boolean))].slice(0,30),notes:value('entry-notes'),status:value('entry-status'),favourite:document.getElementById('entry-fav').checked,source,createdAt:existing?.createdAt||now(),lastReviewedAt:existing?.lastReviewedAt||null});
  }
  async function submitEntry(allowDuplicate=false){
    const entry=allowDuplicate?s.pendingEntry:collectEntry();if(!entry)return;
    const duplicate=s.vocab.find(v=>normal(v.term)===normal(entry.term)&&v.categoryId===entry.categoryId&&v.id!==entry.id);
    if(duplicate&&!allowDuplicate){
      s.pendingEntry=entry;
      openModal('Existing vocabulary found',`<p><strong>${esc(entry.term)}</strong> already exists under <strong>${esc(catName(entry.categoryId))}</strong>.</p><p class="muted small">You can view the existing entry, append this meaning to it, or save this as a separate contextual meaning.</p><div class="note-box"><strong>Existing:</strong> ${esc(duplicate.translation)}<div><strong>New:</strong> ${esc(entry.translation)}</div></div>`,`<button class="btn" data-action="view-entry" data-id="${esc(duplicate.id)}">View Existing</button><button class="btn" data-action="append-meaning" data-id="${esc(duplicate.id)}">Append Meaning</button><button class="btn btn-primary" data-action="save-distinct">Save Distinct Entry</button>`);return;
    }
    try {await DB.put('vocab',entry);s.pendingEntry=null;closeModal();await recordUpdated();toast('Vocabulary saved locally.');}
    catch(e){toast('Could not save vocabulary: '+e.message,true);}
  }
  async function appendMeaning(existingId){
    const old=s.vocab.find(v=>v.id===existingId),item=s.pendingEntry;if(!old||!item)return;
    const extras=[...(old.alternativeMeanings||[])];if(item.translation!==old.translation&&!extras.includes(item.translation))extras.push(item.translation);
    const notes=old.notes+(item.notes?`${old.notes?'\n':''}${item.notes}`:'');
    try{await DB.put('vocab',{...old,alternativeMeanings:extras,notes,updatedAt:now()});s.pendingEntry=null;closeModal();await recordUpdated();toast('Added new meaning to existing word.');}catch(e){toast(e.message,true);}
  }
  function viewEntry(v){
    openModal(v.term,`<div class="translation" style="margin:5px 0">${esc(v.translation)}</div><p class="muted">${esc(catName(v.categoryId))} · ${esc(v.status)} · Added ${date(v.createdAt)}</p>${v.definition?`<h3>Definition</h3><p>${esc(v.definition)}</p>`:''}${v.exampleEn?`<h3>Example</h3><p>${esc(v.exampleEn)}</p>`:''}${v.exampleZh?`<p>${esc(v.exampleZh)}</p>`:''}${v.alternativeMeanings?.length?`<h3>Additional meanings</h3><p>${v.alternativeMeanings.map(esc).join(' · ')}</p>`:''}${v.notes?`<h3>Personal notes</h3><div class="note-box" style="white-space:pre-wrap">${esc(v.notes)}</div>`:''}<p class="help-text">Source: ${esc(v.source)} · Last reviewed: ${date(v.lastReviewedAt)}</p>`,`<button class="btn" data-action="close-modal">Close</button><button class="btn btn-primary" data-action="edit-entry" data-id="${esc(v.id)}">Edit</button>`);
  }
  function openModal(title,body,footer){
    modalLayer.innerHTML=`<div class="modal-overlay"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-header"><h2>${esc(title)}</h2><button class="icon-btn" data-action="close-modal" aria-label="Close dialog">×</button></div><div class="modal-body">${body}</div><div class="modal-footer">${footer||'<button class="btn" data-action="close-modal">Close</button>'}</div></div></div>`;
    modalLayer.querySelector('input:not([type=hidden]),textarea,button')?.focus();
  }
  function closeModal(){modalLayer.innerHTML='';s.pendingEntry=null;}
  function confirmModal(title,detail,confirmAction,idValue){openModal(title,`<p>${esc(detail)}</p>`,`<button class="btn" data-action="close-modal">Cancel</button><button class="btn btn-danger" data-action="${esc(confirmAction)}" ${idValue?`data-id="${esc(idValue)}"`:''}>Confirm</button>`);}
  function renderGrammar(){
    const canCheck=s.prefs.profile==='personal'&&s.prefs.onlineEnabled;
    return `<div class="intro-row"><div><div class="eyebrow">WRITE WITH CONFIDENCE</div><h1>Grammar Checker</h1><p class="subtitle">Check British English grammar, spelling and punctuation. Review every change before applying it.</p></div><span class="pill ${canCheck?'good':'warn'}">${canCheck?'LanguageTool available online':'Online checking disabled'}</span></div>${privacyBanner()}<div class="two-col"><div class="card card-pad editor-area"><div class="panel-topline"><h2>Original Text</h2><span class="small muted" id="grammar-word-count">${countWords(s.grammarText)} words</span></div><textarea id="grammar-input" class="grammar-textarea" placeholder="Type or paste your sentence, email, or meeting notes here..." maxlength="18000">${esc(s.grammarText)}</textarea><div class="editor-bottom"><button class="btn-plain" data-action="clear-grammar">Clear text</button><button class="btn btn-primary" data-action="check-grammar" ${!canCheck||s.grammarLoading?'disabled':''}>${s.grammarLoading?'<span class="spinner"></span> Checking...':'✓ Check Grammar'}</button></div><div class="help-text">Ctrl+Enter to check. Your original draft is preserved. Online check sends the text to LanguageTool when you click the button.</div></div><div class="card card-pad"><div class="panel-topline"><h2>Corrections & Suggestions</h2>${s.grammarChecked?`<span class="pill">${s.grammarSuggestions.filter(v=>v.status==='pending').length} pending</span>`:''}</div>${renderGrammarResults()}</div></div><div class="card card-pad" style="margin-top:18px"><div class="subhead"><h3>Writing modes</h3><span class="pill">Future AI integration</span></div><div class="chip-list"><span class="chip active">Grammar only</span>${['More Natural','Professional / Formal','Concise','Polite','Clear and Simple'].map(x=>`<span class="chip" title="Requires a permitted AI provider">${x} · unavailable</span>`).join('')}</div><p class="help-text" style="margin:10px 0 0">For rewriting, use the manual, approved Copilot prompt workflow. No AI rewrite is simulated.</p><button class="btn btn-sm" data-action="prepare-copilot-grammar" style="margin-top:10px">◈ Prepare Copilot writing prompt</button></div>`;
  }
  function countWords(text){return text.trim()?text.trim().split(/\s+/).length:0;}
  function computedCorrected(){
    const applied=s.grammarSuggestions.filter(x=>x.status==='accepted').sort((a,b)=>b.offset-a.offset);
    let out=s.grammarOriginal, blocks=[];
    for(const match of applied){
      if(blocks.some(b=>match.offset<b.end && match.offset+match.length>b.start))continue;
      const replacement=match.replacements[match.selectedReplacement]||'';
      out=out.slice(0,match.offset)+replacement+out.slice(match.offset+match.length);
      blocks.push({start:match.offset,end:match.offset+match.length});
    }
    return out;
  }
  function renderGrammarResults(){
    if(s.grammarError)return banner('Grammar check unavailable',s.grammarError,'warning')+'<p class="small muted">For a manual alternative, use the approved Copilot prompt below. No automatic corrections were invented.</p>';
    if(s.grammarLoading)return '<div class="empty-state"><span class="spinner"></span><strong>Checking British English…</strong></div>';
    if(!s.grammarChecked)return `<div class="empty-state"><span class="empty-icon">✓</span><strong>Ready when you are</strong><div>Enter some English text and check it to review suggestions.</div></div>`;
    if(s.grammarDirty)return banner('Text changed since checking','Check again to refresh the suggestions.','warning');
    const corrected=computedCorrected();
    const suggestions=s.grammarSuggestions.map((m,i)=>{
      const replacement=m.replacements[m.selectedReplacement]||'';
      const excerpt=s.grammarOriginal.slice(Math.max(0,m.offset-20),m.offset);
      const match=s.grammarOriginal.slice(m.offset,m.offset+m.length);
      const end=s.grammarOriginal.slice(m.offset+m.length,m.offset+m.length+20);
      return `<div class="suggestion ${m.status==='accepted'?'accepted':m.status==='ignored'?'ignored':''}"><div class="suggestion-title"><span>${esc(m.category)}</span><span class="pill ${m.status==='accepted'?'good':''}">${esc(m.status)}</span></div><p class="suggestion-message">${esc(m.message)}</p><div class="suggestion-context">${esc(excerpt)}<span class="strike">${esc(match)||'∅'}</span>${esc(end)}${replacement?`<div style="margin-top:4px">Suggested: <span class="correct-to">${esc(replacement)}</span></div>`:''}</div><div class="setting-input-row">${m.replacements.length>1?`<select aria-label="Replacement choice" data-grammar-choice="${i}">${m.replacements.map((r,j)=>`<option value="${j}" ${j===m.selectedReplacement?'selected':''}>${esc(r)}</option>`).join('')}</select>`:''}<button class="btn btn-sm" data-action="accept-suggestion" data-index="${i}" ${!m.replacements.length||m.status==='accepted'?'disabled':''}>Apply</button><button class="btn btn-sm" data-action="ignore-suggestion" data-index="${i}" ${m.status==='ignored'?'disabled':''}>Ignore</button>${m.status!=='pending'?`<button class="btn btn-sm" data-action="reset-suggestion" data-index="${i}">Undo choice</button>`:''}</div></div>`;
    }).join('');
    return `${s.grammarSuggestions.length?`<p class="small muted">${s.grammarSuggestions.length} issue(s) found by LanguageTool. Accept only changes that preserve your intended meaning and engineering terminology.</p>`:banner('No issues detected','The checker found no issues within its supported rules. This is not a guarantee of error-free text.','ok')}<div class="section-label">CORRECTED DRAFT (YOUR APPROVED CHANGES)</div><div class="result-output" id="grammar-output">${esc(corrected)}</div><div class="action-row" style="margin-top:12px"><button class="btn btn-primary" data-action="copy-corrected">▣ Copy corrected</button><button class="btn" data-action="save-expression">＋ Save expression</button></div>${suggestions}`;
  }
  async function grammarCheck(){
    const input=document.getElementById('grammar-input');s.grammarText=input?.value||s.grammarText;
    if(!s.grammarText.trim()){toast('Enter some text to check.',true);return;}
    if(!liveAllowed()){toast('Switch to Personal Online with internet access to use LanguageTool.',true);return;}
    s.grammarLoading=true;s.grammarError='';s.grammarChecked=false;s.grammarDirty=false;render();
    try{s.grammarSuggestions=await API.checkGrammar(s.grammarText);s.grammarOriginal=s.grammarText;s.grammarChecked=true;}
    catch(e){s.grammarError=e.message;s.grammarSuggestions=[];}
    finally{s.grammarLoading=false;render();}
  }
  function acceptSuggestion(index){
    const item=s.grammarSuggestions[index];if(!item||!item.replacements.length)return;
    if(s.grammarSuggestions.some((m,i)=>i!==index&&m.status==='accepted'&&item.offset<m.offset+m.length&&item.offset+item.length>m.offset)){
      toast('This suggestion overlaps an already accepted change. Undo the other change first.',true);return;
    }
    item.status='accepted';render();
  }
  function promptCopilot(kind){
    const term=kind==='grammar'?s.grammarText:s.query;
    if(!term.trim()){toast('Enter some text first.',true);return;}
    const prompt=kind==='grammar'?`Please review the following English text using British English (en-GB). Correct grammar, spelling and punctuation, while preserving my intended meaning and technical engineering terminology. Distinguish necessary corrections from optional style improvements. Explain corrections briefly in Traditional Chinese (Hong Kong). Do not invent facts.\n\nText:\n${term}`:`Please explain this English term or expression in natural Hong Kong Traditional Chinese (zh-Hant). Include the relevant meaning, part of speech, a concise British-English definition, and one realistic workplace or engineering example. If there are different meanings, distinguish them. Do not guess a meaning without context.\n\nTerm: ${term}\nContext: ${s.context}${s.contextSentence?'\nReference sentence: '+s.contextSentence:''}`;
    openModal('Prepare Copilot Prompt',`${banner('Manual workflow only','Review the text below. Copy it and submit it yourself in your authorised Copilot interface if company policy permits.')}<div class="copilot-prompt" id="copilot-prompt">${esc(prompt)}</div><p class="help-text">This application does not connect to, control, or read from Microsoft Copilot.</p>`,`<button class="btn" data-action="close-modal">Close</button><button class="btn" data-action="open-copilot">Open Copilot ↗</button><button class="btn btn-primary" data-action="copy-copilot">Copy Prompt</button>`);
    modalLayer.dataset.copilotPrompt=prompt;
  }
  function reviewItems(){let arr=s.reviewOnlyLearning?s.vocab.filter(v=>v.status==='New'||v.status==='Learning'):s.vocab;return arr.slice().sort((a,b)=>a.term.localeCompare(b.term));}
  function renderReview(){
    const items=reviewItems();
    s.reviewIndex=Math.max(0,Math.min(s.reviewIndex,items.length-1));
    const v=items[s.reviewIndex];
    const intro=`<div class="intro-row"><div><div class="eyebrow">A FEW MINUTES EVERY DAY</div><h1>Review Vocabulary</h1><p class="subtitle">Learn by recall. Reveal a meaning, then mark your confidence.</p></div><label class="toggle small"><input type="checkbox" id="review-only-learning" ${s.reviewOnlyLearning?'checked':''}> Only New & Learning</label></div>`;
    if(!v)return intro+`<div class="card"><div class="empty-state"><span class="empty-icon">◫</span><strong>Nothing to review</strong><div>${s.vocab.length?'All words in this filter are familiar or mastered. Switch off the filter to review all words.':'Save some vocabulary first, then come back here.'}</div><button class="btn btn-primary" data-page="vocabulary" style="margin-top:15px">Open Vocabulary</button></div></div>`;
    const answer=s.reviewRevealed?`<div class="translation">${esc(v.translation)}</div>${v.definition?`<p>${esc(v.definition)}</p>`:''}${v.exampleEn?`<p class="small muted">${esc(v.exampleEn)}</p>`:''}`:`<div class="muted" style="padding-top:25px">Try to recall the Chinese meaning.<div class="small">Click Reveal to check.</div></div>`;
    const buttons=s.reviewRevealed?`<button class="btn" data-action="review-practice" data-id="${esc(v.id)}">↺ Need Practice</button><button class="btn btn-primary" data-action="review-know" data-id="${esc(v.id)}">✓ I Know This</button>`:`<button class="btn btn-primary" data-action="review-reveal">Reveal Meaning</button>`;
    return intro+`<div class="review-card card"><div class="panel-topline"><span class="pill">${s.reviewIndex+1} of ${items.length}</span><span class="small muted">${esc(catName(v.categoryId))} · ${esc(v.status)}</span></div><div class="review-word">${esc(v.term)}</div><div style="text-align:center"><button class="btn-plain" data-action="review-pronounce">♫ Listen to UK English</button></div><div class="review-answer">${answer}</div><div class="review-buttons">${buttons}<button class="btn" data-action="review-next">Skip →</button></div><p class="help-text" style="text-align:center;margin-top:20px">Review decisions update local learning status and last reviewed date.</p></div>`;
  }
  async function reviewMark(v,know){
    if(!v)return;const newStatus=know?(v.status==='Familiar'||v.status==='Mastered'?'Mastered':'Familiar'):'Learning';
    try{await DB.put('vocab',{...v,status:newStatus,lastReviewedAt:now(),updatedAt:now()});await refreshData();s.reviewRevealed=false;
      const items=reviewItems();if(s.reviewIndex>=items.length)s.reviewIndex=0;render();toast(know?'Marked as familiar.':'Marked for more practice.');}catch(e){toast(e.message,true);}
  }
  function renderSettings(){
    return `<div class="intro-row"><div><div class="eyebrow">YOUR APP · YOUR DATA</div><h1>Settings & Backup</h1><p class="subtitle">Configure privacy, local history, appearance and long-term backup. No account required.</p></div><span class="pill">V${APP_VERSION}</span></div>
      <div class="two-col"><div><div class="card card-pad setting-section"><h2>Privacy & Online Services</h2><div class="setting-item"><div><div class="setting-label">Usage profile</div><div class="setting-desc">Company-Safe blocks third-party requests and external links.</div></div><select id="setting-profile"><option value="company" ${s.prefs.profile==='company'?'selected':''}>Company-Safe</option><option value="personal" ${s.prefs.profile==='personal'?'selected':''}>Personal Online</option></select></div><div class="setting-item"><div><div class="setting-label">Permit online lookup</div><div class="setting-desc">Only acts in Personal Online when you explicitly search.</div></div><label class="toggle"><input type="checkbox" id="setting-online" ${s.prefs.onlineEnabled?'checked':''} aria-label="Enable online lookup"></label></div><div class="setting-item"><div><div class="setting-label">Save search history</div><div class="setting-desc">Only short queries in Personal Online; never store context sentences automatically.</div></div><label class="toggle"><input type="checkbox" id="setting-history" ${s.prefs.historyEnabled?'checked':''} aria-label="Enable search history"></label></div><div class="setting-item"><div><div class="setting-label">History controls</div><div class="setting-desc">Delete locally recorded searches.</div></div><button class="btn btn-sm" data-action="clear-history">Clear history</button></div><p class="help-text" style="margin-top:15px"><strong>Provider transparency:</strong> MyMemory (English text sent as URL query; public translation memory), Free Dictionary API (single word), LanguageTool (grammar text via POST), and Google / Copilot external sites only when opened manually. These are third-party services. Company content should not be sent without authorisation.</p></div>
        <div class="card card-pad setting-section"><h2>Appearance</h2><div class="setting-item"><div><div class="setting-label">Theme</div><div class="setting-desc">Applied to all app screens and dialogs.</div></div><select id="setting-theme">${options(['system','light','dark'],s.prefs.theme)}</select></div><div class="setting-item"><div><div class="setting-label">Text size</div><div class="setting-desc">Can also use browser zoom.</div></div><select id="setting-font">${options(['small','normal','large'],s.prefs.fontSize)}</select></div></div></div>
      <div><div class="card card-pad setting-section"><h2>Backup & Data Portability</h2><p class="small muted">Your vocabulary stays in this browser. Export a backup before changing devices or clearing browser storage.</p><div class="setting-input-row" style="margin-top:15px"><button class="btn btn-primary" data-action="export-backup">↓ Full JSON Backup</button><button class="btn" data-action="export-vocab-json">↓ Vocabulary JSON</button><button class="btn" data-action="export-csv">↓ Vocabulary CSV</button></div><div class="result-divider"></div><h3>Restore or import</h3><div class="setting-input-row"><label class="btn" for="backup-file">↑ Restore Full Backup</label><input id="backup-file" type="file" accept=".json,application/json" class="hide"><label class="btn" for="vocab-file">↑ Import Vocabulary</label><input id="vocab-file" type="file" accept=".json,.csv,application/json,text/csv" class="hide"></div><p class="help-text" style="margin-top:10px">Restore replaces all app records after validation and confirmation. Vocabulary import merges records and skips duplicates. Exported JSON contains schemaVersion 1 and stable IDs.</p></div>
        <div class="card card-pad setting-section"><h2>Vocabulary Categories</h2><div class="category-list">${s.categories.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(c=>`<span class="category-token">${esc(c.name)} <button title="Rename category" data-action="rename-category" data-id="${esc(c.id)}">✎</button><button title="Delete category" data-action="delete-category" data-id="${esc(c.id)}">×</button></span>`).join('')}</div><form id="category-form" class="setting-input-row"><input id="new-category" style="flex:1;min-width:150px" placeholder="New category name" maxlength="75" required><button type="submit" class="btn btn-primary">＋ Add</button></form><p class="help-text">Deleting a category leaves the affected words as Uncategorised.</p></div></div></div><div class="card card-pad"><h2>Storage & Compatibility</h2><p class="small muted">Application version: ${APP_VERSION} · Backup schema: ${SCHEMA_VERSION} · Storage: ${DB.storageType()==='localstorage'?'localStorage fallback':'IndexedDB'} · ${s.vocab.length} saved vocabulary entries · ${s.categories.length} categories.</p><p class="help-text">iPhone Web App edition: host these static files together on an HTTPS website, then use Safari → Share → Add to Home Screen. No Python is required for app users. Browser data is stored on this device and site origin, not automatically synchronised to other devices. Export JSON backups regularly; online providers need internet and may impose rate limits.</p></div>`;
  }
  function exportDownload(filename,content,mime){
    const blob=new Blob([content],{type:mime});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
  function backupObject(){return {app:'Fieldnotes English Companion',appVersion:APP_VERSION,schemaVersion:SCHEMA_VERSION,exportedAt:now(),vocabulary:s.vocab,categories:s.categories,searchHistory:s.history,preferences:{...s.prefs}};}
  function csvString(){
    const cols=['id','term','translation','definition','pos','exampleEn','exampleZh','category','tags','notes','status','favourite','source','createdAt','updatedAt','lastReviewedAt'];
    const rows=s.vocab.map(v=>[v.id,v.term,v.translation,v.definition,v.pos,v.exampleEn,v.exampleZh,catName(v.categoryId),(v.tags||[]).join('; '),v.notes,v.status,v.favourite?'true':'false',v.source,v.createdAt,v.updatedAt,v.lastReviewedAt]);
    return '\ufeff'+[cols.map(encodeCsvCell).join(','),...rows.map(r=>r.map(encodeCsvCell).join(','))].join('\r\n');
  }
  function parseCSV(csv){
    let text=csv.replace(/^\ufeff/,'');const rows=[];let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}else if(c==='"'){quoted=true;}else if(c===','){row.push(cell);cell='';}else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=c;}
    if(quoted)throw new Error('CSV includes an unfinished quoted field.');
    if(cell.length||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
    if(!rows.length)throw new Error('CSV is empty.');
    const header=rows.shift().map(x=>x.trim());if(!header.includes('term')||!header.includes('translation'))throw new Error('CSV needs term and translation columns.');
    return rows.filter(r=>r.some(x=>x.trim())).map(r=>Object.fromEntries(header.map((k,i)=>[k,r[i]||''])));
  }
  function validateEntry(v,mode='backup'){
    if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Invalid vocabulary record.');
    if(typeof v.term!=='string'||!v.term.trim()||v.term.length>500)throw new Error('A vocabulary item has an invalid English term.');
    if(typeof v.translation!=='string'||!v.translation.trim()||v.translation.length>2000)throw new Error(`Invalid Chinese translation for ${v.term}.`);
    const item=makeEntry({id:(typeof v.id==='string'&&v.id.length<150&&v.id.trim())?v.id:id(),term:safeText(v.term,500),translation:safeText(v.translation,2000),definition:safeText(v.definition,3000),pos:safeText(v.pos,80),exampleEn:safeText(v.exampleEn,3000),exampleZh:safeText(v.exampleZh,3000),notes:safeText(v.notes,5000),tags:Array.isArray(v.tags)?v.tags.filter(x=>typeof x==='string').slice(0,30).map(x=>x.slice(0,100)):typeof v.tags==='string'?v.tags.split(';').map(x=>x.trim()).filter(Boolean):[],categoryId:typeof v.categoryId==='string'?v.categoryId:'',status:STATUSES.includes(v.status)?v.status:'New',favourite:v.favourite===true||v.favourite==='true',source:safeText(v.source,160)||'Imported',createdAt:/^\d{4}-\d{2}-\d{2}T/.test(String(v.createdAt))?v.createdAt:now(),lastReviewedAt:v.lastReviewedAt||null,alternativeMeanings:Array.isArray(v.alternativeMeanings)?v.alternativeMeanings.filter(x=>typeof x==='string').slice(0,30):[]});
    if(mode==='backup')item.updatedAt=v.updatedAt||item.createdAt;
    return item;
  }
  function validateBackup(data){
    if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Backup must be a JSON object.');
    if(data.schemaVersion!==SCHEMA_VERSION)throw new Error(`Unsupported backup schema ${String(data.schemaVersion)}. This version supports schema ${SCHEMA_VERSION}.`);
    if(!Array.isArray(data.vocabulary)||!Array.isArray(data.categories)||!data.preferences||typeof data.preferences!=='object')throw new Error('Missing vocabulary, categories or preferences from full backup.');
    if(data.vocabulary.length>50000||data.categories.length>2000)throw new Error('Backup contains too many records.');
    const vocab=data.vocabulary.map(v=>validateEntry(v));
    const seenIDs=new Set();for(const v of vocab){if(seenIDs.has(v.id))throw new Error('Backup contains duplicate vocabulary IDs.');seenIDs.add(v.id);}
    const cats=data.categories.map(c=>{
      if(!c||typeof c.id!=='string'||!c.id||typeof c.name!=='string'||!c.name.trim()||c.name.length>75)throw new Error('Invalid category entry.');
      return {id:c.id,name:c.name,createdAt:c.createdAt||now()};
    });
    if(new Set(cats.map(c=>c.id)).size!==cats.length)throw new Error('Duplicate category IDs.');
    const history=(Array.isArray(data.searchHistory)?data.searchHistory:[]).filter(h=>h&&typeof h.id==='string'&&typeof h.term==='string'&&h.term.length<=90).slice(0,40).map(h=>({id:h.id,term:h.term,createdAt:h.createdAt||now()}));
    const p=data.preferences;const prefs={...DEFAULTS,profile:['company','personal'].includes(p.profile)?p.profile:'company',onlineEnabled:p.onlineEnabled===true,historyEnabled:p.historyEnabled===true,theme:['system','light','dark'].includes(p.theme)?p.theme:'system',fontSize:['small','normal','large'].includes(p.fontSize)?p.fontSize:'normal'};
    return {vocab,categories:cats,history,settings:[prefs]};
  }
  async function handleBackupFile(file){
    if(!file)return;if(file.size>12*1024*1024){toast('Backup exceeds the 12 MB safety limit.',true);return;}
    try{const parsed=JSON.parse(await file.text()),bundle=validateBackup(parsed);
      s.restoreData=bundle;
      openModal('Restore full backup',`<p>This file contains <strong>${bundle.vocab.length}</strong> vocabulary entries and <strong>${bundle.categories.length}</strong> categories.</p>${banner('Existing local data will be replaced','Export a fresh backup first. Restoring is an atomic database transaction.','warning')}`,
        '<button class="btn" data-action="close-modal">Cancel</button><button class="btn btn-danger" data-action="confirm-restore">Replace All Data</button>');
    }catch(e){toast('Backup rejected: '+e.message,true);}
    document.getElementById('backup-file').value='';
  }
  async function handleVocabFile(file){
    if(!file)return;
    if(file.size>10*1024*1024){toast('Import exceeds the 10 MB safety limit.',true);return;}
    try{
      let raw=[],sourceCats=[],isCsv=file.name.toLowerCase().endsWith('.csv');
      if(isCsv){raw=parseCSV(await file.text());}
      else{
        const doc=JSON.parse(await file.text());
        if(!Array.isArray(doc)&&doc.schemaVersion!=null&&doc.schemaVersion!==SCHEMA_VERSION)throw new Error(`Unsupported vocabulary schema ${doc.schemaVersion}.`);
        raw=Array.isArray(doc)?doc:Array.isArray(doc.vocabulary)?doc.vocabulary:[];
        sourceCats=Array.isArray(doc.categories)?doc.categories:[];
      }
      if(!Array.isArray(raw)||!raw.length)throw new Error('No vocabulary items found in this file.');
      if(raw.length>50000||sourceCats.length>2000)throw new Error('Import file contains too many records.');
      const incoming=raw.map(v=>validateEntry(v,'import'));
      // Reconcile category IDs by name, keeping imported vocabulary correctly classified.
      const cats=new Map(s.categories.map(c=>[normal(c.name),c]));
      const additional=[];
      function resolveCategory(label){
        const name=safeText(label,75);
        if(!name||normal(name)==='uncategorised')return '';
        if(cats.has(normal(name)))return cats.get(normal(name)).id;
        const c={id:id(),name,createdAt:now()};additional.push(c);cats.set(normal(name),c);return c.id;
      }
      const sourceById=new Map(sourceCats.filter(c=>c&&typeof c.id==='string'&&typeof c.name==='string').map(c=>[c.id,c.name]));
      incoming.forEach((v,i)=>{
        const original=raw[i];
        const originalId=typeof original.categoryId==='string'?original.categoryId:'';
        const categoryLabel=isCsv?original.category:(sourceById.get(originalId)||'');
        if(categoryLabel)v.categoryId=resolveCategory(categoryLabel);
        else if(!s.categories.some(c=>c.id===originalId))v.categoryId='';
      });
      let skipped=0;const additions=[];
      const existing=new Set(s.vocab.map(v=>`${normal(v.term)}|${normal(v.translation)}|${v.categoryId}`));
      const occupiedIDs=new Set(s.vocab.map(v=>v.id));
      for(const v of incoming){const key=`${normal(v.term)}|${normal(v.translation)}|${v.categoryId}`;
        if(existing.has(key)){skipped++;continue;}
        while(occupiedIDs.has(v.id))v.id=id();
        occupiedIDs.add(v.id);additions.push(v);existing.add(key);
      }
      await DB.batchMerge({vocab:additions,categories:additional});
      await recordUpdated();toast(`Imported ${additions.length} item(s); skipped ${skipped} duplicate(s).`);
    }catch(e){toast('Import failed: '+e.message,true);}
    document.getElementById('vocab-file').value='';
  }
  async function addCategory(name){name=safeText(name,75);if(!name){toast('Enter a category name.',true);return;}
    if(s.categories.some(c=>normal(c.name)===normal(name))){toast('This category already exists.',true);return;}
    try{await DB.put('categories',{id:id(),name,createdAt:now()});await recordUpdated();toast('Category created.');}catch(e){toast(e.message,true);}
  }
  function renameCategory(c){openModal('Rename Category',`<form id="rename-category-form"><div class="field"><label for="rename-category-input">Category name</label><input id="rename-category-input" maxlength="75" required value="${esc(c.name)}"></div><input id="rename-category-id" type="hidden" value="${esc(c.id)}"></form>`,`<button class="btn" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="confirm-rename-category">Rename</button>`);}
  async function action(button){
    const what=button.dataset.action, key=button.dataset.id;
    const word=()=>s.vocab.find(x=>x.id===key);
    try{switch(what){
      case 'menu':{const open=document.getElementById('sidebar').classList.toggle('open');document.getElementById('sidebar-scrim')?.classList.toggle('open',open);break;}
      case 'toggle-profile':s.prefs.profile=s.prefs.profile==='company'?'personal':'company';if(s.prefs.profile==='company'){s.lookupSequence++;if(s.lookupResult?.remote)s.lookupResult=null;s.lookupLoading=false;}await savePrefs();render();toast(s.prefs.profile==='personal'?'Personal Online mode: use only public/non-confidential text.':'Company-Safe mode enabled.');break;
      case 'theme-cycle':{const order=['system','light','dark'],idx=order.indexOf(s.prefs.theme);s.prefs.theme=order[(idx+1)%3];await savePrefs();if(s.page==='settings')render();toast(`Theme: ${s.prefs.theme}`);break;}
      case 'save-result':{
        const r=s.lookupResult;if(!r){toast('No result to save.',true);break;}
        entryModal({term:r.term,translation:r.translation,definition:r.definition,pos:r.pos,exampleEn:r.example,source:r.source,categoryId:s.categories.find(c=>normal(c.name)===normal(s.context))?.id||''});break;}
      case 'copy-translation':await copy(s.lookupResult?.translation);break;
      case 'pronounce':if(s.lookupResult)say(s.lookupResult.term,s.lookupResult.audio);break;
      case 'open-google':navigateExternal('google');break;
      case 'open-translate':navigateExternal('translate');break;
      case 'prepare-copilot':promptCopilot('lookup');break;
      case 'prepare-copilot-grammar':promptCopilot('grammar');break;
      case 'copy-copilot':await copy(modalLayer.dataset.copilotPrompt);break;
      case 'open-copilot':window.open('https://copilot.cloud.microsoft/chat','_blank','noopener,noreferrer');break;
      case 'clear-history':if(!s.history.length){toast('Search history is already empty.');break;}confirmModal('Clear Search History','Permanently delete all locally stored search terms?','confirm-clear-history');break;
      case 'confirm-clear-history':await DB.clear('history');closeModal();await recordUpdated();toast('Search history cleared.');break;
      case 'history-search':{const h=s.history.find(x=>x.id===key);if(h)await lookup(h.term);break;}
      case 'history-remove':await DB.del('history',key);await recordUpdated();break;
      case 'new-entry':entryModal(s.query?{term:s.query}:{});break;
      case 'edit-entry':{const v=word();if(v)entryModal(v,true);break;}
      case 'view-entry':{const v=word();if(v)viewEntry(v);break;}
      case 'submit-entry':await submitEntry();break;
      case 'save-distinct':await submitEntry(true);break;
      case 'append-meaning':await appendMeaning(key);break;
      case 'close-modal':closeModal();break;
      case 'toggle-favourite':{const v=word();if(v){await DB.put('vocab',{...v,favourite:!v.favourite,updatedAt:now()});await recordUpdated();}break;}
      case 'delete-entry':{const v=word();if(v)confirmModal('Delete Vocabulary',`Delete "${v.term}" from your personal vocabulary? This cannot be undone.`, 'confirm-delete-entry',v.id);break;}
      case 'confirm-delete-entry':await DB.del('vocab',key);closeModal();await recordUpdated();toast('Vocabulary deleted.');break;
      case 'prev-page':s.vocabPage=Math.max(0,s.vocabPage-1);render();break;
      case 'next-page':s.vocabPage++;render();break;
      case 'clear-grammar':s.grammarText='';s.grammarOriginal='';s.grammarSuggestions=[];s.grammarChecked=false;s.grammarDirty=false;s.grammarError='';render();document.getElementById('grammar-input')?.focus();break;
      case 'check-grammar':await grammarCheck();break;
      case 'accept-suggestion':acceptSuggestion(Number(button.dataset.index));break;
      case 'ignore-suggestion':{const m=s.grammarSuggestions[Number(button.dataset.index)];if(m)m.status='ignored';render();break;}
      case 'reset-suggestion':{const m=s.grammarSuggestions[Number(button.dataset.index)];if(m)m.status='pending';render();break;}
      case 'copy-corrected':await copy(computedCorrected());break;
      case 'save-expression':entryModal({term:computedCorrected(),translation:'',categoryId:s.categories.find(c=>c.name==='Email Writing')?.id||'',definition:'Corrected expression, saved from Grammar Checker',source:'LanguageTool check (user accepted changes)'});break;
      case 'review-pronounce':{const v=reviewItems()[s.reviewIndex];if(v)say(v.term);break;}
      case 'review-reveal':s.reviewRevealed=true;render();break;
      case 'review-next':{const l=reviewItems().length;s.reviewIndex=l?(s.reviewIndex+1)%l:0;s.reviewRevealed=false;render();break;}
      case 'review-know':await reviewMark(word(),true);break;
      case 'review-practice':await reviewMark(word(),false);break;
      case 'export-backup':exportDownload(`fieldnotes-english-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(backupObject(),null,2),'application/json;charset=utf-8');toast('Full JSON backup exported.');break;
      case 'export-vocab-json':exportDownload('fieldnotes-vocabulary.json',JSON.stringify({app:'Fieldnotes English Companion',appVersion:APP_VERSION,schemaVersion:SCHEMA_VERSION,exportedAt:now(),vocabulary:s.vocab,categories:s.categories},null,2),'application/json;charset=utf-8');break;
      case 'export-csv':exportDownload('fieldnotes-vocabulary.csv',csvString(),'text/csv;charset=utf-8');break;
      case 'confirm-restore':{if(!s.restoreData)throw new Error('Restore file not prepared.');await DB.replaceAll(s.restoreData);s.prefs={...s.restoreData.settings[0]};s.restoreData=null;closeModal();await refreshData();applyPreferences();render();toast('Backup restored successfully.');break;}
      case 'rename-category':{const c=s.categories.find(c=>c.id===key);if(c)renameCategory(c);break;}
      case 'confirm-rename-category':{const cid=document.getElementById('rename-category-id').value,name=document.getElementById('rename-category-input').value.trim();const c=s.categories.find(x=>x.id===cid);if(!c||!name)return toast('Enter a category name.',true);if(s.categories.some(x=>x.id!==cid&&normal(x.name)===normal(name)))return toast('A category with that name exists.',true);await DB.put('categories',{...c,name:name.slice(0,75)});closeModal();await recordUpdated();toast('Category renamed.');break;}
      case 'delete-category':{const c=s.categories.find(c=>c.id===key);if(c)confirmModal('Delete Category',`Delete "${c.name}"? Associated vocabulary remains saved, and becomes Uncategorised.`,'confirm-delete-category',c.id);break;}
      case 'confirm-delete-category':{const matches=s.vocab.filter(v=>v.categoryId===key);for(const v of matches)await DB.put('vocab',{...v,categoryId:'',updatedAt:now()});await DB.del('categories',key);closeModal();await recordUpdated();toast('Category deleted; vocabulary preserved.');break;}
    }}catch(err){toast(err.message||'Action failed.',true);}
  }
  document.addEventListener('click',event=>{
    const nav=event.target.closest('[data-page]');
    if(nav){event.preventDefault();setPage(nav.dataset.page);return;}
    const btn=event.target.closest('[data-action]');
    if(btn){event.preventDefault();if(!btn.disabled)void action(btn);}
  });
  document.addEventListener('submit',event=>{
    if(event.target.id==='lookup-form'){event.preventDefault();void lookup(document.getElementById('lookup-input').value);}
    else if(event.target.id==='category-form'){event.preventDefault();void addCategory(document.getElementById('new-category').value);}
    else if(event.target.id==='entry-form'){event.preventDefault();void submitEntry();}
    else if(event.target.id==='rename-category-form'){event.preventDefault();void action({dataset:{action:'confirm-rename-category'}});}
  });
  document.addEventListener('input',event=>{
    const el=event.target;
    if(el.id==='lookup-input')s.query=el.value;
    if(el.id==='context-sentence')s.contextSentence=el.value;
    if(el.id==='vocab-filter'){s.vocabQuery=el.value;s.vocabPage=0;const tgt=document.getElementById('vocab-results');if(tgt)tgt.innerHTML=renderVocabResults();}
    if(el.id==='grammar-input'){s.grammarText=el.value;const count=document.getElementById('grammar-word-count');if(count)count.textContent=countWords(s.grammarText)+' words';if(s.grammarChecked){s.grammarDirty=true;const tgt=el.closest('.two-col')?.querySelector('.card:nth-child(2)');if(tgt){const body=tgt.querySelector('.suggestion, .result-output, .empty-state');if(body){const notice=renderGrammarResults();tgt.innerHTML=`<h2>Corrections & Suggestions</h2>${notice}`;}}}}
  });
  document.addEventListener('change',async event=>{
    const el=event.target;try{switch(el.id){
      case 'context-select':s.context=el.value;break;
      case 'vocab-category-filter':s.vocabCategory=el.value;s.vocabPage=0;render();break;
      case 'vocab-status-filter':s.vocabStatus=el.value;s.vocabPage=0;render();break;
      case 'vocab-sort':s.vocabSort=el.value;s.vocabPage=0;render();break;
      case 'vocab-favs':s.vocabFav=el.checked;s.vocabPage=0;render();break;
      case 'review-only-learning':s.reviewOnlyLearning=el.checked;s.reviewIndex=0;s.reviewRevealed=false;render();break;
      case 'setting-profile':s.prefs.profile=el.value;if(s.prefs.profile==='company'){s.lookupSequence++;if(s.lookupResult?.remote)s.lookupResult=null;s.lookupLoading=false;}await savePrefs();render();break;
      case 'setting-online':s.prefs.onlineEnabled=el.checked;await savePrefs();render();break;
      case 'setting-history':s.prefs.historyEnabled=el.checked;await savePrefs();render();break;
      case 'setting-theme':s.prefs.theme=el.value;await savePrefs();render();break;
      case 'setting-font':s.prefs.fontSize=el.value;await savePrefs();render();break;
      case 'backup-file':await handleBackupFile(el.files?.[0]);break;
      case 'vocab-file':await handleVocabFile(el.files?.[0]);break;
    }
    if(el.dataset.grammarChoice!=null){const index=Number(el.dataset.grammarChoice);const m=s.grammarSuggestions[index];if(m){m.selectedReplacement=Number(el.value);render();}}
    }catch(err){toast(err.message||'Could not save change.',true);}
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&modalLayer.hasChildNodes()){closeModal();event.preventDefault();return;}
    if(event.key==='Escape'&&document.getElementById('sidebar').classList.contains('open')){document.getElementById('sidebar').classList.remove('open');document.getElementById('sidebar-scrim')?.classList.remove('open');event.preventDefault();return;}
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();setPage('dictionary');focusLookup(true);}
    if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&s.page==='grammar'&&document.activeElement?.id==='grammar-input'){event.preventDefault();void grammarCheck();}
  });
  window.addEventListener('online',()=>{refreshTop();render();});window.addEventListener('offline',()=>{refreshTop();render();});
  if(window.matchMedia)window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if(s.prefs.theme==='system')applyPreferences();});
  async function boot(){
    try{await DB.open();s.storageReady=true;const prefs=await DB.get('settings','main');s.prefs={...DEFAULTS,...(prefs||{})};
      const categories=await DB.getAll('categories');
      if(!categories.length&&!prefs){for(const name of DEFAULT_CATEGORIES)await DB.put('categories',{id:id(),name,createdAt:now()});}
      await refreshData();applyPreferences();render();focusLookup();
      if(!window.FIELDNOTES_STANDALONE && 'serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1')){
        navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('Offline cache not registered:',e));
      }
    }catch(err){root.innerHTML=`<div class="card card-pad">${banner('Local storage unavailable',err.message,'error')}<p>Browser storage must be enabled to save vocabulary. Check storage permissions or use an HTTPS-hosted static version (no Python required) and import a JSON backup.</p></div>`;}
  }
  boot();
})();
