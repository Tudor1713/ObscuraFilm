// SpektraLab prints of a roll's frames, from the darkroom in the main process (lab.js). A print is the
// photo through SpektraLab's own engine with the roll's film: grain, halation and all. `which` is the size:
// 's' for the strip, 'l' for the lightbox, 'p' for the film picker. Resolves to a URL, or null when there
// is no print to be had (no film, no engine), in which case the LUT stays.
const api = window.anhe?.lab;
const done = new Map();   // key -> Promise<url|null>

export function printOf(p, film, which, { prio = 0, group = '' } = {}) {
  if (!api || !p || film === 'none') return Promise.resolve(null);
  const key = `${p.id}~${film}~${which}`;
  if (!done.has(key)) {
    const req = { key, photo: p.id, demo: p.demo || null, which, stock: film, prio, group };
    const ask = async () => {
      let r = await api.print(req);
      if (r?.need === 'src') {
        const blob = which === 'l' ? p.full : p.thumb;
        if (!blob) return null;
        await api.src(p.id, which, await blob.arrayBuffer());
        r = await api.print(req);
      }
      return r?.url || null;
    };
    const job = ask().catch(() => null);
    done.set(key, job);
    // a print that did not happen (dropped, failed) can be asked for again later
    job.then(url => { if (!url && done.get(key) === job) done.delete(key); });
  } else if (prio > 0) {
    api.print({ key, photo: p.id, demo: p.demo || null, which, stock: film, prio, group }).catch(() => {});
  }
  return done.get(key);
}

// waiting strip prints of a film the roll no longer uses are not printed
export function dropPrints(group) { api?.drop(group); }

// a deleted photo's copies and prints
export function forgetPrints(id) {
  api?.forget(id);
  for (const k of [...done.keys()]) if (k.startsWith(id + '~')) done.delete(k);
}
