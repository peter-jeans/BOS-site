# Cloud BOS Public Plugin Boundary

Status: `ACTIVE_DEVELOPMENT_GATE`

## Allowed in the public plugin

- public plugin manifests and host connection metadata;
- public-safe skills that explain how to invoke the eight Level-1 advisory and
  six project-governance control-plane tools;
- compact provider-neutral MCP schemas;
- redacted connection, version, entitlement class and capability status;
- public documentation, passive external support links and uninstall instructions;
- public tier capability IDs, minimum-tier metadata and compact decision reasons;
- bounded diagnostic code that does not contain credentials or private BOS
  logic;
- public project-governance lifecycle contracts and environment adapter metadata;
- one public-safe Base44 workspace-skill projection containing static build-time
  routing instructions and no enforcement or application-runtime claim;
- provider-neutral OAuth resource-validation contracts and privacy-safe hashed
  platform-identity binding metadata;
- exact zero-write governance plans; and
- minimal manifest-backed project projections containing only public-safe
  identity, authority, permission, binding, evidence-location and checksum data.

## Forbidden in the public plugin or any project-governance projection

- `LDP:FULL`, `.bos`, full DevPack or Master BOS source;
- private prompts, scan engines, estimator logic or personal quoting;
- secrets, token values, credential files or payment keys;
- raw OAuth access tokens, issuer subjects or client secrets;
- raw receipts, raw logs, full project source, database exports or customer
  data;
- Stripe charging, quote decisions or client-asserted entitlement; and
- website or hosting discovery, creation, publishing, deployment, domain/slug,
  access-policy, credential, analytics or content management;
- Sites, Cloudflare Pages, Cloudforge or any other website-hosting control-plane
  integration; and
- autonomous project mutation, deployment or main-branch publication.

## Website and support-link boundary

Websites are not Cloud BOS plugin hosts or deployment environments. The V1
plugin operates only in Codex, Claude Code and Base44 BuildAI. A separately
owned publicBOS website may be configured as a passive HTTPS support link after
owner selection and semantic readback, but the plugin must not discover,
create, deploy, publish, authenticate to, administer or exchange user data with
that site. Opening the link is ordinary external navigation and grants the site
no Cloud BOS, project-governance, entitlement or plugin authority.

The V1 runtime catalogues, renders and plans only those three development
hosts. Definitions retained for later host research are withheld and fail
closed; they do not constitute dormant V1 installation capability.

## Install-once, govern-many rule

The plugin, skill, MCP connection and platform authentication are installed
once per AI-development-platform identity. That lifecycle never proves that a
project is governed.

On Base44, the custom MCP connection is installed once per account and the
static Cloud BOS skill is installed once per selected workspace. The skill is
guidance for the editor chat, not a security control. Each governed Base44 app
still requires its own separately approved and verified app-governance
projection.

Every `GOVERNED_ACTIVE` project must have a separately authorised, installed
and read-back governance projection. The projection format is environment
specific, but the governance outcome is mandatory. A project with no verified
projection is `UNBOUND` or `DISCOVERY_ONLY`, never governed.

Project writes require an exact dry run and explicit approval. Removal may
delete only manifest-owned governance artifacts and must preserve application
source, data and runtime behaviour. Removing the platform plugin must not make
the application dependent on unavailable BOS code.

## Coexistence rule

`cloudbos-public-plugin` must never overwrite, rename, package from, install as,
or reuse the cache identity of `cloudbos-connector`. Shared behavior belongs
behind the authenticated Cloud BOS service or in an explicitly public-safe,
versioned source module with independent tests.

## Release rule

An empty or placeholder MCP configuration is preferable to exposing an
unverified tool. A Level-1 tool may be added only after its request and response
schemas, BOS authority mapping, privacy class, entitlement rule, failure
envelope and contract tests are present.

The project-governance lifecycle is a build-time control plane, not an
application runtime dependency. `write:project_governance` authorises only an
exact approved governance plan and its compact binding state; it does not grant
application-source, application-data, deployment, payment or private-BOS
authority.

The exact plan must also be server-issued and D1-anchored. Adapter ID,
project/binding scope, artifact-manifest hash, installed-manifest hash,
evidence class and readback hash must agree. A caller-supplied boolean, an
unissued self-consistent plan or a substituted removal manifest never proves
governance.

The control plane stores the complete original public governance plan, including
its proposed governance-file contents, alongside its issuance anchor. This is
bounded to 262,144 canonical UTF-8 bytes and does not authorise collection of
application source, customer records or credentials. Plan payloads remain with
their anchor until control-plane record removal; expiry does not delete stored
contents. Recovery requires the same authenticated platform, project and binding,
and an unconsumed plan inside its original approval window. Recovery never grants
approval or extends that window. Hash-only historical anchors cannot be recovered.

External billing may create hosted-provider redirects and verified compact
entitlement metadata only in the Cloud BOS server control plane. No billing
secret, payment SDK, card flow, charge authority or quote logic belongs in the
public plugin or project-governance projection.

Tier selection is also a server control-plane decision. Client headers,
project files, complexity recommendations and maturation-stage recommendations
cannot unlock capability. A tier change must not require plugin or project-core
reinstallation, and Standard must retain the complete Level-1 tool set.
