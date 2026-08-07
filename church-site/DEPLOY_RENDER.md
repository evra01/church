# Déployer le site sur Render

## 0. Point important : la persistance des données

Le site stocke ses données (messes, dons, articles, groupes, photos) dans un
fichier `data/db.json` et dans `public/images/`. Sur la plupart des
hébergeurs comme Render, le disque **est effacé à chaque redéploiement et
parfois à chaque redémarrage** — sauf si vous ajoutez un **disque
persistant**.

- **Sans disque persistant** (plan gratuit) : parfait pour tester le site
  rapidement, mais toute donnée ajoutée depuis l'admin (dons, nouveaux
  articles/groupes, photos) sera perdue au prochain redéploiement.
- **Avec disque persistant** (plan payant "Starter" à partir de ~7 $/mois) :
  les données sont conservées durablement. **Recommandé pour un vrai site en
  production.**

Le code est déjà prêt pour les deux cas grâce aux variables d'environnement
`DATA_DIR` et `UPLOADS_DIR`.

---

## 1. Mettre le code sur GitHub

Render déploie depuis un dépôt Git. Depuis le dossier `church-site` :

```bash
cd church-site
git init
git add .
git commit -m "Site paroisse Sainte Famille"
```

Créez un dépôt vide sur [github.com/new](https://github.com/new), puis :

```bash
git remote add origin https://github.com/VOTRE-COMPTE/eglise-sainte-famille.git
git branch -M main
git push -u origin main
```

---

## 2. Déployer sur Render

### Option A — Déploiement rapide (plan gratuit, sans disque persistant)

1. Créez un compte sur [render.com](https://render.com) et connectez votre compte GitHub.
2. **New +** → **Web Service** → sélectionnez votre dépôt.
3. Renseignez :
   - **Name** : `eglise-sainte-famille-bingerville` (ou ce que vous voulez)
   - **Runtime** : Node
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Instance Type** : Free
4. Cliquez **Create Web Service**. Render installe, build et démarre le site (2-3 min).
5. Votre site est en ligne à l'URL fournie, du type `https://eglise-sainte-famille-bingerville.onrender.com`.

⚠️ Avec ce plan, pensez à **exporter régulièrement `data/db.json`** si vous
y ajoutez du contenu important, car il peut être réinitialisé.

### Option B — Déploiement avec disque persistant (recommandé)

Le fichier `render.yaml` fourni configure automatiquement le service **et**
le disque persistant.

1. Sur Render : **New +** → **Blueprint**.
2. Sélectionnez votre dépôt GitHub. Render détecte `render.yaml` automatiquement.
3. Vérifiez les paramètres proposés (plan **Starter**, disque de 1 Go monté
   sur `/var/data`) puis validez.
4. Render crée le service et le disque, et déploie automatiquement.

Les variables d'environnement `DATA_DIR=/var/data` et
`UPLOADS_DIR=/var/data/images` sont déjà configurées dans `render.yaml` :
elles indiquent au serveur d'écrire ses données sur le disque persistant
plutôt que dans le code du dépôt.

---

## 3. Après le déploiement : sécuriser l'admin

Le compte admin par défaut est `admin` / `admin123`. **Changez ce mot de
passe dès la mise en ligne** :

1. Allez sur `https://VOTRE-SITE.onrender.com/admin.html`
2. Connectez-vous avec les identifiants par défaut.
3. Onglet **Paramètres** → changez le mot de passe.

---

## 4. Nom de domaine personnalisé (optionnel)

Dans le service Render → **Settings** → **Custom Domains**, ajoutez votre
nom de domaine (ex : `www.paroisse-bingerville.org`) et suivez les
instructions pour configurer le DNS chez votre registrar. Render fournit le
certificat HTTPS automatiquement.

---

## Résumé des variables d'environnement

| Variable      | Rôle                                              | Défaut sans variable      |
|---------------|----------------------------------------------------|---------------------------|
| `PORT`        | Port d'écoute (défini automatiquement par Render)  | 3000                      |
| `DATA_DIR`    | Dossier où est stocké `db.json`                    | `./data` (dans le dépôt)  |
| `UPLOADS_DIR` | Dossier où sont stockées les photos uploadées      | `./public/images`         |
| `NODE_ENV`    | `production` active le cookie de session sécurisé  | non défini                |
