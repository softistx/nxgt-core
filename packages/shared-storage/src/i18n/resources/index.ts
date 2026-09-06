import { resources as shared } from '@nxgt/i18n';
import en from './en.json';
import fr from './fr.json';

export const resources = {
	en: {
		storage: en,
		...shared.en,
	},
	fr: {
		storage: fr,
		...shared.fr,
	},
};
