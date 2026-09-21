# `compose-a-stack` in nxgt-docker

nxgt-docker is the platform layer: ~45 compose files under one directory per
service — postgres, mariadb, mongo, redis, minio, mailpit, kafka, rabbitmq,
jenkins, keycloak, traefik, the AI services, the monitoring stack. It owns two
things nothing else may own.

**It creates the `proxy` network.** `traefik/docker-compose.yaml` is the only
file with an `ipam` block for it; everywhere else, in this repo and in every
other, `proxy` is `external: true`. It is also where the entrypoints, the TLS
switch and the dashboard live, so traefik must be up before any other stack is
reachable by hostname.

**It is the registry of record for what is pinned.** After 2026-09-20 that list
is two entries, and the register is the comment above each:

| service | address | why |
| --- | --- | --- |
| traefik | `${PROXY_NET_PREFIX:-172.22.0}.2` | named by `TRAEFIK_ENTRYPOINTS_*_PROXYPROTOCOL_TRUSTEDIPS` |
| stalwart (mail) | `${PROXY_NET_PREFIX:-172.22.0}.5` | the same list |

29 other `ipv4_address` lines were removed. `PROXY_NET_PREFIX`'s default was
`172.20.0` while the live network is `172.22.0.0/24`, and nothing failed —
because a `subnet:` for a network that already exists is ignored with a warning
only, and a duplicated shell `export` was supplying the right value. Fixed in
both consumers. Do not trust a default here; read `docker network inspect proxy`.

## The state of this repo

- **No bind points outside its own project directory.** Every host volume moved
  to `./data/` on 2026-09-20, `DATA_DIR` is gone, and `data/` is gitignored. The
  exceptions are written down in `AGENTS.md`: the docker socket, `/etc/localtime`,
  `/etc/ssl`, `/etc/letsencrypt`, `/run/mysqld`, and jenkins' deliberately shared
  `~/.bun`, `~/.gradle`, `~/.m2`.
- **The 27 `.env` files are untracked**, each with a tracked `.env.example`
  carrying placeholders. The values on disk were not changed, so nothing needed
  reconfiguring. The secrets are still in the git history and are listed in
  `AGENTS.md` as needing rotation — two remain (a Cloudflare Tunnel token and an
  FRP server token), and neither can be regenerated from the machine.
- **The dashboard basicauth is `${TRAEFIK_DASHBOARD_USERS}`**, not a literal. The
  `$$apr1$$…` doubling that a label needs disappears when the hash moves into
  `.env`: compose interpolates that file, the label is no longer the place the
  escaping happens.
- `TRAEFIK_ENABLE` gates whether a container gets picked up at all. It comes
  from the shell profile; a session started before that profile changed carries
  the old value into every container it creates.

## Ports here, after 2026-09-20

Nothing publishes for convenience, in development either. What is published is
what the port IS: traefik's `:80`/`:443` and its mail entrypoints, adguard's DNS
and DHCP, the `dms` listeners, `frps` on `:7000`. Eleven `docker-compose.dev.yaml`
files whose only job was publishing an HTTP console were deleted — a console needs
a router, and `mailpit.${HOST}`, `minio.${HOST}`, `rabbitmq.${HOST}`,
`grafana.${HOST}`, `keycloak.${HOST}`, `pgadmin.${HOST}` are those routers.

Seven files remain and are **transitional**, one TCP port each: postgres `5432`,
mariadb `3306`, mongo `27017`/`27018`, redis `6379`, mailpit SMTP `1025`, minio S3
`9000`, rabbitmq AMQP `5672`. They exist only because `sellix-monorepo` and
`nxgt-federation` still run dev servers on the host that dial them. Deleting them
is the last step of converting those two repos — not a separate decision.

## Two things `.env` taught here, the hard way

- **`git rm` is not `git rm --cached`.** The commit that untracked the twenty-six
  `.env` files deleted them from disk as well, and said in its message that it had
  not. Containers recreated in the following hours came up without them. They were
  restored from the commit before; the two keys introduced *by* that commit could
  not be, and one had to be read back from a running container's own label.
- **Compose gives the shell precedence over `.env`, and this machine's real
  credentials are in `~/.bashrc`** — postgres, mariadb, minio, rabbitmq, S3, and
  the three `TRAEFIK_*`. So `docker compose up -d` does different things in
  different shells: from the owner's terminal it keeps what is running, from an
  agent's session or a CI job it would rotate those credentials silently. Recreate
  a service from the shell that owns the values, and never assume a `.env` you can
  read is the value in effect. A stale export is the same trap in reverse: a
  session started before a profile changed carries the old value into every
  container it creates — which is exactly how a `traefik.enable=false` got baked
  into four freshly created containers, twice.

## When you add a service here

Container name and hostname, no port, no address, `./data/<service>` for state,
`.env` + `.env.example`, and `traefik.enable=false` for anything that has no
business having a route (every database does). This repo predates
`STACK_PREFIX` and does not use it: these are the machine's single shared
instances, one per service by definition. A stack that wants its own copy
declares it in its own compose (skill §5), it does not add a second one here.
