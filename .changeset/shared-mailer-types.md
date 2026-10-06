---
'@nxgt/shared': patch
---

Ship `@types/nodemailer` as a dependency. The built `dist/types/mailer.d.ts` imports `createTransport` from `nodemailer` to type `SendMailOptions`, but the types were only a devDependency, so a consumer with `skipLibCheck: false` got TS7016 and with `skipLibCheck: true` got `SendMailOptions` as `any`.
