const loginScreen = document.getElementById('loginScreen');
const adminShell = document.getElementById('adminShell');

// ============ Utilitaires ============
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
}
function formatDate(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatDateTime(iso) {
  return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}

// ============ Auth ============
async function checkSession() {
  try {
    await api('/api/admin/me');
    showDashboard();
  } catch (e) {
    showLogin();
  }
}
function showLogin() {
  loginScreen.style.display = 'flex';
  adminShell.classList.remove('show');
}
function showDashboard() {
  loginScreen.style.display = 'none';
  adminShell.classList.add('show');
  loadEverything();
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const err = document.getElementById('loginError');
  err.classList.remove('show');
  btn.disabled = true;
  btn.textContent = 'Connexion…';
  try {
    await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('lUser').value,
        password: document.getElementById('lPass').value
      })
    });
    document.getElementById('loginForm').reset();
    showDashboard();
  } catch (e) {
    err.textContent = '✕ ' + e.message;
    err.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Se connecter';
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' });
  showLogin();
});

// ============ Navigation entre panneaux ============
document.querySelectorAll('.side-nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.side-nav button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById('panel-' + btn.dataset.panel).classList.add('active');
  });
});

// ============ Chargement des données ============
async function loadEverything() {
  await Promise.all([loadStats(), loadMesses(), loadDons(), loadArticles(), loadGroupes(), loadSiteSettings(), loadHeroPhotosAdmin(), loadGaleriePhotosAdmin()]);
}

async function loadStats() {
  const s = await api('/api/admin/stats');
  document.getElementById('badgeMesses').textContent = s.messesEnAttente;
  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card"><div class="label">Dons totaux</div><div class="value">${formatFcfa(s.totalDons)}</div><div class="sub">${s.nombreDons} contribution(s)</div></div>
    <div class="stat-card"><div class="label">Dons ce mois-ci</div><div class="value">${formatFcfa(s.donsCeMois)}</div><div class="sub">Depuis le 1er du mois</div></div>
    <div class="stat-card"><div class="label">Demandes en attente</div><div class="value">${s.messesEnAttente}</div><div class="sub">sur ${s.totalMesses} au total</div></div>
    <div class="stat-card"><div class="label">Articles publiés</div><div class="value">${s.articlesPublies}</div><div class="sub">sur ${s.totalArticles} au total</div></div>
    <div class="stat-card"><div class="label">Groupes actifs</div><div class="value">${s.groupesActifs}</div><div class="sub">sur ${s.totalGroupes} au total</div></div>
  `;
}

function formatFcfa(n) {
  return Number(n || 0).toLocaleString('fr-FR') + ' FCFA';
}

const statusLabels = { en_attente: 'En attente', confirmee: 'Confirmée', refusee: 'Refusée' };

async function loadMesses() {
  const messes = await api('/api/admin/messes');
  const tbody = document.getElementById('messesTable');
  if (!messes.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-row">Aucune demande de messe pour le moment.</td></tr>`;
  } else {
    tbody.innerHTML = messes.map(m => `
      <tr>
        <td><div class="cell-name">${escapeHtml(m.nom)}</div><div class="cell-email">${escapeHtml(m.email)}</div></td>
        <td>${escapeHtml(m.type)}<div class="cell-note">${escapeHtml(m.note || '—')}</div></td>
        <td>${formatDate(m.date)}</td>
        <td>${formatDateTime(m.createdAt)}</td>
        <td>
          <select class="status-select ${m.status}" data-id="${m.id}">
            <option value="en_attente" ${m.status === 'en_attente' ? 'selected' : ''}>En attente</option>
            <option value="confirmee" ${m.status === 'confirmee' ? 'selected' : ''}>Confirmée</option>
            <option value="refusee" ${m.status === 'refusee' ? 'selected' : ''}>Refusée</option>
          </select>
        </td>
        <td><button class="icon-btn" data-del-messe="${m.id}">Supprimer</button></td>
      </tr>
    `).join('');
  }

  // Vue d'ensemble : 5 dernières
  const overview = document.getElementById('overviewMesses');
  const recent = messes.slice(0, 5);
  overview.innerHTML = recent.length ? recent.map(m => `
    <tr>
      <td class="cell-name">${escapeHtml(m.nom)}</td>
      <td>${escapeHtml(m.type)}</td>
      <td>${formatDate(m.date)}</td>
      <td><span class="status-select ${m.status}" style="pointer-events:none; display:inline-block;">${statusLabels[m.status]}</span></td>
    </tr>
  `).join('') : `<tr><td colspan="4" class="empty-row">Aucune demande pour le moment.</td></tr>`;

  tbody.querySelectorAll('.status-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      try {
        await api(`/api/admin/messes/${sel.dataset.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: sel.value })
        });
        sel.className = 'status-select ' + sel.value;
        toast('Statut mis à jour');
        loadStats();
      } catch (e) {
        toast('Erreur : ' + e.message);
      }
    });
  });
  tbody.querySelectorAll('[data-del-messe]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer cette demande de messe ?')) return;
      await api(`/api/admin/messes/${btn.dataset.delMesse}`, { method: 'DELETE' });
      toast('Demande supprimée');
      loadMesses(); loadStats();
    });
  });
}

const freqLabels = { monthly: 'Mensuel', construction: 'Construction', once: 'Ponctuel' };
async function loadDons() {
  const dons = await api('/api/admin/dons');
  const tbody = document.getElementById('donsTable');
  if (!dons.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-row">Aucun don enregistré pour le moment.</td></tr>`;
    return;
  }
  tbody.innerHTML = dons.map(d => `
    <tr>
      <td><div class="cell-name">${escapeHtml(d.nom)}</div><div class="cell-email">${escapeHtml(d.email)}</div></td>
      <td><b>${formatFcfa(d.montant)}</b></td>
      <td>${freqLabels[d.frequence] || 'Ponctuel'}</td>
      <td>${formatDateTime(d.createdAt)}</td>
      <td><button class="icon-btn" data-del-don="${d.id}">Supprimer</button></td>
    </tr>
  `).join('');
  tbody.querySelectorAll('[data-del-don]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer cet enregistrement de don ?')) return;
      await api(`/api/admin/dons/${btn.dataset.delDon}`, { method: 'DELETE' });
      toast('Don supprimé');
      loadDons(); loadStats();
    });
  });
}

