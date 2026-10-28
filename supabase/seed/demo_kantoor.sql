-- Amplify Vastgoed, etappe 0b: demo-kantoor met voorbeelddata
--
-- Maakt het kantoor "Amplify Immobilier (démo)" aan, met jou als eigenaar, en vult het met 30 panden in Rabat en omgeving,
-- eigenaars, leads, bezichtigingen, taken, deals, huurovereenkomsten met betalingen en onderhoud.
-- Bedoeld voor demo's en screenshots. Je eigen kantoor blijft ongemoeid; in de desk wissel je bovenaan van kantoor.
--
-- Gebruik:
--   1. Log eerst in op de desk en maak je eigen kantoor aan, zodat je gebruiker bestaat.
--   2. Plak alles in de Supabase SQL-editor en klik op Run. Zonder iets te veranderen krijgen alle eigenaars van een
--      kantoor toegang. Alleen voor een bepaalde gebruiker? Vervang dan JOUW-EMAIL@VOORBEELD.COM hieronder door diens e-mail.
-- Werkt maar een keer: bestaat het demo-kantoor al, dan krijg je een melding en verandert er niets.
-- De publieke kantoorpagina komt op het adres met code "demo-immobilier".

do $seed$
declare
  v_email text := 'JOUW-EMAIL@VOORBEELD.COM';

  v_user uuid;
  v_org  uuid;
  r      record;
  i      int;
  p      uuid[] := '{}';   -- panden, in volgorde van de lijst hieronder
  ow     uuid[] := '{}';   -- eigenaars
  cl     uuid[] := '{}';   -- klanten (leads)
  ld     uuid[] := '{}';   -- leads
  tn     uuid[] := '{}';   -- huurders
  ls     uuid[] := '{}';   -- huurovereenkomsten
  plumber uuid; electrician uuid; coagent uuid;
  d_id   uuid;
  m      int;
  due    date;
