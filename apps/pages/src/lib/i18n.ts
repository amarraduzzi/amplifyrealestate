// Languages of the public pages: French, Arabic (right to left) and English.
// Same idea as the desk app: the English text is the key. t('Call') returns the translation, or the
// English text when a translation is missing, so a visitor never sees a blank.
// Variables: t('Confirmed {n} days ago', { n: 3 }).
//
// Arabic and French here are a careful first version: have a native speaker read them once before
// you send the links to many clients.

export type Lang = 'fr' | 'ar' | 'en';
export const LANGS: { id: Lang; name: string }[] = [
  { id: 'fr', name: 'Français' },
  { id: 'ar', name: 'العربية' },
  { id: 'en', name: 'English' },
];

const isLang = (x: unknown): x is Lang => x === 'fr' || x === 'ar' || x === 'en';
const KEY = 'pages-lang';
let current: Lang = 'fr';
export const getLang = () => current;

export function applyLang(l: Lang) {
  current = l;
  const root = document.documentElement;
  root.lang = l;
  root.dir = l === 'ar' ? 'rtl' : 'ltr';
}

export function saveLang(l: Lang) {
  try { localStorage.setItem(KEY, l); } catch { /* private mode: keep it for this visit only */ }
}

/** ?lang= in the link wins (the agent picks the language when sharing), then the last choice, then the phone language. French by default. */
export function detectLang(): Lang {
  const q = new URLSearchParams(window.location.search).get('lang');
  if (isLang(q)) { saveLang(q); return q; }
  try { const s = localStorage.getItem(KEY); if (isLang(s)) return s; } catch { /* ignore */ }
  const nav = (navigator.language || '').toLowerCase();
  if (nav.startsWith('ar')) return 'ar';
  if (nav.startsWith('en')) return 'en';
  return 'fr';
}