// ============ Articles ============
let editingColor = 'wine';

async function loadArticles() {
  const articles = await api('/api/admin/articles');
  const list = document.getElementById('articlesList');
  if (!articles.length) {
    list.innerHTML = `<p class="empty-note">Aucun article. Créez-en un avec le bouton ci-dessus.</p>`;
    return;
  }
  list.innerHTML = articles.map(a => `
    <div class="article-admin-item">
      <div class="swatch ${a.couleur}"></div>
      <div class="info">
        <h4>${escapeHtml(a.titre)}</h4>
        <div class="meta">${escapeHtml(a.tag)} · ${escapeHtml(a.auteur)} · ${formatDate(a.createdAt)}
          <span class="pill ${a.publie ? 'pub' : 'draft'}" style="margin-left:8px;">${a.publie ? 'Publié' : 'Brouillon'}</span>
        </div>
      </div>
      <div class="actions">
        <button class="icon-btn" data-edit="${a.id}">Modifier</button>
        <button class="icon-btn" data-del-art="${a.id}">Supprimer</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const article = articles.find(a => a.id === btn.dataset.edit);
      openEditor(article);
    });
  });
  list.querySelectorAll('[data-del-art]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer cet article ?')) return;
      await api(`/api/admin/articles/${btn.dataset.delArt}`, { method: 'DELETE' });
      toast('Article supprimé');
      loadArticles(); loadStats();
    });
  });
}

const editor = document.getElementById('articleEditor');
function openEditor(article) {
  document.getElementById('editorTitle').textContent = article ? 'Modifier l\'article' : 'Nouvel article';
  document.getElementById('artId').value = article ? article.id : '';
  document.getElementById('artTitre').value = article ? article.titre : '';
  document.getElementById('artTag').value = article ? article.tag : '';
  document.getElementById('artExtrait').value = article ? article.extrait : '';
  document.getElementById('artContenu').value = article ? article.contenu : '';
  document.getElementById('artAuteur').value = article ? article.auteur : '';
  document.getElementById('artPublie').checked = article ? article.publie : true;
  editingColor = article ? article.couleur : 'wine';
  document.querySelectorAll('#articleEditor .color-swatch').forEach(s => s.classList.toggle('active', s.dataset.c === editingColor));
  editor.classList.add('show');
  editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
document.getElementById('newArticleBtn').addEventListener('click', () => openEditor(null));
document.getElementById('cancelArticleBtn').addEventListener('click', () => editor.classList.remove('show'));
document.querySelectorAll('#articleEditor .color-swatch').forEach(sw => {
  sw.addEventListener('click', () => {
    editingColor = sw.dataset.c;
    document.querySelectorAll('#articleEditor .color-swatch').forEach(s => s.classList.remove('active'));
    sw.classList.add('active');
  });
});

document.getElementById('saveArticleBtn').addEventListener('click', async () => {
  const id = document.getElementById('artId').value;
  const payload = {
    titre: document.getElementById('artTitre').value,
    tag: document.getElementById('artTag').value,
    extrait: document.getElementById('artExtrait').value,
    contenu: document.getElementById('artContenu').value,
    auteur: document.getElementById('artAuteur').value,
    couleur: editingColor,
    publie: document.getElementById('artPublie').checked
  };
  if (!payload.titre || !payload.extrait) {
    toast('Le titre et l\'extrait sont obligatoires');
    return;
  }
  try {
    if (id) {
      await api(`/api/admin/articles/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      toast('Article mis à jour');
    } else {
      await api('/api/admin/articles', { method: 'POST', body: JSON.stringify(payload) });
      toast('Article publié');
    }
    editor.classList.remove('show');
    loadArticles(); loadStats();
  } catch (e) {
    toast('Erreur : ' + e.message);
  }
});

