/**
 * Onion Architecture import gate for server/ + reviewer-core/.
 *
 * Rings are mapped onto current file roles (no folder refactor):
 *   domain          — src/vendor/shared (contracts + adapter ports), src/modules/<m>/domain.ts, reviewer-core/src
 *   application     — src/modules/<m>/{service,run-executor,*-loader,ports}.ts, src/modules/<m>/pipeline/*
 *   presentation    — src/modules/<m>/routes.ts
 *   infrastructure  — src/modules/<m>/repository(.ts|/*), src/db/, src/adapters/
 *   composition root — src/platform/container.ts, src/app.ts (may import anything)
 *
 * Dependencies point inward only. Run from server/:
 *   pnpm lint:arch            # fails on violations not in the baseline
 *   pnpm lint:arch:baseline   # regenerate .dependency-cruiser-known-violations.json
 *
 * Paths are resolved relative to server/, so reviewer-core files appear as
 * `../reviewer-core/src/...` and server files as `src/...` (hence the `^src/` anchors).
 */

const NPM_INFRA = '(^|/)node_modules/(drizzle-orm|postgres|octokit|@octokit|simple-git)/';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'routes-no-persistence',
      severity: 'error',
      comment:
        'Presentation ring (routes.ts) must not reach persistence: no drizzle-orm, src/db/ or repositories. ' +
        'Parse input, call the module service, shape the reply.',
      from: { path: '^src/modules/.+/routes\\.ts$' },
      to: {
        path: ['(^|/)node_modules/drizzle-orm/', '^src/db/', '^src/modules/.+/repository(\\.ts$|/)'],
      },
    },
    {
      name: 'application-no-infra',
      severity: 'error',
      comment:
        'Application ring (service / run-executor / *-loader / ports / pipeline) must not import infrastructure ' +
        '(drizzle-orm, postgres, src/db/, src/adapters/) or the web framework (fastify). ' +
        'Depend on ports from @devdigest/shared and repositories injected by the container.',
      from: {
        path: [
          '^src/modules/.+/(service|run-executor|[^/]+-loader|ports)\\.ts$',
          '^src/modules/[^/]+/pipeline/',
        ],
      },
      to: {
        path: [
          '(^|/)node_modules/(drizzle-orm|postgres|fastify)/',
          '^src/db/',
          '^src/adapters/',
        ],
      },
    },
    {
      name: 'domain-pure',
      severity: 'error',
      comment:
        'Domain ring (src/vendor/shared, modules/<m>/domain.ts) is the core: it may import only other domain code, ' +
        'platform/errors and zod. No server internals, no other npm packages, no node builtins.',
      from: { path: ['^src/modules/[^/]+/domain\\.ts$', '^src/vendor/shared/'] },
      to: {
        pathNot: [
          '^src/vendor/shared/',
          '^src/modules/[^/]+/domain\\.ts$',
          '^src/platform/errors\\.ts$',
          '(^|/)node_modules/zod/',
        ],
      },
    },
    {
      name: 'adapters-not-into-modules',
      severity: 'error',
      comment:
        'Infrastructure ring (src/adapters/) implements ports from @devdigest/shared; it must not import ' +
        'application/presentation code from src/modules/. Move shared constants into the adapter or vendor/shared.',
      from: { path: '^src/adapters/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'infra-not-into-presentation',
      severity: 'error',
      comment:
        'Infrastructure ring (repositories, src/db/) must not import outer/application code (routes.ts, service.ts).',
      from: { path: ['^src/modules/[^/]+/repository(\\.ts$|/)', '^src/db/'] },
      to: { path: '^src/modules/.+/(routes|service)\\.ts$' },
    },
    {
      name: 'core-stays-pure',
      severity: 'error',
      comment:
        'reviewer-core is a pure domain engine (no I/O): it may use server/src/vendor/shared only, ' +
        'and no fs/net/http builtins, drizzle-orm, postgres, octokit or simple-git.',
      from: { path: '^\\.\\./reviewer-core/src/' },
      to: {
        path: [
          '^src/(?!vendor/shared/)',
          '^(node:)?(fs|net|http|https|http2|child_process)(/|$)',
          NPM_INFRA,
        ],
      },
    },
    {
      name: 'no-cross-module-internals',
      severity: 'error',
      comment:
        "A module must not import another module's repository (infrastructure internals). " +
        "Go through that module's service, or move the shared query/type inward.",
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/[^/]+/repository(\\.ts$|/)',
        pathNot: '^src/modules/$1/',
      },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular imports blur ring boundaries and break inward-only dependency flow.',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['(^|/)test/', '^src/db/migrations/'] },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
  },
};
