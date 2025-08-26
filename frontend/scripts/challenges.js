(function(){
  requireAuth();
  mountToastRoot();
  const me = localStorage.getItem("timely_username");
  const listEl = document.getElementById("ch-list");
  const detailEl = document.getElementById("ch-detail");

  async function load(){
    const list = await api('/api/challenges');
    listEl.innerHTML = '';
    for (const c of list){
      const item = document.createElement('div'); item.className='row';
      item.innerHTML = `<div><span class="chip">${c.type}</span> <strong>${c.title}</strong><br/><small>${new Date(c.startsAt).toLocaleString()} → ${new Date(c.endsAt).toLocaleString()}</small></div>
        <button class="btn" data-open="${c.id}">Apri</button>`;
      listEl.appendChild(item);
    }
    listEl.querySelectorAll('[data-open]').forEach(btn => btn.addEventListener('click', ()=> open(btn.getAttribute('data-open'))));
  }

  async function open(id){
    const c = await api(`/api/challenges/${id}`);
    let entries = '';
    if (c.entries && c.entries.length){
      entries = c.entries.map(e => `<div class="card"><strong>@${e.author}</strong><div>${e.content}</div><div class="row"><span class="muted">Voti: ${e.votes||0}</span><button class="chip" data-vote="${e.id}">Vota</button></div></div>`).join('');
    } else {
      entries = `<div class="muted">Nessuna entry</div>`;
    }
    detailEl.innerHTML = `<div class="flow">
      <h3>${c.title}</h3>
      <div class="muted">${c.description||''}</div>
      <div><small>Stato: ${c.status} — Voti usati: ${c.myVotes||0}/6</small></div>
      <div class="grid">${entries}</div>
      <hr/>
      <textarea id="entryText" rows="3" placeholder="La tua entry…"></textarea>
      <div class="row"><button class="btn" id="submitEntry">Invia</button></div>
    </div>`;
    detailEl.querySelectorAll('[data-vote]').forEach(btn => btn.addEventListener('click', async()=>{
      const entryId = btn.getAttribute('data-vote');
      const r = await api(`/api/challenges/${id}/vote`, { method:'POST', body:{ userId: me, entryId } });
      if (r?.ok) { showToast('success','Voto registrato'); open(id); } else { showToast('error', r?.error||'Errore'); }
    }));
    detailEl.querySelector('#submitEntry').addEventListener('click', async()=>{
      const content = (detailEl.querySelector('#entryText').value||'').trim(); if(!content) return;
      const r = await api(`/api/challenges/${id}/submit`, { method:'POST', body:{ userId: me, content } });
      if (r?.ok) { showToast('success','Entry inviata'); open(id); } else { showToast('error', r?.error||'Errore'); }
    });
  }

  load();
  setInterval(()=> api('/api/challenges/cron', { method:'POST' }), 15000);
})();
// Create challenge form
document.addEventListener('DOMContentLoaded', ()=>{
  const btn = document.getElementById('ch-create');
  if(!btn) return;
  btn.addEventListener('click', async()=>{
    const meUser = localStorage.getItem("timely_username") || 'demo';
    const title = document.getElementById('ch-title').value.trim();
    const type = document.getElementById('ch-type').value;
    const description = document.getElementById('ch-desc').value.trim();
    const startsAt = document.getElementById('ch-start').value ? new Date(document.getElementById('ch-start').value).toISOString() : new Date(Date.now()+60000).toISOString();
    const endsAt = document.getElementById('ch-end').value ? new Date(document.getElementById('ch-end').value).toISOString() : new Date(Date.now()+3600000).toISOString();
    const timtPrize = parseInt(document.getElementById('ch-prize').value||'10',10);
    const timeBonusMinutes = parseInt(document.getElementById('ch-bonus').value||'60',10);
    if(!title){ alert('Titolo richiesto'); return; }
    const r = await api('/api/challenges', { method:'POST', body:{ userId: meUser, title, type, description, startsAt, endsAt, timtPrize, timeBonusMinutes } });
    if(r?.ok){ alert('Challenge creata'); location.reload(); } else { alert(r?.error||'Errore'); }
  });
});
