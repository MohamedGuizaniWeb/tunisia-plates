# Matrik — version live Tunisie

Cette version utilise le même endpoint RegCheck qui a été testé avec succès avec `818TU223`.

## Ce qui fonctionne
- Plaques tunisiennes normales : `223 تونس 818` est convertie en `818TU223` côté serveur.
- Résultat réel : marque, modèle, année, carburant, variante, moteur, type et puissance fiscale si RegCheck les retourne.
- RS est présent dans l'interface. Le code utilise `RS` comme représentation latine de `ن ت`; le format exact RS doit être confirmé avec un vrai test RS avant lancement public.
- Aucun faux kilométrage : la partie kilométrage reste désactivée tant qu'une vraie source historique n'est pas connectée.

## Mise en ligne sur Vercel
1. Crée/importez un projet Vercel avec ce dossier.
2. Ouvrez **Settings -> Environment Variables**.
3. Ajoutez :
   - Name: `REGCHECK_USERNAME`
   - Value: votre nom d'utilisateur RegCheck
4. Redeployez le projet.
5. Ouvrez le site et testez d'abord `223 تونس 818` (l'exemple RegCheck `818TU223`).

Ne mettez jamais le username RegCheck dans `index.html` : sinon les visiteurs peuvent le récupérer et consommer vos crédits directement.
