# Amplify Vastgoed

Platform voor de Marokkaanse vastgoedsector: panden, personen, mandaten en (later) leads, transacties, beheer en samenwerking tussen bemiddelaars.

Stand: **etappe 1 is afgerond** (1a t/m 1l); etappe 2 is begonnen met **2a** (deals met commissie) **2b** (WhatsApp-herinnering voor de klant en dagoverzicht voor het team) **2c** (rapport voor de eigenaar per pand) en **2d** (deals exporteren naar Excel) **2e** (leads en panden exporteren), **2f** (eigenaarsupdate via WhatsApp) en **2g** (databasetest voor deals) **2h** (documenten bij een deal) en **3a** (huurovereenkomsten, begin van etappe 3). Een vastgoedkantoor kan nu werken met panden, personen, mandaten, leads, bezichtigingen, taken en team, in het Frans, Arabisch en Engels; panden online zetten en delen via WhatsApp; en heeft een plan (30 dagen proef, daarna betaald of alleen-lezen).

Gebouwd per onderdeel: **1a** databasekern, **1b** desk-app (panden, personen, mandaten, leads, bezichtigingen, team, taken, Today), **1c** publieke pandpagina's, **1d** foto's, **1e** Frans en Arabisch, **1f** panden naar een lead sturen via WhatsApp, **1g** contacten importeren, **1h** eigen adresnaam, **1i** Overview, **1j** eerste stappen, **1k** automatische taak bij aflopende mandaten, **1l** plan per kantoor.

## Wat er staat