// ============ Groupes de service ============
let editingGroupeColor = 'wine';

async function loadGroupes() {
  const groupes = await api('/api/admin/groupes');
  const list = document.getElementById('groupesList');
  if (!groupes.length) {
    list.innerHTML = `<p class="empty-note">Aucun groupe. Créez-en un avec le bouton ci-dessus.</p>`;
    return;
  }
  list.innerHTML = groupes.map(g => `
    <div class="article-admin-item">
      <div class="swatch ${g.couleur}"></div>
      <div class="info">
        <h4>${escapeHtml(g.nom)}</h4>
        <div class="meta">${escapeHtml(g.responsable || 'Sans responsable indiqué')}${g.horaire ? ' · ' + escapeHtml(g.horaire) : ''}
          <span class="pill ${g.actif ? 'pub' : 'draft'}" style="margin-left:8px;">${g.actif ? 'Visible' : 'Masqué'}</span>
        </div>
      </div>
      <div class="actions">
        <button class="icon-btn" data-edit-grp="${g.id}">Modifier</button>
        <button class="icon-btn" data-del-grp="${g.id}">Supprimer</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-edit-grp]').forEach(btn => {
    btn.addEventListener('click', () => {
      const groupe = groupes.find(g => g.id === btn.dataset.editGrp);
      openGroupeEditor(groupe);
    });
  });
  list.querySelectorAll('[data-del-grp]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer ce groupe ?')) return;
      await api(`/api/admin/groupes/${btn.dataset.delGrp}`, { method: 'DELETE' });
      toast('Groupe supprimé');
      loadGroupes(); loadStats();
    });
  });
}

const groupeEditor = document.getElementById('groupeEditor');
function openGroupeEditor(groupe) {
  document.getElementById('groupeEditorTitle').textContent = groupe ? 'Modifier le groupe' : 'Nouveau groupe';
  document.getElementById('grpId').value = groupe ? groupe.id : '';
  document.getElementById('grpNom').value = groupe ? groupe.nom : '';
  document.getElementById('grpDescription').value = groupe ? groupe.description : '';
  document.getElementById('grpResponsable').value = groupe ? groupe.responsable : '';
  document.getElementById('grpHoraire').value = groupe ? groupe.horaire : '';
  document.getElementById('grpActif').checked = groupe ? groupe.actif : true;
  editingGroupeColor = groupe ? groupe.couleur : 'wine';
  document.querySelectorAll('#groupeColorPicker .color-swatch').forEach(s => s.classList.toggle('active', s.dataset.c === editingGroupeColor));
  groupeEditor.classList.add('show');
  groupeEditor.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
document.getElementById('newGroupeBtn').addEventListener('click', () => openGroupeEditor(null));
document.getElementById('cancelGroupeBtn').addEventListener('click', () => groupeEditor.classList.remove('show'));
document.querySelectorAll('#groupeColorPicker .color-swatch').forEach(sw => {
  sw.addEventListener('click', () => {
    editingGroupeColor = sw.dataset.c;
    document.querySelectorAll('#groupeColorPicker .color-swatch').forEach(s => s.classList.remove('active'));
    sw.classList.add('active');
  });
});

document.getElementById('saveGroupeBtn').addEventListener('click', async () => {
  const id = document.getElementById('grpId').value;
  const payload = {
    nom: document.getElementById('grpNom').value,
    description: document.getElementById('grpDescription').value,
    responsable: document.getElementById('grpResponsable').value,
    horaire: document.getElementById('grpHoraire').value,
    couleur: editingGroupeColor,
    actif: document.getElementById('grpActif').checked
  };
  if (!payload.nom || !payload.description) {
    toast('Le nom et la description sont obligatoires');
    return;
  }
  try {
    if (id) {
      await api(`/api/admin/groupes/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      toast('Groupe mis à jour');
    } else {
      await api('/api/admin/groupes', { method: 'POST', body: JSON.stringify(payload) });
      toast('Groupe ajouté');
    }
    groupeEditor.classList.remove('show');
    loadGroupes(); loadStats();
  } catch (e) {
    toast('Erreur : ' + e.message);
  }
});

