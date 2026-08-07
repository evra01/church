const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const { Pool } = require('pg');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// =====================================================================
// BASE DE DONNÉES POSTGRESQL (Render)
// =====================================================================
// DATABASE_URL est fournie automatiquement par Render quand la base
// Postgres est liée au service web (voir render.yaml). En local, sans
// base configurée, le serveur refuse de démarrer avec un message clair.
if (!process.env.DATABASE_URL) {
  console.error(
    "ERREUR : la variable d'environnement DATABASE_URL n'est pas définie.\n" +
    "Créez une base PostgreSQL (sur Render : New + -> PostgreSQL), puis reliez-la\n" +
    "à ce service, ou définissez DATABASE_URL manuellement pour tester en local."
  );
  process.exit(1);
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'off' ? false : { rejectUnauthorized: false }
});

function uid(prefix) {
  return prefix + '_' + crypto.randomBytes(6).toString('hex');
}

// Le front-end existant attend `createdAt` (camelCase) alors que Postgres
// renvoie `created_at`. On convertit ici plutôt que de tout réécrire côté client.
function withCamelDate(row) {
  if (!row) return row;
  const { created_at, ...rest } = row;
  return { ...rest, createdAt: created_at };
}
function withCamelDates(rows) {
  return rows.map(withCamelDate);
}

const DEFAULT_SETTINGS = {
  nomParoisse: 'Sainte Famille de Nazareth',
  sousTitre: 'Paris Village · Bingerville',
  heroTitre: 'Vivez votre foi,',
  heroTitreAccent: 'où que vous soyez',
  heroTexte: "Informations paroissiales, demandes de messe et cotisation en ligne : la Quasi-Paroisse Sainte Famille de Nazareth reste proche de vous, même à distance.",
  stats: [
    { chiffre: '3', label: 'Messes chaque semaine' },
    { chiffre: '12', label: 'Groupes & mouvements' },
    { chiffre: '1948', label: 'Année de fondation' }
  ],
  cierge: { messeDimanche: '10h00', confessions: 'Sam. 16h–17h30', permanence: 'Lun–Ven 9h–12h' },
  horaires: [
    { jour: 'Dimanche', detail: 'Messe principale', heure: '10h00' },
    { jour: 'Mercredi', detail: 'Messe en semaine', heure: '18h30' },
    { jour: 'Vendredi', detail: 'Adoration & messe', heure: '17h00' },
    { jour: 'Samedi', detail: 'Confessions', heure: '16h–17h30' }
  ],
  contact: {
    adresse: 'Paris Village, Bingerville',
    telephone: 'À compléter',
    email: 'contact@sainte-famille-bingerville.org',
    parking: 'Parking disponible sur le site paroissial'
  },
  sacrements: ['Baptême', 'Mariage', 'Confirmation', 'Funérailles'],
  dons: {
    montants: [1000, 2500, 5000, 10000],
    montantDefaut: 2500,
    impacts: [
      "2 500 FCFA financent les fournitures liturgiques du mois",
      "5 000 FCFA contribuent à l'entretien du bâtiment",
      "10 000 FCFA soutiennent le repas paroissial mensuel"
    ]
  },
  construction: {
    texte: "Participez à la construction et à l'aménagement de la nouvelle église de la paroisse. Chaque contribution compte.",
    montants: [5000, 10000, 25000, 50000],
    montantDefaut: 10000,
    impacts: [
      '10 000 FCFA financent des sacs de ciment',
      '25 000 FCFA contribuent aux fers à béton',
      "50 000 FCFA soutiennent la main d'œuvre du chantier"
    ]
  },
  liturgie: { couleur: 'vert', saison: 'Temps ordinaire' },
  footerTagline: 'Une paroisse accueillante, proche de vous en présence comme à distance.',
  copyright: '© 2026 Quasi-Paroisse Sainte Famille de Nazareth — Bingerville'
};

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (id INT PRIMARY KEY DEFAULT 1, data JSONB NOT NULL);
    CREATE TABLE IF NOT EXISTS admin_user (id INT PRIMARY KEY DEFAULT 1, username TEXT NOT NULL, password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS messes (
      id TEXT PRIMARY KEY, nom TEXT, email TEXT, date TEXT, type TEXT, note TEXT,
      status TEXT DEFAULT 'en_attente', created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS dons (
      id TEXT PRIMARY KEY, nom TEXT, email TEXT, montant NUMERIC, frequence TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY, tag TEXT, titre TEXT, extrait TEXT, contenu TEXT, auteur TEXT,
      couleur TEXT DEFAULT 'wine', publie BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS groupes (
      id TEXT PRIMARY KEY, nom TEXT, description TEXT, responsable TEXT, horaire TEXT,
      couleur TEXT DEFAULT 'wine', actif BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS citations (
      id TEXT PRIMARY KEY, texte TEXT, reference TEXT, publie BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS hero_images (
      id TEXT PRIMARY KEY, mimetype TEXT, data BYTEA, created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS galerie (
      id TEXT PRIMARY KEY, mimetype TEXT, data BYTEA, legende TEXT, created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  const { rows: settingsRows } = await pool.query('SELECT 1 FROM app_settings WHERE id = 1');
  if (!settingsRows.length) {
    await pool.query('INSERT INTO app_settings (id, data) VALUES (1, $1)', [DEFAULT_SETTINGS]);
  }
  const { rows: adminRows } = await pool.query('SELECT 1 FROM admin_user WHERE id = 1');
  if (!adminRows.length) {
    const hash = bcrypt.hashSync('admin123', 10);
    await pool.query('INSERT INTO admin_user (id, username, password_hash) VALUES (1, $1, $2)', ['admin', hash]);
    console.log("Compte admin par défaut créé : admin / admin123 — à changer dans Paramètres après connexion.");
  }
}

// ---------- Compression des images avant stockage ----------
// Réduit fortement le poids stocké en base ET accélère le chargement du
// site (images plus légères = rendu plus rapide côté navigateur).
async function compressImage(buffer, maxWidth) {
  const out = await sharp(buffer)
    .rotate() // corrige l'orientation EXIF
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality: 76 })
    .toBuffer();
  return { buffer: out, mimetype: 'image/webp' };
}

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }, // 12 Mo max en entrée, avant compression
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      return cb(new Error("Format d'image non supporté (jpg, png, webp ou gif uniquement)"));
    }
    cb(null, true);
  }
});

