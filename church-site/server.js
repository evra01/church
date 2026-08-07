const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// ---------- Dossier de données (persistant si configuré) ----------
// Sur Render (et la plupart des hébergeurs), le disque est effacé à chaque
// redéploiement/redémarrage sauf si un "Persistent Disk" est monté.
// En définissant la variable d'environnement DATA_DIR sur le chemin de ce
// disque (ex: /var/data), les dons, articles, groupes et photos survivent
// aux redéploiements. Sans cette variable, tout fonctionne normalement en
// local avec le dossier ./data du projet.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const SEED_DB_PATH = path.join(__dirname, 'data', 'db.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
// Si la base n'existe pas encore à cet emplacement (premier démarrage sur un
// disque persistant vide), on l'initialise avec les données de départ du dépôt.
if (!fs.existsSync(DB_PATH) && fs.existsSync(SEED_DB_PATH)) {
  fs.copyFileSync(SEED_DB_PATH, DB_PATH);
}

// ---------- Dossiers de stockage des photos ----------
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'public', 'images');
const HERO_DIR = path.join(UPLOADS_DIR, 'hero');
const GALERIE_DIR = path.join(UPLOADS_DIR, 'galerie');
fs.mkdirSync(HERO_DIR, { recursive: true });
fs.mkdirSync(GALERIE_DIR, { recursive: true });

function makeUploader(dir) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
      cb(null, uid('img') + ext);
    }
  });
  return multer({
    storage,
    limits: { fileSize: 8 * 1024 * 1024 }, // 8 Mo max par photo
    fileFilter: (req, file, cb) => {
      if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
        return cb(new Error("Format d'image non supporté (jpg, png, webp ou gif uniquement)"));
      }
      cb(null, true);
    }
  });
}
const uploadHero = makeUploader(HERO_DIR);
const uploadGalerie = makeUploader(GALERIE_DIR);

// ---------- Petite "base de données" fichier JSON ----------
function readDB() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}
function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}
function uid(prefix) {
  return prefix + '_' + crypto.randomBytes(6).toString('hex');
}

// ---------- Sessions admin en mémoire ----------
// token -> { username, expires }
const sessions = new Map();
const SESSION_DURATION_MS = 1000 * 60 * 60 * 8; // 8 heures

function createSession(username) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { username, expires: Date.now() + SESSION_DURATION_MS });
  return token;
}
function requireAuth(req, res, next) {
  const token = req.cookies.session;
  const session = token && sessions.get(token);
  if (!session || session.expires < Date.now()) {
    if (session) sessions.delete(token);
    return res.status(401).json({ error: 'Non authentifié' });
  }
  // renouvelle la session
  session.expires = Date.now() + SESSION_DURATION_MS;
  req.admin = session.username;
  next();
}

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
// Sert les photos uploadées même si UPLOADS_DIR pointe vers un disque
// externe (persistant) situé en dehors du dossier public/ du dépôt.
app.use('/images', express.static(UPLOADS_DIR));

// =====================================================================
// AUTH ADMIN
// =====================================================================
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  const db = readDB();
  if (!username || !password) {
    return res.status(400).json({ error: 'Identifiants requis' });
  }
  if (username !== db.admin.username || !bcrypt.compareSync(password, db.admin.passwordHash)) {
    return res.status(401).json({ error: 'Identifiants incorrects' });
  }
  const token = createSession(username);
  res.cookie('session', token, {
    httpOnly: true,
    maxAge: SESSION_DURATION_MS,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  });
  res.json({ ok: true, username });
});

app.post('/api/admin/logout', (req, res) => {
  const token = req.cookies.session;
  if (token) sessions.delete(token);
  res.clearCookie('session');
  res.json({ ok: true });
});

app.get('/api/admin/me', requireAuth, (req, res) => {
  res.json({ username: req.admin });
});

app.post('/api/admin/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const db = readDB();
  if (!bcrypt.compareSync(currentPassword || '', db.admin.passwordHash)) {
    return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères' });
  }
  db.admin.passwordHash = bcrypt.hashSync(newPassword, 10);
  writeDB(db);
  res.json({ ok: true });
});

// =====================================================================
// PARAMÈTRES DU SITE (contenu éditable : coordonnées, horaires, textes...)
// =====================================================================
app.get('/api/settings', (req, res) => {
  const db = readDB();
  res.json(db.settings);
});

