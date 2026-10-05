# TaskManager (nouvelle app)

Gestionnaire de tâches local-first : projets en **roadmap** façon roadmap.sh (étapes reliées par leurs dépendances), **ressources** par étape, vue **Tâches du jour** triée par heure, et **rappels** à l'heure de chaque tâche.

```bash
cd app
npm install
npm run dev          # http://localhost:5173
npm test             # tests de la logique (dépendances, rappels, vue du jour)
npm run build        # build de production dans dist/
npm run build:single # un seul fichier HTML autonome dans dist-single/
```

État actuel (lots 0 à 2 du plan, plus des rappels côté navigateur) :
- données stockées dans le navigateur (IndexedDB), pas encore de compte ni de synchronisation ;
- les rappels s'affichent dans l'app et en notification système si elle est autorisée, **tant que l'onglet est ouvert**. Les notifications application fermée arrivent avec le lot 5 (Web Push + planificateur serveur).
