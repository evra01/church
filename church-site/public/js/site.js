// ============ Paramètres généraux du site ============
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const s = await res.json();
    applySettings(s);
  } catch (err) {
    // Si l'API n'est pas disponible, on garde le contenu déjà présent dans la page.
  }
}

function applySettings(s) {
  // Marque (nav + footer)
  setText('navNom', s.nomParoisse);
  setText('navSousTitre', s.sousTitre);
  setText('footerNom', s.nomParoisse);
  setText('footerSousTitre', s.sousTitre);

  // Hero
  const heroTitreEl = document.getElementById('heroTitre');
  if (heroTitreEl && heroTitreEl.childNodes[0]) {
    heroTitreEl.childNodes[0].textContent = (s.heroTitre || '') + ' ';
  }
  setText('heroTitreAccent', s.heroTitreAccent);
  setText('heroTexte', s.heroTexte);

  if (Array.isArray(s.stats)) {
    const statsEl = document.getElementById('heroStats');
    statsEl.innerHTML = s.stats.map(st => `<div><b>${escapeHtml(st.chiffre)}</b><span>${escapeHtml(st.label)}</span></div>`).join('');
  }

  // Cierge du jour
  if (s.cierge) {
    setText('ciergeMesse', s.cierge.messeDimanche);
    setText('ciergeConfessions', s.cierge.confessions);
    setText('ciergePermanence', s.cierge.permanence);
  }

  // Horaires
  if (Array.isArray(s.horaires)) {
    const listEl = document.getElementById('scheduleList');
    listEl.innerHTML = s.horaires.map(h => `
      <div class="schedule-row"><div><div class="day">${escapeHtml(h.jour)}</div><div class="detail">${escapeHtml(h.detail)}</div></div><div class="time">${escapeHtml(h.heure)}</div></div>
    `).join('');
  }

  // Sacrements (carte d'action + pied de page)
  if (Array.isArray(s.sacrements)) {
    setText('acSacrements', s.sacrements.join(', '));
    const footerSac = document.getElementById('footerSacrements');
    footerSac.innerHTML = s.sacrements.map(x => `<li>${escapeHtml(x)}</li>`).join('');
  }

  // Contact / infos pratiques
  if (s.contact) {
    setText('infoAdresse', s.contact.adresse);
    setText('infoTelephone', s.contact.telephone);
    setText('infoEmail', s.contact.email);
    setText('infoParking', s.contact.parking);
    const footerContact = document.getElementById('footerContact');
    footerContact.innerHTML = `<li>${escapeHtml(s.contact.adresse)}</li><li>${escapeHtml(s.contact.telephone)}</li><li>${escapeHtml(s.contact.email)}</li>`;
  }

  // Pied de page
  setText('footerTagline', s.footerTagline);
  setText('footerCopyright', s.copyright);

  // Couleur liturgique
  if (s.liturgie) {
    if (s.liturgie.couleur && s.liturgie.couleur !== 'bordeaux') {
      document.body.dataset.liturgie = s.liturgie.couleur;
    } else {
      delete document.body.dataset.liturgie;
    }
    setText('liturgieBadgeText', s.liturgie.saison);
  }

  // Dons / cotisations (montants et messages configurables)
  if (typeof initDonsFromSettings === 'function') {
    initDonsFromSettings(s);
  }
}

function setText(id, value) {
  if (value === undefined || value === null) return;
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

loadSettings();

// ============ Demande de messe ============
const massForm = document.getElementById('massForm');
const massSubmitBtn = document.getElementById('massSubmitBtn');
const massConfirm = document.getElementById('massConfirm');
const massError = document.getElementById('massError');

massForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  massError.classList.remove('show');
  massConfirm.classList.remove('show');
  massSubmitBtn.disabled = true;
  massSubmitBtn.textContent = 'Envoi en cours…';

  const payload = {
    nom: document.getElementById('mNom').value,
    email: document.getElementById('mEmail').value,
    date: document.getElementById('mDate').value,
    type: document.getElementById('mType').value,
    note: document.getElementById('mNote').value
  };

  try {
    const res = await fetch('/api/messes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Une erreur est survenue");
    massConfirm.classList.add('show');
    massForm.reset();
  } catch (err) {
    massError.textContent = '✕ ' + err.message;
    massError.classList.add('show');
  } finally {
    massSubmitBtn.disabled = false;
    massSubmitBtn.textContent = 'Envoyer la demande';
  }
});

// ============ Dons / cotisation (montants et messages pilotés depuis l'admin) ============
const freqBtns = document.querySelectorAll('.freq-btn');
const donateBtn = document.getElementById('donateBtn');
const donConfirm = document.getElementById('donConfirm');
const donError = document.getElementById('donError');
const amountsGrid = document.getElementById('amountsGrid');
const donateSide = document.getElementById('donateSide');

