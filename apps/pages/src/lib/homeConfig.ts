// Settings of the marketing home page (/). Change them here, nothing else needs to move.
// A link or number left empty hides the button that uses it, so the page never shows a dead button.

/** Amplify's own WhatsApp number, digits only with country code (for example 2126XXXXXXXX). */
export const CONTACT_WHATSAPP = '';
/** The address of the desk app, where an agent signs up (for example https://desk.example.pages.dev). */
export const DESK_URL = '';
/** The address of a demo office website, so a visitor can look for themselves (for example /demo-immo). */
export const DEMO_URL = '';

/** Prices in DH. A starting point, not tested on the market: change them to what you decide. */
export const PRICES = {
  agent: { month: 99, year: 990, freeProperties: 3 },
  agence: { month: 299, year: 2990, members: 5 },
  agencePlus: { month: 599, year: 5990, members: 15 },
};

/** The pilot offer for the first offices. Only promise what you will keep. */
export const PILOT = { offices: 10, freeMonths: 3, priceAfter: 199 };
