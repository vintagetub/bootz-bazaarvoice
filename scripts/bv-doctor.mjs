#!/usr/bin/env node
/**
 * Reports what a Bazaarvoice deployment actually serves.
 *
 * Portal changes only take effect once the implementation is deployed to a zone
 * and environment, and nothing in the portal makes it obvious whether that has
 * happened. Everything this reads is public JavaScript, so it is checkable
 * directly instead of being taken on trust:
 *
 *   - the build date, which changes when the deployment is regenerated. If it
 *     has not moved, a portal change has not reached this environment.
 *   - the Capabilities banner and the publicName registry, which are the
 *     `data-bv-show` values the deployment can actually render.
 *   - the domains allowlist, which bv.js checks the page hostname against
 *     before doing anything else.
 *
 * Usage:
 *   npm run bv:check                      both environments
 *   npm run bv:check -- --env production  one of them
 *   npm run bv:check -- --host reviews-test.bootz.com
 *                                         also report whether that host passes
 *   npm run bv:check -- --file ./bv.js    parse a local copy instead of fetching
 */

import { pathToFileURL } from "node:url";

const LOADER_HOST = "https://apps.bazaarvoice.com";

function parseArgs(argv) {
  const args = { env: null, host: null, file: null };
  for (let i = 0; i < argv.length; i += 1) {
    const [flag, inline] = argv[i].split("=");
    const value = inline ?? argv[i + 1];
    if (flag === "--env" || flag === "--host" || flag === "--file") {
      args[flag.slice(2)] = value;
      if (inline === undefined) i += 1;
    }
  }
  return args;
}

const {
  BV_CLIENT_NAME = "bootz",
  BV_SITE_ID = "main_site",
  BV_LOCALE = "en_US",
} = process.env;

function urls(environment) {
  const base = `${LOADER_HOST}/deployments/${BV_CLIENT_NAME}/${BV_SITE_ID}/${environment}/${BV_LOCALE}`;
  return { loader: `${base}/bv.js`, config: `${base}/swat-submission-config.js` };
}

async function read(source) {
  if (source.startsWith("http")) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${source}`);
    return response.text();
  }
  const { readFile } = await import("node:fs/promises");
  return readFile(source, "utf8");
}

/** The `/*! ... *\/` banner at the top of a Bazaarvoice bundle. */
export function parseBanner(text) {
  const version = text.match(/bv-loader v([\d.]+)/)?.[1] ?? null;
  const built =
    text.match(/^\s*\*\s+((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+[^\n*]+GMT[^\n*]*)/m)?.[1]?.trim() ??
    null;
  const capabilities = [...text.matchAll(/^\s*\*\s{3}([a-z_][\w-]*)@([\d.]+)\s*$/gim)].map(
    (match) => `${match[1]}@${match[2]}`,
  );
  return { version, built, capabilities };
}

/** Every `data-bv-show` value the deployment registers a handler for. */
export function parseRegistry(text) {
  return [...new Set([...text.matchAll(/publicName:"([a-z_]+)"/g)].map((match) => match[1]))].sort();
}

/** The hostname allowlist bv.js enforces. */
export function parseDomains(text) {
  const addresses = [...text.matchAll(/"domainAddress":"([^"]+)"/g)].map((match) => match[1]);
  const flags = [...text.matchAll(/"allowSubdomain":(true|false)/g)].map(
    (match) => match[1] === "true",
  );
  return addresses.map((domain, index) => ({
    domain,
    allowSubdomain: flags[index] ?? false,
  }));
}

export function hostAllowed(host, domains) {
  return domains.some(({ domain, allowSubdomain }) =>
    allowSubdomain ? host === domain || host.endsWith(`.${domain}`) : host === domain,
  );
}

async function reportEnvironment(environment, host, fileOverride) {
  const { loader, config } = urls(environment);
  console.log(`\n${"=".repeat(72)}\n${environment.toUpperCase()}\n${"=".repeat(72)}`);

  let loaderText;
  try {
    loaderText = await read(fileOverride ?? loader);
  } catch (error) {
    console.log(`  bv.js unreachable: ${error.message}`);
    return false;
  }

  const banner = parseBanner(loaderText);
  const registry = parseRegistry(loaderText);

  console.log(`  loader            ${loader}`);
  console.log(`  bv-loader version ${banner.version ?? "unknown"}`);
  console.log(`  built             ${banner.built ?? "unknown"}`);
  console.log(`  capabilities      ${banner.capabilities.join(", ") || "none found"}`);
  console.log(`  data-bv-show      ${registry.join(", ") || "none found"}`);

  const pickerReady = registry.includes("product_picker");
  console.log(`  product_picker    ${pickerReady ? "REGISTERED" : "NOT REGISTERED"}`);

  if (fileOverride) return pickerReady;

  let domains = [];
  try {
    domains = parseDomains(await read(config));
  } catch (error) {
    console.log(`  domains           unreadable: ${error.message}`);
    return pickerReady;
  }

  console.log(
    `  allowed domains   ${domains
      .map(({ domain, allowSubdomain }) => `${domain}${allowSubdomain ? " (+subdomains)" : ""}`)
      .join(", ")}`,
  );

  if (host) {
    const ok = hostAllowed(host, domains);
    console.log(`  ${host} ${ok ? "is ALLOWED" : "is NOT ALLOWLISTED"}`);
    return pickerReady && ok;
  }

  return pickerReady;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const environments = args.env ? [args.env] : ["production", "staging"];

  let allGood = true;
  for (const environment of environments) {
    // Sequential on purpose: the output is meant to be read top to bottom.
    const ok = await reportEnvironment(environment, args.host, args.file);
    allGood = allGood && ok;
  }

  console.log(
    `\n${allGood ? "All checks passed." : "Something above is not ready — see NOT REGISTERED / NOT ALLOWLISTED."}\n`,
  );
  process.exit(allGood ? 0 : 1);
}

// Guarded so the parsers above can be imported without running the CLI.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
