# apps/pages: publieke pandpagina's

Wat een klant ziet als je een link deelt via WhatsApp. Frans, Arabisch (rechts naar links) en Engels, snel op een telefoon, zonder inloggen.

## Adressen

| Adres | Wat |
|---|---|
| `/` | korte uitleg |
| `/{kantoor}` | beschikbare en gereserveerde panden van een kantoor, met filter (koop / huur) en contactknoppen |
| `/{kantoor}/{referentie}` | één pand: prijs, gegevens, beschrijving, wijk en stad, "bevestigd X dagen geleden", WhatsApp- en bel-knop |

De taal volgt `?lang=fr`, `?lang=ar` of `?lang=en` in de link. Zonder dat: de laatste keuze van de bezoeker, anders de taal van de telefoon, anders Frans. De bezoeker kan de taal bovenaan wisselen.

## Wat wel en niet publiek is

Bezoekers hebben **geen** toegang tot tabellen. De site roept alleen `public_office_page` en `public_property_page` aan (zie `supabase/migrations/20261027000500_public_pages.sql`). Die geven alleen terug:

- pand: titel, type, doel, status, prijs, wijk en stad, kamers, oppervlakte, gemeubileerd, beschrijving, "laatst bevestigd"
- kantoor: naam, stad, WhatsApp, telefoon, e-mail (die je zelf invult onder Team > Public pages)

Nooit: exact adres, eigenaar of andere personen, mandaten, interne notities, leads, taken.

Een pand is alleen zichtbaar als **alle drie** kloppen: de pagina staat aan (per pand), de status is beschikbaar, gereserveerd, verhuurd of verkocht, en er is een actief mandaat. Een verhuurd of verkocht pand blijft bereikbaar met een melding, zodat een oude WhatsApp-link niet op een foutpagina uitkomt.

## Voorbeeld bij delen via WhatsApp

WhatsApp maakt het voorbeeld (titel, prijs) uit de HTML, zonder JavaScript uit te voeren. Daarom staat er een kleine worker in `public/_worker.js` die voor `/{kantoor}/{referentie}` de gegevens opzoekt en in de HTML zet. Gaat er iets mis (database onbereikbaar), dan krijgt de bezoeker gewoon de normale pagina. Zonder worker werkt de site ook, alleen is het voorbeeld dan algemeen ("Amplify Real Estate").

## Cloudflare Pages (nieuw project, dezelfde repo)

- Framework preset: geen
- Build command: `npm run build -w @vastgoed/pages`
- Build output directory: `apps/pages/dist`
- Environment variables: `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY` (dezelfde als bij de desk-app; alleen de publieke anon key, nooit een geheime sleutel). De worker gebruikt dezelfde twee variabelen.
- Zet daarna in het **desk**-project `VITE_PUBLIC_SITE_URL` op het adres van dit project en deploy de desk opnieuw.

## Lokaal draaien

```
cp apps/pages/.env.example apps/pages/.env.local   # vul URL en anon key in
npm install
npm run dev -w @vastgoed/pages                      # http://localhost:5177/{kantoor}/{referentie}
```

Lokaal draait de worker niet (alleen de app zelf). Het voorbeeld bij delen test je op Cloudflare.

## Nog niet

Foto's (komt in 1d, met opslag in Supabase), kaart, zoeken op de publieke pagina, en een eigen domeinnaam per kantoor.
