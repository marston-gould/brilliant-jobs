const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/FeedPage-DYkehA6p.js","assets/react-vendor-DGWi3gCj.js","assets/design-system-CHMJ-a0P.js","assets/providers-CqMgP1io.js","assets/router-BaE0turN.js","assets/react-dom-Dsjvxb5P.js","assets/PipelinePage-B_zr9jhe.js","assets/KeywordsPage-BkdqfPhT.js","assets/ResumesPage-Bhj-LYcf.js","assets/ApplicationsPage-DTNP48gf.js","assets/StatsPage-Cg5Gm2J9.js","assets/TuningPage-BdFwgAkt.js","assets/BillingPage-D9Ezqc64.js","assets/SettingsPage-MFJfbgdR.js","assets/IntegrationsPage-DyH268xi.js","assets/ChatPage-CBl1_r2p.js","assets/ReferralsPage-SFV2H0Aq.js","assets/InterviewPrepPage-rFx3oP33.js","assets/loader-circle-9r73JtHW.js","assets/NotificationsPage-CO9zEoJN.js","assets/admin-pages-bCMIz7zY.js"])))=>i.map(i=>d[i]);
import{a as t,j as e}from"./react-vendor-DGWi3gCj.js";import{c as F}from"./react-dom-Dsjvxb5P.js";import{u as J,a as G,O as P,N as Z,b as v,c as Q,R as X}from"./router-BaE0turN.js";import{u as z,b as Y,s as A,D as ee}from"./providers-CqMgP1io.js";(function(){const n=document.createElement("link").relList;if(n&&n.supports&&n.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))i(r);new MutationObserver(r=>{for(const o of r)if(o.type==="childList")for(const m of o.addedNodes)m.tagName==="LINK"&&m.rel==="modulepreload"&&i(m)}).observe(document,{childList:!0,subtree:!0});function s(r){const o={};return r.integrity&&(o.integrity=r.integrity),r.referrerPolicy&&(o.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?o.credentials="include":r.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function i(r){if(r.ep)return;r.ep=!0;const o=s(r);fetch(r.href,o)}})();const te="modulepreload",ae=function(a){return"/dist/spa/"+a},M={},d=function(n,s,i){let r=Promise.resolve();if(s&&s.length>0){let m=function(p){return Promise.all(p.map(f=>Promise.resolve(f).then(y=>({status:"fulfilled",value:y}),y=>({status:"rejected",reason:y}))))};document.getElementsByTagName("link");const u=document.querySelector("meta[property=csp-nonce]"),b=u?.nonce||u?.getAttribute("nonce");r=m(s.map(p=>{if(p=ae(p),p in M)return;M[p]=!0;const f=p.endsWith(".css"),y=f?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${p}"]${y}`))return;const g=document.createElement("link");if(g.rel=f?"stylesheet":te,f||(g.as="script"),g.crossOrigin="",g.href=p,b&&g.setAttribute("nonce",b),document.head.appendChild(g),f)return new Promise((k,_)=>{g.addEventListener("load",k),g.addEventListener("error",()=>_(new Error(`Unable to preload CSS for ${p}`)))})}))}function o(m){const u=new Event("vite:preloadError",{cancelable:!0});if(u.payload=m,window.dispatchEvent(u),!u.defaultPrevented)throw m}return r.then(m=>{for(const u of m||[])u.status==="rejected"&&o(u.reason);return n().catch(o)})};/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const O=(...a)=>a.filter((n,s,i)=>!!n&&n.trim()!==""&&i.indexOf(n)===s).join(" ").trim();/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ne=a=>a.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase();/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const se=a=>a.replace(/^([A-Z])|[\s-_]+(\w)/g,(n,s,i)=>i?i.toUpperCase():s.toLowerCase());/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const R=a=>{const n=se(a);return n.charAt(0).toUpperCase()+n.slice(1)};/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var oe={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const re=a=>{for(const n in a)if(n.startsWith("aria-")||n==="role"||n==="title")return!0;return!1};/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ie=t.forwardRef(({color:a="currentColor",size:n=24,strokeWidth:s=2,absoluteStrokeWidth:i,className:r="",children:o,iconNode:m,...u},b)=>t.createElement("svg",{ref:b,...oe,width:n,height:n,stroke:a,strokeWidth:i?Number(s)*24/Number(n):s,className:O("lucide",r),...!o&&!re(u)&&{"aria-hidden":"true"},...u},[...m.map(([p,f])=>t.createElement(p,f)),...Array.isArray(o)?o:[o]]));/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const l=(a,n)=>{const s=t.forwardRef(({className:i,...r},o)=>t.createElement(ie,{ref:o,iconNode:n,className:O(`lucide-${ne(R(a))}`,`lucide-${a}`,i),...r}));return s.displayName=R(a),s};/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const le=[["path",{d:"M10.268 21a2 2 0 0 0 3.464 0",key:"vwvbt9"}],["path",{d:"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326",key:"11g9vi"}]],$=l("bell",le);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ce=[["path",{d:"M12 7v14",key:"1akyts"}],["path",{d:"M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z",key:"ruj8y"}]],T=l("book-open",ce);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const de=[["path",{d:"M12 8V4H8",key:"hb8ula"}],["rect",{width:"16",height:"12",x:"4",y:"8",rx:"2",key:"enze0r"}],["path",{d:"M2 14h2",key:"vft8re"}],["path",{d:"M20 14h2",key:"4cs60a"}],["path",{d:"M15 13v2",key:"1xurst"}],["path",{d:"M9 13v2",key:"rq6x2g"}]],he=l("bot",de);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const pe=[["path",{d:"M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16",key:"jecpp"}],["rect",{width:"20",height:"14",x:"2",y:"6",rx:"2",key:"i6l2r4"}]],ue=l("briefcase",pe);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const me=[["path",{d:"M3 3v16a2 2 0 0 0 2 2h16",key:"c24i48"}],["path",{d:"M18 17V9",key:"2bz60n"}],["path",{d:"M13 17V5",key:"1frdt8"}],["path",{d:"M8 17v-3",key:"17ska0"}]],xe=l("chart-column",me);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const fe=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M12 6v6l4 2",key:"mmk7yg"}]],ge=l("clock",fe);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ye=[["rect",{width:"20",height:"14",x:"2",y:"5",rx:"2",key:"ynyp8z"}],["line",{x1:"2",x2:"22",y1:"10",y2:"10",key:"1b3vmo"}]],be=l("credit-card",ye);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const _e=[["path",{d:"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",key:"1oefj6"}],["path",{d:"M14 2v5a1 1 0 0 0 1 1h5",key:"wfsgrz"}],["path",{d:"M10 9H8",key:"b1mrlr"}],["path",{d:"M16 13H8",key:"t4e002"}],["path",{d:"M16 17H8",key:"z1uh3a"}]],je=l("file-text",_e);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ke=[["path",{d:"M15 6a9 9 0 0 0-9 9V3",key:"1cii5b"}],["circle",{cx:"18",cy:"6",r:"3",key:"1h7g24"}],["circle",{cx:"6",cy:"18",r:"3",key:"fqmcym"}]],ve=l("git-branch",ke);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const we=[["path",{d:"m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4",key:"g0fldk"}],["path",{d:"m21 2-9.6 9.6",key:"1j0ho8"}],["circle",{cx:"7.5",cy:"15.5",r:"5.5",key:"yqb3hr"}]],Pe=l("key",we);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ne=[["rect",{width:"7",height:"9",x:"3",y:"3",rx:"1",key:"10lvy0"}],["rect",{width:"7",height:"5",x:"14",y:"3",rx:"1",key:"16une8"}],["rect",{width:"7",height:"9",x:"14",y:"12",rx:"1",key:"1hutg5"}],["rect",{width:"7",height:"5",x:"3",y:"16",rx:"1",key:"ldoo1y"}]],Ee=l("layout-dashboard",Ne);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Se=[["path",{d:"m16 17 5-5-5-5",key:"1bji2h"}],["path",{d:"M21 12H9",key:"dn1m92"}],["path",{d:"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4",key:"1uf3rs"}]],Ae=l("log-out",Se);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Me=[["path",{d:"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",key:"18887p"}]],Re=l("message-square",Me);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ie=[["rect",{width:"20",height:"14",x:"2",y:"3",rx:"2",key:"48i651"}],["line",{x1:"8",x2:"16",y1:"21",y2:"21",key:"1svkeh"}],["line",{x1:"12",x2:"12",y1:"17",y2:"21",key:"vw1qmm"}]],Ce=l("monitor",Ie);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Le=[["path",{d:"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401",key:"kfwtm"}]],ze=l("moon",Le);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Oe=[["path",{d:"m15 9-6 6",key:"1uzhvr"}],["path",{d:"M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z",key:"2d38gg"}],["path",{d:"m9 9 6 6",key:"z0biqf"}]],$e=l("octagon-x",Oe);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Te=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M9 3v18",key:"fh3hqa"}],["path",{d:"m16 15-3-3 3-3",key:"14y99z"}]],Ve=l("panel-left-close",Te);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const De=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M9 3v18",key:"fh3hqa"}],["path",{d:"m14 9 3 3-3 3",key:"8010ee"}]],qe=l("panel-left-open",De);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Be=[["path",{d:"M13 21h8",key:"1jsn5i"}],["path",{d:"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",key:"1a8usu"}]],Ke=l("pen-line",Be);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const He=[["path",{d:"M12 22v-5",key:"1ega77"}],["path",{d:"M15 8V2",key:"18g5xt"}],["path",{d:"M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z",key:"1xoxul"}],["path",{d:"M9 8V2",key:"14iosj"}]],Ue=l("plug",He);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const We=[["path",{d:"M4 11a9 9 0 0 1 9 9",key:"pv89mb"}],["path",{d:"M4 4a16 16 0 0 1 16 16",key:"k0647b"}],["circle",{cx:"5",cy:"19",r:"1",key:"bfqh0e"}]],Fe=l("rss",We);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Je=[["path",{d:"m21 21-4.34-4.34",key:"14j7rj"}],["circle",{cx:"11",cy:"11",r:"8",key:"4ej97u"}]],Ge=l("search",Je);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ze=[["path",{d:"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z",key:"1ffxy3"}],["path",{d:"m21.854 2.147-10.94 10.939",key:"12cjpa"}]],Qe=l("send",Ze);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Xe=[["path",{d:"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",key:"1i5ecw"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]],Ye=l("settings",Xe);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const et=[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]],tt=l("shield-check",et);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const at=[["path",{d:"M10 5H3",key:"1qgfaw"}],["path",{d:"M12 19H3",key:"yhmn1j"}],["path",{d:"M14 3v4",key:"1sua03"}],["path",{d:"M16 17v4",key:"1q0r14"}],["path",{d:"M21 12h-9",key:"1o4lsq"}],["path",{d:"M21 19h-5",key:"1rlt1p"}],["path",{d:"M21 5h-7",key:"1oszz2"}],["path",{d:"M8 10v4",key:"tgpxqk"}],["path",{d:"M8 12H3",key:"a7s4jb"}]],nt=l("sliders-horizontal",at);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const st=[["circle",{cx:"12",cy:"12",r:"4",key:"4exip2"}],["path",{d:"M12 2v2",key:"tus03m"}],["path",{d:"M12 20v2",key:"1lh1kg"}],["path",{d:"m4.93 4.93 1.41 1.41",key:"149t6j"}],["path",{d:"m17.66 17.66 1.41 1.41",key:"ptbguv"}],["path",{d:"M2 12h2",key:"1t8f8n"}],["path",{d:"M20 12h2",key:"1q8mjw"}],["path",{d:"m6.34 17.66-1.41 1.41",key:"1m8zz5"}],["path",{d:"m19.07 4.93-1.41 1.41",key:"1shlcs"}]],ot=l("sun",st);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const rt=[["path",{d:"M16 7h6v6",key:"box55l"}],["path",{d:"m22 7-8.5 8.5-5-5L2 17",key:"1t1m79"}]],it=l("trending-up",rt);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const lt=[["path",{d:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",key:"1yyitq"}],["path",{d:"M16 3.128a4 4 0 0 1 0 7.744",key:"16gr8j"}],["path",{d:"M22 21v-2a4 4 0 0 0-3-3.87",key:"kshegd"}],["circle",{cx:"9",cy:"7",r:"4",key:"nufk8"}]],ct=l("users",lt);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const dt=[["path",{d:"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z",key:"1xq2db"}]],ht=l("zap",dt),pt=[{label:"Search",items:[{path:"/app/feed",label:"Feed",Icon:Fe,badgeKey:"jobs"},{path:"/app/keywords",label:"Keywords",Icon:Pe},{path:"/app/chat",label:"Chat",Icon:Re}]},{label:"Applications",items:[{path:"/app/pipeline",label:"Pipeline",Icon:ve},{path:"/app/applications",label:"Applications",Icon:Qe,badgeKey:"applications"},{path:"/app/resumes",label:"Resumes",Icon:je,badgeKey:"resumes"},{path:"/app/interview-prep",label:"Interview Prep",Icon:T}]},{label:"Intelligence",items:[{path:"/app/stats",label:"Stats",Icon:xe},{path:"/app/tuning",label:"Tuning",Icon:nt},{path:"/app/integrations",label:"Integrations",Icon:Ue}]},{label:"Account",items:[{path:"/app/notifications",label:"Notifications",Icon:$},{path:"/app/billing",label:"Billing",Icon:be},{path:"/app/settings",label:"Settings",Icon:Ye},{path:"/app/referrals",label:"Referrals",Icon:ct}]}],ut=[{path:"/app/admin/overview",label:"Overview",Icon:Ee},{path:"/app/admin/jobs",label:"Jobs",Icon:ue},{path:"/app/admin/cron",label:"Cron",Icon:ge},{path:"/app/admin/content",label:"Content",Icon:Ke},{path:"/app/admin/seo",label:"SEO",Icon:Ge},{path:"/app/admin/notifications",label:"Notifications",Icon:$},{path:"/app/admin/agents",label:"Agents",Icon:he},{path:"/app/admin/monitoring",label:"Monitoring",Icon:it},{path:"/app/admin/killswitch",label:"Kill Switch",Icon:$e},{path:"/app/admin/compliance",label:"Compliance",Icon:tt}],V="bj_theme";function mt(){try{const a=localStorage.getItem(V);if(a==="light"||a==="dark"||a==="auto")return a}catch{}return"auto"}function I(a){const n=document.documentElement;if(a==="auto"){const s=window.matchMedia("(prefers-color-scheme: dark)").matches;n.classList.toggle("dark",s)}else n.classList.toggle("dark",a==="dark");try{localStorage.setItem(V,a)}catch{}}const xt={light:ot,dark:ze,auto:Ce},w=["light","dark","auto"],C=["#6366f1","#8b5cf6","#ec4899","#f43f5e","#f97316","#eab308","#22c55e","#14b8a6","#06b6d4","#3b82f6"];function ft(a){const n=Array.from(a).reduce((s,i)=>(s<<5)-s+i.charCodeAt(0)|0,0);return C[Math.abs(n)%C.length]??"#6366f1"}function gt(a,n){return n?n.charAt(0).toUpperCase():a.charAt(0).toUpperCase()}function yt(){const a=z(),n=Y(),s=J(),[i,r]=t.useState(null),[o,m]=t.useState(!1),[u,b]=t.useState(!1),[p,f]=t.useState(mt),[y,g]=t.useState({}),k=G(),_=k.pathname.startsWith("/app/admin");t.useEffect(()=>{try{const c=window.posthog;c?.capture&&c.capture("$pageview",{$current_url:window.location.href})}catch{}},[k.pathname]),t.useEffect(()=>(a.getCurrentUser().then(r).catch(()=>r(null)),a.onAuthChange(r)),[a]),t.useEffect(()=>{async function c(){try{const[j,E,S]=await Promise.allSettled([n.stats.getJobCounts(),n.resumes.getAll(),n.applications.getQueue()]);g({jobs:j.status==="fulfilled"&&j.value?.total_open?j.value.total_open:0,resumes:E.status==="fulfilled"?E.value.length:0,applications:S.status==="fulfilled"?S.value.length:0})}catch{}}c();const x=setInterval(c,6e4);return()=>clearInterval(x)},[n]),t.useEffect(()=>{I(p);const c=window.matchMedia("(prefers-color-scheme: dark)"),x=()=>{p==="auto"&&I("auto")};return c.addEventListener("change",x),()=>c.removeEventListener("change",x)},[p]);const D=i?.role==="admin",q=t.useCallback(()=>m(c=>!c),[]),B=t.useCallback(()=>b(c=>!c),[]),K=t.useCallback(()=>{f(c=>{const x=w.indexOf(c);return w[(x+1)%w.length]??"auto"})},[]),H=t.useCallback(async()=>{try{await a.signOut(),s("/")}catch{}},[a,s]);function N(c){const x=c.badgeKey?y[c.badgeKey]:void 0;return e.jsxs(Z,{to:c.path,className:({isActive:j})=>`
          flex items-center gap-3 px-3 py-2 mx-2 rounded-md
          text-sm font-medium transition-all
          ${j?"bg-white/15 text-white":"text-white/65 hover:text-white hover:bg-white/[0.08]"}
        `,children:[e.jsx(c.Icon,{className:"w-[18px] h-[18px] flex-shrink-0",strokeWidth:1.75}),!o&&e.jsx("span",{className:"truncate",children:c.label}),!o&&x!=null&&x>0&&e.jsx("span",{className:"ml-auto text-[10px] font-semibold bg-white/20 text-white px-1.5 py-0.5 rounded-full min-w-[20px] text-center",children:x>999?"999+":x})]},c.path)}function U(c){return o?e.jsx("div",{className:"my-2 mx-4 border-t border-white/10"}):e.jsx("p",{className:"px-5 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/35",children:c})}const W=xt[p];return e.jsxs("div",{className:"flex h-screen bg-bg-main",children:[e.jsxs("nav",{"aria-label":"Main navigation",className:`
          flex flex-col h-full bg-[#1a1f36] text-white
          transition-all duration-200 flex-shrink-0
          ${o?"w-[60px]":"w-[240px]"}
        `,children:[e.jsxs("div",{className:"flex items-center gap-3 px-4 py-4 border-b border-white/10",children:[!o&&e.jsx("span",{className:"font-semibold text-base tracking-tight select-none",children:"Brilliant Jobs"}),e.jsx("button",{onClick:q,className:"ml-auto p-1.5 rounded-md hover:bg-white/10 transition-colors","aria-label":o?"Expand navigation":"Collapse navigation",children:o?e.jsx(qe,{className:"w-4 h-4",strokeWidth:1.75}):e.jsx(Ve,{className:"w-4 h-4",strokeWidth:1.75})})]}),e.jsx("div",{className:"flex-1 overflow-y-auto py-1",role:"list",children:_||u?e.jsxs(e.Fragment,{children:[!o&&e.jsx("p",{className:"px-5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/35",children:"Admin"}),ut.map(N)]}):pt.map(c=>e.jsxs("div",{role:"group","aria-label":c.label,children:[U(c.label),c.items.map(N)]},c.label))}),e.jsxs("div",{className:"border-t border-white/10",children:[e.jsxs("a",{href:"https://brilliantjobs.app/blog",target:"_blank",rel:"noopener noreferrer",className:"flex items-center gap-3 px-3 py-2 mx-2 mt-2 rounded-md text-sm text-white/50 hover:text-white hover:bg-white/[0.08] transition-all",children:[e.jsx(T,{className:"w-[18px] h-[18px] flex-shrink-0",strokeWidth:1.75}),!o&&e.jsx("span",{children:"Blog & Insights"})]}),D&&e.jsxs("button",{onClick:B,className:`
                flex items-center gap-3 w-[calc(100%-16px)] mx-2 px-3 py-2 rounded-md
                text-sm font-medium transition-all
                ${u||_?"bg-red-500/20 text-red-400":"text-white/50 hover:text-white hover:bg-white/[0.08]"}
              `,"aria-label":"Toggle admin view",children:[e.jsx(ht,{className:"w-[18px] h-[18px] flex-shrink-0",strokeWidth:1.75}),!o&&e.jsx("span",{children:u||_?"Dashboard":"Admin"})]}),e.jsxs("div",{className:`flex items-center ${o?"flex-col gap-1 py-2":"gap-1 px-3 py-2"}`,children:[e.jsx("button",{onClick:K,className:"p-2 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors","aria-label":`Theme: ${p}. Click to cycle.`,title:`Theme: ${p}`,children:e.jsx(W,{className:"w-4 h-4",strokeWidth:1.75})}),e.jsx("button",{onClick:H,className:"p-2 rounded-md text-white/50 hover:text-red-400 hover:bg-white/10 transition-colors","aria-label":"Sign out",title:"Sign out",children:e.jsx(Ae,{className:"w-4 h-4",strokeWidth:1.75})})]}),i&&e.jsx("div",{className:"border-t border-white/10 px-3 py-3",children:e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx("div",{className:"w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0",style:{backgroundColor:ft(i.email)},"aria-hidden":"true",children:gt(i.email,i.display_name)}),!o&&e.jsxs("div",{className:"min-w-0",children:[e.jsx("p",{className:"text-xs text-white/80 truncate",children:i.email}),e.jsxs("p",{className:"text-[10px] text-white/40 mt-0.5 uppercase tracking-wider",children:[i.tier," • ",i.role]})]})]})})]})]}),e.jsx("main",{id:"main-content",role:"main",className:"flex-1 overflow-y-auto",children:e.jsx(P,{})})]})}function bt(){const[a,n]=t.useState("loading");return t.useEffect(()=>{let s=!1;A.auth.getSession().then(({data:r})=>{s||n(r?.session?.user?"authenticated":"unauthenticated")}).catch(()=>{s||n("unauthenticated")});const{data:{subscription:i}}=A.auth.onAuthStateChange((r,o)=>{s||n(o?.user?"authenticated":"unauthenticated")});return()=>{s=!0,i.unsubscribe()}},[]),a==="loading"?e.jsx("div",{className:"flex items-center justify-center h-screen bg-bg-main",children:e.jsxs("div",{className:"flex flex-col items-center gap-3",children:[e.jsx("div",{className:"w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"}),e.jsx("p",{className:"text-sm text-text-dim",children:"Loading..."})]})}):a==="unauthenticated"?(window.location.href="/",null):e.jsx(P,{})}function _t(){const a=z(),[n,s]=t.useState("loading");return t.useEffect(()=>{let i=!1;return a.getCurrentUser().then(r=>{i||s(r?.role==="admin"?"admin":"denied")}).catch(()=>{i||s("denied")}),()=>{i=!0}},[a]),n==="loading"?e.jsx("div",{className:"flex items-center justify-center h-full",children:e.jsx("div",{className:"w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"})}):n==="denied"?e.jsx(v,{to:"/app/feed",replace:!0}):e.jsx(P,{})}const jt=t.lazy(()=>d(()=>import("./FeedPage-DYkehA6p.js"),__vite__mapDeps([0,1,2,3,4,5]))),kt=t.lazy(()=>d(()=>import("./PipelinePage-B_zr9jhe.js"),__vite__mapDeps([6,1,2,3]))),vt=t.lazy(()=>d(()=>import("./KeywordsPage-BkdqfPhT.js"),__vite__mapDeps([7,1,2,3]))),wt=t.lazy(()=>d(()=>import("./ResumesPage-Bhj-LYcf.js"),__vite__mapDeps([8,1,2,3]))),Pt=t.lazy(()=>d(()=>import("./ApplicationsPage-DTNP48gf.js"),__vite__mapDeps([9,1,2,3]))),Nt=t.lazy(()=>d(()=>import("./StatsPage-Cg5Gm2J9.js"),__vite__mapDeps([10,1,2,3]))),Et=t.lazy(()=>d(()=>import("./TuningPage-BdFwgAkt.js"),__vite__mapDeps([11,1,2,3]))),St=t.lazy(()=>d(()=>import("./BillingPage-D9Ezqc64.js"),__vite__mapDeps([12,1,2,3]))),At=t.lazy(()=>d(()=>import("./SettingsPage-MFJfbgdR.js"),__vite__mapDeps([13,1,2,3]))),Mt=t.lazy(()=>d(()=>import("./IntegrationsPage-DyH268xi.js"),__vite__mapDeps([14,1,2,3]))),Rt=t.lazy(()=>d(()=>import("./ChatPage-CBl1_r2p.js"),__vite__mapDeps([15,1,2,3]))),It=t.lazy(()=>d(()=>import("./ReferralsPage-SFV2H0Aq.js"),__vite__mapDeps([16,1,2,3]))),Ct=t.lazy(()=>d(()=>import("./InterviewPrepPage-rFx3oP33.js"),__vite__mapDeps([17,1,3,18,5,4]))),Lt=t.lazy(()=>d(()=>import("./NotificationsPage-CO9zEoJN.js"),__vite__mapDeps([19,1,3,18,5,4]))),zt=t.lazy(()=>d(()=>import("./admin-pages-bCMIz7zY.js").then(a=>a.O),__vite__mapDeps([20,1,2,3]))),Ot=t.lazy(()=>d(()=>import("./admin-pages-bCMIz7zY.js").then(a=>a.J),__vite__mapDeps([20,1,2,3]))),$t=t.lazy(()=>d(()=>import("./admin-pages-bCMIz7zY.js").then(a=>a.C),__vite__mapDeps([20,1,2,3]))),Tt=t.lazy(()=>d(()=>import("./admin-pages-bCMIz7zY.js").then(a=>a.a),__vite__mapDeps([20,1,2,3]))),Vt=t.lazy(()=>d(()=>import("./admin-pages-bCMIz7zY.js").then(a=>a.S),__vite__mapDeps([20,1,2,3]))),Dt=t.lazy(()=>d(()=>import("./admin-pages-bCMIz7zY.js").then(a=>a.N),__vite__mapDeps([20,1,2,3]))),qt=t.lazy(()=>d(()=>import("./admin-pages-bCMIz7zY.js").then(a=>a.A),__vite__mapDeps([20,1,2,3]))),Bt=t.lazy(()=>d(()=>import("./admin-pages-bCMIz7zY.js").then(a=>a.M),__vite__mapDeps([20,1,2,3]))),Kt=t.lazy(()=>d(()=>import("./admin-pages-bCMIz7zY.js").then(a=>a.K),__vite__mapDeps([20,1,2,3]))),Ht=t.lazy(()=>d(()=>import("./admin-pages-bCMIz7zY.js").then(a=>a.b),__vite__mapDeps([20,1,2,3])));function h({label:a}){return e.jsx("div",{className:"flex items-center justify-center py-16",children:e.jsxs("div",{className:"text-center",children:[e.jsx("div",{className:"inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"}),e.jsxs("p",{className:"text-xs text-text-faint mt-2",children:["Loading ",a,"…"]})]})})}function Ut(){return e.jsx(t.Suspense,{fallback:e.jsx(h,{label:"feed"}),children:e.jsx(jt,{})})}function Wt(){return e.jsx(t.Suspense,{fallback:e.jsx(h,{label:"pipeline"}),children:e.jsx(kt,{})})}function Ft(){return e.jsx(t.Suspense,{fallback:e.jsx(h,{label:"readiness"}),children:e.jsx(vt,{})})}function Jt(){return e.jsx(t.Suspense,{fallback:e.jsx(h,{label:"resumes"}),children:e.jsx(wt,{})})}function Gt(){return e.jsx(t.Suspense,{fallback:e.jsx(h,{label:"applications"}),children:e.jsx(Pt,{})})}function Zt(){return e.jsx(t.Suspense,{fallback:e.jsx(h,{label:"stats"}),children:e.jsx(Nt,{})})}function Qt(){return e.jsx(t.Suspense,{fallback:e.jsx(h,{label:"tuning"}),children:e.jsx(Et,{})})}function Xt(){return e.jsx(t.Suspense,{fallback:e.jsx(h,{label:"billing"}),children:e.jsx(St,{})})}function Yt(){return e.jsx(t.Suspense,{fallback:e.jsx(h,{label:"settings"}),children:e.jsx(At,{})})}function ea(){return e.jsx(t.Suspense,{fallback:e.jsx(h,{label:"integrations"}),children:e.jsx(Mt,{})})}function ta(){return e.jsx(t.Suspense,{fallback:e.jsx(h,{label:"chat"}),children:e.jsx(Rt,{})})}function aa(){return e.jsx(t.Suspense,{fallback:e.jsx(h,{label:"referrals"}),children:e.jsx(It,{})})}function na(){return e.jsx(t.Suspense,{fallback:e.jsx(h,{label:"interview prep"}),children:e.jsx(Ct,{})})}function sa(){return e.jsx(t.Suspense,{fallback:e.jsx(h,{label:"notifications"}),children:e.jsx(Lt,{})})}function oa(){return e.jsx(t.Suspense,{fallback:e.jsx(h,{label:"overview"}),children:e.jsx(zt,{})})}function ra(){return e.jsx(t.Suspense,{fallback:e.jsx(h,{label:"jobs"}),children:e.jsx(Ot,{})})}function ia(){return e.jsx(t.Suspense,{fallback:e.jsx(h,{label:"cron"}),children:e.jsx($t,{})})}function la(){return e.jsx(t.Suspense,{fallback:e.jsx(h,{label:"content"}),children:e.jsx(Tt,{})})}function ca(){return e.jsx(t.Suspense,{fallback:e.jsx(h,{label:"seo"}),children:e.jsx(Vt,{})})}function da(){return e.jsx(t.Suspense,{fallback:e.jsx(h,{label:"notifications"}),children:e.jsx(Dt,{})})}function ha(){return e.jsx(t.Suspense,{fallback:e.jsx(h,{label:"agents"}),children:e.jsx(qt,{})})}function pa(){return e.jsx(t.Suspense,{fallback:e.jsx(h,{label:"monitoring"}),children:e.jsx(Bt,{})})}function ua(){return e.jsx(t.Suspense,{fallback:e.jsx(h,{label:"killswitch"}),children:e.jsx(Kt,{})})}function ma(){return e.jsx(t.Suspense,{fallback:e.jsx(h,{label:"compliance"}),children:e.jsx(Ht,{})})}const xa=[{path:"/app",element:e.jsx(bt,{}),children:[{element:e.jsx(yt,{}),children:[{index:!0,element:e.jsx(v,{to:"feed",replace:!0})},{path:"feed",element:e.jsx(Ut,{})},{path:"pipeline",element:e.jsx(Wt,{})},{path:"keywords",element:e.jsx(Ft,{})},{path:"resumes",element:e.jsx(Jt,{})},{path:"applications",element:e.jsx(Gt,{})},{path:"stats",element:e.jsx(Zt,{})},{path:"tuning",element:e.jsx(Qt,{})},{path:"billing",element:e.jsx(Xt,{})},{path:"settings",element:e.jsx(Yt,{})},{path:"integrations",element:e.jsx(ea,{})},{path:"chat",element:e.jsx(ta,{})},{path:"referrals",element:e.jsx(aa,{})},{path:"interview-prep",element:e.jsx(na,{})},{path:"notifications",element:e.jsx(sa,{})},{path:"admin",element:e.jsx(_t,{}),children:[{index:!0,element:e.jsx(v,{to:"overview",replace:!0})},{path:"overview",element:e.jsx(oa,{})},{path:"jobs",element:e.jsx(ra,{})},{path:"cron",element:e.jsx(ia,{})},{path:"content",element:e.jsx(la,{})},{path:"seo",element:e.jsx(ca,{})},{path:"notifications",element:e.jsx(da,{})},{path:"agents",element:e.jsx(ha,{})},{path:"monitoring",element:e.jsx(pa,{})},{path:"killswitch",element:e.jsx(ua,{})},{path:"compliance",element:e.jsx(ma,{})}]},{path:"*",element:e.jsx(v,{to:"feed",replace:!0})}]}]}];function fa(){return Q(xa)}(function(){const n=window.location.hash?.replace("#",""),s=window.location.pathname;n&&(s==="/dashboard"||s==="/dashboard.html"||s==="/admin"||s==="/admin.html")&&["feed","pipeline","keywords","resumes","applications","stats","billing","settings","tuning","integrations","chat","referrals"].includes(n)&&window.history.replaceState(null,"",`/app/${n}`),(s==="/dashboard"||s==="/dashboard.html")&&!n&&window.history.replaceState(null,"","/app/feed"),(s==="/admin"||s==="/admin.html")&&!n&&window.history.replaceState(null,"","/app/admin/overview")})();const ga=fa();function ya(){return e.jsx(t.StrictMode,{children:e.jsx(ee,{children:e.jsx(X,{router:ga})})})}const L=document.getElementById("spa-root");L?F.createRoot(L).render(e.jsx(ya,{})):console.error("[SPA] #spa-root not found — React app cannot mount.");export{T as B,Re as M,Ge as S,Qe as a,$ as b,l as c,Ye as d};
//# sourceMappingURL=app-B-UfP3aC.js.map
