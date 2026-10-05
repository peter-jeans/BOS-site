(() => {
  const stages = ['Under development', 'Beta', 'Mature'];
  const tiers = ['Standard', 'Plus', 'Pro', 'Enterprise'];
  const list = document.querySelector('#packages');
  const status = document.querySelector('#feed-status');
  const tier = document.querySelector('#tier-filter');
  const search = document.querySelector('#package-search');
  const refreshButton = document.querySelector('#refresh');
  let pending = false;
  function filter() {
    let count = 0;
    for (const card of list.children) {
      const tierMatch = tier.value === 'all' || tiers.indexOf(card.dataset.tier) <= tiers.indexOf(tier.value);
      card.hidden = !(tierMatch && card.textContent.toLowerCase().includes(search.value.trim().toLowerCase()));
      if (!card.hidden) count++;
    }
    document.querySelector('#result-count').textContent = `${count} of ${list.children.length} packages${tier.value === 'all' ? '' : ` eligible by ${tier.value} profile — readiness still applies`}`;
    document.querySelector('#no-results').hidden = count > 0;
  }
  function el(tag, text, cls) {
    const node = document.createElement(tag);
    if (text !== null) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  }
  function render(pack) {
    const card = el('article', null, 'package-card');
    Object.assign(card.dataset, {id: pack.id, tier: pack.minimum_tier, maturity: pack.maturity});
    card.append(el('div', pack.tier_label, 'tier-badge'), el('h2', pack.name), el('p', pack.description, 'description'));
    const head = el('div', null, 'maturity-heading');
    head.append(el('span', 'Maturity'), el('strong', pack.maturity));
    const bar = el('div', null, 'maturity-bar');
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', `${pack.maturity}, stage ${stages.indexOf(pack.maturity) + 1} of 3`);
    stages.forEach((_, i) => bar.append(el('span', null, i <= stages.indexOf(pack.maturity) ? 'lit' : '')));
    const availability = el('p', null, 'availability');
    availability.append(el('strong', 'Availability: '), el('span', pack.availability));
    card.append(head, bar, el('p', pack.maturity_reason, 'maturity-reason'), availability);
    if (pack.id === 'governance') card.append(el('p', 'This optional package adds deeper project governance; Standard still retains basic saved decisions and continuity.', 'package-note'));
    const detail = el('details', null), ul = el('ul', null);
    pack.features.forEach(feature => ul.append(el('li', feature)));
    detail.append(el('summary', 'What it covers'), ul); card.append(detail);
    return card;
  }
  function validate(data) {
    if (data.schema !== 'BOS_PUBLIC_INSTALL_PACKAGES_V1' || !Number.isFinite(Date.parse(data.published_at)) ||
        !Array.isArray(data.packages) || !data.packages.length || data.packages.length > 100 ||
        new Set(data.packages.map(p => p.id)).size !== data.packages.length) throw Error('Invalid catalogue');
    for (const p of data.packages) {
      if (!stages.includes(p.maturity) || !tiers.includes(p.minimum_tier) ||
          !['id','name','description','tier_label','maturity_reason','availability'].every(k => typeof p[k] === 'string' && p[k].length < 5000) ||
          !Array.isArray(p.features) || !p.features.every(x => typeof x === 'string')) throw Error('Invalid package');
    }
    return data;
  }
  async function refresh() {
    if (pending) return;
    pending = true; refreshButton.disabled = true;
    try {
      const response = await fetch('data/install-packages.json', {cache: 'no-store', signal: AbortSignal.timeout(10000)});
      if (!response.ok) throw Error('Unavailable');
      const data = validate(await response.json());
      const expanded = new Set([...list.querySelectorAll('details[open]')].map(x => x.closest('[data-id]').dataset.id));
      const fragment = document.createDocumentFragment();
      data.packages.forEach(p => { const card = render(p); card.querySelector('details').open = expanded.has(p.id); fragment.append(card); });
      list.replaceChildren(fragment); filter();
      const date = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Not recorded';
      status.textContent = `Latest published catalogue checked ${new Date().toLocaleTimeString()}. Publication: ${date(data.published_at)}. Maturity evidence: ${date(data.maturity_evidence_at)}.`;
    } catch {
      status.textContent = 'Refresh unavailable. Keeping the last displayed catalogue; its currentness could not be confirmed. Try Refresh status again.';
    } finally { pending = false; refreshButton.disabled = false; }
  }
  tier.addEventListener('change', filter); search.addEventListener('input', filter);
  refreshButton.addEventListener('click', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  setInterval(() => { if (!document.hidden) refresh(); }, 60000);
  filter(); refresh();
})();
