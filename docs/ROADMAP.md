# Roadmap (suggested order)

1. **Run generated projects end to end.** Exercise FastAPI and Express against PostgreSQL, including foreign keys,
   many-to-many relations, and parameterized SQL queries.
2. **Login screen** in the frontend (token endpoints already exist).
3. **Generated project quality:** Alembic migrations (Blueprint should diff IR versions and emit migrations),
   auth on generated APIs, real Paystack/Flutterwave/Termii adapters in `integrations.py`, Dockerfile.
4. **Flow semantics:** joins (no duplicated steps), loops over line items, delays/scheduled events ("remind 2h before"),
   status-transition rules ("only Admin may move paid -> refunded") using actor blocks.
5. **More blocks and templates:** inventory/stock, SMS campaigns, LMS lessons/quizzes, roles & permissions enforcement.
6. **Grouping/sub-flows** (collapse "Checkout" into one block) to stop big diagrams becoming spaghetti.
7. **Background jobs (Celery + Redis)** for generation and AI once they get slow; stream progress (SSE).
8. **AI:** interview mode (asks questions, builds blocks), scenario checker ("customer cancels after payment"),
   plain-language rule -> condition block. Keep the rule: AI edits the diagram, validator gates it.
9. **GitHub push** of generated output; storefront generation; multi-user collaboration.