const FR: Record<string, string> = {
  'Available properties': 'Biens disponibles',
  'All': 'Tous',
  'For sale': 'À vendre',
  'Long-term rent': 'Location longue durée',
  'Short-term rent': 'Location courte durée',
  '/ month': '/ mois',
  '/ night': '/ nuit',
  'Apartment': 'Appartement', 'Villa': 'Villa', 'Riad': 'Riad', 'House': 'Maison', 'Land': 'Terrain',
  'Shop': 'Local commercial', 'Office': 'Bureau', 'Building': 'Immeuble', 'Other': 'Autre',
  'Available': 'Disponible', 'Reserved': 'Réservé', 'Rented': 'Loué', 'Sold': 'Vendu',
  'Bedrooms': 'Chambres', 'Bathrooms': 'Salles de bain', 'Area': 'Surface',
  'Furnished': 'Meublé', 'Unfurnished': 'Non meublé',
  'Price and availability': 'Prix et disponibilité',
  'Confirmed today': 'Confirmé aujourd’hui',
  'Confirmed yesterday': 'Confirmé hier',
  'Confirmed {n} days ago': 'Confirmé il y a {n} jours',
  'WhatsApp': 'WhatsApp',
  'Contact on WhatsApp': 'Écrire sur WhatsApp',
  'Call': 'Appeler',
  'Email': 'E-mail',
  'Share on WhatsApp': 'Partager sur WhatsApp',
  'Hello, I am interested in “{title}” ({ref}). {url}': 'Bonjour, je suis intéressé(e) par « {title} » ({ref}). {url}',
  'Hello, I would like information about your properties.': 'Bonjour, je souhaite des informations sur vos biens.',
  'This property is currently reserved. Contact us for similar properties.': 'Ce bien est actuellement réservé. Contactez-nous pour des biens similaires.',
  'This property has been rented. Contact us for similar properties.': 'Ce bien a été loué. Contactez-nous pour des biens similaires.',
  'This property has been sold. Contact us for similar properties.': 'Ce bien a été vendu. Contactez-nous pour des biens similaires.',
  'Reference': 'Référence',
  'Description': 'Description',
  'Details': 'Caractéristiques',
  'Location': 'Localisation',
  'The exact address is shared on request.': 'L’adresse exacte est communiquée sur demande.',
  'More properties from {office}': 'Autres biens de {office}',
  'Page not found': 'Page introuvable',
  'This property is no longer online, or the link is not correct.': 'Ce bien n’est plus en ligne, ou le lien est incorrect.',
  'This page does not exist, or the link is not correct.': 'Cette page n’existe pas, ou le lien est incorrect.',
  'No properties are online right now.': 'Aucun bien en ligne pour le moment.',
  'Something went wrong. Please try again.': 'Une erreur s’est produite. Veuillez réessayer.',
  'Try again': 'Réessayer',
  'Powered by Amplify Real Estate': 'Propulsé par Amplify Real Estate',
  'Open the link your agent sent you to see a property.': 'Ouvrez le lien envoyé par votre agent pour voir un bien.',
  'Moroccan real estate, shared simply.': 'L’immobilier au Maroc, partagé simplement.',
  'Language': 'Langue',
  'Photos': 'Photos',
  'Photo {i} of {n}': 'Photo {i} sur {n}',
  'Previous': 'Précédent',
  'Next': 'Suivant',
  'Close': 'Fermer',
  // Aanvraagformulier (6e)
  'Be called back': 'Être rappelé',
  'Leave your number, the agency will contact you.': 'Laissez votre numéro, l’agence vous contacte.',
  'I am looking for': 'Je cherche',
  'Your name': 'Votre nom',
  'Phone or WhatsApp': 'Téléphone ou WhatsApp',
  'Your message (optional)': 'Votre message (facultatif)',
  'Send my request': 'Envoyer ma demande',
  'Your details are only shared with this agency.': 'Vos coordonnées sont transmises uniquement à cette agence.',
  'Please enter your name.': 'Merci d’indiquer votre nom.',
  'Please enter a valid phone number.': 'Merci d’indiquer un numéro de téléphone valide.',
  'Please check your name and phone number.': 'Merci de vérifier votre nom et votre numéro.',
  'Too many requests right now. Please try again in a moment, or contact us on WhatsApp.': 'Trop de demandes en ce moment. Réessayez dans un instant, ou écrivez-nous sur WhatsApp.',
  'Sending failed. Check your connection and try again.': 'L’envoi a échoué. Vérifiez votre connexion et réessayez.',
  'Thank you, we will call you back': 'Merci, nous vous rappelons',
  'Your request has been sent to the agency.': 'Votre demande a bien été envoyée à l’agence.',
  // Kantoorwebsite (6g)
  'See our properties': 'Voir nos biens',
  'In figures': 'En chiffres',
  'Properties online': 'Biens en ligne',
  'For rent': 'À louer',
  'Sold or rented': 'Vendus ou loués',
  'Type': 'Type',
  'All types': 'Tous les types',
  'Neighborhood, city...': 'Quartier, ville...',
  'Search': 'Rechercher',
  'No property matches your search. Leave your number below and we will look for you.': 'Aucun bien ne correspond à votre recherche. Laissez votre numéro ci-dessous, nous cherchons pour vous.',
  'About us': 'Qui sommes-nous',
  'Our services': 'Nos services',
  'Contact': 'Contact',
};

