import { getBvConfig } from "@/lib/config";

/**
 * Instruments the page, then loads bv.js itself.
 *
 * Rendered only on `/debug/picker`. It monkey-patches `console`, `fetch`,
 * `XMLHttpRequest`, and DOM insertion, which is acceptable in an operator tool
 * and not in a consumer page.
 *
 * It injects bv.js rather than letting `BazaarvoiceLoader` do it, because the
 * patches have to be installed *before* bv.js runs. React hoists
 * `<script async src>` into `<head>`, above this inline script, so a warm cache
 * could otherwise let bv.js execute first — the same ordering hazard that
 * applied to `window.bvCallback`. Injecting last makes the order unconditional.
 */
export interface BvUiCall {
  campaignId: string;
  categoryId: string | null;
  familyProductId: string | null;
  inline: boolean;
  preventClose: boolean;
}

function buildScript(options: {
  loaderUrl: string;
  crossOrigin: boolean;
  forceCrossOriginOnInjected: boolean;
  uiCall: BvUiCall | null;
}): string {
  const { loaderUrl, crossOrigin, forceCrossOriginOnInjected, uiCall } = options;

  return `(function(){
if(window.__bvLog){return;}
var log=window.__bvLog=[];
var net=window.__bvNet=[];
var SRC=${JSON.stringify(loaderUrl).replace(/</g, "\\u003c")};
var CORS=${crossOrigin ? "true" : "false"};
var FORCE_CORS_ON_INJECTED=${forceCrossOriginOnInjected ? "true" : "false"};
var UI_CALL=${uiCall ? JSON.stringify(uiCall).replace(/</g, "\\u003c") : "null"};
function describe(value){
try{
if(value instanceof Error){return value.message+(value.stack?" | "+String(value.stack).split("\\n").slice(0,3).join(" / "):"");}
if(typeof value==="string"){return value;}
return JSON.stringify(value);
}catch(e){return String(value);}
}
function record(kind,args){
try{
log.push(kind+": "+Array.prototype.map.call(args,describe).join(" "));
if(log.length>60){log.shift();}
}catch(e){}
}
var origError=console.error,origWarn=console.warn;
console.error=function(){record("error",arguments);return origError.apply(console,arguments);};
console.warn=function(){record("warn",arguments);return origWarn.apply(console,arguments);};
window.addEventListener("error",function(event){
record("uncaught",[event.message+(event.filename?" @ "+event.filename+":"+event.lineno:"")]);
});
/* Resource load failures do not bubble, so they need a capturing listener.
   This is what catches a script or stylesheet failing to fetch. */
window.addEventListener("error",function(event){
var target=event.target;
if(target&&target!==window&&(target.src||target.href)){
record("resource-failed",[(target.tagName||"?")+" "+(target.src||target.href)]);
}
},true);
/* Content-Security-Policy refusals are logged by the browser directly, not
   through console.error, so the wrapper above never sees them. Without this
   listener a CSP block looks like silence. */
document.addEventListener("securitypolicyviolation",function(event){
record("csp-blocked",[(event.violatedDirective||"?")+" blocked "+(event.blockedURI||"(inline)")]);
});
function isBv(url){return typeof url==="string"&&url.indexOf("bazaarvoice.com")!==-1;}
function noteNet(method,url,status){
try{
net.push(method+" "+status+"  "+String(url).slice(0,300));
if(net.length>60){net.shift();}
}catch(e){}
}
var origFetch=window.fetch;
if(origFetch){
window.fetch=function(input,init){
var url=typeof input==="string"?input:(input&&input.url)||"";
var method=(init&&init.method)||"GET";
return origFetch.apply(window,arguments).then(function(response){
if(isBv(url)){noteNet("fetch "+method,url,response.status);}
return response;
},function(error){
if(isBv(url)){noteNet("fetch "+method,url,"FAILED "+describe(error));}
throw error;
});
};
}
var origOpen=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(method,url){
var self=this;
if(isBv(url)){
self.addEventListener("loadend",function(){
noteNet("xhr "+(method||"GET"),url,self.status===0?"FAILED/blocked":self.status);
});
}
return origOpen.apply(self,arguments);
};
/* bv.js is a loader: it injects further scripts, which go through neither fetch
   nor XHR. Record those insertions, and optionally force CORS on them so an
   exception thrown inside one is not masked as a bare "Script error.". */
function handleInsert(node){
try{
if(!node||node.nodeType!==1||node.tagName!=="SCRIPT"){return;}
var src=node.src||node.getAttribute&&node.getAttribute("src");
if(!isBv(src)){return;}
record("injected-script",[src]);
if(FORCE_CORS_ON_INJECTED&&!node.crossOrigin){node.crossOrigin="anonymous";}
}catch(e){}
}
var origAppend=Node.prototype.appendChild;
Node.prototype.appendChild=function(node){handleInsert(node);return origAppend.apply(this,arguments);};
var origInsert=Node.prototype.insertBefore;
Node.prototype.insertBefore=function(node){handleInsert(node);return origInsert.apply(this,arguments);};
/* The programmatic path: BV.ui("rr","submit_generic",...). Worth trying when
   the declarative data-bv-show="product_picker" container is not registered in
   this deployment's bundle, since the BV.ui implementation may still be present
   inside swat-submission.

   It is also the only way to read the real error. CORS masks *uncaught* errors
   only — an exception caught in our own try/catch exposes its message and stack
   whatever the script's origin. */
if(UI_CALL){
window.bvCallback=function(BV){
try{
if(!BV){record("bv-ui",["bvCallback ran but BV was falsy"]);return;}
if(typeof BV.ui!=="function"){
record("bv-ui",["BV.ui is not a function — this deployment does not expose the programmatic API"]);
return;
}
var opts={campaignId:UI_CALL.campaignId,preventClose:UI_CALL.preventClose,inline:UI_CALL.inline};
if(UI_CALL.categoryId){opts.categoryId=UI_CALL.categoryId;}
if(UI_CALL.familyProductId){opts.familyProductId=UI_CALL.familyProductId;}
record("bv-ui",["calling BV.ui('rr','submit_generic',"+JSON.stringify(opts)+")"]);
BV.ui("rr","submit_generic",opts);
record("bv-ui",["BV.ui returned without throwing"]);
}catch(error){
/* The payoff: a caught error is fully readable. */
record("bv-ui-threw",[error]);
}
};
record("bv-ui",["window.bvCallback installed, waiting for bv.js"]);
}
/* Now that everything is watching, load bv.js. */
var loader=document.createElement("script");
loader.async=true;
if(CORS){loader.crossOrigin="anonymous";}
loader.src=SRC;
loader.setAttribute("data-bv-loader","1");
(document.head||document.documentElement).appendChild(loader);
})();`;
}

export function BvErrorCapture({
  crossOrigin = false,
  forceCrossOriginOnInjected = false,
  uiCall = null,
}: {
  crossOrigin?: boolean;
  forceCrossOriginOnInjected?: boolean;
  /** When set, calls BV.ui instead of relying on a data-bv-show container. */
  uiCall?: BvUiCall | null;
}) {
  const { loaderUrl } = getBvConfig();

  if (!loaderUrl) return null;

  return (
    <>
      <link rel="preconnect" href="https://apps.bazaarvoice.com" />
      <script
        dangerouslySetInnerHTML={{
          __html: buildScript({ loaderUrl, crossOrigin, forceCrossOriginOnInjected, uiCall }),
        }}
      />
    </>
  );
}
