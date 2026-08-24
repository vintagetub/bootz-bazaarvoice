/**
 * Buffers bv.js console output and its network calls so the diagnostics panel
 * can show them without opening devtools.
 *
 * Rendered only on `/debug/picker`. The production pages stay free of it: this
 * monkey-patches `console`, `fetch`, and `XMLHttpRequest`, which is acceptable
 * in an operator tool and not in a consumer page.
 *
 * An inline script rather than an effect in a client component, because the
 * interesting failures happen while bv.js initialises — a client component
 * hydrates too late to see them. Rendered at the very top of the page body, so
 * it runs during parse and before an async cross-origin bv.js can resolve.
 */
const CAPTURE_SCRIPT = `(function(){
if(window.__bvLog){return;}
var log=window.__bvLog=[];
var net=window.__bvNet=[];
function describe(value){
try{
if(value instanceof Error){return value.message;}
if(typeof value==="string"){return value;}
return JSON.stringify(value);
}catch(e){return String(value);}
}
function record(kind,args){
try{
log.push(kind+": "+Array.prototype.map.call(args,describe).join(" "));
if(log.length>40){log.shift();}
}catch(e){}
}
var origError=console.error,origWarn=console.warn;
console.error=function(){record("error",arguments);return origError.apply(console,arguments);};
console.warn=function(){record("warn",arguments);return origWarn.apply(console,arguments);};
window.addEventListener("error",function(event){
record("uncaught",[event.message+(event.filename?" @ "+event.filename:"")]);
});
window.addEventListener("unhandledrejection",function(event){
var reason=event.reason;
record("rejection",[describe(reason&&reason.message?reason.message:reason)]);
});
function isBv(url){return typeof url==="string"&&url.indexOf("bazaarvoice.com")!==-1;}
function noteNet(method,url,status){
try{
net.push(method+" "+status+"  "+String(url).slice(0,300));
if(net.length>40){net.shift();}
}catch(e){}
}
var origFetch=window.fetch;
if(origFetch){
window.fetch=function(input,init){
var url=typeof input==="string"?input:(input&&input.url)||"";
var method=(init&&init.method)||"GET";
return origFetch.apply(window,arguments).then(function(response){
if(isBv(url)){noteNet(method,url,response.status);}
return response;
},function(error){
if(isBv(url)){noteNet(method,url,"FAILED "+describe(error));}
throw error;
});
};
}
var origOpen=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(method,url){
var self=this;
if(isBv(url)){
self.addEventListener("loadend",function(){
noteNet(method||"GET",url,self.status===0?"FAILED/blocked":self.status);
});
}
return origOpen.apply(self,arguments);
};
})();`;

export function BvErrorCapture() {
  return <script dangerouslySetInnerHTML={{ __html: CAPTURE_SCRIPT }} />;
}