const AR: Record<string, string> = {
  'Available properties': 'العقارات المتوفرة',
  'All': 'الكل',
  'For sale': 'للبيع',
  'Long-term rent': 'كراء طويل الأمد',
  'Short-term rent': 'كراء قصير الأمد',
  '/ month': '/ الشهر',
  '/ night': '/ الليلة',
  'Apartment': 'شقة', 'Villa': 'فيلا', 'Riad': 'رياض', 'House': 'منزل', 'Land': 'أرض',
  'Shop': 'محل تجاري', 'Office': 'مكتب', 'Building': 'عمارة', 'Other': 'أخرى',
  'Available': 'متوفر', 'Reserved': 'محجوز', 'Rented': 'مكترى', 'Sold': 'مباع',
  'Bedrooms': 'غرف النوم', 'Bathrooms': 'الحمامات', 'Area': 'المساحة',
  'Furnished': 'مفروش', 'Unfurnished': 'غير مفروش',
  'Price and availability': 'السعر والتوفر',
  'Confirmed today': 'تم التأكيد اليوم',
  'Confirmed yesterday': 'تم التأكيد أمس',
  'Confirmed {n} days ago': 'تم التأكيد منذ {n} أيام',
  'WhatsApp': 'واتساب',
  'Contact on WhatsApp': 'تواصل عبر واتساب',
  'Call': 'اتصال',
  'Email': 'البريد الإلكتروني',
  'Share on WhatsApp': 'مشاركة عبر واتساب',
  'Hello, I am interested in “{title}” ({ref}). {url}': 'مرحبا، أنا مهتم بالعقار «{title}» ({ref}). {url}',
  'Hello, I would like information about your properties.': 'مرحبا، أود الحصول على معلومات حول عقاراتكم.',
  'This property is currently reserved. Contact us for similar properties.': 'هذا العقار محجوز حاليا. تواصلوا معنا للاطلاع على عقارات مشابهة.',
  'This property has been rented. Contact us for similar properties.': 'تم كراء هذا العقار. تواصلوا معنا للاطلاع على عقارات مشابهة.',
  'This property has been sold. Contact us for similar properties.': 'تم بيع هذا العقار. تواصلوا معنا للاطلاع على عقارات مشابهة.',
  'Reference': 'المرجع',
  'Description': 'الوصف',
  'Details': 'المواصفات',
  'Location': 'الموقع',
  'The exact address is shared on request.': 'يتم تزويدكم بالعنوان الدقيق عند الطلب.',
  'More properties from {office}': 'عقارات أخرى من {office}',
  'Page not found': 'الصفحة غير موجودة',
  'This property is no longer online, or the link is not correct.': 'هذا العقار لم يعد منشورا، أو أن الرابط غير صحيح.',
  'This page does not exist, or the link is not correct.': 'هذه الصفحة غير موجودة، أو أن الرابط غير صحيح.',
  'No properties are online right now.': 'لا توجد عقارات منشورة حاليا.',
  'Something went wrong. Please try again.': 'حدث خطأ. يرجى المحاولة مرة أخرى.',
  'Try again': 'إعادة المحاولة',
  'Powered by Amplify Real Estate': 'بدعم من Amplify Real Estate',
  'Open the link your agent sent you to see a property.': 'افتح الرابط الذي أرسله لك الوكيل لعرض العقار.',
  'Moroccan real estate, shared simply.': 'العقار بالمغرب، بطريقة مبسطة.',
  'Language': 'اللغة',
  'Photos': 'الصور',
  'Photo {i} of {n}': 'الصورة {i} من {n}',
  'Previous': 'السابق',
  'Next': 'التالي',
  'Close': 'إغلاق',
  // Aanvraagformulier (6e)
  'Be called back': 'اطلب اتصالا',
  'Leave your number, the agency will contact you.': 'اترك رقمك وستتصل بك الوكالة.',
  'I am looking for': 'أبحث عن',
  'Your name': 'اسمك',
  'Phone or WhatsApp': 'الهاتف أو واتساب',
  'Your message (optional)': 'رسالتك (اختياري)',
  'Send my request': 'أرسل طلبي',
  'Your details are only shared with this agency.': 'معلوماتك تُرسل إلى هذه الوكالة فقط.',
  'Please enter your name.': 'المرجو كتابة اسمك.',
  'Please enter a valid phone number.': 'المرجو كتابة رقم هاتف صحيح.',
  'Please check your name and phone number.': 'المرجو التحقق من اسمك ورقمك.',
  'Too many requests right now. Please try again in a moment, or contact us on WhatsApp.': 'طلبات كثيرة حاليا. حاول بعد لحظة، أو راسلنا على واتساب.',
  'Sending failed. Check your connection and try again.': 'فشل الإرسال. تحقق من الاتصال وحاول مرة أخرى.',
  'Thank you, we will call you back': 'شكرا، سنتصل بك',
  'Your request has been sent to the agency.': 'تم إرسال طلبك إلى الوكالة.',
  // Kantoorwebsite (6g)
  'See our properties': 'شاهد عقاراتنا',
  'In figures': 'بالأرقام',
  'Properties online': 'عقارات معروضة',
  'For rent': 'للكراء',
  'Sold or rented': 'مباعة أو مكتراة',
  'Type': 'النوع',
  'All types': 'كل الأنواع',
  'Neighborhood, city...': 'الحي، المدينة...',
  'Search': 'بحث',
  'No property matches your search. Leave your number below and we will look for you.': 'لا يوجد عقار يطابق بحثك. اترك رقمك أسفله وسنبحث لك.',
  'About us': 'من نحن',
  'Our services': 'خدماتنا',
  'Contact': 'اتصل بنا',
};

export function t(en: string, vars?: Record<string, string | number>): string {
  const dict = current === 'ar' ? AR : current === 'fr' ? FR : null;
  let s = dict ? (dict[en] ?? en) : en;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
  return s;
}
