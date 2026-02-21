import { resources as shared } from '@nxgt/i18n';
import en from './en.json';
import fr from './fr.json';

export const resources = {
	en: {
		...en,
		...shared.en,
	},
	fr: {
		...fr,
		...shared.fr,
	},
};