app.get('/api/admin/settings', requireAuth, (req, res) => {
  const db = readDB();
  res.json(db.settings);
});

app.put('/api/admin/settings', requireAuth, (req, res) => {
  const body = req.body || {};
  const db = readDB();

  // Fusion superficielle sécurisée : on ne garde que les clés connues,
  // pour éviter d'injecter des données arbitraires dans le fichier.
  const s = db.settings;
  if (typeof body.nomParoisse === 'string') s.nomParoisse = body.nomParoisse;
  if (typeof body.sousTitre === 'string') s.sousTitre = body.sousTitre;
  if (typeof body.heroTitre === 'string') s.heroTitre = body.heroTitre;
  if (typeof body.heroTitreAccent === 'string') s.heroTitreAccent = body.heroTitreAccent;
  if (typeof body.heroTexte === 'string') s.heroTexte = body.heroTexte;
  if (typeof body.footerTagline === 'string') s.footerTagline = body.footerTagline;
  if (typeof body.copyright === 'string') s.copyright = body.copyright;

  if (Array.isArray(body.stats)) {
    s.stats = body.stats
      .filter(x => x && typeof x.chiffre === 'string' && typeof x.label === 'string')
      .slice(0, 6);
  }
  if (Array.isArray(body.horaires)) {
    s.horaires = body.horaires
      .filter(x => x && typeof x.jour === 'string' && typeof x.detail === 'string' && typeof x.heure === 'string')
      .slice(0, 10);
  }
  if (Array.isArray(body.sacrements)) {
    s.sacrements = body.sacrements.filter(x => typeof x === 'string' && x.trim()).slice(0, 12);
  }
  if (!s.dons) s.dons = { montants: [], montantDefaut: 0, impacts: [] };
  if (body.dons && typeof body.dons === 'object') {
    if (Array.isArray(body.dons.montants)) {
      s.dons.montants = body.dons.montants.map(Number).filter(n => Number.isFinite(n) && n > 0).slice(0, 8);
    }
    if (body.dons.montantDefaut !== undefined && Number.isFinite(Number(body.dons.montantDefaut))) {
      s.dons.montantDefaut = Number(body.dons.montantDefaut);
    }
    if (Array.isArray(body.dons.impacts)) {
      s.dons.impacts = body.dons.impacts.filter(x => typeof x === 'string' && x.trim()).slice(0, 8);
    }
  }
  if (!s.construction) s.construction = { texte: '', montants: [], montantDefaut: 0, impacts: [] };
  if (body.construction && typeof body.construction === 'object') {
    if (typeof body.construction.texte === 'string') s.construction.texte = body.construction.texte;
    if (Array.isArray(body.construction.montants)) {
      s.construction.montants = body.construction.montants.map(Number).filter(n => Number.isFinite(n) && n > 0).slice(0, 8);
    }
    if (body.construction.montantDefaut !== undefined && Number.isFinite(Number(body.construction.montantDefaut))) {
      s.construction.montantDefaut = Number(body.construction.montantDefaut);
    }
    if (Array.isArray(body.construction.impacts)) {
      s.construction.impacts = body.construction.impacts.filter(x => typeof x === 'string' && x.trim()).slice(0, 8);
    }
  }
  if (body.cierge && typeof body.cierge === 'object') {
    if (typeof body.cierge.messeDimanche === 'string') s.cierge.messeDimanche = body.cierge.messeDimanche;
    if (typeof body.cierge.confessions === 'string') s.cierge.confessions = body.cierge.confessions;
    if (typeof body.cierge.permanence === 'string') s.cierge.permanence = body.cierge.permanence;
  }
  if (body.contact && typeof body.contact === 'object') {
    if (typeof body.contact.adresse === 'string') s.contact.adresse = body.contact.adresse;
    if (typeof body.contact.telephone === 'string') s.contact.telephone = body.contact.telephone;
    if (typeof body.contact.email === 'string') s.contact.email = body.contact.email;
    if (typeof body.contact.parking === 'string') s.contact.parking = body.contact.parking;
  }
  if (body.liturgie && typeof body.liturgie === 'object') {
    const couleursValides = ['bordeaux', 'violet', 'rouge', 'vert', 'blanc_or', 'rose', 'bleu_marial'];
    if (couleursValides.includes(body.liturgie.couleur)) s.liturgie.couleur = body.liturgie.couleur;
    if (typeof body.liturgie.saison === 'string') s.liturgie.saison = body.liturgie.saison;
  }

  writeDB(db);
  res.json(s);
});

