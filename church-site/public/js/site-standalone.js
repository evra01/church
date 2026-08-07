// ============ Version autonome (sans serveur) ============
// Les formulaires ci-dessous affichent une confirmation visuelle mais
// n'enregistrent rien réellement : pour un enregistrement réel, utilisez
// la version reliée au serveur Node.js (voir le fichier README.md).

// ============ Demande de messe ============
const massForm = document.getElementById('massForm');
const massSubmitBtn = document.getElementById('massSubmitBtn');
const massConfirm = document.getElementById('massConfirm');

massForm.addEventListener('submit', (e) => {
  e.preventDefault();
  massSubmitBtn.disabled = true;
  massSubmitBtn.textContent = 'Envoi en cours…';
  setTimeout(() => {
    massConfirm.classList.add('show');
    massForm.reset();
    massSubmitBtn.disabled = false;
    massSubmitBtn.textContent = 'Envoyer la demande';
  }, 500);
});

// ============ Dons / cotisation (démo avec montants fixes en FCFA) ============
const freqBtns = document.querySelectorAll('.freq-btn');
const donateBtn = document.getElementById('donateBtn');
const donConfirm = document.getElementById('donConfirm');
const donError = document.getElementById('donError');
const amountsGrid = document.getElementById('amountsGrid');
const donateSide = document.getElementById('donateSide');

const demoDonsConfig = {
  once: { montants: [1000, 2500, 5000, 10000], montantDefaut: 2500,
    impacts: ["2 500 FCFA financent les fournitures liturgiques du mois", "5 000 FCFA contribuent à l'entretien du bâtiment", "10 000 FCFA soutiennent le repas paroissial mensuel"] },
  monthly: { montants: [1000, 2500, 5000, 10000], montantDefaut: 2500,
    impacts: ["2 500 FCFA financent les fournitures liturgiques du mois", "5 000 FCFA contribuent à l'entretien du bâtiment", "10 000 FCFA soutiennent le repas paroissial mensuel"] },
  construction: { texte: "Participez à la construction et à l'aménagement de la nouvelle église de la paroisse. Chaque contribution compte.",
    montants: [5000, 10000, 25000, 50000], montantDefaut: 10000,
    impacts: ["10 000 FCFA financent des sacs de ciment", "25 000 FCFA contribuent aux fers à béton", "50 000 FCFA soutiennent la main d'œuvre du chantier"] }
};

let currentFreq = 'once';
let currentAmount = 0;

function formatFcfa(n) {
  return Number(n || 0).toLocaleString('fr-FR') + ' FCFA';
}
function activeCfg() { return demoDonsConfig[currentFreq]; }

function renderAmounts() {
  const cfg = activeCfg();
  if (!currentAmount || !cfg.montants.includes(currentAmount)) currentAmount = cfg.montantDefaut;
  amountsGrid.innerHTML = cfg.montants.map(m => `
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
  const cfg = activeCfg();
  const impacts = cfg.impacts.map(txt => `<div class="impact-row"><div class="dot"></div><span>${txt}</span></div>`).join('');
  if (currentFreq === 'construction') {
    donateSide.innerHTML = `<p style="margin-bottom:20px; color:#5a4f48; font-size:14px;">${cfg.texte}</p>${impacts}`;
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

renderAmounts();
renderDonateSide();
updateFormLabels();
updateDonateLabel();

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

donateBtn.addEventListener('click', () => {
  donError.classList.remove('show');
  donConfirm.classList.remove('show');
  const nom = document.getElementById('dNom').value;
  const email = document.getElementById('dEmail').value;
  if (!nom || !email) {
    donError.textContent = '✕ Merci de renseigner votre nom et e-mail.';
    donError.classList.add('show');
    return;
  }
  donConfirm.classList.add('show');
  document.getElementById('dNom').value = '';
  document.getElementById('dEmail').value = '';
});

// ============ Articles (données de démonstration en dur) ============
const demoArticles = [
  {
    tag: 'Homélie', couleur: 'wine', auteur: 'Père Antoine', date: '20 juil. 2026',
    titre: "Marcher dans la lumière : réflexion sur l'Évangile",
    extrait: "Retour sur la lecture du dimanche et son écho dans notre vie quotidienne."
  },
  {
    tag: 'Communauté', couleur: 'sage', auteur: 'Équipe pastorale', date: '15 juil. 2026',
    titre: "Le groupe de jeunes lance sa collecte annuelle",
    extrait: "Découvrez les actions solidaires organisées par nos jeunes paroissiens ce mois-ci."
  },
  {
    tag: 'Formation', couleur: 'gold', auteur: 'Secrétariat', date: '8 juil. 2026',
    titre: "Inscriptions au catéchisme : la rentrée approche",
    extrait: "Toutes les informations pour inscrire vos enfants à la préparation aux sacrements."
  }
];

// ============ Groupes de service (données de démonstration en dur) ============
const demoGroupes = [
  { nom: 'Chorale Sainte Famille', couleur: 'wine', responsable: 'Chef de chœur : Sœur Bernadette', horaire: 'Répétition le jeudi à 18h30',
    description: "Anime les chants de la messe dominicale et des grandes fêtes liturgiques." },
  { nom: 'Groupe de jeunes', couleur: 'sage', responsable: 'Animateur : Jean-Marc Kouassi', horaire: 'Samedi à 15h, salle paroissiale',
    description: "Rassemble les jeunes de la paroisse autour de temps spirituels, sportifs et solidaires." },
  { nom: 'Catéchèse', couleur: 'gold', responsable: 'Responsable : Secrétariat paroissial', horaire: 'Mercredi à 16h',
    description: "Prépare les enfants et adultes aux sacrements de l'initiation chrétienne." }
];

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

const groupesGridEl = document.getElementById('groupesGrid');
if (groupesGridEl) {
  groupesGridEl.innerHTML = demoGroupes.map(g => `
    <div class="groupe-card">
      <div class="groupe-bar groupe-${g.couleur}"></div>
      <div class="groupe-body">
        <h4>${escapeHtml(g.nom)}</h4>
        <p>${escapeHtml(g.description)}</p>
        <div class="groupe-meta"><span>${escapeHtml(g.responsable)}</span><span>${escapeHtml(g.horaire)}</span></div>
      </div>
    </div>
  `).join('');
}

document.getElementById('articlesGrid').innerHTML = demoArticles.map(a => `
  <div class="article-card">
    <div class="article-thumb a-thumb-${a.couleur}">${escapeHtml(a.tag)}</div>
    <div class="article-body">
      <div class="article-tag">${escapeHtml(a.tag)}</div>
      <h4>${escapeHtml(a.titre)}</h4>
      <p>${escapeHtml(a.extrait)}</p>
      <div class="article-meta"><span>${escapeHtml(a.auteur)}</span><span>${escapeHtml(a.date)}</span></div>
    </div>
  </div>
`).join('');