begin
  if v_email = 'JOUW-EMAIL@VOORBEELD.COM' then
    -- niets ingevuld: iedereen die eigenaar is van een kantoor krijgt toegang (de eerste wordt de vaste eigenaar)
    select m.user_id into v_user from public.memberships m where m.role = 'owner' order by m.created_at limit 1;
    if v_user is null then
      raise exception 'Er is nog geen kantoor in de app. Log eerst in op de desk en maak je kantoor aan, en draai dit daarna opnieuw.';
    end if;
  else
    select id into v_user from auth.users where lower(email) = lower(trim(v_email));
    if v_user is null then
      raise exception 'Geen gebruiker gevonden met e-mail %. Controleer het e-mailadres of laat de regel v_email ongewijzigd.', v_email;
    end if;
  end if;
  if exists (select 1 from public.organizations where slug = 'demo-immobilier') then
    raise exception 'Het demo-kantoor bestaat al (code demo-immobilier). Er is niets veranderd.';
  end if;

  -- Kantoor, met jou als eigenaar en een jaar actief plan
  insert into public.organizations (name, slug, city, public_whatsapp, public_phone, public_email,
                                    plan, plan_until, max_members, max_properties)
  values ('Amplify Immobilier (démo)', 'demo-immobilier', 'Rabat', '+212660353741', '+212660353741', 'demo@amplifygrowthstudio.com',
          'active', current_date + 365, 10, 250)
  returning id into v_org;
  insert into public.memberships (org_id, user_id, role) values (v_org, v_user, 'owner');
  if v_email = 'JOUW-EMAIL@VOORBEELD.COM' then
    insert into public.memberships (org_id, user_id, role)
    select distinct v_org, m.user_id, 'owner'::public.org_role from public.memberships m
    where m.role = 'owner' and m.user_id <> v_user and m.org_id <> v_org
    on conflict do nothing;
  end if;

  -- Eigenaars (15)
  for r in select * from (values
    ('Karim Benjelloun', '+212661234501'), ('Nadia El Idrissi', '+212661234502'), ('Youssef Alaoui', '+212661234503'),
    ('Fatima Zahra Tazi', '+212661234504'), ('Mehdi Berrada', '+212661234505'), ('Salma Chraibi', '+212661234506'),
    ('Omar Fassi Fihri', '+212661234507'), ('Laila Bennani', '+212661234508'), ('Hicham Kettani', '+212661234509'),
    ('Rachid Amrani (MRE, Amsterdam)', '+31612345610'), ('Samira Ouazzani (MRE, Bruxelles)', '+32470123411'),
    ('Driss Lahlou', '+212661234512'), ('Khadija Sefrioui', '+212661234513'), ('Anas Belkadi', '+212661234514'),
    ('Imane Guessous', '+212661234515')
  ) as t(name, tel) loop
    insert into public.people (org_id, full_name, phone, whatsapp, notes)
    values (v_org, r.name, r.tel, r.tel, 'Propriétaire') returning id into d_id;
    ow := ow || d_id;
  end loop;

  -- Panden (30): titel, soort, doel, status, prijs in DH, wijk, stad, kamers, badkamers, m2, gemeubeld, eigenaar, online
  for r in select * from (values
    ('Appartement lumineux à Agdal',            'apartment', 'sale',      'available', 1650000,  'Agdal',        'Rabat',   3, 2, 115, false, 1,  true),
    ('Villa avec piscine à Souissi',            'villa',     'sale',      'available', 12500000, 'Souissi',      'Rabat',   6, 5, 850, false, 2,  true),
    ('Villa familiale à Hay Riad',              'villa',     'sale',      'available', 6800000,  'Hay Riad',     'Rabat',   5, 4, 420, false, 3,  true),
    ('Appartement vue mer à Harhoura',          'apartment', 'sale',      'available', 2350000,  'Harhoura',     'Témara',  3, 2, 130, true,  4,  true),
    ('Studio meublé près de la gare Agdal',     'apartment', 'rent_long', 'available', 6500,     'Agdal',        'Rabat',   1, 1, 45,  true,  5,  true),
    ('Appartement 2 chambres à Hassan',         'apartment', 'rent_long', 'available', 8500,     'Hassan',       'Rabat',   2, 1, 85,  false, 6,  true),
    ('Riad rénové dans la Médina',              'riad',      'sale',      'available', 3900000,  'Médina',       'Rabat',   5, 4, 260, true,  7,  true),
    ('Duplex moderne à Hay Riad',               'apartment', 'sale',      'available', 2950000,  'Hay Riad',     'Rabat',   4, 3, 190, false, 8,  true),
    ('Local commercial avenue Fal Ould Oumeir', 'shop',      'rent_long', 'available', 22000,    'Agdal',        'Rabat',   0, 1, 120, false, 9,  true),
    ('Plateau de bureaux à Hay Riad',           'office',    'rent_long', 'available', 18000,    'Hay Riad',     'Rabat',   0, 2, 160, false, 9,  true),
    ('Villa pieds dans l''eau à Harhoura',      'villa',     'sale',      'available', 9800000,  'Harhoura',     'Témara',  5, 4, 500, true,  10, true),
    ('Appartement à l''Océan',                  'apartment', 'sale',      'available', 1250000,  'Océan',        'Rabat',   2, 1, 78,  false, 11, true),
    ('Terrain constructible à Témara',          'land',      'sale',      'available', 2200000,  'Wifak',        'Témara',  0, 0, 600, null,  12, true),
    ('Appartement neuf à Prestigia',            'apartment', 'sale',      'available', 1890000,  'Prestigia',    'Salé',    3, 2, 105, false, 13, true),
    ('Maison de plage à Skhirat',               'house',     'rent_short','available', 2500,     'Plage',        'Skhirat', 3, 2, 140, true,  14, true),
    ('Appartement de standing à Souissi',       'apartment', 'rent_long', 'available', 16000,    'Souissi',      'Rabat',   3, 3, 180, true,  15, false),
    ('Appartement familial à Hay Nahda',        'apartment', 'sale',      'available', 980000,   'Hay Nahda',    'Rabat',   3, 1, 90,  false, 1,  false),
    ('Villa à rénover à Bir Kacem',             'villa',     'sale',      'available', 4200000,  'Bir Kacem',    'Rabat',   4, 3, 380, false, 2,  false),
    ('Appartement meublé à Agdal',              'apartment', 'rent_short','available', 900,      'Agdal',        'Rabat',   2, 1, 70,  true,  3,  false),
    ('Penthouse avec terrasse à Hay Riad',      'apartment', 'sale',      'available', 4600000,  'Hay Riad',     'Rabat',   4, 3, 240, false, 4,  false),
    ('Appartement à Hassan, proche tramway',    'apartment', 'sale',      'reserved',  1450000,  'Hassan',       'Rabat',   2, 2, 95,  false, 5,  true),
    ('Villa contemporaine à Souissi',           'villa',     'sale',      'reserved',  15500000, 'Souissi',      'Rabat',   7, 6, 1100,false, 6,  true),
    ('Appartement à Agdal, rue de Fès',         'apartment', 'rent_long', 'available', 9000,     'Agdal',        'Rabat',   3, 2, 110, false, 7,  false),
    ('Appartement vue mer, Harhoura',           'apartment', 'rent_long', 'available', 12000,    'Harhoura',     'Témara',  2, 2, 100, true,  10, false),
    ('Villa à Hay Riad, secteur 11',            'villa',     'rent_long', 'available', 25000,    'Hay Riad',     'Rabat',   5, 4, 450, false, 11, false),
    ('Studio à l''Océan',                       'apartment', 'rent_long', 'available', 4800,     'Océan',        'Rabat',   1, 1, 40,  true,  12, false),
    ('Appartement à Hay Riad, vendu',           'apartment', 'sale',      'available', 2100000,  'Hay Riad',     'Rabat',   3, 2, 125, false, 13, false),
    ('Villa à Harhoura, vendue',                'villa',     'sale',      'available', 5400000,  'Harhoura',     'Témara',  4, 3, 350, false, 14, false),
    ('Appartement à Souissi',                   'apartment', 'sale',      'available', 3300000,  'Souissi',      'Rabat',   3, 3, 170, false, 15, false),
    ('Nouveau mandat à Agdal (à compléter)',    'apartment', 'sale',      'draft',     null,     'Agdal',        'Rabat',   2, 1, null,null,  8,  false)
  ) as t(title, ptype, purpose, status, price, hood, city, bed, bath, m2, furn, owner_no, online) loop
    insert into public.properties (org_id, title, property_type, purpose, status, price_cents, city, neighborhood,
                                   bedrooms, bathrooms, area_m2, furnished, description, address_note)
    values (v_org, r.title, r.ptype::public.property_type, r.purpose::public.deal_purpose, r.status::public.property_status,
            r.price::bigint * 100, r.city, r.hood, r.bed, r.bath, r.m2, r.furn,
            case when r.price is null then null else r.title || '. Bien entretenu, quartier calme et recherché, proche des commerces, écoles et transports. Visite sur rendez-vous.' end,
            'Adresse exacte : voir dossier (jamais publique)')
    returning id into d_id;
    p := p || d_id;
    insert into public.property_parties (org_id, property_id, person_id, role) values (v_org, d_id, ow[r.owner_no], 'owner');
    if r.status <> 'draft' then
      insert into public.property_mandates (org_id, property_id, owner_person_id, basis, status, valid_from, valid_until, evidence_note)
      values (v_org, d_id, ow[r.owner_no], 'written', 'active', current_date - 60,
              case when array_length(p, 1) in (3, 8) then current_date + 12   -- loopt bijna af: taak "Renew mandate"
                   else current_date + 120 end,
              'Mandat signé, scan au dossier');
    end if;
    if r.online then
      update public.properties set is_published = true where id = d_id;
    end if;
  end loop;

  -- Een verlopen mandaat (pand 18)
  update public.property_mandates set valid_until = current_date - 5, valid_from = current_date - 185 where property_id = p[18];

  -- Klanten en leads (15)
  for r in select * from (values
    ('Amine Squalli',        '+212662000101', 'sale',      'active',  '{apartment}',       'Rabat',  'Agdal,Hassan',   1200000,  1800000, 2),
    ('Sara Bouzidi',         '+212662000102', 'sale',      'viewing', '{villa}',           'Rabat',  'Souissi',        9000000,  14000000,4),
    ('Jamal Tahiri',         '+212662000103', 'rent_long', 'new',     '{apartment}',       'Rabat',  'Agdal',          5000,     8000,    1),
    ('Meryem Lamrani',       '+212662000104', 'sale',      'viewing', '{apartment,villa}', 'Témara', 'Harhoura',       2000000,  3000000, 2),
    ('Hamza Naciri',         '+212662000105', 'rent_long', 'active',  '{office}',          'Rabat',  'Hay Riad',       12000,    20000,   0),
    ('Kenza Zniber',         '+212662000106', 'sale',      'new',     '{apartment}',       'Salé',   'Prestigia',      1500000,  2000000, 3),
    ('Ayoub El Ghazi',       '+212662000107', 'rent_long', 'viewing', '{apartment}',       'Rabat',  'Hassan',         7000,     9500,    2),
    ('Ghita Benkirane',      '+212662000108', 'sale',      'active',  '{riad}',            'Rabat',  'Médina',         3000000,  4500000, 4),
    ('Thomas & Eva de Vries (NL)', '+31612000109', 'sale', 'active',  '{villa,house}',     'Témara', 'Harhoura',       4000000,  10000000,3),
    ('Zakaria Mouline',      '+212662000110', 'rent_long', 'new',     '{apartment}',       'Rabat',  'Souissi',        12000,    18000,   3),
    ('Houda Skalli',         '+212662000111', 'sale',      'won',     '{apartment}',       'Rabat',  'Hay Riad',       1800000,  2200000, 3),
    ('Reda Filali',          '+212662000112', 'sale',      'won',     '{villa}',           'Témara', 'Harhoura',       5000000,  6000000, 4),
    ('Soukaina Hajji',       '+212662000113', 'sale',      'lost',    '{apartment}',       'Rabat',  'Océan',          900000,   1100000, 2),
    ('Nabil Cherkaoui',      '+212662000114', 'sale',      'viewing', '{villa}',           'Rabat',  'Souissi',        12000000, 16000000,5),
    ('Yasmine Alami',        '+212662000115', 'rent_short','new',     '{house,apartment}', 'Skhirat','Plage',          null,     3000,    2)
  ) as t(name, tel, purpose, status, types, city, hoods, bmin, bmax, beds) loop
    insert into public.people (org_id, full_name, phone, whatsapp) values (v_org, r.name, r.tel, r.tel) returning id into d_id;
    cl := cl || d_id;
    insert into public.leads (org_id, person_id, purpose, status, property_types, city, neighborhoods,
                              budget_min_cents, budget_max_cents, min_bedrooms, last_contact_at)
    values (v_org, d_id, r.purpose::public.deal_purpose, r.status::public.lead_status, r.types::public.property_type[], r.city,
            string_to_array(r.hoods, ','), r.bmin::bigint * 100, r.bmax::bigint * 100, r.beds,
            now() - (array_length(cl, 1) * interval '2 days'))
    returning id into d_id;
    ld := ld || d_id;
  end loop;

  -- Bezichtigingen: eerder (met uitkomst) en komende dagen
  insert into public.viewings (org_id, lead_id, property_id, scheduled_at, status, outcome, notes) values
    (v_org, ld[2],  p[2],  now() - interval '6 days',  'done', 'interested',     'Aime le jardin, veut revenir avec son mari'),
    (v_org, ld[4],  p[4],  now() - interval '4 days',  'done', 'offer_made',     'Offre orale à 2,2 MDH'),
    (v_org, ld[1],  p[12], now() - interval '3 days',  'done', 'not_interested', 'Trop petit'),
    (v_org, ld[7],  p[6],  now() - interval '2 days',  'done', 'interested',     null),
    (v_org, ld[14], p[22], now() - interval '9 days',  'done', 'offer_made',     'Négociation en cours'),
    (v_org, ld[3],  p[5],  now() - interval '1 day',   'no_show', null,          'Pas venu, relancer'),
    (v_org, ld[1],  p[1],  date_trunc('day', now()) + interval '1 day 10 hours',  'scheduled', null, null),
    (v_org, ld[2],  p[2],  date_trunc('day', now()) + interval '2 days 16 hours', 'scheduled', null, 'Deuxième visite avec le mari'),
    (v_org, ld[9],  p[11], date_trunc('day', now()) + interval '3 days 11 hours', 'scheduled', null, 'Clients néerlandais, visite en anglais'),
    (v_org, ld[8],  p[7],  date_trunc('day', now()) + interval '4 days 15 hours', 'scheduled', null, null);

  -- Deals
  insert into public.deals (org_id, lead_id, property_id, stage, price_cents, commission_pct, commission_cents, notes)
  values (v_org, ld[4], p[4], 'offer', 220000000, 2.5, 5500000, 'Offre à 2,2 MDH, propriétaire réfléchit');
  insert into public.deals (org_id, lead_id, property_id, stage, price_cents, commission_pct, commission_cents, notes)
  values (v_org, ld[1], p[21], 'accepted', 140000000, 2.5, 3500000, 'Compromis prévu chez le notaire');
  insert into public.deals (org_id, lead_id, property_id, stage, price_cents, commission_pct, commission_cents, notes)
  values (v_org, ld[14], p[22], 'accepted', 1500000000, 2, 30000000, 'Accord sur 15 MDH');
  insert into public.deals (org_id, lead_id, property_id, stage, price_cents, commission_pct, commission_cents, signed_at, notes)
  values (v_org, ld[11], p[27], 'signed', 205000000, 2.5, 5125000, now() - interval '10 days', 'Acte signé, commission à encaisser')
  returning id into d_id;
  insert into public.people (org_id, full_name, phone, whatsapp, notes)
  values (v_org, 'Hassan Rami (Immo Salé)', '+212663000201', '+212663000201', 'Confrère') returning id into coagent;
  insert into public.deal_splits (org_id, deal_id, person_id, agency_name, kind, share_pct, agreement_note)
  values (v_org, d_id, coagent, 'Immo Salé', 'co_agent', 30, 'Accord WhatsApp du ' || to_char(current_date - 12, 'DD/MM/YYYY'));
  insert into public.deals (org_id, lead_id, property_id, stage, price_cents, commission_pct, commission_cents, signed_at, paid_at, notes)
  values (v_org, ld[12], p[28], 'paid', 530000000, 2.5, 13250000, now() - interval '35 days', now() - interval '20 days', 'Commission reçue');
  insert into public.deals (org_id, lead_id, property_id, stage, price_cents, commission_pct, commission_cents, lost_reason)
  values (v_org, ld[13], p[12], 'lost', 115000000, 2.5, 2875000, 'Crédit refusé');

  -- Huurders en huurovereenkomsten (4 panden verhuurd), met 6 maanden geschiedenis
  for r in select * from (values
    (23, 'Adil Mansouri',    '+212664000301', 9000,  5),
    (24, 'Sophie Laurent',   '+33612000302',  12000, 1),
    (25, 'Famille Benali',   '+212664000303', 25000, 1),
    (26, 'Ilyas Ouchen',     '+212664000304', 4800,  10)
  ) as t(prop_no, name, tel, rent, pday) loop
    insert into public.people (org_id, full_name, phone, whatsapp, notes) values (v_org, r.name, r.tel, r.tel, 'Locataire') returning id into d_id;
    tn := tn || d_id;
    insert into public.property_parties (org_id, property_id, person_id, role) values (v_org, p[r.prop_no], d_id, 'tenant');
    insert into public.leases (org_id, property_id, tenant_person_id, rent_cents, deposit_cents, start_date, end_date, payment_day)
    values (v_org, p[r.prop_no], d_id, r.rent::bigint * 100, r.rent::bigint * 200, current_date - 200, current_date + 165, r.pday)
    returning id into d_id;
    ls := ls || d_id;
    -- maandhuren van de afgelopen 6 maanden: betaald, behalve de laatste twee bij de eerste huurder (achterstand)
    for m in reverse 6..0 loop
      due := make_date(extract(year from (current_date - make_interval(months => m)))::int,
                       extract(month from (current_date - make_interval(months => m)))::int, r.pday);
      continue when due > current_date or due < current_date - 200;
      insert into public.rent_payments (org_id, lease_id, due_date, amount_cents, status, paid_on)
      values (v_org, d_id, due, r.rent::bigint * 100,
              case when r.prop_no = 23 and m <= 1 then 'due'::public.rent_payment_status else 'paid'::public.rent_payment_status end,
              case when r.prop_no = 23 and m <= 1 then null else due + 2 end);
    end loop;
  end loop;

  -- Reparateurs en onderhoud
  insert into public.people (org_id, full_name, phone, whatsapp, notes)
  values (v_org, 'Mustapha (plombier)', '+212665000401', '+212665000401', 'Plombier, rapide et fiable') returning id into plumber;
  insert into public.people (org_id, full_name, phone, whatsapp, notes)
  values (v_org, 'Said (électricien)', '+212665000402', '+212665000402', 'Électricien') returning id into electrician;
  insert into public.maintenance_requests (org_id, property_id, reported_by_person_id, assigned_person_id, title, description,
                                           priority, status, reported_on, done_on, cost_cents, cost_borne_by) values
    (v_org, p[23], tn[1], plumber,     'Fuite sous l''évier de la cuisine', 'Le locataire signale une fuite depuis hier', 'urgent', 'open',        current_date - 1,  null,              null,   null),
    (v_org, p[24], tn[2], electrician, 'Prise du salon ne fonctionne plus', null,                                          'normal', 'in_progress', current_date - 4,  null,              null,   'owner'),
    (v_org, p[25], tn[3], plumber,     'Chauffe-eau remplacé',              'Ancien chauffe-eau hors service',             'normal', 'done',        current_date - 40, current_date - 37, 280000, 'owner'),
    (v_org, p[26], tn[4], null,        'Peinture de la chambre',            'À prévoir avant l''été',                      'low',    'open',        current_date - 10, null,              null,   'tenant');

  -- Taken
  insert into public.tasks (org_id, title, notes, due_date, assigned_to, lead_id, property_id) values
    (v_org, 'Rappeler Jamal pour un nouveau rendez-vous', 'Pas venu à la visite du studio', current_date,     v_user, ld[3],  p[5]),
    (v_org, 'Envoyer le compromis au notaire',           null,                             current_date + 1, v_user, ld[1],  p[21]),
    (v_org, 'Photos professionnelles de la villa Souissi', null,                           current_date + 2, v_user, null,   p[2]),
    (v_org, 'Relancer le propriétaire sur l''offre de 2,2 MDH', null,                      current_date,     v_user, ld[4],  p[4]),
    (v_org, 'Encaisser la commission Hay Riad',          'Acte signé il y a 10 jours',     current_date - 2, v_user, ld[11], p[27]),
    (v_org, 'Compléter le nouveau mandat à Agdal',       'Prix et surface manquent',       current_date + 3, v_user, null,   p[30]);
  insert into public.tasks (org_id, title, due_date, status, completed_at, assigned_to, lead_id)
  values (v_org, 'Envoyer une sélection à Sara', current_date - 5, 'done', now() - interval '5 days', v_user, ld[2]);

  -- Automatische taken voor mandaten die bijna aflopen of verlopen zijn
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  perform public.sync_mandate_tasks(v_org, 'Renouveler le mandat');

  raise notice 'Demo-kantoor klaar: Amplify Immobilier (démo), code demo-immobilier.';
end
$seed$;
