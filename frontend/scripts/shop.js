(function(){
  requireAuth();
  const me = localStorage.getItem("timely_username");
  const list = document.getElementById('shop-list');
  async function load(){
    const items = await api('/api/shop/items');
    list.innerHTML = '';
    for (const it of items){
      const card = document.createElement('div'); card.className='card';
      card.innerHTML = `<div class="row"><span class="chip">${it.category}</span><strong>${it.name}</strong></div>
        <div class="muted">${it.desc||''}</div>
        <div class="row"><span><strong>${it.price} TIMT</strong></span><button class="btn" data-buy="${it.id}">Compra</button></div>`;
      list.appendChild(card);
    }
    list.querySelectorAll('[data-buy]').forEach(btn => btn.addEventListener('click', async()=>{
      const id = btn.getAttribute('data-buy');
      const r = await api('/api/shop/buy', { method:'POST', body:{ userId: me, itemId: id } });
      if (r?.ok) alert('Acquistato!'); try{ const user = await api(`/api/users/${encodeURIComponent(me)}`); if(user && user.theme) applyTheme(user.theme);}catch(e){} try{ const me = await api(`/api/users/${encodeURIComponent(me)}`);}catch(e){} else alert(r?.error||'Errore');
    }));
  }
  load();
})();