| Onderdeel | Status |
|---|---|
| Organisaties, leden en rollen (owner, manager, agent, viewer) | klaar |
| Personen, panden, betrokkenen per pand, mandaten | klaar |
| Onveranderlijke geschiedenis (aanmaken, status, prijs, "laatst bevestigd") | klaar |
| Beveiliging per organisatie (RLS + samengestelde foreign keys) | klaar |
| Tests (31 + 13 + 30 controles in drie SQL-bestanden; taken zijn apart getest) | klaar |
| Desk-app: inloggen, kantoor aanmaken, panden tonen en toevoegen (EN) | klaar (1b-1) |
| Desk-app: pand openen en wijzigen, personen, leads | klaar (1b-2 t/m 1b-4) |
| Desk-app: bezichtigingen (afspraak tussen lead en pand, met uitkomst) | klaar (1b-5) |
| Desk-app: team (leden toevoegen, rol wijzigen, verwijderen) | klaar (1b-5) |
| Desk-app: taken (deadline, verantwoordelijke, koppeling aan lead of pand) en Today-scherm | klaar (1b-6) |
| Publieke pandpagina's (`apps/pages`): kantoorpagina, pandpagina, WhatsApp-knop, FR/AR/EN, voorbeeld bij delen | klaar (1c) |
| Foto's: uploaden in de desk (verkleind in de browser), omslagfoto, galerij op de pandpagina, foto in lijst en WhatsApp-voorbeeld | klaar (1d) |
| Desk-app in Frans en Arabisch (RTL), met taalkeuze FR / AR / EN | klaar (1e) |
| Desk-app: passende panden met één klik naar een lead sturen via WhatsApp (taal van de klant, met links) | klaar (1f) |
| Desk-app: contacten importeren uit CSV of Excel, met controle op dubbelen | klaar (1g) |
| Eigen adresnaam voor de kantoorpagina, oude links blijven werken | klaar (1h) |
| Desk-app: tabblad Overview voor eigenaar en manager (panden per status, nieuwe leads, bezichtigingen, verlopen en bijna verlopen mandaten) | klaar (1i) |
| Desk-app: kaart “Eerste stappen” op Today (contactgegevens, eerste pand, pand online, eerste lead, collega uitnodigen); verdwijnt vanzelf of met een kruisje | klaar (1j) |
| Automatische taak “Renew mandate” (database + Today): bij een mandaat dat binnen 30 dagen afloopt of al verlopen is; komt niet terug als je hem sluit | klaar (1k) |
| Plan per kantoor (`trial` 30 dagen of `active` betaald), alleen-lezen na de laatste dag, limieten voor leden en panden, tabblad Plan en banner (database + desk); jij activeert met `activate_plan` | klaar (1l) |
| Deals (transacties): bod, akkoord, getekend, betaald of niet doorgegaan; prijs en commissie; totalen verwacht, te innen en binnen; pand en lead volgen vanzelf (database + desk, tabblad Deals, ook te starten vanuit een bezichtiging met uitkomst "offer made") | klaar (2a) |
| WhatsApp-berichten met één klik (geen automatische verzending): herinnering van een bezichtiging aan de klant (FR/AR/EN) en "Share briefing" op Today voor het team (taken, bezichtigingen, leads om te bellen) | klaar (2b) |
| Rapport voor de eigenaar per pand (knop "Owner report" in het pand): pand, mandaat, bezichtigingen en offertes op één pagina, afdrukken of opslaan als PDF; zonder namen van geïnteresseerden en zonder commissie. Geen SQL nodig | klaar (2c) |
| Deals exporteren naar Excel (CSV met ; en accenten, volgt het gekozen filter), geen SQL nodig | klaar (2d) |
| Leads en panden exporteren naar Excel (CSV, volgt filter en zoekopdracht; telefoonnummers behouden hun 0), geen SQL nodig | klaar (2e) |
| Eigenaarsupdate via WhatsApp met één klik, vanuit het eigenaarsrapport (aantallen, link naar de pagina als die online staat; taal van de app), geen SQL nodig | klaar (2f) |
| Databasetest voor deals (fasen, gevolgen voor pand en lead, rechten, alleen-lezen na afloop plan) | klaar (2g) |
| Documenten bij een deal (contract, mandaat, betaalbewijs; PDF of afbeelding tot 10 MB, max. 20): prive opslag, alleen eigenaar, manager en agent zien ze, verwijderen alleen eigenaar en manager, geen id-kaarten (database + desk) | klaar (2h) |
| Huurovereenkomsten (etappe 3a): huurder, pand, maandhuur, borg, start- en einddatum, betaaldag; tabblad Rentals met totalen en waarschuwing bij bijna afgelopen; een lopende overeenkomst zet het pand op verhuurd, beeindigen zet het weer beschikbaar (database + desk) | klaar (3a) |
| Desk-app: pagina aan/uit per pand, deellink, kantoorgegevens voor de publieke pagina | klaar (1c) |

Gebruikershandleiding voor het team (Frans, één pagina): `docs/guide-fr.md`.

## Buiten etappe 1 (bewust nog niet gebouwd)

Samenwerking tussen kantoren (Amplify Network), automatische betaling, en automatische meldingen (zelf versturen vanuit de app kan al via WhatsApp; automatisch vraagt een WhatsApp Business-koppeling).

## Ontwerpkeuzes

- Elke rij hoort bij precies een organisatie; verwijzen over organisaties heen kan niet.
- Bedragen in centimes. Panden worden nooit verwijderd (status `withdrawn`).
- Delen tussen organisaties (Amplify Network) bestaat bewust nog niet.
- Publieke pagina's: bezoekers hebben geen toegang tot tabellen, alleen tot twee databasefuncties (`public_office_page`, `public_property_page`). Een pand is alleen zichtbaar als de pagina bewust aanstaat, het pand beschikbaar/gereserveerd (of verhuurd/verkocht) is, en er een actief mandaat is. Het exacte adres, personen, mandaten en interne notities staan er nooit in.

## Opzetten (eenmalig)