let currentFreq = 'once';
let currentAmount = 0;
let donsSettingsData = { montants: [], montantDefaut: 0, impacts: [] };
let constructionSettingsData = { texte: '', montants: [], montantDefaut: 0, impacts: [] };

function formatFcfa(n) {
  return Number(n || 0).toLocaleString('fr-FR') + ' FCFA';
}
function getActiveDonSettings() {
  return currentFreq === 'construction' ? constructionSettingsData : donsSettingsData;
}

function renderAmounts() {
  const cfg = getActiveDonSettings();
  const montants = cfg.montants || [];
  if (!currentAmount || !montants.includes(currentAmount)) {
    currentAmount = (cfg.montantDefaut && montants.includes(cfg.montantDefaut)) ? cfg.montantDefaut : (montants[0] || 0);
  }
  amountsGrid.innerHTML = montants.map(m => `
    <button type="button" class="amt-btn${m === currentAmount ? ' active' : ''}" data-amt="${m}">${formatFcfa(m)}</button>
  `).join('') + `<button type="button" class="amt-btn" data-amt="other">Autre</button>`;

  amountsGrid.querySelectorAll('.amt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.amt === 'other') {
        const val = prompt('Montant personnalisé (FCFA) :', '');
        if (val && !isNaN(val) && Number(val) > 0) {
          currentAmount = Math.round(Number(val));
          amountsGrid.querySelectorAll('.amt-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        } else {
          return;
        }
      } else {
        currentAmount = Number(btn.dataset.amt);
        amountsGrid.querySelectorAll('.amt-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
      updateDonateLabel();
    });
  });
}

function renderDonateSide() {
  const cfg = getActiveDonSettings();
  const impacts = (cfg.impacts || []).map(txt => `<div class="impact-row"><div class="dot"></div><span>${escapeHtml(txt)}</span></div>`).join('');
  if (currentFreq === 'construction') {
    donateSide.innerHTML = `<p style="margin-bottom:20px; color:#5a4f48; font-size:14px;">${escapeHtml(cfg.texte || '')}</p>${impacts}`;
  } else {
    donateSide.innerHTML = `<div class="num">🙏</div><p style="margin-bottom:20px; color:#5a4f48; font-size:14px;">Merci pour votre générosité, elle fait vivre la paroisse.</p>${impacts}`;
  }
}

function updateFormLabels() {
  const titleEl = document.getElementById('donFormTitle');
  const subEl = document.getElementById('donFormSub');
  if (currentFreq === 'construction') {
    titleEl.textContent = 'Choisissez un montant pour la construction';
    subEl.textContent = "Chaque contribution rapproche la paroisse de son nouvel édifice";
  } else if (currentFreq === 'monthly') {
    titleEl.textContent = 'Choisissez le montant de votre cotisation';
    subEl.textContent = 'Tous les paiements sont sécurisés';
  } else {
    titleEl.textContent = 'Choisissez un montant';
    subEl.textContent = 'Tous les dons sont sécurisés';
  }
}

function updateDonateLabel() {
  const amountText = formatFcfa(currentAmount);
  if (currentFreq === 'monthly') donateBtn.textContent = `Cotiser ${amountText} / mois`;
  else if (currentFreq === 'construction') donateBtn.textContent = `Contribuer ${amountText} à la construction`;
  else donateBtn.textContent = `Faire un don de ${amountText}`;
}

function initDonsFromSettings(s) {
  donsSettingsData = (s && s.dons) || { montants: [], montantDefaut: 0, impacts: [] };
  constructionSettingsData = (s && s.construction) || { texte: '', montants: [], montantDefaut: 0, impacts: [] };
  currentAmount = 0;
  updateFormLabels();
  renderAmounts();
  renderDonateSide();
  updateDonateLabel();
}
// Rendu initial avec les valeurs par défaut, en attendant la réponse de /api/settings
initDonsFromSettings(null);

freqBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    freqBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFreq = btn.dataset.freq;
    currentAmount = 0;
    updateFormLabels();
    renderAmounts();
    renderDonateSide();
    updateDonateLabel();
  });
});

donateBtn.addEventListener('click', async () => {
  donError.classList.remove('show');
  donConfirm.classList.remove('show');
  const nom = document.getElementById('dNom').value;
  const email = document.getElementById('dEmail').value;
  if (!nom || !email) {
    donError.textContent = '✕ Merci de renseigner votre nom et e-mail.';
    donError.classList.add('show');
    return;
  }
  donateBtn.disabled = true;
  const originalLabel = donateBtn.textContent;
  donateBtn.textContent = 'Traitement…';

  try {
    const res = await fetch('/api/dons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom, email, montant: currentAmount, frequence: currentFreq })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Une erreur est survenue');
    donConfirm.classList.add('show');
    document.getElementById('dNom').value = '';
    document.getElementById('dEmail').value = '';
  } catch (err) {
    donError.textContent = '✕ ' + err.message;
    donError.classList.add('show');
  } finally {
    donateBtn.disabled = false;
    donateBtn.textContent = originalLabel;
  }
});

