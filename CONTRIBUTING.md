# Contributing

Keep the model boundary visible: the executable construction is one-round
PSMT over synchronous, independently labeled private/authenticated paths. A
change to topology, rounds, adversary mobility, channel authentication or
failure semantics is a protocol change, not a wording edit.

Before submitting a change, run:

```sh
npm ci
npm run ci
npx playwright install chromium
npm run test:claims
npm run test:a11y
npm run test:mutations
```

Do not weaken a test, coverage threshold, accessibility check, or mutation to
make a change pass. Learner-visible values must be computed from the current
run and checked through an independent route where practical.