// =====================================================================
// PHOTOS DE FOND (bandeau d'accueil)
// =====================================================================
app.get('/api/hero-images', (req, res) => {
  const db = readDB();
  res.json((db.heroImages || []).map(h => ({ id: h.id, url: '/images/hero/' + h.filename })));
});

app.post('/api/admin/hero-images', requireAuth, (req, res) => {
  uploadHero.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Aucune image reçue' });
    const db = readDB();
    if (!db.heroImages) db.heroImages = [];
    const item = { id: uid('h'), filename: req.file.filename, createdAt: new Date().toISOString() };
    db.heroImages.push(item);
    writeDB(db);
    res.status(201).json({ id: item.id, url: '/images/hero/' + item.filename });
  });
});

app.delete('/api/admin/hero-images/:id', requireAuth, (req, res) => {
  const db = readDB();
  const item = (db.heroImages || []).find(h => h.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Image introuvable' });
  db.heroImages = db.heroImages.filter(h => h.id !== req.params.id);
  writeDB(db);
  fs.unlink(path.join(HERO_DIR, item.filename), () => {});
  res.json({ ok: true });
});

// =====================================================================
// GALERIE DES CÉLÉBRATIONS
// =====================================================================
app.get('/api/galerie', (req, res) => {
  const db = readDB();
  const list = (db.galerie || []).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(list.map(g => ({ id: g.id, url: '/images/galerie/' + g.filename, legende: g.legende || '' })));
});

app.get('/api/admin/galerie', requireAuth, (req, res) => {
  const db = readDB();
  const list = (db.galerie || []).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(list.map(g => ({ id: g.id, url: '/images/galerie/' + g.filename, legende: g.legende || '' })));
});

app.post('/api/admin/galerie', requireAuth, (req, res) => {
  uploadGalerie.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Aucune image reçue' });
    const db = readDB();
    if (!db.galerie) db.galerie = [];
    const item = {
      id: uid('g'),
      filename: req.file.filename,
      legende: (req.body && req.body.legende) || '',
      createdAt: new Date().toISOString()
    };
    db.galerie.push(item);
    writeDB(db);
    res.status(201).json({ id: item.id, url: '/images/galerie/' + item.filename, legende: item.legende });
  });
});

