# Déployer le site sur Render (avec base PostgreSQL)

## 0. Ce qui a changé

Le site stocke désormais **toutes ses données dans une vraie base
PostgreSQL** (messes, dons, articles, groupes, citations, paramètres) —
y compris les **photos** (fond du hero, galerie), qui sont automatiquement
**compressées** (redimensionnées + converties en WebP) avant d'être
enregistrées. Cela règle définitivement le problème de données perdues au
redémarrage, sans avoir besoin d'un disque persistant payant : la base
Postgres gratuite de Render suffit pour un usage paroissial normal.

Le fichier `render.yaml` fourni configure automatiquement **le service web
et la base de données** ensemble.

---

## 1. Mettre le code sur GitHub

```bash
cd church-site
git init
git add .
git commit -m "Site paroisse Sainte Famille (avec base PostgreSQL)"
```

Créez un dépôt vide sur [github.com/new](https://github.com/new), puis :

```bash
git remote add origin https://github.com/VOTRE-COMPTE/eglise-sainte-famille.git
git branch -M main
git push -u origin main
```

---

## 2. Déployer sur Render via Blueprint (recommandé)

1. Créez un compte sur [render.com](https://render.com) et connectez votre compte GitHub.
2. **New +** → **Blueprint**.
3. Sélectionnez votre dépôt. Render détecte `render.yaml` automatiquement et
   propose de créer **deux ressources** :
   - Le service web `eglise-sainte-famille-bingerville`
   - La base `paroisse-db` (plan **Free**)
4. Validez. Render crée la base, puis le service web, et relie
   automatiquement `DATABASE_URL` entre les deux (déjà configuré dans
   `render.yaml`, rien à faire manuellement).
5. Au premier démarrage, le serveur crée automatiquement les tables et un
   compte admin par défaut (`admin` / `admin123`).

⚠️ **Limite du plan Postgres gratuit de Render** : la base gratuite expire
au bout de **90 jours** et doit être recréée (ou passée en payant, ~7$/mois)
pour un usage durable. Pour un vrai site en production, prévoyez de passer
sur le plan payant avant l'expiration — Render vous prévient par e-mail à
l'avance.

### Déploiement manuel (si vous préférez ne pas utiliser Blueprint)

1. **New +** → **PostgreSQL** → nommez-la `paroisse-db`, plan Free → **Create**.
2. Une fois créée, copiez sa **Internal Database URL**.
3. **New +** → **Web Service** → sélectionnez votre dépôt.
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - Dans **Environment**, ajoutez la variable `DATABASE_URL` avec l'URL copiée à l'étape 2.
4. **Create Web Service**.

---

## 3. Après le déploiement : sécuriser l'admin

1. Allez sur `https://VOTRE-SITE.onrender.com/admin.html`
2. Connectez-vous avec `admin` / `admin123`.
3. Onglet **Paramètres** → changez le mot de passe immédiatement.

---

## 4. Nom de domaine personnalisé (optionnel)

Dans le service Render → **Settings** → **Custom Domains**, ajoutez votre
nom de domaine et suivez les instructions DNS. Render fournit le certificat
HTTPS automatiquement.

---

## Résumé des variables d'environnement

| Variable       | Rôle                                                        |
|----------------|---------------------------------------------------------------|
| `PORT`         | Port d'écoute (défini automatiquement par Render)             |
| `DATABASE_URL` | Chaîne de connexion PostgreSQL (fournie par `render.yaml`)     |
| `NODE_ENV`     | `production` active le cookie de session sécurisé              |
