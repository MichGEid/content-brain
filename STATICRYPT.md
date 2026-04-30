# Content Brain — StaticCrypt-oppsett

Dashbordet er låst med passord før det publiseres til GitHub Pages.
Kildekoden inlines og krypteres som én bundle slik at verken HTML, CSS
eller seed-data kan hentes uten passord.

## Slik fungerer flyten

```
main branch (kilde)              GitHub Pages (publisert)
─────────────────────            ──────────────────────────
index.html                       dist/index.html  ← kryptert
style.css           ─ push ─►    (alt annet inlinet og
seed.js             Action       låst bak passordet)
app.js
scripts/build.js
```

På hver `git push` til `main` kjører GitHub Action `deploy.yml`:

1. Henter koden
2. Kjører `npm install`
3. Kjører `npm run build` — bundler alt og krypterer
4. Sjekker at `SEED_POSTS` ikke finnes i klartekst i `dist/index.html`
5. Deployer `dist/` til GitHub Pages

## Førstegangsoppsett (gjør én gang)

### 1. Velg passord

Et som du husker, men ikke trivielt. Lagre det i 1Password / Apple
Keychain. Det skal aldri inn i et commit eller en chat.

### 2. Legg passordet inn som GitHub Secret

1. Gå til `https://github.com/MichGEid/content-brain/settings/secrets/actions`
2. Klikk **New repository secret**
3. Name: `STATICRYPT_PASSWORD`
4. Secret: ditt valgte passord
5. **Add secret**

### 3. Slå på GitHub Pages med Actions som kilde

1. Gå til `https://github.com/MichGEid/content-brain/settings/pages`
2. Under **Build and deployment** → **Source**: velg **GitHub Actions**
3. Lagre

### 4. Test lokalt før første push

```bash
cd "/Users/nomei1/Documents/Claude/Projects/Content Brain"
npm install
STATICRYPT_PASSWORD="ditt-passord" npm run build
npm run serve:dist
# Åpne http://localhost:8080 — skal be om passord
```

Hvis du ikke vil sette miljøvariabel:

```bash
node scripts/build.js --password "ditt-passord"
```

### 5. Push til main

```bash
git add .
git commit -m "Add StaticCrypt encryption pipeline"
git push origin main
```

Følg med på `https://github.com/MichGEid/content-brain/actions` — workflow
skal være grønn etter ca. 1 minutt.

### 6. Verifiser at Pages krever passord

Åpne `https://michgeid.github.io/content-brain/` (eller hva URLen din
er — sjekk under Settings → Pages). Du skal se en låseskjerm.

## Daglig bruk

Du jobber som før — endrer `index.html`, `app.js`, `style.css` eller
`seed.js`, committer, pusher. Encryption skjer automatisk.

For lokal preview av råversjonen (uten kryptering) — bare åpne
`index.html` i nettleseren som du gjør i dag.

## Bytte passord

1. Oppdater `STATICRYPT_PASSWORD` i GitHub Secrets
2. Push en hvilken som helst commit til `main` (eller kjør workflow
   manuelt fra Actions-fanen via **Run workflow**)
3. Den nye krypteringen overskriver den gamle på Pages

Alle som har bookmarka URLen må skrive nytt passord neste gang.

## Feilsøking

| Symptom | Sjekk |
|---|---|
| Action feiler med "Mangler GitHub secret" | Secret heter ikke `STATICRYPT_PASSWORD` (case-sensitiv) |
| `npm run build` feiler lokalt | Kjørte du `npm install` først? Er du i prosjekt-roten? |
| Sanity check faller på `SEED_POSTS` | Bundling fungerte, kryptering ikke. Sjekk staticrypt-output i Action-loggen |
| Pages viser 404 | Pages er ikke satt til "GitHub Actions" som source — se trinn 3 over |
| Låseskjermen vises, men galt passord godtas | Du har sannsynligvis flere passord-versjoner cachet. Hard reload (Cmd+Shift+R) |

## Hva blir publisert

- ✅ `dist/index.html` — kryptert HTML med staticrypt-låseskjerm
- ❌ `index.html` (kilden) — aldri publisert
- ❌ `style.css`, `seed.js`, `app.js` — aldri publisert som egne filer

Innholdet ligger inlinet og kryptert inne i `dist/index.html`.

## Merk om `main`-branchen

Hvis repoet er **public**, kan hvem som helst lese `seed.js`, `app.js`
osv. direkte på GitHub. StaticCrypt beskytter kun den **publiserte**
URLen.

For full privacy: gjør repoet privat (Settings → General → Danger Zone
→ Change visibility → Make private). GitHub Pages fra private repos
krever Pro/Team-abonnement.