// ---------- Sessions admin en mémoire ----------
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
  session.expires = Date.now() + SESSION_DURATION_MS;
  req.admin = session.username;
  next();
}

app.use(express.json());
app.use(cookieParser());
app.use(express.static(require('path').join(__dirname, 'public')));

// =====================================================================
// AUTH ADMIN
// =====================================================================
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Identifiants requis' });
  const { rows } = await pool.query('SELECT * FROM admin_user WHERE id = 1');
  const admin = rows[0];
  if (!admin || username !== admin.username || !bcrypt.compareSync(password, admin.password_hash)) {
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

app.post('/api/admin/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const { rows } = await pool.query('SELECT * FROM admin_user WHERE id = 1');
  const admin = rows[0];
  if (!bcrypt.compareSync(currentPassword || '', admin.password_hash)) {
    return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  await pool.query('UPDATE admin_user SET password_hash = $1 WHERE id = 1', [hash]);
  res.json({ ok: true });
});

// =====================================================================
// PARAMÈTRES DU SITE
// =====================================================================
app.get('/api/settings', async (req, res) => {
  const { rows } = await pool.query('SELECT data FROM app_settings WHERE id = 1');
  res.json(rows[0].data);
});

app.get('/api/admin/settings', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT data FROM app_settings WHERE id = 1');
  res.json(rows[0].data);
});

