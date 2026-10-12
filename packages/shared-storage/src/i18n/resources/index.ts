import { resources as shared } from '@nxgt/i18n';
import en from './en.json';
import filesEn from './files.en.json';
import filesFr from './files.fr.json';
import fr from './fr.json';

export const resources = {
	en: {
		storage: en,
		// GridFSService's keys, which predate the `storage` namespace.
		files: filesEn,
		...shared.en,
	},
	fr: {
		storage: fr,
		files: filesFr,
		...shared.fr,
	},
};
