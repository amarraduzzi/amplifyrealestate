# Amplify Tournée

Route planner for visiting restaurants in Rabat. Static web app (Leaflet + OpenStreetMap + OSRM) with a Supabase database and login.

## Deploy (Cloudflare Pages)
1. Push this folder's contents to a GitHub repo.
2. Cloudflare → Workers & Pages → Create → Pages → Connect to Git → choose the repo.
3. Framework preset: None. Build command: empty. Build output directory: `/`.

## Files
- `index.html` — the whole app (Supabase URL and public key already filled in at the top of the script)
- `schema.sql` — database tables (already run in Supabase)

## Daily use
1. Add restaurants (Google Maps link, address search, tap on the map) or import a CSV.
2. Tick today's stops, open the "Ma tournée" tab.
3. Drag the blue pin to your starting point (or "Ma position"), then "Calculer la meilleure route".
4. Open in Google Maps or Waze, log each visit, send the WhatsApp follow-up.

CSV columns: `name, address, district, phone, lat, lng, status` (status: new, appt, demo, client, lost).

The Supabase key in `index.html` is a publishable key. Never put the secret/service_role key in this repo.

## Taal / Langue

The app has an FR | NL switch in the header (default: Dutch). The choice is remembered per device.

## Online zoeken / Recherche en ligne

"Online zoeken" (top of the list) searches OpenStreetMap by name in Rabat, Salé and Témara, or lists all restaurants in the area (Overpass) and adds them with one tap. Restaurants already in the list are marked and skipped.

## Update 1: huisstijl, mobiele tabs, lead score

Run `schema-update-1.sql` in Supabase (SQL Editor) BEFORE uploading index.html.
New fields per restaurant: type, website yes/no, Google rating and review count, environment. The list is sorted by a provisional lead score (no website, Google reviews, not a difficult area).
CSV import also reads rating / reviews / website / type columns when present.

## Update 2: bezoeken en pijplijn

Run `schema-update-2.sql` in Supabase BEFORE uploading index.html. Visit log with outcome, contact person, interest, objection and who visited; pipeline statuses (to visit, visited, interested, appointment, demo, trial, client, not interested); filters "to follow up" and "not yet visited"; last visit date in the list.

## Update 3: lead score uitleg

No SQL needed. Tap the score number next to a restaurant to see why; "Réglages du score" lets you change the weights (stored per device).

## Update 4: dagadvies (tab "Aujourd'hui / Vandaag")

No SQL needed. Pick available hours (about 2 stops per hour). Advice = due follow-ups first, then best-scoring restaurants that are close together and not visited in the last 7 days, each with a short pitch tip. "In mijn ronde zetten" fills the route and calculates it.

## Update 5: eigen tabbladen en cijfers

No SQL needed. Tabs: Vandaag, Restaurants, Cijfers, Kaart (map + route). On phones each tab is a full screen; the map only shows in the Kaart tab. Cijfers: funnel, visits per week and person, districts, objections, product interest.

## Update 6: import uit Notion

No SQL needed. Upload `index.html` and `README.md`, then import `notion-import.csv` via "Importeren" (119 restaurants uit Amars Notion-lijst; Etoile du chef en Lina gluten free zijn overgeslagen omdat ze niet bestaan).
The CSV import now also reads these optional columns: `website_status` (yes / no / unknown), `next_step`, `next_contact` (YYYY-MM-DD) and `last_visit` (YYYY-MM-DD).
The import has no coordinates: the app looks them up by name and district (about 1 per second, so ~2 minutes). Check the positions afterwards; wrong ones can be fixed with "Op de kaart plaatsen".

## Update 7: bijwerken bij import en tabblad Overzicht

No SQL needed. The CSV import has a checkbox "Restaurants die al in de lijst staan bijwerken" (on by default): for restaurants already in the list (same name) it fills in empty fields only (status if still "te bezoeken", next step, follow-up date, last visit, website, district). Nothing already filled in is overwritten and clients are never changed.
New tab "Overzicht": counts per status (tap to filter the list), follow-ups due, and the best-scoring restaurants not yet visited.

