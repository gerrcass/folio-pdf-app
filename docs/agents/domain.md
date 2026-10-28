# Domain docs

This repository is **single-context**.

## Before exploring, read these

- `GLOSSARY.md` for the product's canonical vocabulary.
- `docs/adr/` for decisions that constrain the area you are about to change.
- `docs/design/grill-session.md` for the reasoning behind the objective and boundaries.

If a file does not exist, proceed silently. The `/domain-modeling` skill creates domain files lazily when terms or decisions actually get resolved.

## Use the glossary's vocabulary

Name domain concepts exactly as `GLOSSARY.md` defines them in issues, commits, tests, and UI copy. If a needed concept is missing, note it for `/domain-modeling` rather than inventing a synonym.

## Flag ADR conflicts

If planned work contradicts an ADR, surface it explicitly instead of silently overriding it.
