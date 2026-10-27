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

## Etappe 1c: publieke pandpagina's

- Op een pand staat een blok **Public page**: aanzetten, uitzetten, link kopiëren, openen en delen via WhatsApp. De taal van de link (FR, AR of EN) kies je zelf, zodat de klant de pagina in zijn eigen taal opent
- Aanzetten kan alleen voor een beschikbaar of gereserveerd pand met een **actief mandaat**. Verloopt het mandaat, of wordt het pand concept of ingetrokken, dan verdwijnt de pagina vanzelf (bij concept/ingetrokken gaat hij ook echt uit en moet je hem later bewust opnieuw aanzetten)
- Tab **Team** > **Public pages**: WhatsApp-nummer, telefoon en e-mail van je kantoor (komen op elke publieke pagina) en de link naar je kantooroverzicht. Alleen eigenaar en manager kunnen dit wijzigen
- Aan- en uitzetten komt in de geschiedenis van het pand
- Voor 1c is `supabase/migrations/20261027000500_public_pages.sql` nodig

Stel in Cloudflare (en in `.env.local`) ook `VITE_PUBLIC_SITE_URL` in: het adres van de publieke site, zonder slash aan het eind (bijvoorbeeld `https://pandpagina.pages.dev`). Zonder die variabele werkt alles, maar de app kan geen links tonen.

## Etappe 1d: foto's

- Op een pand staat een blok **Photos**: meerdere foto's tegelijk toevoegen (maximaal 20), omslagfoto kiezen (ster), verwijderen (prullenbak). De eerste foto wordt automatisch de omslag
- Elke foto wordt in de browser verkleind (lange zijde 1600 px, JPEG) plus een klein voorbeeld van 480 px, zodat de publieke pagina ook op mobiel data snel laadt
- Een viewer ziet de foto's maar kan niets wijzigen
- Foto's staan in Supabase Storage (bucket `property-photos`, wordt door de SQL aangemaakt). Ze verschijnen alleen op de publieke pagina als die pagina online is
- Voor 1d is `supabase/migrations/20261027000600_photos.sql` nodig. Er zijn geen nieuwe variabelen

## Etappe 1f: passende panden naar een lead sturen

- In een lead staan bij **Matching properties** nu aanvinkvakjes (standaard de eerste 6 aangevinkt, maximaal 6 per bericht) en de knop **Send … on WhatsApp**
- Het bericht wordt in de taal van de klant gemaakt (FR, AR of EN, los van de taal van de app): begroeting met de voornaam, per pand titel, prijs, wijk en stad, en de link naar de publieke pagina. Een pand zonder publieke pagina gaat als tekst mee, zonder link
- De chat opent met het WhatsApp-nummer van de lead (anders telefoon); heeft de persoon geen nummer, dan kies je zelf het contact in WhatsApp. Het bericht wordt niet automatisch verstuurd: je kunt het eerst nalezen
- Geen SQL en geen nieuwe variabelen nodig (de links gebruiken `VITE_PUBLIC_SITE_URL`)

## Talen

De desk is er in Engels, Frans en Arabisch (rechts naar links). Rechtsboven (en op het inlogscherm) staat een keuze **FR / AR / EN**; de keuze wordt op dat apparaat onthouden. Testen kan ook met `?lang=fr` of `?lang=ar`.
De Engelse tekst is de sleutel: de vertalingen staan in `src/lib/i18n/fr.ts` en `ar.ts` (`'English text': 'vertaling'`). Een tekst zonder vertaling blijft Engels. Voeg je later een tekst toe, zet er dan de vertaling bij in beide bestanden.
De Franse en Arabische teksten zijn een zorgvuldige eerste versie: laat een moedertaalspreker ze één keer lezen. Meldingen die rechtstreeks uit de database komen (zeldzaam) kunnen Engels of Nederlands blijven.

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
