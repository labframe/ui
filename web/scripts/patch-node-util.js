/* eslint-disable @typescript-eslint/no-require-imports */
// Ensures deprecated util._extend is replaced before Next.js boots in dev/build.
const util = require("util");

if (typeof util._extend === "function") {
  util._extend = Object.assign;
}