// ============ Paramètres : mot de passe ============
document.getElementById('pwForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const confirmMsg = document.getElementById('pwConfirm');
  const errMsg = document.getElementById('pwError');
  confirmMsg.classList.remove('show');
  errMsg.classList.remove('show');
  try {
    await api('/api/admin/change-password', {
      method: 'POST',
      body: JSON.stringify({
        currentPassword: document.getElementById('pwCurrent').value,
        newPassword: document.getElementById('pwNew').value
      })
    });
    confirmMsg.classList.add('show');
    document.getElementById('pwForm').reset();
  } catch (e) {
    errMsg.textContent = '✕ ' + e.message;
    errMsg.classList.add('show');
  }
});

checkSession();

// ============ Informations du site ============
let statsData = [];
let horairesData = [];
let sacrementsData = [];
let currentLiturgie = 'bordeaux';

function renderLiturgiePicker() {
  document.querySelectorAll('.liturgie-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.l === currentLiturgie);
  });
}
document.querySelectorAll('.liturgie-option').forEach(opt => {
  opt.addEventListener('click', () => {
    currentLiturgie = opt.dataset.l;
    renderLiturgiePicker();
  });
});

async function loadSiteSettings() {
  const s = await api('/api/admin/settings');
  document.getElementById('sNom').value = s.nomParoisse || '';
  document.getElementById('sSousTitre').value = s.sousTitre || '';
  document.getElementById('sHeroTitre').value = s.heroTitre || '';
  document.getElementById('sHeroTitreAccent').value = s.heroTitreAccent || '';
  document.getElementById('sHeroTexte').value = s.heroTexte || '';

  document.getElementById('sCiergeMesse').value = (s.cierge && s.cierge.messeDimanche) || '';
  document.getElementById('sCiergeConfessions').value = (s.cierge && s.cierge.confessions) || '';
  document.getElementById('sCiergePermanence').value = (s.cierge && s.cierge.permanence) || '';

  document.getElementById('sAdresse').value = (s.contact && s.contact.adresse) || '';
  document.getElementById('sTelephone').value = (s.contact && s.contact.telephone) || '';
  document.getElementById('sEmail').value = (s.contact && s.contact.email) || '';
  document.getElementById('sParking').value = (s.contact && s.contact.parking) || '';

  document.getElementById('sFooterTagline').value = s.footerTagline || '';
  document.getElementById('sCopyright').value = s.copyright || '';

  currentLiturgie = (s.liturgie && s.liturgie.couleur) || 'bordeaux';
  document.getElementById('sLiturgieSaison').value = (s.liturgie && s.liturgie.saison) || '';
  renderLiturgiePicker();

  statsData = Array.isArray(s.stats) ? JSON.parse(JSON.stringify(s.stats)) : [];
  horairesData = Array.isArray(s.horaires) ? JSON.parse(JSON.stringify(s.horaires)) : [];
  sacrementsData = Array.isArray(s.sacrements) ? [...s.sacrements] : [];

  donsMontantsData = (s.dons && Array.isArray(s.dons.montants)) ? [...s.dons.montants] : [];
  donsImpactsData = (s.dons && Array.isArray(s.dons.impacts)) ? [...s.dons.impacts] : [];
  document.getElementById('donMontantDefaut').value = (s.dons && s.dons.montantDefaut) || '';

  constructionTexteData = (s.construction && s.construction.texte) || '';
  document.getElementById('constructionTexte').value = constructionTexteData;
  constructionMontantsData = (s.construction && Array.isArray(s.construction.montants)) ? [...s.construction.montants] : [];
  constructionImpactsData = (s.construction && Array.isArray(s.construction.impacts)) ? [...s.construction.impacts] : [];
  document.getElementById('constructionMontantDefaut').value = (s.construction && s.construction.montantDefaut) || '';

  renderStats();
  renderHoraires();
  renderSacrements();
  renderDonsMontants();
  renderDonsImpacts();
  renderConstructionMontants();
  renderConstructionImpacts();
}

