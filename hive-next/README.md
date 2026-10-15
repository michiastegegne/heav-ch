# Hive CRM — Next.js rebuild

This is an **isolated UI foundation**, not a production CRM. No database writes, business switching, project deletion or authentication are implemented yet. Nonfunctional modules are labelled and the creation button is disabled to avoid misleading users.

## Local development

```sh
cd hive-next
npm install
npm run dev
```

The existing GitHub Pages site and Supabase production database are not modified by this folder.

## Implementation order

1. Authenticated Supabase SSR session handling and validated workspace membership.
2. Workspace-scoped customers and projects, server-side authorization, archive/delete with clear dependent-record policies.
3. Automated tests and disposable test database verifying tenant isolation and project CRUD.
4. Offers, invoices, immutable accounting snapshots and controlled migration of existing records.
5. Customer portal, e-mail and optional MCP integration.

Before production use: create a dedicated preview database; audit existing RLS policies, triggers and migrations; back up the production data; and validate the application with browser tests. Never expose service-role secrets in client code.
