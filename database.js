/* Fieldnotes storage adapter. Data stays in this browser's IndexedDB unless user exports it. */
(function (root) {
  'use strict';
  const DB_NAME = 'fieldnotes-english-companion';
  const VERSION = 1;
  let database;
  let mode = 'indexeddb';
  const FALLBACK_KEY = 'fieldnotes-english-companion-browser-only-v1';
  const stores = ['vocab', 'categories', 'history', 'settings'];
  // IndexedDB is preferred. For file:// browsers that block it, use localStorage
  // when supported, rather than silently discarding vocabulary on refresh.
  function useFallback(reason) {
    try {
      const probe = FALLBACK_KEY + ':probe';
      root.localStorage.setItem(probe, 'ok');
      root.localStorage.removeItem(probe);
      mode = 'localstorage';
      database = { kind: 'localstorage' };
      // Warn explicitly: file:// origins are implementation dependent.
      console.warn('IndexedDB unavailable; using browser localStorage fallback.', reason);
      return database;
    } catch (e) {
      throw new Error('Browser storage is blocked. IndexedDB: ' + String(reason?.message || reason || 'unavailable') + '; localStorage: ' + String(e.message));
    }
  }
  function open() {
    if (database) return Promise.resolve(database);
    if (!root.indexedDB) {
      try { return Promise.resolve(useFallback(new Error('IndexedDB unavailable'))); }
      catch (e) { return Promise.reject(e); }
    }
    return new Promise((resolve, reject) => {
      let req;
      try { req = root.indexedDB.open(DB_NAME, VERSION); }
      catch (e) { try { resolve(useFallback(e)); } catch (fallbackError) { reject(fallbackError); } return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of stores) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      };
      req.onsuccess = () => {
        database = req.result;
        database.onversionchange = () => { database.close(); database = null; };
        resolve(database);
      };
      req.onerror = () => {
        try { resolve(useFallback(req.error || new Error('Unable to open local database.'))); }
        catch (e) { reject(e); }
      };
      // Do not use the fallback if a database upgrade is blocked, to avoid
      // accidentally creating a separate, apparently empty data store.
      req.onblocked = () => reject(new Error('Database upgrade blocked. Close other tabs of this app.'));
    });
  }
  function readLocal() {
    const raw = root.localStorage.getItem(FALLBACK_KEY);
    if (!raw) return Object.fromEntries(stores.map(name => [name, []]));
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('Saved local data is invalid. Restore your JSON backup.');
    return Object.fromEntries(stores.map(name => [name, Array.isArray(parsed[name]) ? parsed[name] : []]));
  }
  function writeLocal(data) {
    try { root.localStorage.setItem(FALLBACK_KEY, JSON.stringify(data)); }
    catch (e) { throw new Error('Unable to save in this browser. Storage may be full or disabled: ' + e.message); }
  }
  async function localOperation(name, action, item) {
    const data = readLocal(), rows = data[name];
    if (!rows) throw new Error('Unknown storage collection.');
    if (action === 'getAll') return rows;
    if (action === 'get') return rows.find(r => r.id === item);
    if (action === 'put') {
      if (!item || typeof item.id !== 'string') throw new Error('Invalid saved item ID.');
      const index = rows.findIndex(r => r.id === item.id);
      if (index < 0) rows.push(item); else rows[index] = item;
      writeLocal(data); return item.id;
    }
    if (action === 'delete') { data[name] = rows.filter(r => r.id !== item); writeLocal(data); return; }
    if (action === 'clear') { data[name] = []; writeLocal(data); return; }
  }
  async function txn(name, transactionMode, operation) {
    const db = await open();
    if (mode === 'localstorage') throw new Error('Internal storage operation not supported.');
    return new Promise((resolve, reject) => {
      let value;
      const t = db.transaction(name, transactionMode);
      const request = operation(t.objectStore(name));
      if (request) {
        request.onsuccess = () => { value = request.result; };
      }
      t.oncomplete = () => resolve(value);
      t.onerror = () => reject(t.error || (request && request.error) || new Error('Database transaction failed.'));
      t.onabort = () => reject(t.error || new Error('Database transaction was cancelled.'));
    });
  }
  async function route(name, action, item, transactionMode, operation) {
    await open();
    if (mode === 'localstorage') return localOperation(name, action, item);
    return txn(name, transactionMode, operation);
  }
  const getAll = (name) => route(name, 'getAll', null, 'readonly', s => s.getAll());
  const get = (name, id) => route(name, 'get', id, 'readonly', s => s.get(id));
  const put = (name, item) => route(name, 'put', item, 'readwrite', s => s.put(item));
  const del = (name, id) => route(name, 'delete', id, 'readwrite', s => s.delete(id));
  const clear = (name) => route(name, 'clear', null, 'readwrite', s => s.clear());
  async function batchMerge(data) {
    const db = await open();
    if (mode === 'localstorage') {
      const current = readLocal();
      for (const name of stores) for (const record of (data[name] || [])) {
        const index = current[name].findIndex(r => r.id === record.id);
        if (index < 0) current[name].push(record); else current[name][index] = record;
      }
      writeLocal(current);
      return;
    }
    const names = Object.keys(data).filter(n => stores.includes(n));
    if (!names.length) return;
    return new Promise((resolve, reject) => {
      const t = db.transaction(names, 'readwrite');
      for (const name of names) for (const record of (data[name] || [])) t.objectStore(name).put(record);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error || new Error('Import transaction failed.'));
      t.onabort = () => reject(t.error || new Error('Import transaction cancelled.'));
    });
  }
  async function replaceAll(data) {
    const db = await open();
    if (mode === 'localstorage') {
      writeLocal(Object.fromEntries(stores.map(name => [name, data[name] || []])));
      return;
    }
    return new Promise((resolve, reject) => {
      const t = db.transaction(stores, 'readwrite');
      for (const name of stores) {
        const store = t.objectStore(name);
        store.clear();
        for (const record of (data[name] || [])) store.put(record);
      }
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error || new Error('Restore transaction failed.'));
      t.onabort = () => reject(t.error || new Error('Restore cancelled.'));
    });
  }
  root.FieldnotesDB = { open, getAll, get, put, del, clear, replaceAll, batchMerge, VERSION, storageType: () => mode };
})(window);
