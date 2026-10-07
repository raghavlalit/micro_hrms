// Offline contract check: no server, database writes, passwords or network needed.
require("reflect-metadata");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { plainToInstance } = require("class-transformer");
const { validateSync } = require("class-validator");
const { collection, environment, bindings } = require("./generate-postman.cjs");
const root = path.resolve(__dirname, "..");
const actual = JSON.parse(
  fs.readFileSync(
    path.join(root, "postman/MicroHRMS.postman_collection.json"),
    "utf8",
  ),
);
const env = JSON.parse(
  fs.readFileSync(
    path.join(root, "postman/MicroHRMS.local.postman_environment.json"),
    "utf8",
  ),
);
assert(
  JSON.stringify(actual) === JSON.stringify(collection),
  "Collection is stale: run npm run postman:generate",
);
assert(
  JSON.stringify(env) === JSON.stringify(environment),
  "Environment template is stale or contains local values",
);
const values = Object.fromEntries(env.values.map((v) => [v.key, v.value]));
for (const entry of env.values)
  if (/password|token/.test(entry.key))
    assert.equal(entry.value, "", "Never commit secrets");
const references = [...JSON.stringify(actual).matchAll(/\{\{(\w+)\}\}/g)].map(
  (match) => match[1],
);
for (const key of references)
  assert(Object.hasOwn(values, key), `Missing environment variable: ${key}`);
function scripts(items) {
  for (const item of items) {
    for (const event of item.event || [])
      new vm.Script(event.script.exec.join("\n"));
    if (item.item) scripts(item.item);
    else
      assert(
        item.request?.url && item.request.method && item.event?.length,
        "Invalid request structure",
      );
  }
}
scripts([{ item: actual.item, event: actual.event }]);
const uuid = "11111111-1111-4111-8111-111111111111";
const samples = { ...values };
for (const key of Object.keys(samples)) {
  if (key.endsWith("_id")) samples[key] = uuid;
  if (key.includes("password"))
    samples[key] = "Postman contract validation only 123!";
}
samples.activation_token = uuid + "." + "a".repeat(64);
let dtoCount = 0;
for (const binding of bindings) {
  if (!binding.dto) continue;
  const [modulePath, className] = binding.dto.split(":");
  const Dto = require(path.join(root, "apps/api/dist/modules", modulePath))[
    className
  ];
  assert(Dto, `Missing DTO: ${binding.dto}`);
  const body = JSON.parse(
    JSON.stringify(binding.body).replace(
      /\{\{(\w+)\}\}/g,
      (_, key) => samples[key],
    ),
  );
  const errors = validateSync(plainToInstance(Dto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  assert.equal(
    errors.length,
    0,
    `${binding.method} ${binding.endpoint}: ${JSON.stringify(errors)}`,
  );
  dtoCount++;
}
function files(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? files(path.join(directory, entry.name))
        : [path.join(directory, entry.name)],
    );
}
const sourceRoutes = new Set();
for (const file of files(path.join(root, "apps/api/src")).filter((file) =>
  file.endsWith(".controller.ts"),
)) {
  const text = fs.readFileSync(file, "utf8");
  const controllers = [...text.matchAll(/@Controller\((?:'([^']*)')?\)/g)];
  controllers.forEach((controller, index) => {
    const block = text.slice(
      controller.index,
      controllers[index + 1]?.index ?? text.length,
    );
    for (const route of block.matchAll(
      /@(Get|Post|Put|Patch|Delete)\((?:'([^']*)')?\)/g,
    )) {
      const endpoint =
        "/" + [controller[1], route[2]].filter(Boolean).join("/");
      sourceRoutes.add(
        `${route[1].toUpperCase()} ${endpoint.replace(/\/$/, "").replace(/:[^/]+/g, ":id")}`,
      );
    }
  });
}
const collectionRoutes = new Set(
  bindings.map(
    (b) => `${b.method} ${b.endpoint.replace(/\{\{\w+\}\}/g, ":id")}`,
  ),
);
for (const route of sourceRoutes)
  assert(
    collectionRoutes.has(route),
    `Implemented route missing from Postman: ${route}`,
  );
for (const route of collectionRoutes)
  assert(sourceRoutes.has(route), `Postman route is not implemented: ${route}`);
console.log(
  `PASS: ${bindings.length} requests cover all ${sourceRoutes.size} controller routes; ${dtoCount} request bodies match DTO validation; scripts and environment references are valid.`,
);