1. Maak een nieuw Supabase-project (regio Frankfurt, eu-central-1). Gebruik een apart project, niet dat van posamplify.
2. Supabase > SQL Editor: plak de inhoud van `supabase/migrations/20261027000100_core.sql` en klik Run.
3. Test: plak `supabase/tests/01_core.test.sql` en klik Run. Je krijgt altijd een rode melding; die bevat het resultaat (`TESTRESULTAAT: 31 geslaagd, 0 mislukt` is goed). Alle testgegevens worden automatisch teruggedraaid.

4. Etappe 1b-4: plak `supabase/migrations/20261027000200_leads.sql` en klik Run. Test daarna met `supabase/tests/02_leads.test.sql`
   (`TESTRESULTAAT: 13 geslaagd, 0 mislukt` is goed).
5. Etappe 1b-5: plak `supabase/migrations/20261027000300_viewings_team.sql` en klik Run. Test daarna met `supabase/tests/03_viewings_team.test.sql`
   (`TESTRESULTAAT: 30 geslaagd, 0 mislukt` is goed).
6. Etappe 1b-6: plak `supabase/migrations/20261027000400_tasks.sql` en klik Run.
7. Etappe 1c: plak `supabase/migrations/20261027000500_public_pages.sql` en klik Run.
8. Etappe 1d: `20261027000600_photos.sql`, etappe 1h: `20261027000700_office_slug.sql`.
9. Etappe 1k: plak `supabase/migrations/20261027000800_mandate_tasks.sql` en klik Run. Test daarna met `supabase/tests/04_mandate_tasks.test.sql` (`TESTRESULTAAT: 17 geslaagd, 0 mislukt` is goed).

10. Etappe 1l: plak `supabase/migrations/20261027000900_subscription.sql` en klik Run. Test daarna met `supabase/tests/05_subscription.test.sql` (`TESTRESULTAAT: 33 geslaagd, 0 mislukt` is goed). Bestaande kantoren krijgen vandaag + 30 dagen proef.

11. Etappe 2a: plak `supabase/migrations/20261027001000_deals.sql` en klik Run. Test daarna met `supabase/tests/06_deals.test.sql` (`TESTRESULTAAT: 26 geslaagd, 0 mislukt` is goed).
12. Etappe 2h: plak `supabase/migrations/20261027001100_deal_documents.sql` en klik Run. Test daarna met `supabase/tests/07_deal_documents.test.sql` (`TESTRESULTAAT: 22 geslaagd, 0 mislukt` is goed). Er komt een prive opslagbucket `deal-documents` bij; die is niet openbaar.
13. Etappe 3a: plak `supabase/migrations/20261027001200_leases.sql` en klik Run. Test daarna met `supabase/tests/08_leases.test.sql` (`TESTRESULTAAT: 24 geslaagd, 0 mislukt` is goed).

14. Etappe 3b: plak `supabase/migrations/20261027001300_rent_payments.sql` en klik Run. Test daarna met `supabase/tests/09_rent_payments.test.sql` (`TESTRESULTAAT: 22 geslaagd, 0 mislukt` is goed).

15. Etappe 3c: plak `supabase/migrations/20261027001400_maintenance.sql` en klik Run.

16. Etappe 3d: geen SQL, alleen de app.

17. Etappe 4a: geen SQL, alleen de app.

### Een kantoor op betaald zetten of verlengen

Plak in de SQL-editor (slug van het kantoor, laatste dag, en optioneel max. leden en max. panden):

```sql
select public.activate_plan('mijn-kantoor', '2027-11-30');
select public.activate_plan('mijn-kantoor', '2027-11-30', 10, 250);
```

Na de laatste dag is een kantoor alleen-lezen; de publieke pandpagina's blijven online. De standaardlimieten (5 leden, 100 panden) staan in de migratie en zijn voorlopig.

## De apps publiceren

- Desk (werkruimte voor je team): zie `apps/desk/README.md`.
- Publieke pandpagina's (voor klanten): zie `apps/pages/README.md`. Dat is een tweede Cloudflare Pages-project vanuit dezelfde repo.
