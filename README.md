# Amplify Vastgoed

Platform voor de Marokkaanse vastgoedsector: panden, personen, mandaten en (later) leads, transacties, beheer en samenwerking tussen bemiddelaars.

Dit is **etappe 1a: de databasekern**. De apps (`apps/desk`, `apps/pages`) komen in 1b en 1c.

## Wat er staat

| Onderdeel | Status |
|---|---|
| Organisaties, leden en rollen (owner, manager, agent, viewer) | klaar |
| Personen, panden, betrokkenen per pand, mandaten | klaar |
| Onveranderlijke geschiedenis (aanmaken, status, prijs, "laatst bevestigd") | klaar |
| Beveiliging per organisatie (RLS + samengestelde foreign keys) | klaar |
| Tests (31 controles in een SQL-bestand) | klaar |
| Desk-app voor makelaars | etappe 1b |
| Publieke pandpagina's | etappe 1c |

## Ontwerpkeuzes

- Elke rij hoort bij precies een organisatie; verwijzen over organisaties heen kan niet.
- Bedragen in centimes. Panden worden nooit verwijderd (status `withdrawn`).
- Delen tussen organisaties (Amplify Network) bestaat bewust nog niet.

## Opzetten (eenmalig)

1. Maak een nieuw Supabase-project (regio Frankfurt, eu-central-1). Gebruik een apart project, niet dat van posamplify.
2. Supabase > SQL Editor: plak de inhoud van `supabase/migrations/20261027000100_core.sql` en klik Run.
3. Test: plak `supabase/tests/01_core.test.sql` en klik Run. Je krijgt altijd een rode melding; die bevat het resultaat (`TESTRESULTAAT: 31 geslaagd, 0 mislukt` is goed). Alle testgegevens worden automatisch teruggedraaid.