function renderStats() {
  const el = document.getElementById('statsList');
  el.innerHTML = statsData.map((st, i) => `
    <div class="repeat-row">
      <input class="repeat-num" data-stat-i="${i}" data-stat-f="chiffre" value="${escapeHtml(st.chiffre)}" placeholder="Ex : 12">
      <input data-stat-i="${i}" data-stat-f="label" value="${escapeHtml(st.label)}" placeholder="Ex : Groupes & mouvements">
      <button type="button" class="icon-btn" data-del-stat="${i}">Supprimer</button>
    </div>
  `).join('') || '<p class="empty-note">Aucun chiffre pour le moment.</p>';

  el.querySelectorAll('input[data-stat-i]').forEach(inp => {
    inp.addEventListener('input', () => {
      statsData[Number(inp.dataset.statI)][inp.dataset.statF] = inp.value;
    });
  });
  el.querySelectorAll('[data-del-stat]').forEach(btn => {
    btn.addEventListener('click', () => {
      statsData.splice(Number(btn.dataset.delStat), 1);
      renderStats();
    });
  });
}
document.getElementById('addStatBtn').addEventListener('click', () => {
  statsData.push({ chiffre: '', label: '' });
  renderStats();
});

function renderHoraires() {
  const el = document.getElementById('horairesList');
  el.innerHTML = horairesData.map((h, i) => `
    <div class="repeat-row">
      <input data-hor-i="${i}" data-hor-f="jour" value="${escapeHtml(h.jour)}" placeholder="Jour">
      <input data-hor-i="${i}" data-hor-f="detail" value="${escapeHtml(h.detail)}" placeholder="Détail">
      <input data-hor-i="${i}" data-hor-f="heure" value="${escapeHtml(h.heure)}" placeholder="Heure" style="max-width:140px;">
      <button type="button" class="icon-btn" data-del-hor="${i}">Supprimer</button>
    </div>
  `).join('') || '<p class="empty-note">Aucun horaire pour le moment.</p>';

  el.querySelectorAll('input[data-hor-i]').forEach(inp => {
    inp.addEventListener('input', () => {
      horairesData[Number(inp.dataset.horI)][inp.dataset.horF] = inp.value;
    });
  });
  el.querySelectorAll('[data-del-hor]').forEach(btn => {
    btn.addEventListener('click', () => {
      horairesData.splice(Number(btn.dataset.delHor), 1);
      renderHoraires();
    });
  });
}
document.getElementById('addHoraireBtn').addEventListener('click', () => {
  horairesData.push({ jour: '', detail: '', heure: '' });
  renderHoraires();
});

