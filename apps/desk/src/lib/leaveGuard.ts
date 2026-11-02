import { t } from './i18n';

/** A screen with unsaved changes tells the app here, so leaving it can ask first. */
let unsaved = false;
export const setUnsaved = (v: boolean) => { unsaved = v; };
export const confirmLeave = () => !unsaved || window.confirm(t('You have unsaved changes. Leave without saving?'));