## Update 8: nieuwe onderste menubalk

No SQL needed. The bottom tab bar on phones now has icons, more space, a highlighted active tab and a rounded floating look. The route counter on "Kaart" only shows when stops are selected.

## Update 9: computerweergave

No SQL needed. On a computer the list area is now wide (the map is a narrower panel on the right, about 30% of the screen), the tabs have icons above their names and fit without being cut off, and the content is centred with a maximum width.

## Update 10: online zoeken uitgebreid

No SQL needed. The button "Restaurants, cafés en patisserieën in de regio" now also finds cafés, ice cream shops, food courts, bakeries and pastry/chocolate shops (before: only restaurants and fast food). Type (restaurant, café, snack, pâtisserie) is filled in automatically. Places already in the list are marked "Staat al in de lijst" and are never added twice (same name, or similar name within 40 m).

## Update 11: slimme route op Vandaag

No SQL needed. The tab "Vandaag" now builds a route for you: choose a starting point (address or neighbourhood, "Mijn locatie", or move the pin on the map), a region (or "doesn't matter, closest to my start"), the number of stops (6, 8, 12, 16) and walking or driving. Two switches: "Alleen nieuwe en hoge potentie" (never visited, status "te bezoeken", lead score 55 or higher) and "Opvolgingen meenemen" (due follow-ups, at most a third of the stops; without a region only those within 6 km of the start). The app picks stops that are close together and orders them shortest-first, with distance and time. Buttons: "In mijn ronde zetten" (calculates the real route on the map tab), "Openen in Google Maps" and Waze per stop. The button "Ontbrekende posities opzoeken" finds map positions for restaurants that have none (about 1 per second); those then take part in the route.


## Update 26: mobiele app-ervaring

Geen SQL nodig. Upload `index.html`, `sw.js`, `manifest.webmanifest` en de vier `.png` iconen naar de root van de repo.
Installeren op het beginscherm: iPhone → Safari → Deel → "Zet op beginscherm"; Android → Chrome → menu → "App installeren".

## Update 27: vaste ronde, bezoekformulier, dagoverzicht

Run `schema-update-7.sql` in Supabase (needed to edit earlier visits). Upload `index.html`, `sw.js` and `README.md`.
- Vandaag: "Ronde starten" freezes today's stops. Per stop: Navigeer (Google Maps with only that restaurant, searched by name, starting from where you are), Bezoek, Overslaan. Saving a visit ticks the stop off and shows the next one. When done: "Terug naar start" (the car) or "Nieuwe ronde vanaf hier".
- Radius around the start (1, 2, 3, 5, 10 km) and "Terug naar startpunt (auto)" switch. Restaurants can be added to the plan or the running round by name; new walk-ins via "+ Nieuw restaurant" (GPS position and visit form open straight away). A walk-in counts as a visit of today once the visit is saved.
- Google Maps links use restaurant name + address/district instead of coordinates, so no more "dropped pin". Walking routes on the map use a walking router.
- Visit form: "Gesproken met baas" added, "Interesse" and "WhatsApp-opvolging" removed, contact moments shown at the top, follow-up grouped, save button always visible. Earlier visits can be edited or deleted.
- When a visit is saved during a round and the restaurant has no or an approximate position, the phone's GPS position is stored.
- "Bezoeken van de dag" on Vandaag and "Bezochte restaurants in deze periode" in Cijfers, with WhatsApp, Bellen, Agenda and Openen per restaurant.
- Fix: on phones the page was slightly wider than the screen (date and time fields ran off the form).

## Update 28: nieuwe WhatsApp-berichten

No SQL needed. The 3 old WhatsApp templates are replaced by 2 fixed messages: "Manager + Boss" and "Glovo message" (visit form and the WhatsApp button everywhere). Both can still be edited for the whole team via "WhatsApp-berichten" on the Restaurants tab.