function renderSacrements() {
  const el = document.getElementById('sacrementsList');
  el.innerHTML = sacrementsData.map((s, i) => `
    <div class="repeat-row">
      <input data-sac-i="${i}" value="${escapeHtml(s)}" placeholder="Ex : Baptême">
      <button type="button" class="icon-btn" data-del-sac="${i}">Supprimer</button>
    </div>
  `).join('') || '<p class="empty-note">Aucun sacrement pour le moment.</p>';

  el.querySelectorAll('input[data-sac-i]').forEach(inp => {
    inp.addEventListener('input', () => {
      sacrementsData[Number(inp.dataset.sacI)] = inp.value;
    });
  });
  el.querySelectorAll('[data-del-sac]').forEach(btn => {
    btn.addEventListener('click', () => {
      sacrementsData.splice(Number(btn.dataset.delSac), 1);
      renderSacrements();
    });
  });
}
document.getElementById('addSacrementBtn').addEventListener('click', () => {
  sacrementsData.push('');
  renderSacrements();
});

// ---- Montants & impacts des dons ----
let donsMontantsData = [];
let donsImpactsData = [];
let constructionTexteData = '';
let constructionMontantsData = [];
let constructionImpactsData = [];

function renderDonsMontants() {
  const el = document.getElementById('donsMontantsList');
  el.innerHTML = donsMontantsData.map((val, i) => `
    <div class="repeat-row">
      <input type="number" min="0" step="1" data-dm-i="${i}" value="${val}" placeholder="Ex : 2500">
      <button type="button" class="icon-btn" data-del-dm="${i}">Supprimer</button>
    </div>
  `).join('') || `<p class="empty-note">Aucun montant pour le moment.</p>`;
  el.querySelectorAll('input[data-dm-i]').forEach(inp => {
    inp.addEventListener('input', () => { donsMontantsData[Number(inp.dataset.dmI)] = Number(inp.value) || 0; });
  });
  el.querySelectorAll('[data-del-dm]').forEach(btn => {
    btn.addEventListener('click', () => { donsMontantsData.splice(Number(btn.dataset.delDm), 1); renderDonsMontants(); });
  });
}
document.getElementById('addDonMontantBtn').addEventListener('click', () => { donsMontantsData.push(0); renderDonsMontants(); });

function renderDonsImpacts() {
  const el = document.getElementById('donsImpactsList');
  el.innerHTML = donsImpactsData.map((val, i) => `
    <div class="repeat-row">
      <input data-di-i="${i}" value="${escapeHtml(val)}" placeholder="Ex : 5 000 FCFA contribuent à...">
      <button type="button" class="icon-btn" data-del-di="${i}">Supprimer</button>
    </div>
  `).join('') || `<p class="empty-note">Aucun message pour le moment.</p>`;
  el.querySelectorAll('input[data-di-i]').forEach(inp => {
    inp.addEventListener('input', () => { donsImpactsData[Number(inp.dataset.diI)] = inp.value; });
  });
  el.querySelectorAll('[data-del-di]').forEach(btn => {
    btn.addEventListener('click', () => { donsImpactsData.splice(Number(btn.dataset.delDi), 1); renderDonsImpacts(); });
  });
}
document.getElementById('addDonImpactBtn').addEventListener('click', () => { donsImpactsData.push(''); renderDonsImpacts(); });

