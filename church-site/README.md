# Quasi-Paroisse Sainte Famille de Nazareth (Paris Village, Bingerville) — Site + Serveur + Admin

Site web pour une église : page publique (informations, demande de messe à
distance, dons/cotisations en ligne, articles) + serveur Node.js/Express +
tableau de bord d'administration.

## 1. Installer et lancer en local

Prérequis : [Node.js](https://nodejs.org) version 18 ou plus (à installer une seule fois).

### Option rapide (recommandée)

Après avoir installé Node.js, double-cliquez simplement sur :

- **`demarrer-mac-linux.sh`** si vous êtes sur Mac ou Linux
- **`demarrer-windows.bat`** si vous êtes sur Windows

Le script installe automatiquement ce qu'il faut la première fois, démarre le
serveur, et ouvre votre navigateur sur le site.

### Option manuelle

```bash
cd church-site
npm install
npm start
```

Le site est alors disponible sur :

- Site public : http://localhost:3000
- Espace admin : http://localhost:3000/admin.html

**Identifiants admin par défaut :** `admin` / `admin123`
→ Changez ce mot de passe dès la première connexion, dans *Paramètres* de
l'espace admin.

## 2. Structure du projet

```
church-site/
├─ server.js              Serveur Express + API REST
├─ data/db.json            Base de données (fichier JSON, créé/modifié automatiquement)
└─ public/
   ├─ index.html            Site public
   ├─ admin.html            Tableau de bord admin
   ├─ css/style.css         Styles du site public
   ├─ css/admin.css         Styles du tableau de bord
   └─ js/site.js, js/admin.js   Logique front-end (appels à l'API)
```

Les données (demandes de messe, dons, articles) sont stockées dans
`data/db.json`. C'est volontairement simple (pas de base de données à
installer) — pour un usage avec plus de trafic, on migrerait vers PostgreSQL
ou SQLite, mais ce fichier suffit largement pour une paroisse.

## 3. Ce que fait déjà le serveur

- **Demandes de messe** : formulaire public → enregistrées → visibles et
  modifiables (en attente / confirmée / refusée) dans l'admin.
- **Dons / cotisations** : formulaire public → enregistrés → visibles dans
  l'admin avec un total et un total du mois.
- **Articles** : gérés entièrement depuis l'admin (créer, modifier,
  publier/dépublier, supprimer) et affichés automatiquement sur le site
  public.
- **Authentification admin** : mot de passe haché (bcrypt), session sécurisée
  par cookie (httpOnly).

## 4. Ce qu'il reste à brancher pour la production

Ce projet enregistre bien les demandes et les dons, mais deux points
demandent un service externe pour être pleinement fonctionnels en réel :

1. **Paiement réel des dons** : aujourd'hui le formulaire de don enregistre
   l'intention de don, mais aucun argent ne circule. Pour un vrai paiement,
   il faut intégrer un prestataire comme **HelloAsso** (gratuit et pensé
   pour les associations/paroisses françaises), Stripe ou PayPal.
2. **Envoi d'e-mails automatiques** (confirmation de messe, reçu fiscal de
   don) : il faut un service comme Resend, SendGrid ou Brevo, avec vos
   identifiants API.

## 5. Mettre le site en ligne

Pour que le site soit accessible en dehors de votre ordinateur, il faut
l'héberger. Options simples et peu coûteuses : Render, Railway, ou un VPS
(OVH, Hetzner). Le projet est un serveur Node.js standard : `npm install`
puis `npm start` sur la machine d'hébergement.

## 6. Sécurité — à faire avant mise en ligne publique

- Changez le mot de passe admin par défaut.
- Servez le site en HTTPS (nécessaire pour que le cookie de session
  fonctionne correctement en production).
- Faites des sauvegardes régulières de `data/db.json`.