app.put('/api/admin/settings', requireAuth, async (req, res) => {
  const body = req.body || {};
  const { rows } = await pool.query('SELECT data FROM app_settings WHERE id = 1');
  const s = rows[0].data;

  if (typeof body.nomParoisse === 'string') s.nomParoisse = body.nomParoisse;
  if (typeof body.sousTitre === 'string') s.sousTitre = body.sousTitre;
  if (typeof body.heroTitre === 'string') s.heroTitre = body.heroTitre;
  if (typeof body.heroTitreAccent === 'string') s.heroTitreAccent = body.heroTitreAccent;
  if (typeof body.heroTexte === 'string') s.heroTexte = body.heroTexte;
  if (typeof body.footerTagline === 'string') s.footerTagline = body.footerTagline;
  if (typeof body.copyright === 'string') s.copyright = body.copyright;

  if (Array.isArray(body.stats)) {
    s.stats = body.stats.filter(x => x && typeof x.chiffre === 'string' && typeof x.label === 'string').slice(0, 6);
  }
  if (Array.isArray(body.horaires)) {
    s.horaires = body.horaires.filter(x => x && typeof x.jour === 'string' && typeof x.detail === 'string' && typeof x.heure === 'string').slice(0, 10);
  }
  if (Array.isArray(body.sacrements)) {
    s.sacrements = body.sacrements.filter(x => typeof x === 'string' && x.trim()).slice(0, 12);
  }
  if (!s.dons) s.dons = { montants: [], montantDefaut: 0, impacts: [] };
  if (body.dons && typeof body.dons === 'object') {
    if (Array.isArray(body.dons.montants)) s.dons.montants = body.dons.montants.map(Number).filter(n => Number.isFinite(n) && n > 0).slice(0, 8);
    if (body.dons.montantDefaut !== undefined && Number.isFinite(Number(body.dons.montantDefaut))) s.dons.montantDefaut = Number(body.dons.montantDefaut);
    if (Array.isArray(body.dons.impacts)) s.dons.impacts = body.dons.impacts.filter(x => typeof x === 'string' && x.trim()).slice(0, 8);
  }
  if (!s.construction) s.construction = { texte: '', montants: [], montantDefaut: 0, impacts: [] };
  if (body.construction && typeof body.construction === 'object') {
    if (typeof body.construction.texte === 'string') s.construction.texte = body.construction.texte;
    if (Array.isArray(body.construction.montants)) s.construction.montants = body.construction.montants.map(Number).filter(n => Number.isFinite(n) && n > 0).slice(0, 8);
    if (body.construction.montantDefaut !== undefined && Number.isFinite(Number(body.construction.montantDefaut))) s.construction.montantDefaut = Number(body.construction.montantDefaut);
    if (Array.isArray(body.construction.impacts)) s.construction.impacts = body.construction.impacts.filter(x => typeof x === 'string' && x.trim()).slice(0, 8);
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

  await pool.query('UPDATE app_settings SET data = $1 WHERE id = 1', [s]);
  res.json(s);
});

// =====================================================================
// PHOTOS DE FOND (bandeau d'accueil) — compressées, stockées en base
// =====================================================================
app.get('/api/hero-images', async (req, res) => {
  const { rows } = await pool.query('SELECT id FROM hero_images ORDER BY created_at ASC');
  res.json(rows.map(h => ({ id: h.id, url: '/images/hero/' + h.id })));
});

app.get('/images/hero/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT mimetype, data FROM hero_images WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).end();
  res.set('Content-Type', rows[0].mimetype);
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(rows[0].data);
});

app.post('/api/admin/hero-images', requireAuth, (req, res) => {
  memoryUpload.single('photo')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Aucune image reçue' });
    try {
      const { buffer, mimetype } = await compressImage(req.file.buffer, 1920);
      const id = uid('h');
      await pool.query('INSERT INTO hero_images (id, mimetype, data) VALUES ($1, $2, $3)', [id, mimetype, buffer]);
      res.status(201).json({ id, url: '/images/hero/' + id });
    } catch (e) {
      res.status(500).json({ error: "Erreur lors du traitement de l'image" });
    }
  });
});

app.delete('/api/admin/hero-images/:id', requireAuth, async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM hero_images WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Image introuvable' });
  res.json({ ok: true });
});

