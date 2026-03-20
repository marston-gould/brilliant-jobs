import{a as c,j as e}from"./react-vendor-DGWi3gCj.js";import{s as j}from"./providers-B8ZJcEn4.js";const A=c.createContext({toast:()=>{}});function Ke({children:o}){const[a,t]=c.useState([]),d=c.useCallback((h,x="info",m=3e3)=>{const y=crypto.randomUUID();t(p=>[...p,{id:y,text:h,type:x,duration:m}])},[]),i=c.useCallback(h=>{t(x=>x.filter(m=>m.id!==h))},[]);c.useEffect(()=>{if(a.length===0)return;const h=a[0];if(!h)return;const x=setTimeout(()=>i(h.id),h.duration||3e3);return()=>clearTimeout(x)},[a,i]),c.useEffect(()=>{window.__bjToast=d},[d]);const l={success:"bg-green text-white",error:"bg-red text-white",info:"bg-accent text-white"};return e.jsxs(A.Provider,{value:{toast:d},children:[o,e.jsx("div",{className:"fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none",style:{maxWidth:360},children:a.map(h=>e.jsx("div",{className:`pointer-events-auto px-4 py-2.5 rounded-lg shadow-lg text-[13px] font-medium animate-[slideIn_0.2s_ease] ${l[h.type]}`,onClick:()=>i(h.id),style:{cursor:"pointer"},children:h.text},h.id))})]})}/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const $=(...o)=>o.filter((a,t,d)=>!!a&&a.trim()!==""&&d.indexOf(a)===t).join(" ").trim();/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const H=o=>o.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase();/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const E=o=>o.replace(/^([A-Z])|[\s-_]+(\w)/g,(a,t,d)=>d?d.toUpperCase():t.toLowerCase());/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const C=o=>{const a=E(o);return a.charAt(0).toUpperCase()+a.slice(1)};/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var B={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const q=o=>{for(const a in o)if(a.startsWith("aria-")||a==="role"||a==="title")return!0;return!1};/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const V=c.forwardRef(({color:o="currentColor",size:a=24,strokeWidth:t=2,absoluteStrokeWidth:d,className:i="",children:l,iconNode:h,...x},m)=>c.createElement("svg",{ref:m,...B,width:a,height:a,stroke:o,strokeWidth:d?Number(t)*24/Number(a):t,className:$("lucide",i),...!l&&!q(x)&&{"aria-hidden":"true"},...x},[...h.map(([y,p])=>c.createElement(y,p)),...Array.isArray(l)?l:[l]]));/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const s=(o,a)=>{const t=c.forwardRef(({className:d,...i},l)=>c.createElement(V,{ref:l,iconNode:a,className:$(`lucide-${H(C(o))}`,`lucide-${o}`,d),...i}));return t.displayName=C(o),t};/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const D=[["path",{d:"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",key:"169zse"}]],We=s("activity",D);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const P=[["path",{d:"M10.268 21a2 2 0 0 0 3.464 0",key:"vwvbt9"}],["path",{d:"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326",key:"11g9vi"}]],Ge=s("bell",P);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const U=[["path",{d:"M10 2v8l3-3 3 3V2",key:"sqw3rj"}],["path",{d:"M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",key:"k3hazp"}]],Xe=s("book-marked",U);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const T=[["path",{d:"M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z",key:"oz39mx"}],["path",{d:"m9 10 2 2 4-4",key:"1gnqz4"}]],Ze=s("bookmark-check",T);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const R=[["path",{d:"M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z",key:"oz39mx"}]],Qe=s("bookmark",R);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const F=[["path",{d:"M12 8V4H8",key:"hb8ula"}],["rect",{width:"16",height:"12",x:"4",y:"8",rx:"2",key:"enze0r"}],["path",{d:"M2 14h2",key:"vft8re"}],["path",{d:"M20 14h2",key:"4cs60a"}],["path",{d:"M15 13v2",key:"1xurst"}],["path",{d:"M9 13v2",key:"rq6x2g"}]],Ye=s("bot",F);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const O=[["path",{d:"M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16",key:"jecpp"}],["rect",{width:"20",height:"14",x:"2",y:"6",rx:"2",key:"i6l2r4"}]],et=s("briefcase",O);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const I=[["path",{d:"M10 12h4",key:"a56b0p"}],["path",{d:"M10 8h4",key:"1sr2af"}],["path",{d:"M14 21v-3a2 2 0 0 0-4 0v3",key:"1rgiei"}],["path",{d:"M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2",key:"secmi2"}],["path",{d:"M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16",key:"16ra0t"}]],tt=s("building-2",I);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const J=[["path",{d:"M3 3v16a2 2 0 0 0 2 2h16",key:"c24i48"}],["path",{d:"M18 17V9",key:"2bz60n"}],["path",{d:"M13 17V5",key:"1frdt8"}],["path",{d:"M8 17v-3",key:"17ska0"}]],at=s("chart-column",J);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const K=[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]],st=s("check",K);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const W=[["path",{d:"m6 9 6 6 6-6",key:"qrunsl"}]],ot=s("chevron-down",W);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const G=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M8 12h8",key:"1wcyev"}],["path",{d:"M12 8v8",key:"napkw2"}]],rt=s("circle-plus",G);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const X=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"m15 9-6 6",key:"1uzhvr"}],["path",{d:"m9 9 6 6",key:"z0biqf"}]],nt=s("circle-x",X);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Z=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M12 6v6l4 2",key:"mmk7yg"}]],ct=s("clock",Z);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Q=[["rect",{width:"20",height:"14",x:"2",y:"5",rx:"2",key:"ynyp8z"}],["line",{x1:"2",x2:"22",y1:"10",y2:"10",key:"1b3vmo"}]],it=s("credit-card",Q);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Y=[["path",{d:"M15 3h6v6",key:"1q9fwt"}],["path",{d:"M10 14 21 3",key:"gplh6r"}],["path",{d:"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",key:"a6xqqp"}]],lt=s("external-link",Y);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ee=[["path",{d:"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",key:"1oefj6"}],["path",{d:"M14 2v5a1 1 0 0 0 1 1h5",key:"wfsgrz"}],["path",{d:"M10 9H8",key:"b1mrlr"}],["path",{d:"M16 13H8",key:"t4e002"}],["path",{d:"M16 17H8",key:"z1uh3a"}]],dt=s("file-text",ee);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const te=[["path",{d:"M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z",key:"sc7q7i"}]],pt=s("funnel",te);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ae=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20",key:"13o1zl"}],["path",{d:"M2 12h20",key:"9i4pu4"}]],ht=s("globe",ae);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const se=[["path",{d:"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z",key:"j76jl0"}],["path",{d:"M22 10v6",key:"1lu8f3"}],["path",{d:"M6 12.5V16a6 3 0 0 0 12 0v-3.5",key:"1r8lef"}]],ut=s("graduation-cap",se);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const oe=[["line",{x1:"4",x2:"20",y1:"9",y2:"9",key:"4lhtct"}],["line",{x1:"4",x2:"20",y1:"15",y2:"15",key:"vyu0kd"}],["line",{x1:"10",x2:"8",y1:"3",y2:"21",key:"1ggp8o"}],["line",{x1:"16",x2:"14",y1:"3",y2:"21",key:"weycgp"}]],xt=s("hash",oe);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const re=[["path",{d:"M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z",key:"1s6t7t"}],["circle",{cx:"16.5",cy:"7.5",r:".5",fill:"currentColor",key:"w0ekpg"}]],mt=s("key-round",re);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ne=[["rect",{width:"7",height:"7",x:"3",y:"3",rx:"1",key:"1g98yp"}],["rect",{width:"7",height:"7",x:"14",y:"3",rx:"1",key:"6d4xhi"}],["rect",{width:"7",height:"7",x:"14",y:"14",rx:"1",key:"nxv5o0"}],["rect",{width:"7",height:"7",x:"3",y:"14",rx:"1",key:"1bb6yr"}]],yt=s("layout-grid",ne);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ce=[["rect",{width:"7",height:"9",x:"3",y:"3",rx:"1",key:"10lvy0"}],["rect",{width:"7",height:"5",x:"14",y:"3",rx:"1",key:"16une8"}],["rect",{width:"7",height:"9",x:"14",y:"12",rx:"1",key:"1hutg5"}],["rect",{width:"7",height:"5",x:"3",y:"16",rx:"1",key:"ldoo1y"}]],bt=s("layout-dashboard",ce);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ie=[["path",{d:"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",key:"1cjeqo"}],["path",{d:"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",key:"19qd67"}]],ft=s("link",ie);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const le=[["path",{d:"M21 12a9 9 0 1 1-6.219-8.56",key:"13zald"}]],gt=s("loader-circle",le);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const de=[["rect",{width:"18",height:"11",x:"3",y:"11",rx:"2",ry:"2",key:"1w4ew1"}],["path",{d:"M7 11V7a5 5 0 0 1 10 0v4",key:"fwvmzm"}]],kt=s("lock",de);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const pe=[["path",{d:"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",key:"1r0f0z"}],["circle",{cx:"12",cy:"10",r:"3",key:"ilqhr7"}]],vt=s("map-pin",pe);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const he=[["path",{d:"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",key:"18887p"}]],wt=s("message-square",he);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ue=[["rect",{width:"20",height:"14",x:"2",y:"3",rx:"2",key:"48i651"}],["line",{x1:"8",x2:"16",y1:"21",y2:"21",key:"1svkeh"}],["line",{x1:"12",x2:"12",y1:"17",y2:"21",key:"vw1qmm"}]],_t=s("monitor",ue);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const xe=[["path",{d:"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401",key:"kfwtm"}]],Nt=s("moon",xe);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const me=[["path",{d:"m15 9-6 6",key:"1uzhvr"}],["path",{d:"M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z",key:"2d38gg"}],["path",{d:"m9 9 6 6",key:"z0biqf"}]],Mt=s("octagon-x",me);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ye=[["path",{d:"M13 21h8",key:"1jsn5i"}],["path",{d:"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",key:"1a8usu"}]],jt=s("pen-line",ye);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const be=[["path",{d:"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z",key:"10ikf1"}]],Ct=s("play",be);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const fe=[["path",{d:"m21 21-4.34-4.34",key:"14j7rj"}],["circle",{cx:"11",cy:"11",r:"8",key:"4ej97u"}]],$t=s("search",fe);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ge=[["path",{d:"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z",key:"1ffxy3"}],["path",{d:"m21.854 2.147-10.94 10.939",key:"12cjpa"}]],St=s("send",ge);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ke=[["path",{d:"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",key:"1i5ecw"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]],zt=s("settings",ke);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ve=[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]],Lt=s("shield-check",ve);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const we=[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}]],At=s("shield",we);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const _e=[["path",{d:"M10 5H3",key:"1qgfaw"}],["path",{d:"M12 19H3",key:"yhmn1j"}],["path",{d:"M14 3v4",key:"1sua03"}],["path",{d:"M16 17v4",key:"1q0r14"}],["path",{d:"M21 12h-9",key:"1o4lsq"}],["path",{d:"M21 19h-5",key:"1rlt1p"}],["path",{d:"M21 5h-7",key:"1oszz2"}],["path",{d:"M8 10v4",key:"tgpxqk"}],["path",{d:"M8 12H3",key:"a7s4jb"}]],Ht=s("sliders-horizontal",_e);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ne=[["rect",{width:"14",height:"20",x:"5",y:"2",rx:"2",ry:"2",key:"1yt0o3"}],["path",{d:"M12 18h.01",key:"mhygvu"}]],Et=s("smartphone",Ne);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Me=[["path",{d:"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z",key:"1s2grr"}],["path",{d:"M20 2v4",key:"1rf3ol"}],["path",{d:"M22 4h-4",key:"gwowj6"}],["circle",{cx:"4",cy:"20",r:"2",key:"6kqj1y"}]],Bt=s("sparkles",Me);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const je=[["path",{d:"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",key:"r04s7s"}]],qt=s("star",je);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ce=[["circle",{cx:"12",cy:"12",r:"4",key:"4exip2"}],["path",{d:"M12 2v2",key:"tus03m"}],["path",{d:"M12 20v2",key:"1lh1kg"}],["path",{d:"m4.93 4.93 1.41 1.41",key:"149t6j"}],["path",{d:"m17.66 17.66 1.41 1.41",key:"ptbguv"}],["path",{d:"M2 12h2",key:"1t8f8n"}],["path",{d:"M20 12h2",key:"1q8mjw"}],["path",{d:"m6.34 17.66-1.41 1.41",key:"1m8zz5"}],["path",{d:"m19.07 4.93-1.41 1.41",key:"1shlcs"}]],Vt=s("sun",Ce);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const $e=[["path",{d:"M10 11v6",key:"nco0om"}],["path",{d:"M14 11v6",key:"outv1u"}],["path",{d:"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",key:"miytrc"}],["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",key:"e791ji"}]],Dt=s("trash-2",$e);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Se=[["path",{d:"M16 7h6v6",key:"box55l"}],["path",{d:"m22 7-8.5 8.5-5-5L2 17",key:"1t1m79"}]],Pt=s("trending-up",Se);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ze=[["path",{d:"M12 3v12",key:"1x0j5s"}],["path",{d:"m17 8-5-5-5 5",key:"7q97r8"}],["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",key:"ih7n3h"}]],Ut=s("upload",ze);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Le=[["path",{d:"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2",key:"975kel"}],["circle",{cx:"12",cy:"7",r:"4",key:"17ys0d"}]],Tt=s("user",Le);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ae=[["path",{d:"M18 6 6 18",key:"1bl5f8"}],["path",{d:"m6 6 12 12",key:"d8bk6v"}]],He=s("x",Ae),Ee={primary:"bg-accent text-white border-accent hover:opacity-90 active:opacity-80",secondary:"bg-bg-card text-text border-border hover:border-border-hover hover:text-text active:bg-bg-hover",ghost:"bg-transparent text-text-dim border-transparent hover:bg-bg-hover hover:text-text active:bg-bg-input",danger:"bg-red text-white border-red hover:opacity-90 active:opacity-80"},Be={sm:"px-3.5 py-[7px] text-xs rounded-md gap-1.5",md:"px-5 py-2.5 text-[13px] rounded-lg gap-2 font-semibold",lg:"px-8 py-3.5 text-[15px] rounded-lg gap-2 font-semibold"};function Rt({variant:o="secondary",size:a="md",loading:t=!1,icon:d,fullWidth:i=!1,disabled:l,className:h="",children:x,...m}){const y="inline-flex items-center justify-center border font-medium transition-all cursor-pointer select-none",p=l||t?"opacity-50 cursor-not-allowed":"",b=i?"w-full":"";return e.jsxs("button",{className:`${y} ${Ee[o]} ${Be[a]} ${p} ${b} ${h}`,disabled:l||t,...m,children:[t?e.jsx("span",{className:"inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"}):d?e.jsx("span",{className:"flex-shrink-0",children:d}):null,x]})}const qe={default:"bg-bg-card border border-border",elevated:"bg-bg-card border border-border shadow-md",outline:"bg-transparent border border-border",inset:"bg-bg-input border border-border"},Ve={none:"",sm:"p-3",md:"p-6",lg:"p-6"};function Ft({variant:o="default",padding:a="md",as:t="div",className:d="",children:i,...l}){return e.jsx(t,{className:`rounded-xl ${qe[o]} ${Ve[a]} ${d}`,...l,children:i})}const De={default:"bg-bg-input text-text-dim border-border",secondary:"bg-bg-card text-text-muted border-border/50",success:"bg-green-dim text-green border-green/20",warning:"bg-warm-dim text-warm border-warm/20",error:"bg-red-dim text-red border-red/20",info:"bg-accent-dim text-accent border-accent/20",purple:"bg-purple-dim text-purple border-purple/20"},Pe={sm:"px-2.5 py-[3px] text-[11px]",md:"px-2 py-0.5 text-xs"};function Ot({variant:o="default",size:a="md",dot:t=!1,className:d="",children:i,...l}){return e.jsxs("span",{className:`inline-flex items-center gap-1 font-semibold rounded-lg border ${De[o]} ${Pe[a]} ${d}`,...l,children:[t&&e.jsx("span",{className:"w-1.5 h-1.5 rounded-full bg-current flex-shrink-0"}),i]})}const Ue={sm:"max-w-sm",md:"max-w-md",lg:"max-w-lg",xl:"max-w-2xl"};function S({open:o,onClose:a,title:t,size:d="md",children:i,footer:l}){const h=c.useRef(null),x=c.useRef(null);c.useEffect(()=>{o?(x.current=document.activeElement,h.current?.focus()):x.current?.focus()},[o]);const m=c.useCallback(p=>{p.key==="Escape"&&(p.stopPropagation(),a())},[a]),y=c.useCallback(p=>{p.target===p.currentTarget&&a()},[a]);return o?e.jsxs("div",{className:"fixed inset-0 z-40 flex items-center justify-center p-4 animate-modal-fade",role:"presentation",onClick:y,children:[e.jsx("div",{className:"absolute inset-0 bg-black/50","aria-hidden":"true",onClick:a}),e.jsxs("dialog",{ref:h,open:!0,className:`
          relative z-50 w-full ${Ue[d]}
          bg-bg-card border border-border rounded-lg
          shadow-xl
          animate-modal-slide
          max-h-[85vh] overflow-hidden flex flex-col
        `,role:"dialog","aria-modal":"true","aria-labelledby":t?"modal-title":void 0,onKeyDown:m,tabIndex:-1,children:[t&&e.jsxs("div",{className:"flex items-center justify-between px-5 py-4 border-b border-border",children:[e.jsx("h2",{id:"modal-title",className:"text-lg font-semibold text-text",children:t}),e.jsx("button",{onClick:a,className:"text-text-faint hover:text-text p-1 rounded-md hover:bg-bg-hover transition-all","aria-label":"Close dialog",children:e.jsx("svg",{width:"16",height:"16",viewBox:"0 0 16 16",fill:"none",stroke:"currentColor",strokeWidth:"2","aria-hidden":"true",children:e.jsx("path",{d:"M4 4l8 8M12 4l-8 8"})})})]}),e.jsx("div",{className:"flex-1 overflow-y-auto px-5 py-4",children:i}),l&&e.jsx("div",{className:"flex items-center justify-end gap-2 px-5 py-3 border-t border-border",children:l})]})]}):null}const Te={feed:{title:"Jobs Feed",steps:["Check one or more saved searches in the sidebar to search jobs.","Shift+click column headers for multi-column sorting.","Click a job title to open the full description and apply.","Colored number badges show which filter matched each job.","Use the keyword insights panel to see term frequency and resume match scores."]},tuning:{title:"Search Tuning",steps:["Set global rules that apply across ALL your saved searches.","Location rules: US-only toggle and city/country exclusions.",'Title exclusions: remove common false positives (e.g. "intern").',"Company exclusions: block specific employers or industries.","Level hierarchy: define seniority levels and their keywords for automatic job ranking."]},pipeline:{title:"Pipeline",steps:["Track every job from saved through offer/rejection.","Click stage headers to collapse/expand sections.","Use the Move dropdown on any row to advance jobs through stages.","Stats at top show response rates and days-to-response.","Filter by saved search using the dropdown above the stages."]},resumes:{title:"Resumes",steps:["Upload a resume for each role type or seniority level you target.","Assign a level (Director, Manager, etc.) to each resume.","Click filter pills on each card to assign resumes to your saved searches.","When you apply, the matching resume is automatically selected.","Keyword extraction shows how well each resume matches job descriptions."]},applications:{title:"Applications",steps:["Queue tab: manage pending applications (manual add, batch process).","Rules tab: set default application mode (Manual, Notify, Auto) and auto-apply rules.","Notifications tab: configure email/SMS preferences for every alert type.","Verify your phone to unlock SMS notifications and escalation.","Set escalation rules: unanswered emails auto-escalate to SMS after your timeout.","Override notification settings per saved search for targeted control.","History tab: full audit trail of applications and notification delivery log."]},stats:{title:"Stats",steps:["View aggregated analytics across all your job search activity.","Track application volume, response rates, and pipeline velocity.","Compare performance across different filters and resume versions."]},"get-started":{title:"Setup",steps:["Connect the Chrome extension to scan your LinkedIn network.","Your connections are matched against our job database.","Jobs where you have an inside contact are flagged for priority."]},settings:{title:"Settings",steps:["Manage your account, notification preferences, and data.","Export or delete your data at any time."]},subscription:{title:"Subscription",steps:["View your current plan and usage.","Upgrade to Pro for auto-apply, advanced analytics, and more."]},notifications:{title:"Notification Center",steps:["Preferences tab: toggle email and SMS per notification type.","Verify your phone number to enable SMS alerts.","Log tab: view delivery history for all notifications."]},"interview-prep":{title:"Interview Prep",steps:["Browse the question bank by category.","Practice mode lets you record and review your answers.","AI scoring gives feedback on structure and content."]}};function Re({helpId:o,onClose:a}){const t=c.useRef(null);if(c.useEffect(()=>{if(!o)return;function i(h){t.current&&!t.current.contains(h.target)&&a()}const l=setTimeout(()=>document.addEventListener("click",i),50);return()=>{clearTimeout(l),document.removeEventListener("click",i)}},[o,a]),c.useEffect(()=>{if(!o)return;function i(l){l.key==="Escape"&&a()}return document.addEventListener("keydown",i),()=>document.removeEventListener("keydown",i)},[o,a]),!o)return null;const d=Te[o];return d?e.jsxs("div",{ref:t,className:"fixed z-[9998] overflow-y-auto",style:{bottom:80,right:24,width:340,maxHeight:"60vh",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:12,boxShadow:"0 8px 32px rgba(0,0,0,0.25)",padding:20},children:[e.jsxs("div",{className:"flex justify-between items-center mb-3",children:[e.jsx("div",{className:"text-[14px] font-bold text-text",children:d.title}),e.jsx("button",{onClick:a,className:"text-text-faint hover:text-text transition-colors p-0.5","aria-label":"Close help panel",children:e.jsx(He,{className:"w-4 h-4",strokeWidth:1.75})})]}),e.jsx("div",{className:"space-y-2.5",children:d.steps.map((i,l)=>e.jsxs("div",{className:"flex gap-2.5 items-start",children:[e.jsx("span",{className:"w-5 h-5 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0",children:l+1}),e.jsx("span",{className:"text-[12px] text-text-dim leading-[1.7]",children:i})]},l))})]}):null}function It({title:o,subtitle:a,helpLink:t,children:d}){const[i,l]=c.useState(!1),h=c.useCallback(()=>{l(m=>!m)},[]),x=c.useCallback(()=>{l(!1)},[]);return e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"sticky top-0 z-10 border-b border-border -mx-10 mb-5",style:{padding:"28px 40px 20px",background:"var(--bg-white, var(--bg-main))"},children:[e.jsx("h2",{className:"font-bold text-text",style:{fontSize:"clamp(18px, 1.8vw + 0.5rem, 22px)",marginBottom:"2px"},children:o}),a&&e.jsxs("p",{className:"text-[13px] text-text-dim",children:[a,t&&e.jsxs(e.Fragment,{children:[" ",e.jsx("button",{type:"button",onClick:h,className:"text-accent hover:underline page-how-link",children:"How this works →"})]})]}),d]}),e.jsx(Re,{helpId:i&&t||null,onClose:x})]})}function Jt({jobId:o,onClose:a}){const[t,d]=c.useState(null),[i,l]=c.useState(!1),[h,x]=c.useState(null),m=c.useCallback(async p=>{l(!0),x(null);try{const{data:b,error:f}=await j.from("ats_jobs").select("greenhouse_id, title, company_name, location, salary_min, salary_max, salary_currency, salary_rate, ats_source, url, content, created_at, updated_at").eq("greenhouse_id",p).single();if(f)throw f;d(b)}catch(b){x(b?.message||"Failed to load job")}finally{l(!1)}},[]);c.useEffect(()=>{o?m(o):d(null)},[o,m]);const y=p=>{if(!p.salary_min&&!p.salary_max)return null;const b=p.salary_currency||"USD",f=_=>new Intl.NumberFormat("en-US",{style:"currency",currency:b,maximumFractionDigits:0}).format(_);return p.salary_min&&p.salary_max?`${f(p.salary_min)} – ${f(p.salary_max)}${p.salary_rate?` / ${p.salary_rate}`:""}`:p.salary_min?`${f(p.salary_min)}+${p.salary_rate?` / ${p.salary_rate}`:""}`:p.salary_max?`Up to ${f(p.salary_max)}${p.salary_rate?` / ${p.salary_rate}`:""}`:null};return e.jsxs(S,{open:!!o,onClose:a,title:t?.title||"Job Details",size:"xl",footer:t?.url?e.jsx("a",{href:t.url,target:"_blank",rel:"noopener noreferrer",className:"px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:opacity-90",children:"View on Career Page"}):void 0,children:[i&&e.jsx("div",{className:"flex items-center justify-center py-12",children:e.jsx("div",{className:"w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"})}),h&&e.jsx("div",{className:"text-red-500 text-sm py-4",children:h}),t&&!i&&e.jsxs("div",{className:"space-y-4",children:[e.jsxs("div",{className:"flex flex-wrap gap-2 text-sm text-text-dim",children:[t.company_name&&e.jsx("span",{className:"font-medium text-text",children:t.company_name}),t.location&&e.jsxs("span",{children:["· ",t.location]})]}),y(t)&&e.jsx("div",{className:"text-sm font-medium text-accent",children:y(t)}),e.jsxs("div",{className:"flex gap-4 text-xs text-text-faint",children:[t.created_at&&e.jsxs("span",{children:["Posted: ",new Date(t.created_at).toLocaleDateString()]}),t.updated_at&&e.jsxs("span",{children:["Updated: ",new Date(t.updated_at).toLocaleDateString()]})]}),t.content&&e.jsxs("div",{className:"border-t border-border pt-4",children:[e.jsx("h3",{className:"text-sm font-semibold text-text mb-2",children:"Job Description"}),e.jsx("div",{className:"text-sm text-text-dim leading-relaxed prose prose-sm max-w-none",dangerouslySetInnerHTML:{__html:t.content}})]})]})]})}const Fe={company:"Browse Companies",title:"Browse Job Titles",skills:"Browse Skills",dept:"Browse Departments",level:"Browse Levels",location:"Browse Locations"},Oe={company:"company_name",title:"title",skills:"department",dept:"department",level:"level",location:"location"};function Kt({open:o,onClose:a,onSelect:t,dimension:d="company"}){const[i,l]=c.useState([]),[h,x]=c.useState(""),[m,y]=c.useState("all"),[p,b]=c.useState(!1),[f,_]=c.useState("");c.useEffect(()=>{if(!o)return;b(!0);const r=Oe[d]||"company_name";(async()=>{try{if(d==="company"){const{data:u}=await j.rpc("get_company_list");if(u?.length){l(u.map(n=>({name:n.company_name,jobCount:n.job_count||0,status:"neutral"}))),b(!1);return}}}catch{}try{const{data:u}=await j.from("ats_jobs").select(r).limit(1e3);if(u?.length){const n={};u.forEach(w=>{const g=w[r];g&&(n[g]=(n[g]||0)+1)}),l(Object.entries(n).map(([w,g])=>({name:w,jobCount:g,status:"neutral"})).sort((w,g)=>w.name.localeCompare(g.name)))}}catch{}b(!1)})()},[o]);const z=c.useCallback(r=>{l(u=>u.map(n=>n.name===r?{...n,status:n.status==="neutral"?"included":n.status==="included"?"excluded":"neutral"}:n))},[]),N=c.useMemo(()=>{let r=i;return h&&(r=r.filter(u=>u.name.toLowerCase().includes(h.toLowerCase()))),m==="included"&&(r=r.filter(u=>u.status==="included")),m==="excluded"&&(r=r.filter(u=>u.status==="excluded")),r},[i,h,m]),M=c.useMemo(()=>{const r={};return N.forEach(u=>{const n=(u.name[0]||"#").toUpperCase();r[n]||(r[n]=[]),r[n].push(u)}),r},[N]),L=c.useMemo(()=>{const r="ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),u=new Set(Object.keys(M));return r.map(n=>({letter:n,has:u.has(n)}))},[M]),k=i.filter(r=>r.status==="included").length,v=i.filter(r=>r.status==="excluded").length;return o?e.jsx(S,{open:o,onClose:a,title:Fe[d]||"Browse",size:"lg",children:e.jsxs("div",{className:"w-[90vw] max-w-[600px] max-h-[80vh] flex flex-col",children:[e.jsxs("div",{className:"px-5 py-4 border-b border-border flex-shrink-0",children:[e.jsx("div",{className:"text-[15px] font-bold text-text mb-3",children:"Browse Companies"}),e.jsxs("div",{className:"flex items-center gap-2 flex-wrap",children:[e.jsx("input",{type:"text",value:h,onChange:r=>x(r.target.value),placeholder:"Search companies…",className:"flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-border bg-bg-input text-[13px] text-text focus:border-accent focus:outline-none"}),e.jsx("div",{className:"flex gap-0 rounded-lg overflow-hidden border border-border",children:["all","included","excluded"].map(r=>e.jsx("button",{onClick:()=>y(r),className:`px-3 py-1.5 text-[12px] font-semibold transition-all ${m===r?"bg-accent text-white":"bg-bg-input text-text-dim"}`,children:r==="all"?"All":r==="included"?`✓ (${k})`:`✕ (${v})`},r))})]})]}),e.jsx("div",{className:"flex flex-wrap gap-[3px] px-5 py-2 border-b border-border flex-shrink-0",children:L.map(({letter:r,has:u})=>e.jsx("button",{onClick:()=>{u&&(_(r),document.getElementById(`cb-${r}`)?.scrollIntoView({behavior:"smooth",block:"start"}))},className:`text-[11px] font-bold px-1.5 py-0.5 rounded transition-all ${u?f===r?"bg-accent text-white":"text-accent hover:bg-accent/10 cursor-pointer":"text-text-faint opacity-35"}`,children:r},r))}),e.jsx("div",{className:"flex-1 overflow-y-auto px-5 py-2",style:{maxHeight:"55vh"},children:p?e.jsx("div",{className:"text-center py-12 text-text-faint text-[13px]",children:"Loading companies…"}):N.length===0?e.jsx("div",{className:"text-center py-12 text-text-faint text-[13px]",children:"No companies found"}):Object.entries(M).sort(([r],[u])=>r.localeCompare(u)).map(([r,u])=>e.jsxs("div",{className:"mb-5",id:`cb-${r}`,children:[e.jsx("div",{className:"text-[18px] font-bold text-accent py-1 pb-1.5 border-b border-border mb-2 sticky top-0 bg-bg-card z-[2]",children:r}),u.map(n=>e.jsxs("div",{className:"flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg cursor-pointer text-[13px] hover:bg-bg-hover transition-colors",onClick:()=>z(n.name),children:[e.jsx("div",{className:`w-[22px] h-[22px] rounded flex items-center justify-center flex-shrink-0 text-[12px] border-[1.5px] transition-all ${n.status==="included"?"bg-green border-green text-white":n.status==="excluded"?"bg-red border-red text-white":"border-border"}`,children:n.status==="included"?"✓":n.status==="excluded"?"✕":""}),e.jsx("span",{className:"flex-1 font-medium text-text",children:n.name}),e.jsxs("span",{className:"text-[11px] text-text-faint whitespace-nowrap",children:[n.jobCount," job",n.jobCount!==1?"s":""]})]},n.name))]},r))}),(k>0||v>0)&&e.jsxs("div",{className:"px-5 py-3 border-t border-border flex items-center gap-2 flex-shrink-0",children:[e.jsxs("span",{className:"text-[12px] font-semibold text-text-dim",children:[k>0&&e.jsxs("span",{className:"text-green",children:[k," included"]}),k>0&&v>0&&" · ",v>0&&e.jsxs("span",{className:"text-red",children:[v," excluded"]})]}),e.jsx("button",{onClick:()=>{const r=i.filter(n=>n.status==="included").map(n=>n.name),u=i.filter(n=>n.status==="excluded").map(n=>n.name);r.length&&t?.(r,"include"),u.length&&t?.(u,"exclude"),a()},className:"ml-auto px-4 py-2 rounded-lg bg-accent text-white text-[12px] font-semibold",children:"Apply Selections"})]})]})}):null}export{Qe as $,We as A,et as B,Ft as C,At as D,lt as E,dt as F,ut as G,Et as H,pt as I,Jt as J,yt as K,bt as L,_t as M,Ot as N,Mt as O,jt as P,vt as Q,tt as R,$t as S,Ke as T,Ut as U,ht as V,xt as W,He as X,mt as Y,ot as Z,nt as _,ct as a,Ze as a0,Ct as a1,Ge as b,Ye as c,Pt as d,Lt as e,qt as f,Ht as g,at as h,zt as i,it as j,Xe as k,kt as l,Nt as m,Vt as n,wt as o,Rt as p,Dt as q,gt as r,St as s,It as t,Bt as u,Kt as v,st as w,rt as x,ft as y,Tt as z};
//# sourceMappingURL=design-system-Bcud1gCF.js.map
