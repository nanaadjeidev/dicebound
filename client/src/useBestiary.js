import { useEffect, useState } from 'react';
import { api } from './api.js';

let cache = null;
let pending = null;

/** The 334-entry SRD index, fetched once per session and shared by every page. */
export function useBestiary() {
  const [list, setList] = useState(cache);
  useEffect(() => {
    if (cache) return;
    pending ??= api('/bestiary').then((data) => (cache = data));
    pending.then(setList).catch(() => { pending = null; });
  }, []);
  return list;
}

let heroCache = null;
export function useHeroes() {
  const [list, setList] = useState(heroCache);
  useEffect(() => {
    if (heroCache) return;
    api('/heroes').then((data) => { heroCache = data; setList(data); }).catch(() => {});
  }, []);
  return list;
}
