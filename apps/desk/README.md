# apps/desk — Amplify Real Estate (werkruimte voor makelaars)

React + Vite + Tailwind v3, in dezelfde stijl als de andere Amplify-apps (navy en groen, Plus Jakarta Sans / Montserrat / Archivo).

## Wat er in etappe 1b-1 tot en met 1b-4 in zit (Engels)

- Inloggen en account aanmaken
- "Create your office": eerste kantoor aanmaken (via `create_organization`)
- Lijst met panden: tabs per status, zoeken, "Confirmed X days ago" (oranje na 30 dagen)
- Pand toevoegen (formulier), alleen voor eigenaar, manager en agent; een viewer kan alleen lezen
- Pand openen (klik op een kaart): alle gegevens, status wijzigen, prijs en beschikbaarheid bevestigen
- Pand wijzigen (knop Edit). Een nieuwe prijs of een nieuwe status telt ook als bevestiging
- Geschiedenis per pand: aangemaakt, statuswijzigingen, prijswijzigingen en bevestigingen (komt uit de database, kan niet aangepast worden)

- Personen bij een pand: eigenaar, vertegenwoordiger, huurder, koper of contact (bestaand of nieuw), met bel-, WhatsApp- en mailknop. Loskoppelen laat de persoon in de contacten staan
- Mandaat per pand: grondslag (schriftelijk, mondeling, eigenaar zelf, niet geverifieerd), wie het gaf, geldig van/tot, bewijsnotitie. Een mandaat voorbij de einddatum telt als verlopen; zonder actief mandaat staat er een waarschuwing. Intrekken kan met één klik

- Leads (tab "Leads"): een persoon met een zoekopdracht (kopen of huren, budget, type, stad, wijken, slaapkamers, oppervlakte, gemeubileerd). Status new / active / viewing / won / lost, "Contacted today" en een oranje signaal na 14 dagen zonder contact
- Passende panden: bij elke lead die nog zoekt staan de beschikbare panden die passen. Andersom staat bij een beschikbaar pand welke leads er een zoeken, met bel- en WhatsApp-knop. De koppeling wordt berekend (`src/lib/matching.ts`), er wordt niets dubbel opgeslagen

Nog niet: bezichtigingen en afspraken, taken, teamleden uitnodigen. Dat komt in 1b-5.
Voor 1b-2 en 1b-3 is geen nieuwe SQL nodig. Voor 1b-4 wel: `supabase/migrations/20261027000200_leads.sql` (nieuwe tabel `leads`).

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
