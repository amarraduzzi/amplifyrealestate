# Amplify Vastgoed

Platform voor de Marokkaanse vastgoedsector: panden, personen, mandaten en (later) leads, transacties, beheer en samenwerking tussen bemiddelaars.

Stand: **etappe 1a** (databasekern) en **1b-5** (desk-app: inloggen, kantoor aanmaken, panden, personen en mandaat per pand, leads met zoekopdracht en passende panden, bezichtigingen en teambeheer, in het Engels). Publieke pandpagina's (`apps/pages`) komen in 1c.

## Wat er staat

| Onderdeel | Status |
|---|---|
| Organisaties, leden en rollen (owner, manager, agent, viewer) | klaar |
| Personen, panden, betrokkenen per pand, mandaten | klaar |
| Onveranderlijke geschiedenis (aanmaken, status, prijs, "laatst bevestigd") | klaar |
| Beveiliging per organisatie (RLS + samengestelde foreign keys) | klaar |
| Tests (31 + 13 + 30 controles in drie SQL-bestanden) | klaar |
| Desk-app: inloggen, kantoor aanmaken, panden tonen en toevoegen (EN) | klaar (1b-1) |
| Desk-app: pand openen en wijzigen, personen, leads | klaar (1b-2 t/m 1b-4) |
| Desk-app: bezichtigingen (afspraak tussen lead en pand, met uitkomst) | klaar (1b-5) |
| Desk-app: team (leden toevoegen, rol wijzigen, verwijderen) | klaar (1b-5) |
| Frans en Arabisch (RTL) | later |
| Publieke pandpagina's | etappe 1c |

## Ontwerpkeuzes

- Elke rij hoort bij precies een organisatie; verwijzen over organisaties heen kan niet.
- Bedragen in centimes. Panden worden nooit verwijderd (status `withdrawn`).
- Delen tussen organisaties (Amplify Network) bestaat bewust nog niet.

## Opzetten (eenmalig)

1. Maak een nieuw Supabase-project (regio Frankfurt, eu-central-1). Gebruik een apart project, niet dat van posamplify.
2. Supabase > SQL Editor: plak de inhoud van `supabase/migrations/20261027000100_core.sql` en klik Run.
3. Test: plak `supabase/tests/01_core.test.sql` en klik Run. Je krijgt altijd een rode melding; die bevat het resultaat (`TESTRESULTAAT: 31 geslaagd, 0 mislukt` is goed). Alle testgegevens worden automatisch teruggedraaid.

4. Etappe 1b-4: plak `supabase/migrations/20261027000200_leads.sql` en klik Run. Test daarna met `supabase/tests/02_leads.test.sql`
   (`TESTRESULTAAT: 13 geslaagd, 0 mislukt` is goed).
5. Etappe 1b-5: plak `supabase/migrations/20261027000300_viewings_team.sql` en klik Run. Test daarna met `supabase/tests/03_viewings_team.test.sql`
   (`TESTRESULTAAT: 30 geslaagd, 0 mislukt` is goed).

## De app publiceren

Zie `apps/desk/README.md` (Cloudflare Pages en Supabase-instellingen).