// =====================================================================
// GALERIE DES CÉLÉBRATIONS — compressées, stockées en base
// =====================================================================
app.get('/api/galerie', async (req, res) => {
  const { rows } = await pool.query('SELECT id, legende FROM galerie ORDER BY created_at DESC');
  res.json(rows.map(g => ({ id: g.id, url: '/images/galerie/' + g.id, legende: g.legende || '' })));
});

app.get('/api/admin/galerie', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT id, legende FROM galerie ORDER BY created_at DESC');
  res.json(rows.map(g => ({ id: g.id, url: '/images/galerie/' + g.id, legende: g.legende || '' })));
});

app.get('/images/galerie/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT mimetype, data FROM galerie WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).end();
  res.set('Content-Type', rows[0].mimetype);
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(rows[0].data);
});

app.post('/api/admin/galerie', requireAuth, (req, res) => {
  memoryUpload.single('photo')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Aucune image reçue' });
    try {
      const { buffer, mimetype } = await compressImage(req.file.buffer, 1400);
      const id = uid('g');
      const legende = (req.body && req.body.legende) || '';
      await pool.query('INSERT INTO galerie (id, mimetype, data, legende) VALUES ($1, $2, $3, $4)', [id, mimetype, buffer, legende]);
      res.status(201).json({ id, url: '/images/galerie/' + id, legende });
    } catch (e) {
      res.status(500).json({ error: "Erreur lors du traitement de l'image" });
    }
  });
});

app.delete('/api/admin/galerie/:id', requireAuth, async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM galerie WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Photo introuvable' });
  res.json({ ok: true });
});

// =====================================================================
// DEMANDES DE MESSE
// =====================================================================
app.post('/api/messes', async (req, res) => {
  const { nom, email, date, type, note } = req.body || {};
  if (!nom || !email || !date) return res.status(400).json({ error: 'Nom, e-mail et date sont requis' });
  const id = uid('m');
  const { rows } = await pool.query(
    `INSERT INTO messes (id, nom, email, date, type, note, status) VALUES ($1,$2,$3,$4,$5,$6,'en_attente') RETURNING *`,
    [id, nom, email, date, type || 'Autre intention', note || '']
  );
  res.status(201).json(withCamelDate(rows[0]));
});

app.get('/api/admin/messes', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM messes ORDER BY created_at DESC');
  res.json(withCamelDates(rows));
});

app.patch('/api/admin/messes/:id', requireAuth, async (req, res) => {
  const { status } = req.body || {};
  const allowed = ['en_attente', 'confirmee', 'refusee'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Statut invalide' });
  const { rows } = await pool.query('UPDATE messes SET status = $1 WHERE id = $2 RETURNING *', [status, req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Demande introuvable' });
  res.json(withCamelDate(rows[0]));
});

app.delete('/api/admin/messes/:id', requireAuth, async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM messes WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Demande introuvable' });
  res.json({ ok: true });
});

// =====================================================================
// DONS / COTISATIONS
// =====================================================================
app.post('/api/dons', async (req, res) => {
  const { nom, email, montant, frequence } = req.body || {};
  if (!nom || !email || !montant || isNaN(montant) || Number(montant) <= 0) {
    return res.status(400).json({ error: 'Nom, e-mail et montant valide sont requis' });
  }
  const freqValide = ['monthly', 'construction'].includes(frequence) ? frequence : 'once';
  const id = uid('d');
  const { rows } = await pool.query(
    'INSERT INTO dons (id, nom, email, montant, frequence) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [id, nom, email, Number(montant), freqValide]
  );
  // NOTE: aucun paiement réel n'est effectué ici. Pour un vrai paiement,
  // il faut intégrer un prestataire (Stripe, HelloAsso, PayPal...).
  res.status(201).json(withCamelDate(rows[0]));
});

app.get('/api/admin/dons', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM dons ORDER BY created_at DESC');
  res.json(withCamelDates(rows));
});

app.delete('/api/admin/dons/:id', requireAuth, async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM dons WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Don introuvable' });
  res.json({ ok: true });
});

