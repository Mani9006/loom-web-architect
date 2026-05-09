# Contributing to ResumePrep

Thank you for helping improve ResumePrep. This project values focused changes, clear validation, and safe handling of user data.

## Before you start

- Check existing issues, product docs, and runbooks for related context.
- Keep each change scoped to one user-facing or operational outcome.
- Avoid unrelated rewrites, broad formatting-only changes, or speculative refactors.

## Local setup

```sh
npm ci
npm run dev
```

Use local `.env` files for environment-specific values. Never commit secrets.

## Expected validation

Run the checks that match your change. For production code, run the full set when possible:

```sh
npm run type-check
npm run test
npm run build
npm run lint
```

For edge functions or database changes, also review the related Supabase migration, RLS, and function behavior manually.

## Pull request checklist

- Explain the user or business outcome.
- Summarize the implementation at a high level.
- Include screenshots or recordings for UI changes.
- List validation performed and any known limitations.
- Call out migrations, secrets, feature flags, or rollout requirements.

## Coding standards

- Prefer existing components, hooks, utilities, and Supabase patterns.
- Keep UI accessible, responsive, and consistent with shadcn/ui conventions.
- Do not expose service-role keys or server-only credentials in client code.
- Add or update tests when changing business logic or critical workflows.
