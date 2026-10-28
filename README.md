# Amplify Vastgoed

Platform voor de Marokkaanse vastgoedsector: panden, personen, mandaten en (later) leads, transacties, beheer en samenwerking tussen bemiddelaars.

Stand: **etappe 0 (repo compleet en demo-kantoor)** en **etappe 1 zijn afgerond**, en **6a (agenda)** **6c (nieuwe matches)** **6d (multi-posting)** **6e (leadformulier en bron)** **6f (facturen)** en **6g (kantoorwebsite)** staan erin; blok B is begonnen met **7a (eigenaarsportaal)** **7b (beheer en maandafrekening)** **7c (état des lieux)** **7d (quittances en huurverhoging)** en **7e (korte verhuur)**: blok B is af (1a t/m 1l); etappe 2 is begonnen met **2a** (deals met commissie) **2b** (WhatsApp-herinnering voor de klant en dagoverzicht voor het team) **2c** (rapport voor de eigenaar per pand) en **2d** (deals exporteren naar Excel) **2e** (leads en panden exporteren), **2f** (eigenaarsupdate via WhatsApp) en **2g** (databasetest voor deals) **2h** (documenten bij een deal) en **3a** (huurovereenkomsten), **3b** (huurbetalingen), **3c** (onderhoud) en **3d** (achterstand op Today); **4a** (eigenaarsrapport met huur en reparaties) **4b** (commissie delen met een andere makelaar) **4c** (eerdere huurmaanden achteraf invullen) **4d** (huurovereenkomsten exporteren naar Excel) en **5a** (Amplify Network: samenwerken met andere kantoren) en **6b** (alle teksten en foutmeldingen in het Frans en Arabisch nagelopen). Een vastgoedkantoor kan nu werken met panden, personen, mandaten, leads, bezichtigingen, taken en team, in het Frans, Arabisch en Engels; panden online zetten en delen via WhatsApp; en heeft een plan (30 dagen proef, daarna betaald of alleen-lezen).

Gebouwd per onderdeel: **1a** databasekern, **1b** desk-app (panden, personen, mandaten, leads, bezichtigingen, team, taken, Today), **1c** publieke pandpagina's, **1d** foto's, **1e** Frans en Arabisch, **1f** panden naar een lead sturen via WhatsApp, **1g** contacten importeren, **1h** eigen adresnaam, **1i** Overview, **1j** eerste stappen, **1k** automatische taak bij aflopende mandaten, **1l** plan per kantoor.

## Wat er staat

