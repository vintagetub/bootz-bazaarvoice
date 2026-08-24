import { getBvConfig, getMpsBehaviour } from "@/lib/config";

/**
 * Escapes a value for embedding inside an inline `<script>` block.
 *
 * Escaping `<` means a stray `</script>` can never terminate the block early.
 * The exotic JSON-vs-JavaScript hazards (U+2028/U+2029, which are legal in a
 * JSON string but are line terminators in JavaScript) are handled upstream:
 * every value reaching this function is drawn from a validated allowlist in
 * `lib/config.ts`, so it cannot contain them.
 */
function toScriptLiteral(value: string): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * Builds the single inline script that defines `window.bvCallback` and then
 * injects the bv.js loader.
 *
 * Both jobs live in one script for a reason. bv.js invokes `window.bvCallback`
 * as soon as the Bazaarvoice library is ready, so the callback has to exist
 * first. Declaring them as two sibling tags does not guarantee that: React 19
 * hoists `<script async src>` to the top of `<head>`, above any inline script
 * rendered by a layout, and an `async` script with a warm HTTP cache can
 * execute before the parser reaches a later inline block. Creating the tag from
 * inside the script that defines the callback makes the ordering unconditional.
 *
 * Reference: https://docs.bazaarvoice.com/articles/#!ratings-reviews/host-the-mps-form-on-your-domain
 *            https://docs.bazaarvoice.com/articles/ratings-reviews/bv-pixel-implementation-bv-js/a/add-the-bv-loader
 */
function buildLoaderScript(redirectOnClose: string, thankYouPath: string, loaderUrl: string): string {
  return `(function(){
var MODE=${toScriptLiteral(redirectOnClose)},DEST=${toScriptLiteral(thankYouPath)},SRC=${toScriptLiteral(loaderUrl)};
window.bvCallback=function(BV){
try{
if(!BV||!BV.swat_submission||typeof BV.swat_submission.on!=="function"){return;}
BV.swat_submission.on("mpsClose",function(data){
var d=data||{};
try{window.dispatchEvent(new CustomEvent("bootz:mpsClose",{detail:d}));}catch(e){}
if(MODE==="never"){return;}
if(MODE==="completed"&&!d.completed){return;}
window.location.href=DEST;
});
}catch(e){if(window.console&&console.error){console.error("[bv] failed to attach mpsClose handler",e);}}
};
if(document.querySelector('script[data-bv-loader]')){return;}
var s=document.createElement("script");
s.async=true;
s.src=SRC;
s.setAttribute("data-bv-loader","1");
(document.head||document.documentElement).appendChild(s);
})();`;
}

/**
 * Installs the Bazaarvoice loader and the `mpsClose` handler.
 *
 * Bazaarvoice's docs are explicit that bv.js is added exactly once per page;
 * the `data-bv-loader` guard enforces that even if this component is ever
 * rendered twice.
 */
export function BazaarvoiceLoader() {
  const { loaderUrl } = getBvConfig();
  const { redirectOnClose, thankYouPath } = getMpsBehaviour();

  if (!loaderUrl) return null;

  return (
    <>
      {/* Shave the DNS + TLS handshake off the loader fetch. */}
      <link rel="preconnect" href="https://apps.bazaarvoice.com" />
      <script
        dangerouslySetInnerHTML={{
          __html: buildLoaderScript(redirectOnClose, thankYouPath, loaderUrl),
        }}
      />
    </>
  );
}
