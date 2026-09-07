---
'@nxgt/edge': minor
---

The package stops defining itself by the thing it replaced.

Every comment that explained a behaviour as "unlike Ory Oathkeeper" now states
the rule itself, which is what stays true once that service is gone — an
authority that cannot answer is a 503, a request no rule names is a 404, the
edge answers `/health` for itself because every fronted app serves that same
path. One of those mentions was inside a Zod `.describe()` string and therefore
shipped in the generated JSON Schema; the `upstream` field now explains
`${VAR}` expansion by what it buys rather than by who lacks it.

`mirror` mode keeps its mechanism and loses its story. It was built to shadow
one specific predecessor, but `mirrorUpstream` is any URL, and the property
that makes it valuable is general: a change can decide and log against real
traffic without being able to break it. It is documented now as how you
validate the next change — a new authenticator, a reworked rules document, a
newly fronted app.

Removes the `yaml` dependency, which was declared and never imported: the
package takes documents already parsed.
