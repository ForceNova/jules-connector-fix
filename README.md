# Jules Connector Fix

## Problème identifié

Le connecteur Jules dans NudgeBot a un bug dans l'outil `run_jules_session` :

### Symptôme
L'outil échoue avec l'erreur : `"Could not get source '[nom-du-dépôt]'"`

### Cause racine
Le SDK Jules utilise par défaut `requireApproval: true`, mais l'outil n'attend pas l'approbation du plan avant d'essayer de streamer les activités. Cela crée un état incohérent.

### Solution
Ajouter `requireApproval: false` dans la configuration de la session pour que Jules travaille immédiatement sans attendre l'approbation manuelle.

## Fichiers à modifier

### `src/lib/agent/tools.ts` (ou équivalent)
```typescript
// Ligne à modifier dans la fonction runJulesSession
const session = await jules.createSession({
  prompt,
  source: `sources/github/${owner}/${repo}`,
  githubRepoContext: {
    startingBranch: baseBranch,
  },
  automationMode: autoPr ? 'AUTO_CREATE_PR' : 'NO_AUTOMATION',
  title: prompt.substring(0, 100), // titre basé sur le prompt
  requireApproval: false, // ← AJOUTER CETTE LIGNE
});
```

## Test de la correction

1. **Test unitaire** : Vérifier que la session se crée sans erreur
2. **Test d'intégration** : Lancer une session réelle avec un dépôt test
3. **Test de PR** : Vérifier que la PR est créée automatiquement

## Impact
- Résout le bug de connexion
- Améliore l'expérience utilisateur (pas d'attente d'approbation)
- Compatible avec l'API Jules existante