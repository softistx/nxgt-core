---
name: handle-a-file-upload
description: >-
  Take a file from a browser to object storage without it passing through the
  API: a mutation that returns a presigned PUT URL and a storage key, a lazy
  module-level bucket singleton, the MIME type derived server-side, a raw-key
  field beside a resolved-URL field for media that can be replaced, and
  `S3UploadFormField` on the other side. Use when a module accepts an image,
  a document or any attachment, or when a form needs an upload control.
---

# Skill: Handle a file upload

## Purpose

**Bytes never go through the API.** A client asks for a presigned URL, PUTs the
file straight to object storage, and sends back only the key. This is the default
for every attachment in these repositories — an image, a logo, a document — and
it is the same on both sides of the wire, so both halves are here.

Reference implementations: `softistx/self-learning/apps/api`'s
`questions.storage.ts` + `createQuestionUploadUrl` (create-once media, one
field), and `nxgt-federation/apps/services/platform`'s articles, brands and
addresses (editable media, two fields). The UI half is
`softistx/content-hub/apps/ui`'s `use-content-upload-field.ts`.

---

## 1. The mutation takes a filename, and nothing else

```graphql
input CreateQuestionUploadUrlInput { filename: String! }
type UploadUrl { uploadUrl: String!  storageKey: String! }
```

```ts
async createUploadUrl(input: CreateQuestionUploadUrlInput) {
	const storageKey = `${crypto.randomUUID()}-${input.filename}`;
	const uploadUrl = getQuestionStorage().presing(storageKey, {
		method: 'PUT',
		expiresIn: 900,
		type: Bun.file(input.filename).type || undefined,
		acl: 'public-read-write',
	});
	return { uploadUrl, storageKey };
}
```

- **No client-supplied `mimeType`.** `Bun.file(name).type` infers it from the
  extension without the file existing, and an unvalidated content type from a
  client is something to avoid taking, not something to forward.
- **The filename stays in the key**, behind a random prefix, so the object keeps a
  useful extension and two uploads of `scan.pdf` do not collide.
- **The ACL is explicit.** `StorageService.presing()` passes its options straight
  to Bun's `S3Client.presign` and adds **no default** — a call site that needs
  `public-read-write` says so, and one that does not, does not. (An older skill
  claimed the package defaulted it. It does not; measured in
  `packages/shared-storage/src/services/storage.service.ts`.)
- `presing` is spelled that way in `@nxgt/shared-storage`. It is a typo in a
  published API, not a different method.

## 2. The bucket handle is a lazy module-level singleton

```ts
// questions.storage.ts — the whole file
export const getQuestionStorage = createLazyStorage('question-media');
```

`StorageService`'s constructor fires an **unawaited** bucket-existence check
against MinIO, so it must not be constructed eagerly — and it must be a
module-level `const`, never a class field or getter on a service that is
constructed per request (`new QuestionService(user)`), or the "lazy" check
re-fires on the first storage call of most requests.

`createLazyStorage(bucket)` from `@nxgt/shared-storage` is that getter; do not
hand-roll it.

**One feature-scoped bucket per module** — `article-images`, `brand-logos`,
`address-photos` — not one per app. Two apps use one bucket per app only because
each currently has a single media-bearing module; that stops being the pattern the
moment a second one appears.

## 3. One field or two, depending on whether the media can change

**Create-once media** (the upload control only ever appears in a create form)
needs **one** field: the resolved download URL, computed on every read, never
persisted.

```ts
resolveMediaUrl(mediaKey?: string | null) {
	if (!mediaKey) return null;
	return getQuestionStorage().presing(mediaKey, { expiresIn: 900 });
}
```

**Editable media** (add, remove, replace after creation) needs **two**:

| field | what it is |
| --- | --- |
| `Article.images: [String!]` | resolved fresh presigned GET URLs, never stored |
| `Article.imageKeys: [String!]` | the raw persisted keys — what the widget edits and what the inputs accept |

Rename the input field to match the key (`imageKeys`, `logoKey`, `photoKeys`):
calling it `images` when it now holds a key is the bug that split reading from
writing in the first place.

The split exists because the upload widget can only render a thumbnail for a file
it holds locally, mid-upload. A previously-saved value is a bare key with nothing
to render — the resolved URL is for display, the raw key is for editing.

For a `[String!]` patched through the shared `StringListPatchInput`, the widget's
`string[]` maps to `{ replace: value }` where the mutation variables are built.
`patchListString` already treats `replace` as a wholesale override — do not diff
it into add/remove on the client.

## 4. The UI half: one hook per uploadable field

```ts
export function useArticleImageUploadField() {
	const { t } = useTranslation();
	const [createUploadUrl] = useMutation(CREATE_ARTICLE_IMAGE_UPLOAD_URL, {
		successMessage: null,
		errorMessage: t('articles.messages.upload-url-failed'),
	});

	const getPresignedUrl = useCallback(async (file: File) => {
		const { data } = await createUploadUrl({ variables: { input: { filename: file.name } } });
		if (!data) throw new Error(t('articles.messages.upload-url-failed'));
		const { uploadUrl, storageKey } = data.createArticleImageUploadUrl;
		return { uploadUrl, publicUrl: storageKey };
	}, [createUploadUrl, t]);

	return { getPresignedUrl };
}
```

`publicUrl: storageKey` is deliberate, not a naming slip: `S3UploadField`'s
contract is `(file: File) => Promise<{ uploadUrl, publicUrl, headers? }>` and it
reports back only `publicUrl` as the field's new value — which here is the key.
Add the `<module>.messages.upload-url-failed` key in **both** locales beside it.

Then swap the field component, not the mutation shape:

```tsx
<S3UploadFormField
	control={control}
	name="imageKeys"          // the raw-key field, never the resolved-URL one
	mode="multiple"           // or "single"; both are native, no wrapper needed
	accept="image/*"
	getPresignedUrl={getPresignedUrl}
/>
```

`NetworkUploadFieldProps` has no `placeholder` — TypeScript rejects it as an
excess property.

**An editable-media form also needs a preview strip**, because the widget cannot
render a saved value. Render the *resolved* URL field as `<img>` thumbnails with a
remove affordance, and wire the removal back into the raw-key field — `setValue('logoKey', null)`
for `mode="single"`, filter the key array by index for `mode="multiple"`.

## Traps

- **A presigned GET URL is never persisted.** It expires; a stored one becomes a
  broken image with no error anywhere. Store the key, resolve on read.
- **`expiresIn` is seconds.** 900 is the house value for both directions.
- **An upload that succeeds and a record that does not** leaves an orphan object.
  Accept it, or reap by key prefix; do not try to make the two atomic.
- **The key is user-influenced.** It is prefixed with a random id and used only as
  an object key, never joined into a filesystem path.

---

## Checking it

```bash
grep -rn 'createLazyStorage' src/modules/*/*.storage.ts   # one per media module
grep -rn 'new StorageService' src                          # only inside createLazyStorage
grep -rn 'mimeType' src/**/*.graphqls                      # no client-supplied type
```

Then the round trip, which is the only real check: request the URL, `curl -X PUT
--upload-file` to it, read the record back and open the resolved URL. A 403 on the
PUT means the ACL or the method in the presign call does not match what the client
sends.
