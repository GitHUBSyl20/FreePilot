# AGENTS.md

## Project context

This is a personal financial cockpit for a French freelance micro-entrepreneur combining:
- invoicing;
- collected revenue tracking;
- ARE estimation;
- Urssaf provision;
- income tax provision;
- personal/professional cash visibility.

## Rules

- Use TypeScript strict mode.
- Keep business calculations in pure functions.
- Never hardcode French tax or ARE rates directly inside UI components.
- All fiscal and ARE assumptions must be configurable.
- Always separate invoiced revenue from collected revenue.
- Paid invoices count as CA only when paymentDate is set.
- Prioritize simple, testable code over complex abstractions.

## Review guidelines

- Check calculation logic carefully.
- Check that user_id scoping is respected.
- Check Supabase RLS policies.
- Check that no sensitive financial data is logged.
- Check that .env files are not committed.