// ============ Articles ============
async function loadArticles() {
  const grid = document.getElementById('articlesGrid');
  try {
    const res = await fetch('/api/articles');
    const articles = await res.json();
    if (!articles.length) {
      grid.innerHTML = '<p class="empty-note">Aucun article publié pour le moment.</p>';
      return;
    }
    grid.innerHTML = articles.map(a => `
      <div class="article-card">
        <div class="article-thumb a-thumb-${a.couleur}">${escapeHtml(a.tag)}</div>
        <div class="article-body">
          <div class="article-tag">${escapeHtml(a.tag)}</div>
          <h4>${escapeHtml(a.titre)}</h4>
          <p>${escapeHtml(a.extrait)}</p>
          <div class="article-meta"><span>${escapeHtml(a.auteur)}</span><span>${formatDate(a.createdAt)}</span></div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    grid.innerHTML = '<p class="empty-note">Impossible de charger les articles pour le moment.</p>';
  }
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

loadArticles();

// ============ Groupes de service ============
async function loadGroupes() {
  const grid = document.getElementById('groupesGrid');
  if (!grid) return;
  try {
    const res = await fetch('/api/groupes');
    const groupes = await res.json();
    if (!groupes.length) {
      grid.innerHTML = '<p class="empty-note">Aucun groupe publié pour le moment.</p>';
      return;
    }
    grid.innerHTML = groupes.map(g => `
      <div class="groupe-card">
        <div class="groupe-bar groupe-${g.couleur}"></div>
        <div class="groupe-body">
          <h4>${escapeHtml(g.nom)}</h4>
          <p>${escapeHtml(g.description)}</p>
          <div class="groupe-meta">
            ${g.responsable ? `<span>${escapeHtml(g.responsable)}</span>` : ''}
            ${g.horaire ? `<span>${escapeHtml(g.horaire)}</span>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    grid.innerHTML = '<p class="empty-note">Impossible de charger les groupes pour le moment.</p>';
  }
}
loadGroupes();

// ============ Photos de fond (bandeau d'accueil) ============
async function loadHeroImages() {
  const heroBg = document.getElementById('heroBg');
  if (!heroBg) return;
  try {
    const res = await fetch('/api/hero-images');
    const images = await res.json();
    if (!images.length) return; // pas de photo : le fond dégradé habituel reste visible

    heroBg.innerHTML = images.map((img, i) => `<img src="${img.url}" alt="" class="${i === 0 ? 'active' : ''}">`).join('');

    if (images.length > 1) {
      const imgEls = heroBg.querySelectorAll('img');
      let current = 0;
      setInterval(() => {
        imgEls[current].classList.remove('active');
        current = (current + 1) % imgEls.length;
        imgEls[current].classList.add('active');
      }, 6000);
    }
  } catch (err) {
    // le fond dégradé habituel reste affiché si l'API échoue
  }
}
loadHeroImages();

// ============ Galerie des célébrations ============
async function loadGalerie() {
  const grid = document.getElementById('galerieGrid');
  if (!grid) return;
  try {
    const res = await fetch('/api/galerie');
    const photos = await res.json();
    if (!photos.length) {
      grid.innerHTML = '<p class="empty-note">Aucune photo pour le moment. Revenez bientôt !</p>';
      return;
    }
    grid.innerHTML = photos.map(p => `
      <div class="gallery-item" data-url="${p.url}" data-legende="${escapeHtml(p.legende)}">
        <img src="${p.url}" alt="${escapeHtml(p.legende || 'Photo de célébration')}" loading="lazy">
        ${p.legende ? `<div class="cap">${escapeHtml(p.legende)}</div>` : ''}
      </div>
    `).join('');

    grid.querySelectorAll('.gallery-item').forEach(item => {
      item.addEventListener('click', () => openLightbox(item.dataset.url, item.dataset.legende));
    });
  } catch (err) {
    grid.innerHTML = '<p class="empty-note">Impossible de charger les photos pour le moment.</p>';
  }
}
loadGalerie();

// ============ Visionneuse (lightbox) ============
const lightbox = document.getElementById('lightbox');
function openLightbox(url, legende) {
  if (!lightbox) return;
  document.getElementById('lightboxImg').src = url;
  document.getElementById('lightboxCaption').textContent = legende || '';
  lightbox.classList.add('show');
}
function closeLightbox() {
  if (!lightbox) return;
  lightbox.classList.remove('show');
  document.getElementById('lightboxImg').src = '';
}
if (lightbox) {
  document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });
}
