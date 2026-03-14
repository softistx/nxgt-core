import type { createTransport } from 'nodemailer';

export type SendMailOptions = Parameters<
	ReturnType<typeof createTransport>['sendMail']
>[0];
