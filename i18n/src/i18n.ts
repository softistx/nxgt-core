import { cast } from '@nxgt/shared/helpers';
import { logger } from '@nxgt/shared/logging';
import { tryGetContext } from 'hono/context-storage';
import { IntlMessageFormat } from 'intl-messageformat';
import _ from 'lodash';
import { resources } from './resources';
import type { LocaleKey, TranslationContext } from './types';

export function createTranslator<K extends string = LocaleKey>(
	resources: Record<string, any> = {},
) {
	return (key: K, context: TranslationContext = undefined) => {
		const language = tryGetContext()?.get('language' as never) ?? 'en';

		let message: string = _.get(resources[language], key) ?? key;
		try {
			message = cast(new IntlMessageFormat(message, language).format(context));
		} catch (e) {
			logger.error(e);
		}

		return message;
	};
}

export const translate = createTranslator(resources);