// ---- Construction de l'église ----
function renderConstructionMontants() {
  const el = document.getElementById('constructionMontantsList');
  el.innerHTML = constructionMontantsData.map((val, i) => `
    <div class="repeat-row">
      <input type="number" min="0" step="1" data-cm-i="${i}" value="${val}" placeholder="Ex : 10000">
      <button type="button" class="icon-btn" data-del-cm="${i}">Supprimer</button>
    </div>
  `).join('') || `<p class="empty-note">Aucun montant pour le moment.</p>`;
  el.querySelectorAll('input[data-cm-i]').forEach(inp => {
    inp.addEventListener('input', () => { constructionMontantsData[Number(inp.dataset.cmI)] = Number(inp.value) || 0; });
  });
  el.querySelectorAll('[data-del-cm]').forEach(btn => {
    btn.addEventListener('click', () => { constructionMontantsData.splice(Number(btn.dataset.delCm), 1); renderConstructionMontants(); });
  });
}
document.getElementById('addConstructionMontantBtn').addEventListener('click', () => { constructionMontantsData.push(0); renderConstructionMontants(); });

function renderConstructionImpacts() {
  const el = document.getElementById('constructionImpactsList');
  el.innerHTML = constructionImpactsData.map((val, i) => `
    <div class="repeat-row">
      <input data-ci-i="${i}" value="${escapeHtml(val)}" placeholder="Ex : 10 000 FCFA financent...">
      <button type="button" class="icon-btn" data-del-ci="${i}">Supprimer</button>
    </div>
  `).join('') || `<p class="empty-note">Aucun message pour le moment.</p>`;
  el.querySelectorAll('input[data-ci-i]').forEach(inp => {
    inp.addEventListener('input', () => { constructionImpactsData[Number(inp.dataset.ciI)] = inp.value; });
  });
  el.querySelectorAll('[data-del-ci]').forEach(btn => {
    btn.addEventListener('click', () => { constructionImpactsData.splice(Number(btn.dataset.delCi), 1); renderConstructionImpacts(); });
  });
}
document.getElementById('addConstructionImpactBtn').addEventListener('click', () => { constructionImpactsData.push(''); renderConstructionImpacts(); });

document.getElementById('saveSiteBtn').addEventListener('click', async () => {
  const confirmMsg = document.getElementById('siteConfirm');
  const errMsg = document.getElementById('siteError');
  confirmMsg.classList.remove('show');
  errMsg.classList.remove('show');

  const payload = {
    nomParoisse: document.getElementById('sNom').value,
    sousTitre: document.getElementById('sSousTitre').value,
    heroTitre: document.getElementById('sHeroTitre').value,
    heroTitreAccent: document.getElementById('sHeroTitreAccent').value,
    heroTexte: document.getElementById('sHeroTexte').value,
    stats: statsData.filter(s => s.chiffre.trim() || s.label.trim()),
    cierge: {
      messeDimanche: document.getElementById('sCiergeMesse').value,
      confessions: document.getElementById('sCiergeConfessions').value,
      permanence: document.getElementById('sCiergePermanence').value
    },
    horaires: horairesData.filter(h => h.jour.trim() || h.detail.trim() || h.heure.trim()),
    sacrements: sacrementsData.filter(s => s.trim()),
    dons: {
      montants: donsMontantsData.filter(n => n > 0),
      montantDefaut: Number(document.getElementById('donMontantDefaut').value) || 0,
      impacts: donsImpactsData.filter(s => s.trim())
    },
    construction: {
      texte: document.getElementById('constructionTexte').value,
      montants: constructionMontantsData.filter(n => n > 0),
      montantDefaut: Number(document.getElementById('constructionMontantDefaut').value) || 0,
      impacts: constructionImpactsData.filter(s => s.trim())
    },
    contact: {
      adresse: document.getElementById('sAdresse').value,
      telephone: document.getElementById('sTelephone').value,
      email: document.getElementById('sEmail').value,
      parking: document.getElementById('sParking').value
    },
    footerTagline: document.getElementById('sFooterTagline').value,
    copyright: document.getElementById('sCopyright').value,
    liturgie: {
      couleur: currentLiturgie,
      saison: document.getElementById('sLiturgieSaison').value
    }
  };

  try {
    await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(payload) });
    confirmMsg.classList.add('show');
    toast('Informations du site mises à jour');
  } catch (e) {
    errMsg.textContent = '✕ ' + e.message;
    errMsg.classList.add('show');
  }
});

