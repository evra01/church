#!/bin/bash
# Double-cliquez sur ce fichier (ou lancez "./demarrer-mac-linux.sh" dans un terminal)
# pour installer les dépendances si besoin et démarrer le site.

cd "$(dirname "$0")"

if [ ! -d "node_modules" ]; then
  echo "Première installation, merci de patienter quelques instants..."
  npm install
fi

echo ""
echo "=================================================="
echo "  Le site va démarrer sur http://localhost:3000"
echo "  L'administration est sur http://localhost:3000/admin.html"
echo "  Pour arrêter le serveur : fermez cette fenêtre ou faites Ctrl+C"
echo "=================================================="
echo ""

# Ouvre automatiquement le navigateur après un court délai
( sleep 2 && (open http://localhost:3000 2>/dev/null || xdg-open http://localhost:3000 2>/dev/null) ) &

npm start