// =====================================================================
// ARTICLES
// =====================================================================
app.get('/api/articles', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM articles WHERE publie = true ORDER BY created_at DESC');
  res.json(withCamelDates(rows));
});

app.get('/api/admin/articles', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM articles ORDER BY created_at DESC');
  res.json(withCamelDates(rows));
});

app.post('/api/admin/articles', requireAuth, async (req, res) => {
  const { tag, titre, extrait, contenu, auteur, couleur, publie } = req.body || {};
  if (!titre || !extrait) return res.status(400).json({ error: 'Titre et extrait sont requis' });
  const id = uid('a');
  const coul = ['wine', 'sage', 'gold', 'marian'].includes(couleur) ? couleur : 'wine';
  const { rows } = await pool.query(
    `INSERT INTO articles (id, tag, titre, extrait, contenu, auteur, couleur, publie)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [id, tag || 'Actualité', titre, extrait, contenu || extrait, auteur || 'Paroisse', coul, publie !== false]
  );
  res.status(201).json(withCamelDate(rows[0]));
});

app.put('/api/admin/articles/:id', requireAuth, async (req, res) => {
  const { tag, titre, extrait, contenu, auteur, couleur, publie } = req.body || {};
  const { rows: existing } = await pool.query('SELECT * FROM articles WHERE id = $1', [req.params.id]);
  if (!existing.length) return res.status(404).json({ error: 'Article introuvable' });
  const cur = existing[0];
  const coul = (couleur !== undefined && ['wine', 'sage', 'gold', 'marian'].includes(couleur)) ? couleur : cur.couleur;
  const { rows } = await pool.query(
    `UPDATE articles SET tag=$1, titre=$2, extrait=$3, contenu=$4, auteur=$5, couleur=$6, publie=$7 WHERE id=$8 RETURNING *`,
    [
      tag !== undefined ? tag : cur.tag,
      titre !== undefined ? titre : cur.titre,
      extrait !== undefined ? extrait : cur.extrait,
      contenu !== undefined ? contenu : cur.contenu,
      auteur !== undefined ? auteur : cur.auteur,
      coul,
      publie !== undefined ? !!publie : cur.publie,
      req.params.id
    ]
  );
  res.json(withCamelDate(rows[0]));
});

app.delete('/api/admin/articles/:id', requireAuth, async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM articles WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Article introuvable' });
  res.json({ ok: true });
});

// =====================================================================
// CITATIONS LITURGIQUES
// =====================================================================
app.get('/api/citations', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM citations WHERE publie = true ORDER BY created_at DESC');
  res.json(withCamelDates(rows));
});

app.get('/api/admin/citations', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM citations ORDER BY created_at DESC');
  res.json(withCamelDates(rows));
});

app.post('/api/admin/citations', requireAuth, async (req, res) => {
  const { texte, reference, publie } = req.body || {};
  if (!texte) return res.status(400).json({ error: 'Le texte de la citation est requis' });
  const id = uid('c');
  const { rows } = await pool.query(
    'INSERT INTO citations (id, texte, reference, publie) VALUES ($1,$2,$3,$4) RETURNING *',
    [id, texte, reference || '', publie !== false]
  );
  res.status(201).json(withCamelDate(rows[0]));
});

app.put('/api/admin/citations/:id', requireAuth, async (req, res) => {
  const { texte, reference, publie } = req.body || {};
  const { rows: existing } = await pool.query('SELECT * FROM citations WHERE id = $1', [req.params.id]);
  if (!existing.length) return res.status(404).json({ error: 'Citation introuvable' });
  const cur = existing[0];
  const { rows } = await pool.query(
    'UPDATE citations SET texte=$1, reference=$2, publie=$3 WHERE id=$4 RETURNING *',
    [
      texte !== undefined ? texte : cur.texte,
      reference !== undefined ? reference : cur.reference,
      publie !== undefined ? !!publie : cur.publie,
      req.params.id
    ]
  );
  res.json(withCamelDate(rows[0]));
});

app.delete('/api/admin/citations/:id', requireAuth, async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM citations WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Citation introuvable' });
  res.json({ ok: true });
});

// =====================================================================
// GROUPES DE SERVICE
// =====================================================================
app.get('/api/groupes', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM groupes WHERE actif = true ORDER BY nom ASC');
  res.json(withCamelDates(rows));
});

app.get('/api/admin/groupes', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM groupes ORDER BY nom ASC');
  res.json(withCamelDates(rows));
});

app.post('/api/admin/groupes', requireAuth, async (req, res) => {
  const { nom, description, responsable, horaire, couleur, actif } = req.body || {};
  if (!nom || !description) return res.status(400).json({ error: 'Le nom et la description sont requis' });
  const id = uid('gr');
  const coul = ['wine', 'sage', 'gold', 'marian'].includes(couleur) ? couleur : 'wine';
  const { rows } = await pool.query(
    `INSERT INTO groupes (id, nom, description, responsable, horaire, couleur, actif)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [id, nom, description, responsable || '', horaire || '', coul, actif !== false]
  );
  res.status(201).json(withCamelDate(rows[0]));
});

