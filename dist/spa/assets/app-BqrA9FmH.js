const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/FeedPage-DfxeT1OK.js","assets/react-vendor-DGWi3gCj.js","assets/design-system-FUzmWWpK.js","assets/providers-BeAkJWdE.js","assets/router-BaE0turN.js","assets/react-dom-Dsjvxb5P.js","assets/GetStartedPage-CbB8AoZU.js","assets/PipelinePage-t1Vn7YOx.js","assets/KeywordsPage-CFfJQT9I.js","assets/ResumesPage-CCUat8va.js","assets/ApplicationsPage-FGMBeEFK.js","assets/StatsPage-B9CUV_bY.js","assets/TuningPage-DMLncNZs.js","assets/BillingPage-BKGqFvm8.js","assets/SettingsPage-DwpG0KrW.js","assets/IntegrationsPage-D_Ez5Qgm.js","assets/ChatPage-eisfu7k6.js","assets/ReferralsPage-BTO7PFu1.js","assets/InterviewPrepPage-BUSQf8Kp.js","assets/NotificationsPage-C54amsBX.js","assets/admin-pages-PfVa9pLg.js"])))=>i.map(i=>d[i]);
import{a as t,j as e}from"./react-vendor-DGWi3gCj.js";import{c as J}from"./react-dom-Dsjvxb5P.js";import{u as K,a as W,N as S,O as E,b as k,c as G,R as F}from"./router-BaE0turN.js";import{u as z,b as Y,s as I,D as Z}from"./providers-BeAkJWdE.js";import{T as $}from"./design-system-FUzmWWpK.js";(function(){const n=document.createElement("link").relList;if(n&&n.supports&&n.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))c(r);new MutationObserver(r=>{for(const o of r)if(o.type==="childList")for(const p of o.addedNodes)p.tagName==="LINK"&&p.rel==="modulepreload"&&c(p)}).observe(document,{childList:!0,subtree:!0});function s(r){const o={};return r.integrity&&(o.integrity=r.integrity),r.referrerPolicy&&(o.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?o.credentials="include":r.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function c(r){if(r.ep)return;r.ep=!0;const o=s(r);fetch(r.href,o)}})();const Q="modulepreload",X=function(a){return"/dist/spa/"+a},C={},i=function(n,s,c){let r=Promise.resolve();if(s&&s.length>0){let p=function(x){return Promise.all(x.map(g=>Promise.resolve(g).then(y=>({status:"fulfilled",value:y}),y=>({status:"rejected",reason:y}))))};document.getElementsByTagName("link");const m=document.querySelector("meta[property=csp-nonce]"),b=m?.nonce||m?.getAttribute("nonce");r=p(s.map(x=>{if(x=X(x),x in C)return;C[x]=!0;const g=x.endsWith(".css"),y=g?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${x}"]${y}`))return;const f=document.createElement("link");if(f.rel=g?"stylesheet":Q,g||(f.as="script"),f.crossOrigin="",f.href=x,b&&f.setAttribute("nonce",b),document.head.appendChild(f),g)return new Promise((w,N)=>{f.addEventListener("load",w),f.addEventListener("error",()=>N(new Error(`Unable to preload CSS for ${x}`)))})}))}function o(p){const m=new Event("vite:preloadError",{cancelable:!0});if(m.payload=p,window.dispatchEvent(m),!m.defaultPrevented)throw p}return r.then(p=>{for(const m of p||[])m.status==="rejected"&&o(m.reason);return n().catch(o)})};/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const V=(...a)=>a.filter((n,s,c)=>!!n&&n.trim()!==""&&c.indexOf(n)===s).join(" ").trim();/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ee=a=>a.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase();/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const te=a=>a.replace(/^([A-Z])|[\s-_]+(\w)/g,(n,s,c)=>c?c.toUpperCase():s.toLowerCase());/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const R=a=>{const n=te(a);return n.charAt(0).toUpperCase()+n.slice(1)};/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var ae={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ne=a=>{for(const n in a)if(n.startsWith("aria-")||n==="role"||n==="title")return!0;return!1};/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const se=t.forwardRef(({color:a="currentColor",size:n=24,strokeWidth:s=2,absoluteStrokeWidth:c,className:r="",children:o,iconNode:p,...m},b)=>t.createElement("svg",{ref:b,...ae,width:n,height:n,stroke:a,strokeWidth:c?Number(s)*24/Number(n):s,className:V("lucide",r),...!o&&!ne(m)&&{"aria-hidden":"true"},...m},[...p.map(([x,g])=>t.createElement(x,g)),...Array.isArray(o)?o:[o]]));/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const d=(a,n)=>{const s=t.forwardRef(({className:c,...r},o)=>t.createElement(se,{ref:o,iconNode:n,className:V(`lucide-${ee(R(a))}`,`lucide-${a}`,c),...r}));return s.displayName=R(a),s};/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const re=[["path",{d:"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",key:"169zse"}]],oe=d("activity",re);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ie=[["path",{d:"M10.268 21a2 2 0 0 0 3.464 0",key:"vwvbt9"}],["path",{d:"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326",key:"11g9vi"}]],D=d("bell",ie);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const le=[["path",{d:"M10 2v8l3-3 3 3V2",key:"sqw3rj"}],["path",{d:"M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",key:"k3hazp"}]],ce=d("book-marked",le);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const de=[["path",{d:"M12 8V4H8",key:"hb8ula"}],["rect",{width:"16",height:"12",x:"4",y:"8",rx:"2",key:"enze0r"}],["path",{d:"M2 14h2",key:"vft8re"}],["path",{d:"M20 14h2",key:"4cs60a"}],["path",{d:"M15 13v2",key:"1xurst"}],["path",{d:"M9 13v2",key:"rq6x2g"}]],pe=d("bot",de);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const he=[["path",{d:"M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16",key:"jecpp"}],["rect",{width:"20",height:"14",x:"2",y:"6",rx:"2",key:"i6l2r4"}]],q=d("briefcase",he);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ue=[["path",{d:"M3 3v16a2 2 0 0 0 2 2h16",key:"c24i48"}],["path",{d:"M18 17V9",key:"2bz60n"}],["path",{d:"M13 17V5",key:"1frdt8"}],["path",{d:"M8 17v-3",key:"17ska0"}]],xe=d("chart-column",ue);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const me=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M12 6v6l4 2",key:"mmk7yg"}]],ge=d("clock",me);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const fe=[["rect",{width:"20",height:"14",x:"2",y:"5",rx:"2",key:"ynyp8z"}],["line",{x1:"2",x2:"22",y1:"10",y2:"10",key:"1b3vmo"}]],be=d("credit-card",fe);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ye=[["path",{d:"M15 3h6v6",key:"1q9fwt"}],["path",{d:"M10 14 21 3",key:"gplh6r"}],["path",{d:"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",key:"a6xqqp"}]],ve=d("external-link",ye);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const je=[["path",{d:"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",key:"1oefj6"}],["path",{d:"M14 2v5a1 1 0 0 0 1 1h5",key:"wfsgrz"}],["path",{d:"M10 9H8",key:"b1mrlr"}],["path",{d:"M16 13H8",key:"t4e002"}],["path",{d:"M16 17H8",key:"z1uh3a"}]],_e=d("file-text",je);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ke=[["path",{d:"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z",key:"j76jl0"}],["path",{d:"M22 10v6",key:"1lu8f3"}],["path",{d:"M6 12.5V16a6 3 0 0 0 12 0v-3.5",key:"1r8lef"}]],we=d("graduation-cap",ke);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ne=[["rect",{width:"7",height:"9",x:"3",y:"3",rx:"1",key:"10lvy0"}],["rect",{width:"7",height:"5",x:"14",y:"3",rx:"1",key:"16une8"}],["rect",{width:"7",height:"9",x:"14",y:"12",rx:"1",key:"1hutg5"}],["rect",{width:"7",height:"5",x:"3",y:"16",rx:"1",key:"ldoo1y"}]],Pe=d("layout-dashboard",Ne);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ee=[["rect",{width:"18",height:"11",x:"3",y:"11",rx:"2",ry:"2",key:"1w4ew1"}],["path",{d:"M7 11V7a5 5 0 0 1 10 0v4",key:"fwvmzm"}]],Ae=d("lock",Ee);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Se=[["rect",{width:"20",height:"14",x:"2",y:"3",rx:"2",key:"48i651"}],["line",{x1:"8",x2:"16",y1:"21",y2:"21",key:"1svkeh"}],["line",{x1:"12",x2:"12",y1:"17",y2:"21",key:"vw1qmm"}]],Ie=d("monitor",Se);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ce=[["path",{d:"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401",key:"kfwtm"}]],Re=d("moon",Ce);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Me=[["path",{d:"m15 9-6 6",key:"1uzhvr"}],["path",{d:"M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z",key:"2d38gg"}],["path",{d:"m9 9 6 6",key:"z0biqf"}]],Le=d("octagon-x",Me);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Oe=[["path",{d:"M13 21h8",key:"1jsn5i"}],["path",{d:"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",key:"1a8usu"}]],Te=d("pen-line",Oe);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ze=[["path",{d:"m21 21-4.34-4.34",key:"14j7rj"}],["circle",{cx:"11",cy:"11",r:"8",key:"4ej97u"}]],$e=d("search",ze);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ve=[["path",{d:"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",key:"1i5ecw"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]],De=d("settings",Ve);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const qe=[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]],Be=d("shield-check",qe);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const He=[["path",{d:"M10 5H3",key:"1qgfaw"}],["path",{d:"M12 19H3",key:"yhmn1j"}],["path",{d:"M14 3v4",key:"1sua03"}],["path",{d:"M16 17v4",key:"1q0r14"}],["path",{d:"M21 12h-9",key:"1o4lsq"}],["path",{d:"M21 19h-5",key:"1rlt1p"}],["path",{d:"M21 5h-7",key:"1oszz2"}],["path",{d:"M8 10v4",key:"tgpxqk"}],["path",{d:"M8 12H3",key:"a7s4jb"}]],Ue=d("sliders-horizontal",He);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Je=[["path",{d:"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",key:"r04s7s"}]],Ke=d("star",Je);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const We=[["circle",{cx:"12",cy:"12",r:"4",key:"4exip2"}],["path",{d:"M12 2v2",key:"tus03m"}],["path",{d:"M12 20v2",key:"1lh1kg"}],["path",{d:"m4.93 4.93 1.41 1.41",key:"149t6j"}],["path",{d:"m17.66 17.66 1.41 1.41",key:"ptbguv"}],["path",{d:"M2 12h2",key:"1t8f8n"}],["path",{d:"M20 12h2",key:"1q8mjw"}],["path",{d:"m6.34 17.66-1.41 1.41",key:"1m8zz5"}],["path",{d:"m19.07 4.93-1.41 1.41",key:"1shlcs"}]],Ge=d("sun",We);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Fe=[["path",{d:"M16 7h6v6",key:"box55l"}],["path",{d:"m22 7-8.5 8.5-5-5L2 17",key:"1t1m79"}]],Ye=d("trending-up",Fe),Ze=[{label:"",items:[{path:"/app/get-started",label:"Get Started",Icon:Ke,dot:!0,dotColor:"var(--green)"}]},{label:"SEARCH",items:[{path:"/app/feed",label:"Jobs Feed",Icon:q,dot:!0,dotColor:"var(--green)",badge:!0},{path:"/app/tuning",label:"Search Tuning",Icon:Ue,indent:!0,dot:!0,dotColor:"var(--warm)"},{path:"/app/resumes",label:"Resumes",Icon:_e,dot:!0,dotColor:"#ef4444",badge:!0}]},{label:"APPLICATIONS",items:[{path:"/app/applications",label:"My Applications",Icon:oe,dot:!0,dotColor:"#ef4444",badge:!0},{path:"/app/interview-prep",label:"Interview Prep",Icon:we}]},{label:"INTELLIGENCE",items:[{path:"/app/stats",label:"Stats",Icon:xe}]},{label:"ACCOUNT",items:[{path:"/app/settings",label:"Settings",Icon:De},{path:"/app/billing",label:"Subscription",Icon:be},{path:"/app/notifications",label:"Notifications",Icon:D}]}],Qe=[{path:"/app/admin/overview",label:"Overview",Icon:Pe},{path:"/app/admin/jobs",label:"Jobs",Icon:q},{path:"/app/admin/cron",label:"Cron",Icon:ge},{path:"/app/admin/content",label:"Content",Icon:Te},{path:"/app/admin/seo",label:"SEO",Icon:$e},{path:"/app/admin/notifications",label:"Notifications",Icon:D},{path:"/app/admin/agents",label:"Agents",Icon:pe},{path:"/app/admin/monitoring",label:"Monitoring",Icon:Ye},{path:"/app/admin/killswitch",label:"Kill Switch",Icon:Le},{path:"/app/admin/compliance",label:"Compliance",Icon:Be}],B="bj-theme",M={light:"Light",dark:"Dark",auto:"Auto"},Xe={light:Ge,dark:Re,auto:Ie},P=["light","dark","auto"];function et(){try{const a=localStorage.getItem(B);if(a==="light"||a==="dark"||a==="auto")return a}catch{}return"auto"}function L(a){document.documentElement.setAttribute("data-theme",a);try{localStorage.setItem(B,a)}catch{}}const O=["#6366f1","#8b5cf6","#ec4899","#f43f5e","#f97316","#eab308","#22c55e","#14b8a6","#06b6d4","#3b82f6"];function tt(a){const n=Array.from(a).reduce((s,c)=>(s<<5)-s+c.charCodeAt(0)|0,0);return O[Math.abs(n)%O.length]??"#6366f1"}function at(a,n){return(n||a).charAt(0).toUpperCase()}function nt(){const a=z(),n=Y(),s=K(),c=W(),[r,o]=t.useState(null),[p,m]=t.useState(et),[b,x]=t.useState(0),[g,y]=t.useState({}),f=c.pathname.startsWith("/app/admin"),w=r?.role==="admin";t.useEffect(()=>{try{const u=window.posthog;u?.capture&&u.capture("$pageview",{$current_url:window.location.href})}catch{}},[c.pathname]),t.useEffect(()=>(a.getCurrentUser().then(o).catch(()=>o(null)),a.onAuthChange(o)),[a]),t.useEffect(()=>{n.billing.getBalance().then(x).catch(()=>x(0))},[n]),t.useEffect(()=>{if(!r)return;const u=async()=>{try{const h={},_=await n.stats.getJobCounts();_&&(h["/app/feed"]=_.total_open??0);const j=await n.resumes.getAll();if(h["/app/resumes"]=Array.isArray(j)?j.length:0,Array.isArray(j)&&j.length>0)try{localStorage.setItem("bj_resumes",JSON.stringify(j))}catch{}const A=await n.applications.getQueue();h["/app/applications"]=Array.isArray(A)?A.length:0,y(h)}catch{}};u();const v=setInterval(u,6e4);return()=>clearInterval(v)},[r,n]),t.useEffect(()=>{L(p);const u=window.matchMedia("(prefers-color-scheme: dark)"),v=()=>{p==="auto"&&L("auto")};return u.addEventListener("change",v),()=>u.removeEventListener("change",v)},[p]);const N=t.useCallback(()=>{m(u=>P[(P.indexOf(u)+1)%P.length]??"auto")},[]),H=t.useCallback(async()=>{try{await a.signOut(),s("/")}catch{}},[a,s]),U=Xe[p];return e.jsx($,{children:e.jsxs("div",{className:"flex h-screen",children:[e.jsxs("nav",{"aria-label":"Main navigation",className:"flex flex-col h-full w-[var(--nav-w,240px)] bg-[var(--nav-bg)] flex-shrink-0 overflow-y-auto overflow-x-hidden",children:[e.jsx("div",{className:"px-6 py-[22px] border-b border-white/[0.08]",children:e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx("div",{className:"w-[30px] h-[30px] rounded-lg bg-white flex items-center justify-center text-[var(--nav-bg)] font-extrabold text-sm flex-shrink-0",children:"B"}),e.jsxs("div",{children:[e.jsx("div",{className:"font-bold text-[16px] text-white leading-tight",children:"Brilliant Jobs"}),e.jsxs("div",{className:"text-[11px] text-[var(--nav-text)]",children:["Dashboard ",e.jsx("span",{className:"text-[9px]",children:"v10.74"})]})]})]})}),e.jsxs("div",{className:"flex-1 px-3 py-4 space-y-0.5 overflow-y-auto",children:[(f?[{label:"ADMIN",items:Qe}]:Ze).map((u,v)=>e.jsxs("div",{children:[u.label&&e.jsx("div",{className:"px-3.5 pt-3 pb-1.5 mt-2 text-[10px] font-bold tracking-[1.5px] text-white/30 uppercase select-none",children:u.label}),u.items.map(h=>e.jsxs(S,{to:h.path,className:({isActive:_})=>`
                    flex items-center gap-3 py-2.5 rounded-lg transition-colors text-[13.5px] font-medium mb-0.5
                    ${_?"bg-[var(--nav-bg-active)] text-white":"text-[var(--nav-text)] hover:bg-[var(--nav-bg-active)]"}
                    ${h.indent?"pl-[34px] pr-3.5 text-[12px]":"px-3.5"}
                  `,children:[e.jsx(h.Icon,{className:"w-[18px] h-[18px] flex-shrink-0 opacity-80",strokeWidth:1.75}),e.jsx("span",{className:"flex-1",children:h.label}),h.badge&&(g[h.path]??0)>0&&e.jsx("span",{className:"text-[11px] font-semibold bg-white/15 text-white px-2 py-0.5 rounded-lg tabular-nums leading-none ml-auto",children:(g[h.path]??0)>999?"999+":g[h.path]}),h.dot&&e.jsx("span",{className:"w-2 h-2 rounded-full flex-shrink-0 ml-auto",style:{background:h.badge&&g[h.path]!==void 0?(g[h.path]??0)>0?"var(--green, #22c55e)":"#ef4444":h.dotColor||"var(--green, #22c55e)"}})]},h.path+h.label)),u.label==="INTELLIGENCE"&&!f&&e.jsxs("a",{href:"/blog",target:"_blank",rel:"noopener noreferrer",className:"flex items-center gap-3 px-3.5 py-2.5 rounded-lg transition-colors text-[13.5px] font-medium text-[var(--nav-text)] hover:bg-[var(--nav-bg-active)] mb-0.5",children:[e.jsx(ce,{className:"w-[18px] h-[18px] flex-shrink-0 opacity-80",strokeWidth:1.75}),e.jsx("span",{children:"Insights"}),e.jsx(ve,{className:"w-[10px] h-[10px] opacity-40 ml-0.5",strokeWidth:1.75})]})]},u.label||v)),w&&!f&&e.jsxs(S,{to:"/app/admin",className:"flex items-center gap-3 px-3.5 py-2.5 rounded-lg transition-colors text-[13.5px] font-medium text-[var(--nav-text)] hover:bg-[var(--nav-bg-active)] mb-0.5",children:[e.jsx(Ae,{className:"w-[18px] h-[18px] flex-shrink-0 opacity-80",strokeWidth:1.75}),e.jsx("span",{children:"Admin"})]})]}),e.jsxs("div",{className:"p-4 mt-auto border-t border-white/[0.08] space-y-2.5",children:[r&&e.jsxs("div",{className:"flex items-center gap-2.5 py-1",children:[e.jsx("div",{className:"w-8 h-8 rounded-full flex items-center justify-center text-white text-[13px] font-bold flex-shrink-0",style:{backgroundColor:tt(r.email)},children:at(r.email,r.display_name)}),e.jsxs("div",{className:"min-w-0",children:[e.jsx("div",{className:"text-[12px] text-white/70 truncate",children:r.email}),e.jsx("div",{className:"text-[10px] font-semibold tracking-wide uppercase",style:{color:r.role==="admin"?"#f97316":"rgba(255,255,255,0.4)"},children:r.role==="admin"?"ADMIN":r.tier.toUpperCase()})]})]}),e.jsxs("div",{className:"flex items-center gap-1.5 mx-3 my-2 px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] cursor-pointer hover:bg-[var(--bg-hover)] hover:border-[var(--border-hover)] transition-colors",onClick:()=>s("/app/billing"),title:"Credits",children:[e.jsx("span",{className:"text-[9px] font-bold text-white/40 bg-white/10 px-1 py-0.5 rounded tracking-wide leading-none",children:"CR"}),e.jsx("span",{className:`text-[13px] font-semibold tabular-nums ${b>0?"text-[var(--green)]":"text-white/70"}`,children:b}),e.jsx("span",{className:"text-[10px] text-white/40",children:"credits"})]}),e.jsx("div",{className:"flex items-center gap-2 mx-3",children:e.jsxs("button",{onClick:N,className:"flex items-center gap-1.5 px-2.5 py-2 rounded-lg hover:bg-white/10 transition-colors","aria-label":`Theme: ${p}`,title:`Theme: ${M[p]}`,children:[e.jsx(U,{className:"w-3.5 h-3.5 text-white/50",strokeWidth:1.75}),e.jsx("span",{className:"text-[10px] text-white/50",children:M[p]})]})}),e.jsx("button",{onClick:H,className:"w-full mt-2.5 py-[7px] rounded-lg text-[11px] font-medium text-white/50 hover:text-white/80 hover:border-white/30 transition-colors border border-white/[0.12]",children:"Log Out"}),e.jsxs("div",{className:"text-[10px] text-white/30 text-center",children:["© ",new Date().getFullYear()," Brilliant Jobs"]})]})]}),e.jsx("main",{id:"main-content",role:"main",className:"flex-1 overflow-y-auto bg-[var(--bg-main)] px-10 py-7",children:e.jsx(E,{})})]})})}function st(){const[a,n]=t.useState("loading");return t.useEffect(()=>{let s=!1;I.auth.getSession().then(({data:r})=>{s||n(r?.session?.user?"authenticated":"unauthenticated")}).catch(()=>{s||n("unauthenticated")});const{data:{subscription:c}}=I.auth.onAuthStateChange((r,o)=>{s||n(o?.user?"authenticated":"unauthenticated")});return()=>{s=!0,c.unsubscribe()}},[]),a==="loading"?e.jsx("div",{className:"flex items-center justify-center h-screen bg-bg-main",children:e.jsxs("div",{className:"flex flex-col items-center gap-3",children:[e.jsx("div",{className:"w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"}),e.jsx("p",{className:"text-sm text-text-dim",children:"Loading..."})]})}):a==="unauthenticated"?(window.location.href="/",null):e.jsx(E,{})}function rt(){const a=z(),[n,s]=t.useState("loading");return t.useEffect(()=>{let c=!1;return a.getCurrentUser().then(r=>{c||s(r?.role==="admin"?"admin":"denied")}).catch(()=>{c||s("denied")}),()=>{c=!0}},[a]),n==="loading"?e.jsx("div",{className:"flex items-center justify-center h-full",children:e.jsx("div",{className:"w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"})}):n==="denied"?e.jsx(k,{to:"/app/feed",replace:!0}):e.jsx(E,{})}const ot=t.lazy(()=>i(()=>import("./FeedPage-DfxeT1OK.js"),__vite__mapDeps([0,1,2,3,4,5]))),it=t.lazy(()=>i(()=>import("./GetStartedPage-CbB8AoZU.js"),__vite__mapDeps([6,1,3,4,5,2]))),lt=t.lazy(()=>i(()=>import("./PipelinePage-t1Vn7YOx.js"),__vite__mapDeps([7,1,2,3]))),ct=t.lazy(()=>i(()=>import("./KeywordsPage-CFfJQT9I.js"),__vite__mapDeps([8,1,2,3,5,4]))),dt=t.lazy(()=>i(()=>import("./ResumesPage-CCUat8va.js"),__vite__mapDeps([9,1,2,3,4,5]))),pt=t.lazy(()=>i(()=>import("./ApplicationsPage-FGMBeEFK.js"),__vite__mapDeps([10,1,2,3,5,4]))),ht=t.lazy(()=>i(()=>import("./StatsPage-B9CUV_bY.js"),__vite__mapDeps([11,1,2,3,5,4]))),ut=t.lazy(()=>i(()=>import("./TuningPage-DMLncNZs.js"),__vite__mapDeps([12,1,2,3,5,4]))),xt=t.lazy(()=>i(()=>import("./BillingPage-BKGqFvm8.js"),__vite__mapDeps([13,1,2,3,5,4]))),mt=t.lazy(()=>i(()=>import("./SettingsPage-DwpG0KrW.js"),__vite__mapDeps([14,1,2,3,5,4]))),gt=t.lazy(()=>i(()=>import("./IntegrationsPage-D_Ez5Qgm.js"),__vite__mapDeps([15,1,2,3]))),ft=t.lazy(()=>i(()=>import("./ChatPage-eisfu7k6.js"),__vite__mapDeps([16,1,2,3]))),bt=t.lazy(()=>i(()=>import("./ReferralsPage-BTO7PFu1.js"),__vite__mapDeps([17,1,2,3]))),yt=t.lazy(()=>i(()=>import("./InterviewPrepPage-BUSQf8Kp.js"),__vite__mapDeps([18,1,2,3,5,4]))),vt=t.lazy(()=>i(()=>import("./NotificationsPage-C54amsBX.js"),__vite__mapDeps([19,1,2,3,5,4]))),jt=t.lazy(()=>i(()=>import("./admin-pages-PfVa9pLg.js").then(a=>a.O),__vite__mapDeps([20,1,2,3]))),_t=t.lazy(()=>i(()=>import("./admin-pages-PfVa9pLg.js").then(a=>a.J),__vite__mapDeps([20,1,2,3]))),kt=t.lazy(()=>i(()=>import("./admin-pages-PfVa9pLg.js").then(a=>a.C),__vite__mapDeps([20,1,2,3]))),wt=t.lazy(()=>i(()=>import("./admin-pages-PfVa9pLg.js").then(a=>a.a),__vite__mapDeps([20,1,2,3]))),Nt=t.lazy(()=>i(()=>import("./admin-pages-PfVa9pLg.js").then(a=>a.S),__vite__mapDeps([20,1,2,3]))),Pt=t.lazy(()=>i(()=>import("./admin-pages-PfVa9pLg.js").then(a=>a.N),__vite__mapDeps([20,1,2,3]))),Et=t.lazy(()=>i(()=>import("./admin-pages-PfVa9pLg.js").then(a=>a.A),__vite__mapDeps([20,1,2,3]))),At=t.lazy(()=>i(()=>import("./admin-pages-PfVa9pLg.js").then(a=>a.M),__vite__mapDeps([20,1,2,3]))),St=t.lazy(()=>i(()=>import("./admin-pages-PfVa9pLg.js").then(a=>a.K),__vite__mapDeps([20,1,2,3]))),It=t.lazy(()=>i(()=>import("./admin-pages-PfVa9pLg.js").then(a=>a.b),__vite__mapDeps([20,1,2,3])));function l({label:a}){return e.jsxs("div",{className:"p-6 max-w-6xl mx-auto",children:[e.jsxs("div",{className:"space-y-2 mb-6",children:[e.jsx("div",{className:"animate-pulse rounded bg-gray-200/50 dark:bg-gray-700/30 h-7 w-48"}),e.jsx("div",{className:"animate-pulse rounded bg-gray-200/50 dark:bg-gray-700/30 h-4 w-72"})]}),e.jsx("div",{className:"grid grid-cols-2 md:grid-cols-4 gap-4 mb-6",children:[1,2,3,4].map(n=>e.jsxs("div",{className:"p-4 rounded-lg border border-gray-200/50 dark:border-gray-700/30",children:[e.jsx("div",{className:"animate-pulse rounded bg-gray-200/50 dark:bg-gray-700/30 h-3 w-16 mb-2"}),e.jsx("div",{className:"animate-pulse rounded bg-gray-200/50 dark:bg-gray-700/30 h-8 w-24"})]},n))}),e.jsx("div",{className:"space-y-3",children:[1,2,3].map(n=>e.jsxs("div",{className:"p-4 rounded-lg border border-gray-200/50 dark:border-gray-700/30",children:[e.jsx("div",{className:"animate-pulse rounded bg-gray-200/50 dark:bg-gray-700/30 h-4 w-3/4 mb-2"}),e.jsx("div",{className:"animate-pulse rounded bg-gray-200/50 dark:bg-gray-700/30 h-3 w-1/2"})]},n))}),e.jsxs("p",{className:"sr-only",children:["Loading ",a,"…"]})]})}function Ct(){return e.jsx(t.Suspense,{fallback:e.jsx(l,{label:"feed"}),children:e.jsx(ot,{})})}function Rt(){return e.jsx(t.Suspense,{fallback:e.jsx(l,{label:"get started"}),children:e.jsx(it,{})})}function Mt(){return e.jsx(t.Suspense,{fallback:e.jsx(l,{label:"pipeline"}),children:e.jsx(lt,{})})}function Lt(){return e.jsx(t.Suspense,{fallback:e.jsx(l,{label:"readiness"}),children:e.jsx(ct,{})})}function Ot(){return e.jsx(t.Suspense,{fallback:e.jsx(l,{label:"resumes"}),children:e.jsx(dt,{})})}function Tt(){return e.jsx(t.Suspense,{fallback:e.jsx(l,{label:"applications"}),children:e.jsx(pt,{})})}function zt(){return e.jsx(t.Suspense,{fallback:e.jsx(l,{label:"stats"}),children:e.jsx(ht,{})})}function $t(){return e.jsx(t.Suspense,{fallback:e.jsx(l,{label:"tuning"}),children:e.jsx(ut,{})})}function Vt(){return e.jsx(t.Suspense,{fallback:e.jsx(l,{label:"billing"}),children:e.jsx(xt,{})})}function Dt(){return e.jsx(t.Suspense,{fallback:e.jsx(l,{label:"settings"}),children:e.jsx(mt,{})})}function qt(){return e.jsx(t.Suspense,{fallback:e.jsx(l,{label:"integrations"}),children:e.jsx(gt,{})})}function Bt(){return e.jsx(t.Suspense,{fallback:e.jsx(l,{label:"chat"}),children:e.jsx(ft,{})})}function Ht(){return e.jsx(t.Suspense,{fallback:e.jsx(l,{label:"referrals"}),children:e.jsx(bt,{})})}function Ut(){return e.jsx(t.Suspense,{fallback:e.jsx(l,{label:"interview prep"}),children:e.jsx(yt,{})})}function Jt(){return e.jsx(t.Suspense,{fallback:e.jsx(l,{label:"notifications"}),children:e.jsx(vt,{})})}function Kt(){return e.jsx(t.Suspense,{fallback:e.jsx(l,{label:"overview"}),children:e.jsx(jt,{})})}function Wt(){return e.jsx(t.Suspense,{fallback:e.jsx(l,{label:"jobs"}),children:e.jsx(_t,{})})}function Gt(){return e.jsx(t.Suspense,{fallback:e.jsx(l,{label:"cron"}),children:e.jsx(kt,{})})}function Ft(){return e.jsx(t.Suspense,{fallback:e.jsx(l,{label:"content"}),children:e.jsx(wt,{})})}function Yt(){return e.jsx(t.Suspense,{fallback:e.jsx(l,{label:"seo"}),children:e.jsx(Nt,{})})}function Zt(){return e.jsx(t.Suspense,{fallback:e.jsx(l,{label:"notifications"}),children:e.jsx(Pt,{})})}function Qt(){return e.jsx(t.Suspense,{fallback:e.jsx(l,{label:"agents"}),children:e.jsx(Et,{})})}function Xt(){return e.jsx(t.Suspense,{fallback:e.jsx(l,{label:"monitoring"}),children:e.jsx(At,{})})}function ea(){return e.jsx(t.Suspense,{fallback:e.jsx(l,{label:"killswitch"}),children:e.jsx(St,{})})}function ta(){return e.jsx(t.Suspense,{fallback:e.jsx(l,{label:"compliance"}),children:e.jsx(It,{})})}const aa=[{path:"/app",element:e.jsx(st,{}),children:[{element:e.jsx(nt,{}),children:[{index:!0,element:e.jsx(k,{to:"get-started",replace:!0})},{path:"get-started",element:e.jsx(Rt,{})},{path:"feed",element:e.jsx(Ct,{})},{path:"pipeline",element:e.jsx(Mt,{})},{path:"keywords",element:e.jsx(Lt,{})},{path:"resumes",element:e.jsx(Ot,{})},{path:"applications",element:e.jsx(Tt,{})},{path:"stats",element:e.jsx(zt,{})},{path:"tuning",element:e.jsx($t,{})},{path:"billing",element:e.jsx(Vt,{})},{path:"settings",element:e.jsx(Dt,{})},{path:"integrations",element:e.jsx(qt,{})},{path:"chat",element:e.jsx(Bt,{})},{path:"referrals",element:e.jsx(Ht,{})},{path:"interview-prep",element:e.jsx(Ut,{})},{path:"notifications",element:e.jsx(Jt,{})},{path:"admin",element:e.jsx(rt,{}),children:[{index:!0,element:e.jsx(k,{to:"overview",replace:!0})},{path:"overview",element:e.jsx(Kt,{})},{path:"jobs",element:e.jsx(Wt,{})},{path:"cron",element:e.jsx(Gt,{})},{path:"content",element:e.jsx(Ft,{})},{path:"seo",element:e.jsx(Yt,{})},{path:"notifications",element:e.jsx(Zt,{})},{path:"agents",element:e.jsx(Qt,{})},{path:"monitoring",element:e.jsx(Xt,{})},{path:"killswitch",element:e.jsx(ea,{})},{path:"compliance",element:e.jsx(ta,{})}]},{path:"*",element:e.jsx(k,{to:"feed",replace:!0})}]}]}];function na(){return G(aa)}(function(){const n=window.location.hash?.replace("#",""),s=window.location.pathname;n&&(s==="/dashboard"||s==="/dashboard.html"||s==="/admin"||s==="/admin.html")&&["feed","pipeline","keywords","resumes","applications","stats","billing","settings","tuning","integrations","chat","referrals"].includes(n)&&window.history.replaceState(null,"",`/app/${n}`),(s==="/dashboard"||s==="/dashboard.html")&&!n&&window.history.replaceState(null,"","/app/feed"),(s==="/admin"||s==="/admin.html")&&!n&&window.history.replaceState(null,"","/app/admin/overview")})();const sa=na();function ra(){return e.jsx(t.StrictMode,{children:e.jsx(Z,{children:e.jsx($,{children:e.jsx(F,{router:sa})})})})}const T=document.getElementById("spa-root");T?J.createRoot(T).render(e.jsx(ra,{})):console.error("[SPA] #spa-root not found — React app cannot mount.");export{D as B,_e as F,Te as P,Ue as S,Ye as T,i as _,$e as a,d as c};
//# sourceMappingURL=app-BqrA9FmH.js.map
