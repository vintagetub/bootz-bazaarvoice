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
 *   npm run bv:check -- --host other.example.com
 *                                         check a hostname other than this
 *                                         project's own (repeatable)
 *   npm run bv:check -- --file ./bv.js    parse a local copy instead of fetching
 */

import { pathToFileURL } from "node:url";

const LOADER_HOST = "https://apps.bazaarvoice.com";

/** The hostnames this project is deployed to, checked unless --host overrides. */
const APP_HOSTS = ["bootz-bazaarvoice.vercel.app", "bootz-warranty.vercel.app"];

function parseArgs(argv) {
  const args = { env: null, hosts: [], file: null };
  for (let i = 0; i < argv.length; i += 1) {
    const [flag, inline] = argv[i].split("=");
    const value = inline ?? argv[i + 1];
    if (flag === "--env" || flag === "--file") {
      args[flag.slice(2)] = value;
      if (inline === undefined) i += 1;
    } else if (flag === "--host") {
      // Repeatable, so several hostnames can be checked in one run.
      if (value) args.hosts.push(value);
      if (inline === undefined) i += 1;
    }
  }
  if (args.hosts.length === 0) args.hosts = APP_HOSTS;
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

/**
 * The hostname allowlist, from the deployment *config* file.
 *
 * Shape: `"allowSubdomain":true,"domainAddress":"bootz.com"`.
 */
export function parseConfigDomains(text) {
  const addresses = [...text.matchAll(/"domainAddress":"([^"]+)"/g)].map((match) => match[1]);
  const flags = [...text.matchAll(/"allowSubdomain":(true|false)/g)].map(
    (match) => match[1] === "true",
  );
  return addresses.map((domain, index) => ({
    domain,
    allowSubdomain: flags[index] ?? false,
  }));
}

/**
 * The hostname allowlist **baked into bv.js**, which is the one that decides.
 *
 * bv.js does not read the config files for this. It compares
 * `location.hostname` against its own embedded list and, on no match, throws
 *
 *     "Bazaarvoice is not configured for the domain <host>."
 *
 * before loading any app module. So a domain added in the portal has no effect
 * until bv.js itself is regenerated — which is why this is reported separately
 * from the config file's list.
 *
 * Shape in the minified bundle: `{firstPartyCookieEnabled:!0,domain:".bootz.com"}`,
 * where a leading dot means subdomains are included.
 */
export function parseLoaderDomains(text) {
  return [...new Set([...text.matchAll(/\bdomain:"(\.[^"]+)"/g)].map((match) => match[1]))].map(
    (raw) => ({ domain: raw.replace(/^\./, ""), allowSubdomain: raw.startsWith(".") }),
  );
}

export function hostAllowed(host, domains) {
  return domains.some(({ domain, allowSubdomain }) =>
    allowSubdomain ? host === domain || host.endsWith(`.${domain}`) : host === domain,
  );
}

function describeDomains(domains) {
  return (
    domains
      .map(({ domain, allowSubdomain }) => `${domain}${allowSubdomain ? " (+subdomains)" : ""}`)
      .join(", ") || "none found"
  );
}

async function reportEnvironment(environment, hosts, fileOverride) {
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

  // The list bv.js actually enforces, embedded in the bundle itself.
  const loaderDomains = parseLoaderDomains(loaderText);
  console.log(`  allowlist (bv.js) ${describeDomains(loaderDomains)}`);

  let hostOk = true;
  for (const host of hosts) {
    const ok = hostAllowed(host, loaderDomains);
    hostOk = hostOk && ok;
    console.log(`  ${host.padEnd(30)} ${ok ? "ALLOWED" : "NOT ALLOWLISTED"}`);
    if (!ok) {
      console.log(
        `    bv.js will throw: "Bazaarvoice is not configured for the domain ${host}."`,
      );
    }
  }

  if (fileOverride) return pickerReady && hostOk;

  // The config file's copy, reported only to show when the two disagree —
  // which means a portal change reached one artifact and not the other.
  try {
    const configDomains = parseConfigDomains(await read(config));
    const same =
      describeDomains(configDomains) === describeDomains(loaderDomains);
    console.log(
      `  allowlist (config)${same ? " same as bv.js" : ` DIFFERS: ${describeDomains(configDomains)}`}`,
    );
  } catch (error) {
    console.log(`  allowlist (config) unreadable: ${error.message}`);
  }

  return pickerReady && hostOk;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const environments = args.env ? [args.env] : ["production", "staging"];

  let allGood = true;
  for (const environment of environments) {
    // Sequential on purpose: the output is meant to be read top to bottom.
    const ok = await reportEnvironment(environment, args.hosts, args.file);
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
