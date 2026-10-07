# Project working agreements

- Keep API business code in its dedicated NestJS module and frontend code in its
  dedicated Angular feature folder. Use understandable code and TypeORM
  repositories/QueryBuilder, following `docs/development-conventions.md`.
- User requirement: after completing every topic, update the shared Postman
  collection at `postman/MicroHRMS.postman_collection.json` for all implemented
  API changes. Maintain its source in `scripts/generate-postman.cjs`, regenerate
  with `npm.cmd run postman:generate`, and validate with
  `npm.cmd run postman:check`. Follow `postman/README.md` for coverage, variables,
  request examples and maintenance. Keep environment templates secret-free.