// ============ Photos de fond (bandeau d'accueil) ============
async function loadHeroPhotosAdmin() {
  const grid = document.getElementById('heroPhotoGrid');
  const photos = await api('/api/hero-images');
  if (!photos.length) {
    grid.innerHTML = '<p class="empty-note">Aucune photo de fond pour le moment.</p>';
    return;
  }
  grid.innerHTML = photos.map(p => `
    <div class="photo-card">
      <img src="${p.url}" alt="Photo de fond">
      <button class="icon-btn" data-del-hero="${p.id}">Supprimer</button>
    </div>
  `).join('');
  grid.querySelectorAll('[data-del-hero]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer cette photo de fond ?')) return;
      await api(`/api/admin/hero-images/${btn.dataset.delHero}`, { method: 'DELETE' });
      toast('Photo supprimée');
      loadHeroPhotosAdmin();
    });
  });
}

document.getElementById('heroPhotoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById('heroPhotoFile');
  const btn = document.getElementById('heroPhotoBtn');
  const err = document.getElementById('heroPhotoError');
  err.classList.remove('show');
  if (!fileInput.files[0]) return;

  const formData = new FormData();
  formData.append('photo', fileInput.files[0]);

  btn.disabled = true;
  btn.textContent = 'Envoi…';
  try {
    const res = await fetch('/api/admin/hero-images', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Une erreur est survenue');
    document.getElementById('heroPhotoForm').reset();
    toast('Photo de fond ajoutée');
    loadHeroPhotosAdmin();
  } catch (e) {
    err.textContent = '✕ ' + e.message;
    err.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ajouter la photo';
  }
});

// ============ Photos des célébrations (galerie) ============
async function loadGaleriePhotosAdmin() {
  const grid = document.getElementById('galeriePhotoGrid');
  const photos = await api('/api/admin/galerie');
  if (!photos.length) {
    grid.innerHTML = '<p class="empty-note">Aucune photo de célébration pour le moment.</p>';
    return;
  }
  grid.innerHTML = photos.map(p => `
    <div class="photo-card">
      <img src="${p.url}" alt="${escapeHtml(p.legende || 'Photo de célébration')}">
      ${p.legende ? `<div class="cap">${escapeHtml(p.legende)}</div>` : ''}
      <button class="icon-btn" data-del-gal="${p.id}">Supprimer</button>
    </div>
  `).join('');
  grid.querySelectorAll('[data-del-gal]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer cette photo ?')) return;
      await api(`/api/admin/galerie/${btn.dataset.delGal}`, { method: 'DELETE' });
      toast('Photo supprimée');
      loadGaleriePhotosAdmin();
    });
  });
}

document.getElementById('galeriePhotoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById('galeriePhotoFile');
  const legende = document.getElementById('galeriePhotoLegende').value;
  const btn = document.getElementById('galeriePhotoBtn');
  const err = document.getElementById('galeriePhotoError');
  err.classList.remove('show');
  if (!fileInput.files[0]) return;

  const formData = new FormData();
  formData.append('photo', fileInput.files[0]);
  formData.append('legende', legende);

  btn.disabled = true;
  btn.textContent = 'Envoi…';
  try {
    const res = await fetch('/api/admin/galerie', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Une erreur est survenue');
    document.getElementById('galeriePhotoForm').reset();
    toast('Photo ajoutée à la galerie');
    loadGaleriePhotosAdmin();
  } catch (e) {
    err.textContent = '✕ ' + e.message;
    err.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ajouter la photo';
  }
});
