/* Actual service adapters. Calls are deliberate, never made by the Company-Safe mode. */
(function (root) {
  'use strict';
  function request(url, options = {}, timeoutMs = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal, cache: 'no-store' }).then(async response => {
      if (response.status === 429) throw new Error('Provider rate limit reached. Please try again later.');
      if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}.`);
      try { return await response.json(); }
      catch { throw new Error('The provider returned invalid JSON.'); }
    }).catch(err => {
      if (err.name === 'AbortError') throw new Error('Lookup timed out. Please retry.');
      if (err instanceof TypeError) throw new Error('Network access blocked or the service is unreachable (possibly CORS or company policy).');
      throw err;
    }).finally(() => clearTimeout(timer));
  }
  function isSimpleWord(term) { return /^[a-z][a-z'\- ]{0,54}$/i.test(term) && term.trim().split(/\s+/).length === 1; }
  async function getTranslation(term) {
    if (new TextEncoder().encode(term).length > 500) throw new Error('Translation text exceeds the provider’s 500-byte limit. Shorten your search.');
    const q = new URLSearchParams({ q: term, langpair: 'en|zh-TW' });
    const data = await request(`https://api.mymemory.translated.net/get?${q}`);
    if (Number(data.responseStatus) !== 200) throw new Error(data.responseDetails || 'Translation is unavailable.');
    const text = String(data.responseData?.translatedText || '').trim();
    if (!text || /^(?:null|undefined|no translation)/i.test(text)) throw new Error('No translation returned by the provider.');
    const alternatives = (Array.isArray(data.matches) ? data.matches : [])
      .map(v => String(v.translation || '').trim()).filter(v => v && v !== text).slice(0, 3);
    return { translation: text, alternatives: [...new Set(alternatives)], source: 'MyMemory (en → zh-TW)' };
  }
  async function getDefinition(term) {
    if (!isSimpleWord(term)) return null;
    let data;
    try { data = await request(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`); }
    catch (e) { if (String(e.message).includes('404')) return null; throw e; }
    if (!Array.isArray(data)) return null;
    const entry = data[0];
    if (!entry || !Array.isArray(entry.meanings)) return null;
    const meanings = entry.meanings.flatMap(m => (m.definitions || []).map(d => ({ pos: m.partOfSpeech || '', definition: d.definition || '', example: d.example || '', synonyms: d.synonyms || [] })));
    const first = meanings[0] || {};
    const audioEntry = (entry.phonetics || []).find(p => p.audio && (p.audio.includes('uk') || p.audio.includes('_gb'))) || (entry.phonetics || []).find(p => p.audio);
    const audio = audioEntry?.audio || '';
    return {
      pos: first.pos || '', definition: first.definition || '', example: first.example || '',
      ipa: entry.phonetic || (entry.phonetics || []).find(p => p.text)?.text || '',
      audio: audio.startsWith('//') ? 'https:' + audio : (audio.startsWith('https://') ? audio : ''),
      synonyms: [...new Set([...first.synonyms, ...(entry.meanings[0]?.synonyms || [])])].slice(0, 7),
      alternativeDefinitions: meanings.slice(1, 4), source: 'Free Dictionary API'
    };
  }
  async function checkGrammar(text) {
    if (text.length > 18000) throw new Error('Use 18,000 characters or fewer for the public grammar checker.');
    const params = new URLSearchParams({ text, language: 'en-GB', enabledOnly: 'false' });
    const data = await request('https://api.languagetool.org/v2/check', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params
    }, 18000);
    if (!Array.isArray(data.matches)) throw new Error('The grammar service returned an invalid response.');
    return data.matches.map((m, index) => ({
      id: `s${index}`, offset: m.offset, length: m.length,
      message: m.message || 'Possible issue', shortMessage: m.shortMessage || '',
      replacements: (m.replacements || []).slice(0, 5).map(v => v.value),
      category: m.rule?.category?.name || 'Grammar', issueType: m.rule?.issueType || '',
      ruleId: m.rule?.id || '', status: 'pending', selectedReplacement: 0
    })).filter(s => Number.isInteger(s.offset) && Number.isInteger(s.length) && s.offset >= 0 && s.length >= 0 && s.offset + s.length <= text.length);
  }
  root.FieldnotesProviders = { getTranslation, getDefinition, checkGrammar };
})(window);