app.delete('/api/admin/galerie/:id', requireAuth, (req, res) => {
  const db = readDB();
  const item = (db.galerie || []).find(g => g.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Photo introuvable' });
  db.galerie = db.galerie.filter(g => g.id !== req.params.id);
  writeDB(db);
  fs.unlink(path.join(GALERIE_DIR, item.filename), () => {});
  res.json({ ok: true });
});

// =====================================================================
// DEMANDES DE MESSE
// =====================================================================
app.post('/api/messes', (req, res) => {
  const { nom, email, date, type, note } = req.body || {};
  if (!nom || !email || !date) {
    return res.status(400).json({ error: 'Nom, e-mail et date sont requis' });
  }
  const db = readDB();
  const demande = {
    id: uid('m'),
    nom, email, date,
    type: type || 'Autre intention',
    note: note || '',
    status: 'en_attente',
    createdAt: new Date().toISOString()
  };
  db.messes.unshift(demande);
  writeDB(db);
  res.status(201).json(demande);
});

app.get('/api/admin/messes', requireAuth, (req, res) => {
  const db = readDB();
  res.json(db.messes);
});

app.patch('/api/admin/messes/:id', requireAuth, (req, res) => {
  const { status } = req.body || {};
  const allowed = ['en_attente', 'confirmee', 'refusee'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Statut invalide' });
  }
  const db = readDB();
  const item = db.messes.find(m => m.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Demande introuvable' });
  item.status = status;
  writeDB(db);
  res.json(item);
});

app.delete('/api/admin/messes/:id', requireAuth, (req, res) => {
  const db = readDB();
  const before = db.messes.length;
  db.messes = db.messes.filter(m => m.id !== req.params.id);
  if (db.messes.length === before) return res.status(404).json({ error: 'Demande introuvable' });
  writeDB(db);
  res.json({ ok: true });
});

// =====================================================================
// DONS / COTISATIONS
// =====================================================================
app.post('/api/dons', (req, res) => {
  const { nom, email, montant, frequence } = req.body || {};
  if (!nom || !email || !montant || isNaN(montant) || Number(montant) <= 0) {
    return res.status(400).json({ error: 'Nom, e-mail et montant valide sont requis' });
  }
  const db = readDB();
  const freqValide = ['monthly', 'construction'].includes(frequence) ? frequence : 'once';
  const don = {
    id: uid('d'),
    nom, email,
    montant: Number(montant),
    frequence: freqValide,
    createdAt: new Date().toISOString()
  };
  db.dons.unshift(don);
  writeDB(db);
  // NOTE: aucun paiement réel n'est effectué ici. Pour un vrai paiement,
  // il faut intégrer un prestataire (Stripe, HelloAsso, PayPal...).
  res.status(201).json(don);
});

app.get('/api/admin/dons', requireAuth, (req, res) => {
  const db = readDB();
  res.json(db.dons);
});

app.delete('/api/admin/dons/:id', requireAuth, (req, res) => {
  const db = readDB();
  const before = db.dons.length;
  db.dons = db.dons.filter(d => d.id !== req.params.id);
  if (db.dons.length === before) return res.status(404).json({ error: 'Don introuvable' });
  writeDB(db);
  res.json({ ok: true });
});

// =====================================================================
// ARTICLES
// =====================================================================
app.get('/api/articles', (req, res) => {
  const db = readDB();
  res.json(db.articles.filter(a => a.publie).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.get('/api/admin/articles', requireAuth, (req, res) => {
  const db = readDB();
  res.json(db.articles.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.post('/api/admin/articles', requireAuth, (req, res) => {
  const { tag, titre, extrait, contenu, auteur, couleur, publie } = req.body || {};
  if (!titre || !extrait) {
    return res.status(400).json({ error: 'Titre et extrait sont requis' });
  }
  const db = readDB();
  const article = {
    id: uid('a'),
    tag: tag || 'Actualité',
    titre,
    extrait,
    contenu: contenu || extrait,
    auteur: auteur || 'Paroisse',
    couleur: ['wine', 'sage', 'gold', 'marian'].includes(couleur) ? couleur : 'wine',
    publie: publie !== false,
    createdAt: new Date().toISOString()
  };
  db.articles.unshift(article);
  writeDB(db);
  res.status(201).json(article);
});

app.put('/api/admin/articles/:id', requireAuth, (req, res) => {
  const db = readDB();
  const item = db.articles.find(a => a.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Article introuvable' });
  const { tag, titre, extrait, contenu, auteur, couleur, publie } = req.body || {};
  if (tag !== undefined) item.tag = tag;
  if (titre !== undefined) item.titre = titre;
  if (extrait !== undefined) item.extrait = extrait;
  if (contenu !== undefined) item.contenu = contenu;
  if (auteur !== undefined) item.auteur = auteur;
  if (couleur !== undefined && ['wine', 'sage', 'gold', 'marian'].includes(couleur)) item.couleur = couleur;
  if (publie !== undefined) item.publie = !!publie;
  writeDB(db);
  res.json(item);
});

app.delete('/api/admin/articles/:id', requireAuth, (req, res) => {
  const db = readDB();
  const before = db.articles.length;
  db.articles = db.articles.filter(a => a.id !== req.params.id);
  if (db.articles.length === before) return res.status(404).json({ error: 'Article introuvable' });
  writeDB(db);
  res.json({ ok: true });
});

// =====================================================================
// CITATIONS LITURGIQUES
// =====================================================================
app.get('/api/citations', (req, res) => {
  const db = readDB();
  res.json((db.citations || []).filter(c => c.publie).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.get('/api/admin/citations', requireAuth, (req, res) => {
  const db = readDB();
  res.json((db.citations || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.post('/api/admin/citations', requireAuth, (req, res) => {
  const { texte, reference, publie } = req.body || {};
  if (!texte) {
    return res.status(400).json({ error: 'Le texte de la citation est requis' });
  }
  const db = readDB();
  if (!db.citations) db.citations = [];
  const citation = {
    id: uid('c'),
    texte,
    reference: reference || '',
    publie: publie !== false,
    createdAt: new Date().toISOString()
  };
  db.citations.unshift(citation);
  writeDB(db);
  res.status(201).json(citation);
});

app.put('/api/admin/citations/:id', requireAuth, (req, res) => {
  const db = readDB();
  const item = (db.citations || []).find(c => c.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Citation introuvable' });
  const { texte, reference, publie } = req.body || {};
  if (texte !== undefined) item.texte = texte;
  if (reference !== undefined) item.reference = reference;
  if (publie !== undefined) item.publie = !!publie;
  writeDB(db);
  res.json(item);
});

app.delete('/api/admin/citations/:id', requireAuth, (req, res) => {
  const db = readDB();
  const before = (db.citations || []).length;
  db.citations = (db.citations || []).filter(c => c.id !== req.params.id);
  if (db.citations.length === before) return res.status(404).json({ error: 'Citation introuvable' });
  writeDB(db);
  res.json({ ok: true });
});

// =====================================================================
// GROUPES DE SERVICE (mouvements, chorale, catéchèse, jeunes...)
// =====================================================================
app.get('/api/groupes', (req, res) => {
  const db = readDB();
  const list = (db.groupes || []).filter(g => g.actif).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  res.json(list);
});

app.get('/api/admin/groupes', requireAuth, (req, res) => {
  const db = readDB();
  const list = (db.groupes || []).slice().sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  res.json(list);
});

app.post('/api/admin/groupes', requireAuth, (req, res) => {
  const { nom, description, responsable, horaire, couleur, actif } = req.body || {};
  if (!nom || !description) {
    return res.status(400).json({ error: 'Le nom et la description sont requis' });
  }
  const db = readDB();
  if (!db.groupes) db.groupes = [];
  const groupe = {
    id: uid('gr'),
    nom,
    description,
    responsable: responsable || '',
    horaire: horaire || '',
    couleur: ['wine', 'sage', 'gold', 'marian'].includes(couleur) ? couleur : 'wine',
    actif: actif !== false,
    createdAt: new Date().toISOString()
  };
  db.groupes.push(groupe);
  writeDB(db);
  res.status(201).json(groupe);
});

app.put('/api/admin/groupes/:id', requireAuth, (req, res) => {
  const db = readDB();
  const item = (db.groupes || []).find(g => g.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Groupe introuvable' });
  const { nom, description, responsable, horaire, couleur, actif } = req.body || {};
  if (nom !== undefined) item.nom = nom;
  if (description !== undefined) item.description = description;
  if (responsable !== undefined) item.responsable = responsable;
  if (horaire !== undefined) item.horaire = horaire;
  if (couleur !== undefined && ['wine', 'sage', 'gold', 'marian'].includes(couleur)) item.couleur = couleur;
  if (actif !== undefined) item.actif = !!actif;
  writeDB(db);
  res.json(item);
});

app.delete('/api/admin/groupes/:id', requireAuth, (req, res) => {
  const db = readDB();
  const before = (db.groupes || []).length;
  db.groupes = (db.groupes || []).filter(g => g.id !== req.params.id);
  if (db.groupes.length === before) return res.status(404).json({ error: 'Groupe introuvable' });
  writeDB(db);
  res.json({ ok: true });
});

// =====================================================================
// STATISTIQUES ADMIN
// =====================================================================
app.get('/api/admin/stats', requireAuth, (req, res) => {
  const db = readDB();
  const totalDons = db.dons.reduce((sum, d) => sum + d.montant, 0);
  const donsCeMois = db.dons.filter(d => {
    const dt = new Date(d.createdAt);
    const now = new Date();
    return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
  }).reduce((sum, d) => sum + d.montant, 0);
  res.json({
    totalDons,
    donsCeMois,
    nombreDons: db.dons.length,
    messesEnAttente: db.messes.filter(m => m.status === 'en_attente').length,
    messesConfirmees: db.messes.filter(m => m.status === 'confirmee').length,
    totalMesses: db.messes.length,
    articlesPublies: db.articles.filter(a => a.publie).length,
    totalArticles: db.articles.length,
    groupesActifs: (db.groupes || []).filter(g => g.actif).length,
    totalGroupes: (db.groupes || []).length
  });
});

app.listen(PORT, () => {
  console.log(`Serveur de la paroisse démarré : http://localhost:${PORT}`);
  console.log(`Admin : http://localhost:${PORT}/admin.html (identifiants par défaut admin / admin123)`);
});
