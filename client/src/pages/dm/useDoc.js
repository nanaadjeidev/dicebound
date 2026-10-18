import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';

/**
 * Loads one of the guest's documents and saves edits automatically, a moment after typing stops.
 * `status` is 'loading' | 'saved' | 'saving' | 'unsaved' | 'error'.
 */
export function useDoc(kind, id) {
  const [doc, setDoc] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const latest = useRef(null);
  const timer = useRef(null);
  const inFlight = useRef(Promise.resolve());

  useEffect(() => {
    let live = true;
    setStatus('loading');
    api(`/${kind}/${id}`).then((d) => {
      if (!live) return;
      latest.current = d;
      setDoc(d);
      setStatus('saved');
    }).catch((err) => live && (setError(err.message), setStatus('error')));
    return () => { live = false; };
  }, [kind, id]);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const body = latest.current;
    if (!body) return inFlight.current;
    setStatus('saving');
    inFlight.current = inFlight.current.then(() => api(`/${kind}/${id}`, { method: 'PUT', body }))
      .then(() => setStatus((s) => (s === 'saving' ? 'saved' : s)))
      .catch((err) => { setError(err.message); setStatus('error'); });
    return inFlight.current;
  }, [kind, id]);

  /** Apply a change: an object to merge, or a function of the current document. */
  const update = useCallback((change) => {
    setDoc((d) => {
      const next = typeof change === 'function' ? change(d) : { ...d, ...change };
      latest.current = next;
      return next;
    });
    setStatus('unsaved');
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  }, [flush]);

  // Don't lose the last keystrokes when leaving the page.
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); flush(); } }, [flush]);

  return { doc, update, status, error, flush };
}

export const newId = () => Math.random().toString(36).slice(2, 10);
