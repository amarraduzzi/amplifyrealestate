# apps/desk — Amplify Real Estate (werkruimte voor makelaars)

React + Vite + Tailwind v3, in dezelfde stijl als de andere Amplify-apps (navy en groen, Plus Jakarta Sans / Montserrat / Archivo).

## Wat er in etappe 1b-1 in zit (Engels)

- Inloggen en account aanmaken
- "Create your office": eerste kantoor aanmaken (via `create_organization`)
- Lijst met panden: tabs per status, zoeken, "Confirmed X days ago" (oranje na 30 dagen)
- Pand toevoegen (formulier), alleen voor eigenaar, manager en agent; een viewer kan alleen lezen

Nog niet: pand openen/wijzigen, status wijzigen, personen, leads. Dat komt in 1b-2.

## Talen

Engels is de basis: de Engelse tekst is de sleutel, zoals bij de andere apps.
Frans en Arabisch (rechts naar links) komen later: vul `src/lib/i18n/fr.ts` en `src/lib/i18n/ar.ts`
(`'English text': 'vertaling'`). Wat nog niet vertaald is, blijft Engels. Testen kan met `?lang=fr` of `?lang=ar`.

## Cloudflare Pages (nieuw project, aparte repo)

- Framework preset: geen
- Build command: `npm run build -w @vastgoed/desk`
- Build output directory: `apps/desk/dist`
- Environment variables: `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY` (Supabase > Project Settings > API)

## Supabase-instellingen

- Authentication > Sign In / Providers > Email > **Confirm email**: uit zolang er geen eigen e-mailserver (SMTP) is ingesteld
- Authentication > URL Configuration: zet bij **Site URL** het adres van de Cloudflare-site (bijvoorbeeld `https://xxx.pages.dev`)

## Lokaal draaien

```
cp apps/desk/.env.example apps/desk/.env.local   # vul URL en anon key in
npm install
npm run dev:desk
npm run typecheck                                 # typecontrole
```
