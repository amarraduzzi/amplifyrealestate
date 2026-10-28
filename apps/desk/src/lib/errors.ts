// One place that turns an error (from the database, from storage, from sign-in or from the network)
// into a sentence in the language of the app. Screens call friendly(error) instead of showing error.message.
//
// The database answers with short codes ("plan_expired", "laatste_eigenaar") or technical messages
// ("new row violates row-level security policy"). Nobody should have to read those, least of all in
// French or Arabic. When a message is not known, a general sentence is shown with the original in
// brackets, so it can still be reported and found.

import { getLang, t } from './i18n';

type Rule = [test: RegExp, text: string, vars?: Record<string, number>];

// The English sentence is the translation key (see lib/i18n.ts). Most of these sentences already exist
// because a screen used them before; the rest were added with the French and Arabic lists.
const RULES: Rule[] = [
  // Plan
  [/plan_expired/, 'Your plan has ended. You can still look at everything, but not change anything.'],
  [/plan_limit_properties/, 'You have reached the maximum number of properties of your plan.'],
  [/plan_limit_members/, 'You have reached the maximum number of team members of your plan.'],

  // Team
  [/gebruiker_niet_gevonden/, 'There is no account with this email address yet. Ask the person to create an account first, then add them here.'],
  [/laatste_eigenaar/, 'An office needs at least one owner.'],
  [/alleen_eigenaar/, 'Only an owner can do this with an owner.'],
  [/lid_niet_gevonden/, 'This person is no longer a member.'],
  [/verantwoordelijke_is_geen_lid/, 'The person you chose is no longer a member of the team.'],

  // Public page and link name
  [/publiceren_vereist_beschikbaar_pand/, 'Only available or reserved properties can be published.'],
  [/publiceren_vereist_actief_mandaat/, 'Add an active mandate first (see Mandate above). Without it the property cannot go online.'],
  [/adresnaam_bezet/, 'This name is already taken.'],
  [/adresnaam_ongeldig/, 'Use only letters and numbers, with single hyphens between words (3 to 40 characters).'],
  [/adresnaam_gereserveerd/, 'This name cannot be used.'],
  [/adresnaam_te_vaak/, 'The name in the link can be changed at most 5 times.'],

  // Deals, shares, leases
  [/verdeling_boven_100/, 'The shares add up to more than 100%.'],
  [/geen_commissiebedrag/, 'Fill in the commission amount of the deal first (Edit), then mark the share as paid.'],
  [/deal_splits_deal_id_person_id_key/, 'This person already has a share in this deal.'],
  [/betaalde verdeling kan niet meer van percentage/, 'A share that has been paid can no longer change its percentage.'],
  [/deals_open_idx/, 'There is already a deal for this lead and this property.'],
  [/pand_is_geen_huurpand/, 'This property is for sale, not for rent. Change its purpose first.'],
  [/leases_one_active_idx/, 'This property already has a running lease. End that one first.'],
  [/leases_check.*end_date|end_date.*leases_check/, 'The end date cannot be before the start date.'],

  // Limits
  [/maximaal_20_fotos/, 'A property can have at most {n} photos.', { n: 20 }],
  [/maximaal_20_documenten/, 'A deal can have at most {n} documents.', { n: 20 }],

  // Fields that are locked once saved (the database says so in Dutch)
  [/kunnen niet gewijzigd worden|kan niet gewijzigd worden|mag niet gewijzigd worden|onveranderlijk/, 'This can no longer be changed.'],

  // Something that is gone
  [/lead_niet_gevonden|pand_niet_gevonden|kantoor_niet_gevonden/, 'This item no longer exists. Reload the page.'],

  // Permission (the database, the storage rules and the app all have their own words for it)
  [/niet_toegestaan|geen_toegang|niet_ingelogd|no_permission|row-level security|permission denied|not authorized|insufficient_privilege/i, 'You do not have permission to do this.'],

  // Sign in and sign up (messages of the login service)
  [/invalid login credentials|invalid_credentials/i, 'Wrong email or password.'],
  [/user already registered|already been registered|user_already_exists|email_exists/i, 'There is already an account with this email address. Sign in instead.'],
  [/email not confirmed|email_not_confirmed/i, 'Confirm your email address first: open the link we emailed you.'],
  [/rate limit|too many requests|over_email_send_rate_limit|over_request_rate_limit/i, 'Too many attempts. Wait a few minutes and try again.'],
  [/signups? (are |is )?(not allowed|disabled)|signup_disabled/i, 'New accounts cannot be created right now.'],
  [/weak_password|pwned|password is known to be weak/i, 'This password is too easy to guess. Choose another one.'],
  [/invalid format|validate email|invalid email|email_address_invalid/i, 'This email address does not look right.'],

  // Session and connection
  [/jwt expired|invalid jwt|refresh_token_not_found|invalid refresh token|session_not_found|session expired/i, 'Your session has expired. Sign in again.'],
  [/failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet_disconnected/i, 'No connection. Check your internet and try again.'],

  // Files
  [/payload too large|exceeded the maximum allowed size|entity too large/i, 'This file is too large.'],
  [/mime type .* is not supported|not an allowed mime/i, 'This type of file is not allowed.'],
];

const PASSWORD_MIN = /password should be at least (\d+)/i;

function textOf(e: unknown): { message: string; code: string } {
  if (typeof e === 'string') return { message: e, code: '' };
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; code?: unknown; error_description?: unknown };
    const message = typeof o.message === 'string' ? o.message : typeof o.error_description === 'string' ? o.error_description : '';
    return { message, code: typeof o.code === 'string' ? o.code : '' };
  }
  return { message: '', code: '' };
}

/** The sentence to show for an error. Never empty, never a bare code. */
export function friendly(e: unknown): string {
  const { message, code } = textOf(e);
  if (!message && !code) return t('Something went wrong.');

  const pw = PASSWORD_MIN.exec(message);
  if (pw) return t('The password must have at least {n} characters.', { n: Number(pw[1]) });

  for (const [test, text, vars] of RULES) {
    if (test.test(message) || (code && test.test(code))) return t(text, vars);
  }
  if (code === '42501') return t('You do not have permission to do this.');
  if (code === '23505') return t('This already exists.');

  // Unknown. A plain English message is fine for an English screen; everything else gets a general
  // sentence, with the original behind it so it can still be reported.
  const machineLike = /^[a-z0-9_ ]+$/.test(message) && /_/.test(message);
  if (!machineLike && getLang() === 'en') return message;
  return message ? `${t('Something went wrong.')} (${message.length > 160 ? message.slice(0, 157) + '…' : message})` : t('Something went wrong.');
}
