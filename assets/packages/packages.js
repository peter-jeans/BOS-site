(() => {
'use strict';
const tiers=['Standard','Plus','Pro','Enterprise'], stages=['Under development','Beta','Mature'];
const list=document.querySelector('#packages'), status=document.querySelector('#feed-status');
const tier=document.querySelector('#tier-filter'), kind=document.querySelector('#kind-filter'), search=document.querySelector('#package-search'), refreshButton=document.querySelector('#refresh');
// The complete static explanation remains the fallback if its optional update fails.
let metadata=new Map([...list.children].map(card=>[card.dataset.id,{
 id:card.dataset.id,kind:card.dataset.kind,plain_name:card.querySelector('h2').textContent,
 where:card.querySelector('.capability-location').textContent.replace(/^Where it belongs:\s*/,''),
 request:card.querySelector('.capability-request').textContent,
 expect:card.querySelector('.capability-result').textContent.replace(/^Expect:\s*/,''),
 limits:card.querySelector('.capability-limit').textContent,
 installation_note:card.querySelector('.capability-installation').textContent,
 keywords:card.dataset.keywords||''
}])), pending=false, renderedRevision=null;
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==null)n.textContent=text;if(cls)n.className=cls;return n;};
const normalise=value=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function filter(){
 const words=normalise(search.value).split(/\s+/).filter(Boolean);let count=0;
 for(const card of list.children){
  const g=metadata.get(card.dataset.id), haystack=normalise(card.textContent+' '+(g?.keywords||''));
  const tierMatch=tier.value==='all'||tiers.indexOf(card.dataset.tier)<=tiers.indexOf(tier.value);
  const kindMatch=kind.value==='all'||card.dataset.kind===kind.value;
  card.hidden=!(tierMatch&&kindMatch&&words.every(word=>haystack.includes(word)));if(!card.hidden)count++;
 }
 document.querySelector('#result-count').textContent=count+' of '+list.children.length+' topics'+(tier.value==='all'?'':' within the '+tier.value+' catalogue filter');
 document.querySelector('#no-results').hidden=count>0;
}
function validateCatalogue(data){
 if(data.schema!=='BOS_PUBLIC_INSTALL_PACKAGES_V1'||!Number.isFinite(Date.parse(data.published_at))||!Array.isArray(data.packages)||!data.packages.length||data.packages.length>100||new Set(data.packages.map(p=>p.id)).size!==data.packages.length)throw Error('Invalid catalogue');
 for(const p of data.packages)if(!stages.includes(p.maturity)||!tiers.includes(p.minimum_tier)||!['id','name','description','tier_label','maturity_reason','availability'].every(k=>typeof p[k]==='string'&&p[k].length<5000)||!Array.isArray(p.features)||!p.features.every(x=>typeof x==='string'))throw Error('Invalid package');
 return data;
}
function validateGuide(data){
 if(data.schema!=='BOS_PUBLIC_CAPABILITY_GUIDE_V1'||!Array.isArray(data.topics)||data.topics.length>100||new Set(data.topics.map(g=>g.id)).size!==data.topics.length)throw Error('Invalid guide');
 const fields=['id','kind','plain_name','where','request','expect','limits','keywords','installation_note'];
 for(const g of data.topics)if(!fields.every(k=>typeof g[k]==='string'&&g[k].length<5000)||!['build-review','project-workflow','app-feature'].includes(g.kind))throw Error('Invalid guide item');
 return data;
}
function render(p,evidenceDate){
 const g=metadata.get(p.id), card=node('article',null,'package-card');
 Object.assign(card.dataset,{id:p.id,tier:p.minimum_tier,maturity:p.maturity,kind:g?.kind||'unclassified',availability:p.availability,keywords:g?.keywords||''});
 card.append(node('p',(g?.kind||'Capability topic').replaceAll('-',' '),'capability-kind'),node('h2',g?.plain_name||p.name),node('p',p.description,'description'));
 const availability=node('p',null,'availability');availability.append(node('strong','Current availability: '),document.createTextNode(p.availability));card.append(availability,node('p',g?.limits||p.maturity_reason,'capability-limit'));
 const where=node('p',null,'capability-location');where.append(node('strong','Where it belongs: '),document.createTextNode(g?.where||'The selected project. Ask BOS to check its supported scope first.'));card.append(where);
 const use=node('details',null,'capability-use');use.append(node('summary','How to ask and what to expect'),node('p','After BOS has checked this project’s connection and approved setup, ask your coding tool:'),node('blockquote',g?.request||'Check whether BOS supports this topic in this exact project before proposing changes.','capability-request'));
 const expect=node('p',null,'capability-result');expect.append(node('strong','Expect: '),document.createTextNode(g?.expect||'A capability and readiness check, including unavailable steps.'));
 const setup=node('a','Check setup availability for your tool');setup.href='setup.html';use.append(expect,node('p',g?.installation_note||'This catalogue entry does not itself install anything.','capability-installation'),setup);
 card.append(use,node('p','Minimum tier: '+p.minimum_tier,'tier-badge'));
 const detail=node('details',null,'capability-evidence');detail.append(node('summary','Package evidence and technical coverage'));
 const original=node('p',null);original.append(node('strong','Original catalogue name: '),document.createTextNode(p.name));
 const maturity=node('p',null);maturity.append(node('strong','Package maturity: '),document.createTextNode(p.maturity+'. '+p.maturity_reason));
 const features=node('ul',null);p.features.forEach(x=>features.append(node('li',x)));
 detail.append(original,maturity,node('p','Evidence catalogue date: '+(typeof evidenceDate==='string'?evidenceDate.slice(0,10):'Not recorded')+'. This is not a fresh verification of your app or every feature.'),features);card.append(detail);return card;
}
async function refresh(){
 if(pending)return;pending=true;refreshButton.disabled=true;
 try{
  const responses=await Promise.allSettled(['data/install-packages.json','data/capability-guide.json'].map(url=>fetch(url,{cache:'no-store',signal:AbortSignal.timeout(10000)}).then(r=>{if(!r.ok)throw Error('Unavailable');return r.json();})));
  if(responses[0].status!=='fulfilled')throw Error('Catalogue unavailable');
  const data=validateCatalogue(responses[0].value);let guideNotice='';
  if(responses[1].status==='fulfilled'){try{const guide=validateGuide(responses[1].value);metadata=new Map(guide.topics.map(g=>[g.id,g]));}catch{guideNotice=' Explanation updates could not be checked.';}}
  else guideNotice=' Explanation updates could not be checked.';
  const revision=JSON.stringify([data.packages,[...metadata.values()]]);
  // Identical publication checks preserve focus and open details.
  if(revision!==renderedRevision){
   const open=new Set([...list.querySelectorAll('details[open]')].map(d=>d.closest('[data-id]').dataset.id+':'+d.className));
   const fragment=document.createDocumentFragment();data.packages.forEach(p=>{const card=render(p,data.maturity_evidence_at);card.querySelectorAll('details').forEach(d=>{d.open=open.has(p.id+':'+d.className);});fragment.append(card);});list.replaceChildren(fragment);
  }
  renderedRevision=revision;filter();
  const date=v=>Number.isFinite(Date.parse(v))?new Date(v).toLocaleDateString():'Not recorded';
  status.textContent='Published catalogue checked '+new Date().toLocaleTimeString()+'. Publication: '+date(data.published_at)+'. Package evidence catalogue: '+date(data.maturity_evidence_at)+'. This is not a live project check.'+guideNotice;
 }catch{status.textContent='Refresh unavailable. Keeping the last displayed catalogue; publication currentness could not be confirmed. This is not a live project check.';}
 finally{pending=false;refreshButton.disabled=false;}
}
tier.addEventListener('change',filter);kind.addEventListener('change',filter);search.addEventListener('input',filter);refreshButton.addEventListener('click',refresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});setInterval(()=>{if(!document.hidden)refresh();},60000);filter();refresh();
})();