| Onderdeel | Status |
|---|---|
| Organisaties, leden en rollen (owner, manager, agent, viewer) | klaar |
| Personen, panden, betrokkenen per pand, mandaten | klaar |
| Onveranderlijke geschiedenis (aanmaken, status, prijs, "laatst bevestigd") | klaar |
| Beveiliging per organisatie (RLS + samengestelde foreign keys) | klaar |
| Tests (elf SQL-bestanden in `supabase/tests`, elk eindigt met TESTRESULTAAT) | klaar |
| Desk-app: inloggen, kantoor aanmaken, panden tonen en toevoegen (EN) | klaar (1b-1) |
| Desk-app: pand openen en wijzigen, personen, leads | klaar (1b-2 t/m 1b-4) |
| Desk-app: bezichtigingen (afspraak tussen lead en pand, met uitkomst) | klaar (1b-5) |
| Desk-app: team (leden toevoegen, rol wijzigen, verwijderen) | klaar (1b-5) |
| Desk-app: taken (deadline, verantwoordelijke, koppeling aan lead of pand) en Today-scherm | klaar (1b-6) |
| Publieke pandpagina's (`apps/pages`): kantoorpagina, pandpagina, WhatsApp-knop, FR/AR/EN, voorbeeld bij delen | klaar (1c) |
| Foto's: uploaden in de desk (verkleind in de browser), omslagfoto, galerij op de pandpagina, foto in lijst en WhatsApp-voorbeeld | klaar (1d) |
| Desk-app in Frans en Arabisch (RTL), met taalkeuze FR / AR / EN | klaar (1e) |
| Foutmeldingen (database, inloggen, bestanden, verbinding) in de taal van de app, nooit een kale code; alle 670 teksten hebben Frans en Arabisch | klaar (6b) |
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
| Huurbetalingen (3b): per maand een regel op de betaaldag (te betalen, te laat, betaald), "Mark as paid", WhatsApp-herinnering aan de huurder (FR/AR/EN), totaal achterstand in Rentals (database + desk) | klaar (3b) |
| Onderhoud (3c): meldingen per pand met urgentie, melder, reparateur, kosten en wie betaalt; status open / in progress / done / cancelled; bericht naar de reparateur via WhatsApp (database + desk) | klaar (3c) |
| Achterstallige huur en reparaties die aandacht nodig hebben op Today, in de briefing en in Overview, geen SQL | klaar (3d) |
| Eigenaarsrapport met huurinkomsten, reparatiekosten en betaald, ook als maandupdate via WhatsApp, geen SQL | klaar (4a) |
| Commissie delen (4b): per deal een percentage van de commissie voor een andere makelaar of tipgever (samen maximaal 100%), afspraak vastleggen, "Confirm in writing" via WhatsApp in FR/AR/EN, betaald markeren (bedrag wordt dan vastgezet); totalen in Deals tonen wat bij het eigen kantoor blijft (database + desk) | klaar (4b) |
| Eerdere huurmaanden achteraf invullen (4c): bij een huurovereenkomst die al liep voordat hij in de app kwam, kies je vanaf welke datum en of die maanden al betaald zijn (of nog openstaan als achterstand); bestaande maanden blijven ongemoeid, maximaal 60 maanden per keer (database + desk) | klaar (4c) |
| Huurovereenkomsten exporteren naar Excel (4d): huurder, huur, borg, data en achterstand per overeenkomst, volgt filter en zoekopdracht; geen SQL | klaar (4d) |
| Amplify Network (5a): kantoren nodigen elkaar uit met de kantoorcode, het andere kantoor accepteert; een beschikbaar pand deel je met een partner met een aangeboden percentage van je commissie en een notitie; de partner ziet alleen titel, prijs, wijk en stad, kamers, oppervlakte, beschrijving, percentage, notitie en jouw contactgegevens, nooit adres, eigenaar, mandaat of notities; beeindigen haalt alles weg (database + desk) | klaar (5a) |
| Desk-app: pagina aan/uit per pand, deellink, kantoorgegevens voor de publieke pagina | klaar (1c) |
| Agenda (6a): tabblad Agenda met de week op een rij (maandag tot zondag): bezichtigingen, taken met deadline, aflopende mandaten, te betalen huur en aflopende huurovereenkomsten; vorige en volgende week, alleen mijn taken, taak afvinken, met + per dag een bezichtiging of taak op die dag toevoegen. Geen SQL | klaar (6a) |
| Nieuwe matches op Today (6c): komt er een pand beschikbaar (nieuw of weer beschikbaar, laatste 14 dagen) dat past bij een lead die nog zoekt, dan staat de lead op Today met de passende panden; met één tik via WhatsApp sturen (FR/AR/EN, telt als contact) of overslaan. Gestuurd of overgeslagen komt niet terug, voor het hele team; panden met al een bezichtiging voor die lead worden niet getoond (database + desk) | klaar (6c) |
| Multi-posting (6d): in elk pand het blok "Advertise on portals": per site (Mubawab, Avito, Sarouty, Facebook, Instagram, andere) een kant-en-klare titel en tekst in FR of AR om te kopiëren, de formuliervelden los te kopiëren, alle foto's in één keer downloaden en een knop naar de site. Portalen krijgen een tekst zonder telefoon en link, sociale media met contact, link en hashtags. Per site vastleggen dat het pand online staat (met link en datum) en offline halen; Today waarschuwt bij advertenties van verkochte of verhuurde panden (database + desk) | klaar (6d) |
| Leadformulier en bron (6e): op elke publieke pandpagina en kantoorpagina een formulier "Être rappelé" (naam, telefoon, bericht; FR/AR/EN). De database maakt de persoon (of herkent hem aan zijn nummer), een lead met bron "Public page" en een taak "Rappeler ..." voor vandaag; beschermd tegen robots en dubbel verzenden. Elke lead heeft een bron (WhatsApp, telefoon, binnenloper, publieke pagina, Mubawab, Avito, Sarouty, Facebook, Instagram, doorverwezen, Amplify Network, andere), zichtbaar in de lijst, de lead en Overview (waar komen de leads van de laatste 30 dagen vandaan). De publieke pagina's tellen bezoeken en klikken op WhatsApp en bellen (alleen tellers, geen persoonsgegevens); het eigenaarsrapport en de WhatsApp-update aan de eigenaar tonen die cijfers en waar het pand geadverteerd is (database + desk + publieke pagina's) | klaar (6e) |
| Facturen (6f): onder Team de factuurgegevens van het kantoor (naam, société of auto-entrepreneur, adres, ICE, IF, RC, taxe professionnelle, RIB, btw-tarief, voettekst). In een deal "Make an invoice": facture of note d'honoraires voor de klant of de eigenaar, met de commissie al ingevuld; tabblad Invoices met alle facturen, te innen en ontvangen dit jaar. De factuur (altijd in het Frans) volgt artikel 145 CGI: doorlopend nummer per jaar zonder gaten (gegeven door de database), gegevens van verkoper en klant, HT, TVA, TTC (of "TVA non applicable" voor een auto-entrepreneur), het bedrag in letters, afdrukken of opslaan als PDF. Na uitgifte ligt de inhoud vast; alleen betaald (met betaalwijze) of geannuleerd. Viewers zien geen facturen (database + desk) | klaar (6f) |
| Kantoorwebsite (6g): de kantoorpagina is nu een volledige website: naam en slogan, wijken, knoppen naar de panden en WhatsApp, cijfers (online, te koop, te huur, verkocht of verhuurd), alle online panden met filter op doel en soort en zoeken op wijk of stad, "Qui sommes-nous", diensten, contactgegevens en het formulier "Être rappelé". Teksten in te vullen onder Team > Website. Een kantoor kan een eigen domeinnaam krijgen (www.atlas-immo.ma): dan is / de kantoorsite en /P-AB12 een pand, ook in de WhatsApp-voorbeelden (database + desk + publieke pagina's) | klaar (6g) |
| Eigenaarsportaal (7a): in elk pand het blok "Owner portal": per eigenaar een persoonlijke link (zonder account) maken en via WhatsApp sturen in FR, AR, EN of NL (voor eigenaars in Nederland en België), kopiëren of stoppen; je ziet hoe vaak de eigenaar hem opende. De eigenaar ziet op `/o/<code>` al zijn panden bij het kantoor: status en prijs, bezichtigingen, geïnteresseerden, offertes, bezoeken en contactaanvragen van de online pagina, waar het pand geadverteerd is, de geldigheid van het mandaat, en bij verhuur de huurder, de huur per maand (betaald, te betalen, te laat) en de reparaties met kosten. Nooit namen of nummers van geïnteresseerden, de commissie of interne notities. Een link vervalt na een jaar; een nieuwe link maakt de oude ongeldig (database + desk + publieke pagina's) | klaar (7a) |
| Beheer en maandafrekening (7b): in een huurpand het blok "Property management": beheercontract met de eigenaar (fee als % van de ontvangen huur, dag van uitbetaling, RIB van de eigenaar). Per maand "Make statement": de database rekent ontvangen huur (betaald in die maand) min beheerfee min reparaties ten laste van de eigenaar (afgerond in die maand) = uit te betalen. De afrekening is af te drukken of als PDF op te slaan in FR, AR, EN of NL en met één tik als samenvatting via WhatsApp te sturen; "Mark as paid out" (eigenaar en manager) zet hem vast. Today toont "Owner payouts": afrekeningen die nog uitbetaald moeten worden en contracten zonder afrekening van vorige maand. De eigenaar ziet zijn afrekeningen in het eigenaarsportaal. Viewers zien geen contracten of afrekeningen (database + desk + publieke pagina's) | klaar (7b) |
| Navigatie (6h): op desktop een vaste zijbalk met groepen (Travail, Vente, Location et gestion, Finances) en onderaan Paramètres, taal en uitloggen; op telefoon en tablet een smalle kopbalk en een onderbalk met Aujourd'hui, Biens, Prospects, Agenda en "Plus" (alle rubrieken op een rij). Taken zitten nu in de Agenda (Semaine of Tâches); Team, pagina's en site, factuurgegevens en abonnement zitten samen in Paramètres. In het Arabisch staat de zijbalk rechts. Geen SQL | klaar (6h) |
| État des lieux (7c): in elke huurovereenkomst een état des lieux d'entrée en later de sortie. Op telefoon of tablet ter plekke in te vullen: datum, meterstanden (water, elektriciteit, gas), per kamer de onderdelen met hun staat (neuf, bon, moyen, mauvais) en een opmerking, foto's per kamer, sleutels en algemene opmerkingen; kamers en onderdelen zijn toe te voegen en te hernoemen. Het état des lieux de sortie begint met de kamers van de entrée en toont per onderdeel de staat bij intrek; slechter geworden staat de staat in het rood in het document. Huurder en kantoor tekenen op het scherm; daarna ligt alles vast (ook de foto's). Afdrukken of als PDF opslaan in het Frans, met foto's en handtekeningen. Foto's staan in een privé-opslag (database + desk) | klaar (7c) |
| Quittances en huurverhoging (7d): bij elke betaalde maand een knop "Quittance": de huurkwitantie in het Frans of Arabisch (kantoor namens de eigenaar, huurder, woning, bedrag in cijfers en letters, maand en betaaldatum, ruimte voor stempel en handtekening), af te drukken of als PDF op te slaan en met een WhatsApp-bericht naar de huurder te sturen. In een lopende huurovereenkomst het blok "Rent increase" volgens de wet (loi 07-03, loi 67-12): pas drie jaar na het begin of de vorige verhoging, hooguit 8% voor bewoning en 10% voor ander gebruik; de app toont wanneer en hoeveel, stelt het maximum voor (afgerond op 10 DH), bericht aan de huurder via WhatsApp, en openstaande maanden krijgen het nieuwe bedrag. Een verlaging kan altijd. Elke wijziging wordt bewaard (database + desk) | klaar (7d) |
| Korte verhuur en conciergerie (7e): nieuw onderdeel "Short stays" onder Location et gestion: per maand een kalender per pand voor korte verhuur met de boekingen als balken (kleur per kanaal: direct, Airbnb, Booking, andere), bezettingsgraad, geboekte nachten en netto-opbrengst. Tik op een vrije dag voor een nieuwe boeking: gast, telefoon, kanaal, aankomst en vertrek, personen, totaalprijs, schoonmaak en commissie van het kanaal (met voorgestelde prijs per nacht). Overlappende boekingen kunnen niet. Elke boeking maakt vanzelf een taak "Accueil" op de aankomstdag en "Ménage" op de vertrekdag (Agenda en Today); annuleren of verzetten past de taken aan. Per pand een iCal-link (`/ical/<code>.ics` op de publieke site) om de bezette data in Airbnb, Booking of Google Agenda te zetten, zonder namen of bedragen. Bij een beheercontract telt de netto-opbrengst van de boekingen mee in de maandafrekening voor de eigenaar (database + desk + publieke site) | klaar (7e) |

Gebruikershandleiding voor het team (Frans, één pagina): `docs/guide-fr.md`.

## Bewust nog niet gebouwd

Verdeling van de commissie tussen twee kantoren die allebei in de app zitten (nu leg je die vast als contact in de deal, gepland in 11a), automatische betaling, en automatische meldingen (zelf versturen vanuit de app kan al via WhatsApp; automatisch vraagt een WhatsApp Business-koppeling).

## Ontwerpkeuzes

- Elke rij hoort bij precies een organisatie; verwijzen over organisaties heen kan niet.
- Bedragen in centimes. Panden worden nooit verwijderd (status `withdrawn`).
- Delen tussen organisaties loopt alleen via het Amplify Network (5a) en alleen via databasefuncties: een partner leest nooit rechtstreeks de tabellen van een ander kantoor.
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

11. Etappe 2a: plak `supabase/migrations/20261027001000_deals.sql` en klik Run. Test daarna met `supabase/tests/06_deals.test.sql` (`TESTRESULTAAT: 12 geslaagd, 0 mislukt` is goed).
12. Etappe 2h: plak `supabase/migrations/20261027001100_deal_documents.sql` en klik Run. Test daarna met `supabase/tests/07_deal_documents.test.sql` (`TESTRESULTAAT: 22 geslaagd, 0 mislukt` is goed). Er komt een prive opslagbucket `deal-documents` bij; die is niet openbaar.
13. Etappe 3a: plak `supabase/migrations/20261027001200_leases.sql` en klik Run. Test daarna met `supabase/tests/08_leases.test.sql` (`TESTRESULTAAT: 24 geslaagd, 0 mislukt` is goed).

14. Etappe 3b: plak `supabase/migrations/20261027001300_rent_payments.sql` en klik Run. Test daarna met `supabase/tests/09_rent_payments.test.sql` (`TESTRESULTAAT: 22 geslaagd, 0 mislukt` is goed).

15. Etappe 3c: plak `supabase/migrations/20261027001400_maintenance.sql` en klik Run.

16. Etappe 3d: geen SQL, alleen de app.

17. Etappe 4a: geen SQL, alleen de app.
18. Etappe 4b: plak `supabase/migrations/20261027001500_commission_splits.sql` en klik Run. Doe dit vóór je de app uploadt of meteen erna; zonder de SQL werkt Deals gewoon, maar het blok "Commission split" geeft een foutmelding.
19. Etappe 4c: plak `supabase/migrations/20261027001600_backfill_rent.sql` en klik Run. Zonder de SQL werkt alles gewoon, maar "Add earlier months" geeft dan een foutmelding. Test (optioneel): `supabase/tests/10_backfill_rent.test.sql` (`TESTRESULTAAT: 8 geslaagd, 0 mislukt` is goed).
20. Etappe 4d: geen SQL, alleen de app.
21. Etappe 5a: plak `supabase/migrations/20261027001700_network.sql` en klik Run. Zonder de SQL werkt de rest gewoon, maar het tabblad Network geeft dan een foutmelding. Test (optioneel): `supabase/tests/11_network.test.sql` (`TESTRESULTAAT: 16 geslaagd, 0 mislukt` is goed).
22. Demo-kantoor (etappe 0b, optioneel): open `supabase/seed/demo_kantoor.sql`, vervang `JOUW-EMAIL@VOORBEELD.COM` door je eigen inlog-e-mail en klik Run. Je krijgt een tweede kantoor "Amplify Immobilier (démo)" met 30 panden, leads, deals, verhuur en onderhoud; in de desk wissel je bovenaan van kantoor. Werkt maar een keer.
23. Etappe 6c: plak `supabase/migrations/20261028000100_match_notices.sql` en klik Run. Zonder de SQL toont Today de matches wel, maar Envoyer en Ignorer geven een foutmelding. Test (optioneel): `supabase/tests/12_match_notices.test.sql` (`TESTRESULTAAT: 6 geslaagd, 0 mislukt` is goed).
24. Etappe 6d: plak `supabase/migrations/20261028000200_postings.sql` en klik Run. Zonder de SQL werken de teksten en foto's wel, maar vastleggen waar het pand online staat niet. Test (optioneel): `supabase/tests/13_postings.test.sql` (`TESTRESULTAAT: 6 geslaagd, 0 mislukt` is goed).
25. Etappe 6e: plak `supabase/migrations/20261028000300_inquiries.sql` en klik Run. Doe dit voor je de apps uploadt: het formulier op de publieke pagina's en het veld Source in de desk hebben de SQL nodig. Test (optioneel): `supabase/tests/14_inquiries.test.sql` (`TESTRESULTAAT: 9 geslaagd, 0 mislukt` is goed).
26. Etappe 6f: plak `supabase/migrations/20261028000400_invoices.sql` en klik Run. Vul daarna in de desk onder Team de factuurgegevens in (naam, ICE en IF zijn verplicht). Test (optioneel): `supabase/tests/15_invoices.test.sql` (`TESTRESULTAAT: 11 geslaagd, 0 mislukt` is goed).
27. Etappe 6g: plak `supabase/migrations/20261028000500_website.sql` en klik Run. Test (optioneel): `supabase/tests/16_website.test.sql` (`TESTRESULTAAT: 6 geslaagd, 0 mislukt` is goed).
28. Etappe 7a: plak `supabase/migrations/20261028000600_owner_portal.sql` en klik Run. Test (optioneel): `supabase/tests/17_owner_portal.test.sql` (`TESTRESULTAAT: 8 geslaagd, 0 mislukt` is goed).
29. Etappe 7b: plak `supabase/migrations/20261028000700_management.sql` en klik Run (na 7a). Test (optioneel): `supabase/tests/18_management.test.sql` (`TESTRESULTAAT: 9 geslaagd, 0 mislukt` is goed).
30. Etappe 7c: plak `supabase/migrations/20261028000800_inspections.sql` en klik Run. Er komt een privé opslagbucket `inspection-photos` bij. Test (optioneel): `supabase/tests/19_inspections.test.sql` (`TESTRESULTAAT: 7 geslaagd, 0 mislukt` is goed).
31. Etappe 7d: plak `supabase/migrations/20261028000900_rent_revisions.sql` en klik Run. Test (optioneel): `supabase/tests/20_rent_revisions.test.sql` (`TESTRESULTAAT: 7 geslaagd, 0 mislukt` is goed).
32. Etappe 7e: plak `supabase/migrations/20261028001000_stays.sql` en klik Run (na 7b). Test (optioneel): `supabase/tests/21_stays.test.sql` (`TESTRESULTAAT: 8 geslaagd, 0 mislukt` is goed). De iCal-link plak je in Airbnb onder Agenda > Beschikbaarheid > Agenda's koppelen > Agenda importeren.

### Een eigen domeinnaam koppelen aan een kantoorsite (6g)

1. Cloudflare > Workers & Pages > het project van de publieke pagina's > Custom domains > Set up a custom domain. Vul de domeinnaam in (bijvoorbeeld `www.atlas-immo.ma`) en volg de stappen. Staat het domein niet bij Cloudflare, dan geeft Cloudflare een CNAME-regel die de klant (of jij) bij de registrar van het domein invult.
2. Wacht tot Cloudflare het domein op Active zet.
3. Vul dezelfde domeinnaam in de desk in onder Team > Website > Own domain name, en klik Save.

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
