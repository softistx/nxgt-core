---
"@nxgt/shared": patch
---

`omit` returns a copy without the given keys and leaves the object passed in as it is; it used to delete the keys from that object and return it. A caller that relied on the deletion must use the returned object. `assign`'s documentation now says what it does: it modifies `target` and returns nothing.