app.put('/api/admin/groupes/:id', requireAuth, async (req, res) => {
  const { nom, description, responsable, horaire, couleur, actif } = req.body || {};
  const { rows: existing } = await pool.query('SELECT * FROM groupes WHERE id = $1', [req.params.id]);
  if (!existing.length) return res.status(404).json({ error: 'Groupe introuvable' });
  const cur = existing[0];
  const coul = (couleur !== undefined && ['wine', 'sage', 'gold', 'marian'].includes(couleur)) ? couleur : cur.couleur;
  const { rows } = await pool.query(
    `UPDATE groupes SET nom=$1, description=$2, responsable=$3, horaire=$4, couleur=$5, actif=$6 WHERE id=$7 RETURNING *`,
    [
      nom !== undefined ? nom : cur.nom,
      description !== undefined ? description : cur.description,
      responsable !== undefined ? responsable : cur.responsable,
      horaire !== undefined ? horaire : cur.horaire,
      coul,
      actif !== undefined ? !!actif : cur.actif,
      req.params.id
    ]
  );
  res.json(withCamelDate(rows[0]));
});

app.delete('/api/admin/groupes/:id', requireAuth, async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM groupes WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Groupe introuvable' });
  res.json({ ok: true });
});

// =====================================================================
// STATISTIQUES ADMIN
// =====================================================================
app.get('/api/admin/stats', requireAuth, async (req, res) => {
  const [dons, messes, articles, groupes] = await Promise.all([
    pool.query('SELECT montant, created_at FROM dons'),
    pool.query('SELECT status FROM messes'),
    pool.query('SELECT publie FROM articles'),
    pool.query('SELECT actif FROM groupes')
  ]);
  const now = new Date();
  const totalDons = dons.rows.reduce((sum, d) => sum + Number(d.montant), 0);
  const donsCeMois = dons.rows
    .filter(d => {
      const dt = new Date(d.created_at);
      return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
    })
    .reduce((sum, d) => sum + Number(d.montant), 0);
  res.json({
    totalDons,
    donsCeMois,
    nombreDons: dons.rows.length,
    messesEnAttente: messes.rows.filter(m => m.status === 'en_attente').length,
    messesConfirmees: messes.rows.filter(m => m.status === 'confirmee').length,
    totalMesses: messes.rows.length,
    articlesPublies: articles.rows.filter(a => a.publie).length,
    totalArticles: articles.rows.length,
    groupesActifs: groupes.rows.filter(g => g.actif).length,
    totalGroupes: groupes.rows.length
  });
});

initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Serveur de la paroisse démarré : http://localhost:${PORT}`);
      console.log(`Admin : http://localhost:${PORT}/admin.html (identifiants par défaut admin / admin123)`);
    });
  })
  .catch(err => {
    console.error('Impossible d\'initialiser la base de données :', err);
    process.exit(1);
  });
