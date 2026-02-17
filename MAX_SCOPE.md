# MAX Scope

- This tree (`projects/Tankoban Max`) is the active Max implementation target.
- `app/` (Tankoban Pro) remains untouched during Max feature work.
- Max changes are additive: Comics and Videos behavior must stay stable while Books mode is introduced.
- Books persistence uses isolated `books_*` stores and must not share write paths with comics/video stores.
