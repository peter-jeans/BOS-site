import React, { useEffect, useId, useRef, useState } from 'react';
import { readMemorySummary } from '../scripts/app-memory-summary.mjs';
import './BosMemoryCard.css';

const TABS = [
  { key: 'decisions', label: 'Decisions', hint: 'The choices shaping your app.', empty: 'No decision summaries saved yet.', detail: 'Saved decision summaries will appear here.' },
  { key: 'intentions', label: 'Build intentions', hint: 'What you’re working towards.', empty: 'No build intentions recorded yet.', detail: 'Your saved plans will appear here.' },
  { key: 'memory', label: 'Memory', hint: 'The context BOS keeps for this app.', empty: 'No project memory recorded yet.', detail: 'Saved project context will appear here.' },
];

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

// loadSummary must call the existing authenticated backend, returning parsed
// summary JSON. visible is presentation only; enforce role/project on the server.
export default function BosMemoryCard({ projectRef, visible = false, loadSummary, iconUrl = null }) {
  const id = useId();
  const [active, setActive] = useState('decisions');
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const buttons = useRef([]);

  useEffect(() => {
    if (!visible || !projectRef) { setResult(null); return; }
    let cancelled = false;
    const controller = new AbortController();
    setResult(null);
    Promise.resolve().then(() => loadSummary({ projectRef, signal: controller.signal }))
      .then(value => readMemorySummary(value, projectRef))
      .then(data => { if (!cancelled) setResult({ projectRef, loader: loadSummary, attempt, data }); })
      .catch(() => { if (!cancelled) setResult({ projectRef, loader: loadSummary, attempt, error: true }); });
    return () => { cancelled = true; controller.abort(); };
  }, [visible, projectRef, loadSummary, attempt]);

  if (!visible) return null;
  // Clear immediately on project/session/loader change, before effects run.
  const current = result?.projectRef === projectRef && result.loader === loadSummary && result.attempt === attempt ? result : null;
  const tab = TABS.find(value => value.key === active);
  const section = current?.data?.tabs[active];
  const unavailable = current?.error || section?.status === 'unavailable';
  const loading = !current;

  function onKeyDown(event, index) {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    if (event.key === 'ArrowLeft') next = (index + TABS.length - 1) % TABS.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = TABS.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    setActive(TABS[next].key);
    buttons.current[next]?.focus();
  }

  return (
    <section className="bos-memory" aria-labelledby={`${id}-title`}>
      <header className="bos-memory__header">
        <div className="bos-memory__brand">{iconUrl && <img src={iconUrl} alt="BOS" width="44" height="44" referrerPolicy="no-referrer" />}<div><p className="bos-memory__eyebrow">BOS · YOUR APP</p><h2 id={`${id}-title`}>Your project, remembered</h2></div></div>
        <span className="bos-memory__readonly">Read only</span>
      </header>
      <div className="bos-memory__tabs" role="tablist" aria-label="Project memory">
        {TABS.map((value, index) => (
          <button key={value.key} ref={node => { buttons.current[index] = node; }} type="button"
            role="tab" id={`${id}-tab-${value.key}`} aria-controls={`${id}-panel-${value.key}`}
            aria-selected={active === value.key} tabIndex={active === value.key ? 0 : -1}
            onKeyDown={event => onKeyDown(event, index)} onClick={() => setActive(value.key)}>
            {value.label}
          </button>
        ))}
      </div>
      {TABS.filter(value => value.key !== active).map(value => <div hidden key={value.key} role="tabpanel"
        id={`${id}-panel-${value.key}`} aria-labelledby={`${id}-tab-${value.key}`} />)}
      <div key={`${projectRef}-${active}`} className="bos-memory__body" role="tabpanel" tabIndex={0}
        id={`${id}-panel-${active}`} aria-labelledby={`${id}-tab-${active}`} aria-busy={loading}>
        <p className="bos-memory__hint">{tab.hint}</p>
        {loading ? <p className="bos-memory__notice" role="status">Loading your saved summaries…</p>
          : unavailable ? <div className="bos-memory__notice" role="status"><h3>Summaries aren’t available right now.</h3><p>Try again to load your saved records.</p></div>
          : section.items.length === 0 ? <div className="bos-memory__notice"><h3>{tab.empty}</h3><p>{tab.detail}</p></div>
          : <ol className="bos-memory__list">{section.items.map((entry, index) => (
            <li key={`${entry.source}-${index}`}>
              <div className="bos-memory__item-heading"><h3>{entry.title}</h3>
                {entry.recorded_at && <time dateTime={entry.recorded_at}>{formatDate(entry.recorded_at)}</time>}
              </div>
              <p>{entry.summary}</p>
              {entry.outcome && <p className="bos-memory__outcome">{entry.outcome}</p>}
            </li>
          ))}</ol>}
        {section && section.total > section.items.length && <p className="bos-memory__hint">Showing the latest {section.items.length} of {section.total} saved summaries.</p>}
      </div>
      <footer className="bos-memory__footer">
        <span>{current?.data ? <>Records saved <time dateTime={current.data.captured_at}>{formatDate(current.data.captured_at)}</time></> : 'From your app’s saved records'}</span>
        <button type="button" disabled={loading} onClick={() => setAttempt(value => value + 1)} aria-label="Refresh project memory">Refresh</button>
      </footer>
    </section>
  );
}
