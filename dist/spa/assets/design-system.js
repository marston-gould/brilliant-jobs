import{a as i,j as e}from"./react-vendor.js";import{s as C}from"./providers.js";const B=i.createContext({toast:()=>{}});function it({children:n}){const[s,a]=i.useState([]),c=i.useCallback((h,y="info",x=3e3)=>{const m=crypto.randomUUID();a(l=>[...l,{id:m,text:h,type:y,duration:x}])},[]),p=i.useCallback(h=>{a(y=>y.filter(x=>x.id!==h))},[]);i.useEffect(()=>{if(s.length===0)return;const h=s[0];if(!h)return;const y=setTimeout(()=>p(h.id),h.duration||3e3);return()=>clearTimeout(y)},[s,p]),i.useEffect(()=>{window.__bjToast=c},[c]);const r={success:"bg-green text-white",error:"bg-red text-white",info:"bg-accent text-white"};return e.jsxs(B.Provider,{value:{toast:c},children:[n,e.jsx("div",{className:"fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none",style:{maxWidth:360},children:s.map(h=>e.jsx("div",{className:`pointer-events-auto px-4 py-2.5 rounded-lg shadow-lg text-[13px] font-medium animate-[slideIn_0.2s_ease] ${r[h.type]}`,onClick:()=>p(h.id),style:{cursor:"pointer"},children:h.text},h.id))})]})}/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const A=(...n)=>n.filter((s,a,c)=>!!s&&s.trim()!==""&&c.indexOf(s)===a).join(" ").trim();/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const D=n=>n.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase();/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const P=n=>n.replace(/^([A-Z])|[\s-_]+(\w)/g,(s,a,c)=>c?c.toUpperCase():a.toLowerCase());/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const z=n=>{const s=P(n);return s.charAt(0).toUpperCase()+s.slice(1)};/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var U={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const T=n=>{for(const s in n)if(s.startsWith("aria-")||s==="role"||s==="title")return!0;return!1};/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const R=i.forwardRef(({color:n="currentColor",size:s=24,strokeWidth:a=2,absoluteStrokeWidth:c,className:p="",children:r,iconNode:h,...y},x)=>i.createElement("svg",{ref:x,...U,width:s,height:s,stroke:n,strokeWidth:c?Number(a)*24/Number(s):a,className:A("lucide",p),...!r&&!T(y)&&{"aria-hidden":"true"},...y},[...h.map(([m,l])=>i.createElement(m,l)),...Array.isArray(r)?r:[r]]));/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const t=(n,s)=>{const a=i.forwardRef(({className:c,...p},r)=>i.createElement(R,{ref:r,iconNode:s,className:A(`lucide-${D(z(n))}`,`lucide-${n}`,c),...p}));return a.displayName=z(n),a};/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const F=[["path",{d:"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",key:"169zse"}]],lt=t("activity",F);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const J=[["path",{d:"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z",key:"3c2336"}],["line",{x1:"15",x2:"9",y1:"9",y2:"15",key:"f7djnv"}],["line",{x1:"9",x2:"15",y1:"9",y2:"15",key:"1shsy8"}]],dt=t("badge-x",J);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const O=[["path",{d:"M10.268 21a2 2 0 0 0 3.464 0",key:"vwvbt9"}],["path",{d:"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326",key:"11g9vi"}]],pt=t("bell",O);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const I=[["path",{d:"M10 2v8l3-3 3 3V2",key:"sqw3rj"}],["path",{d:"M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",key:"k3hazp"}]],ht=t("book-marked",I);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const K=[["path",{d:"M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z",key:"oz39mx"}],["path",{d:"m9 10 2 2 4-4",key:"1gnqz4"}]],yt=t("bookmark-check",K);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const W=[["path",{d:"M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z",key:"oz39mx"}]],ut=t("bookmark",W);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Z=[["path",{d:"M12 8V4H8",key:"hb8ula"}],["rect",{width:"16",height:"12",x:"4",y:"8",rx:"2",key:"enze0r"}],["path",{d:"M2 14h2",key:"vft8re"}],["path",{d:"M20 14h2",key:"4cs60a"}],["path",{d:"M15 13v2",key:"1xurst"}],["path",{d:"M9 13v2",key:"rq6x2g"}]],xt=t("bot",Z);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const G=[["path",{d:"M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16",key:"jecpp"}],["rect",{width:"20",height:"14",x:"2",y:"6",rx:"2",key:"i6l2r4"}]],mt=t("briefcase",G);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const X=[["path",{d:"M12 20v-9",key:"1qisl0"}],["path",{d:"M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z",key:"uouzyp"}],["path",{d:"M14.12 3.88 16 2",key:"qol33r"}],["path",{d:"M21 21a4 4 0 0 0-3.81-4",key:"1b0z45"}],["path",{d:"M21 5a4 4 0 0 1-3.55 3.97",key:"5cxbf6"}],["path",{d:"M22 13h-4",key:"1jl80f"}],["path",{d:"M3 21a4 4 0 0 1 3.81-4",key:"1fjd4g"}],["path",{d:"M3 5a4 4 0 0 0 3.55 3.97",key:"1d7oge"}],["path",{d:"M6 13H2",key:"82j7cp"}],["path",{d:"m8 2 1.88 1.88",key:"fmnt4t"}],["path",{d:"M9 7.13V6a3 3 0 1 1 6 0v1.13",key:"1vgav8"}]],bt=t("bug",X);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Q=[["path",{d:"M10 12h4",key:"a56b0p"}],["path",{d:"M10 8h4",key:"1sr2af"}],["path",{d:"M14 21v-3a2 2 0 0 0-4 0v3",key:"1rgiei"}],["path",{d:"M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2",key:"secmi2"}],["path",{d:"M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16",key:"16ra0t"}]],kt=t("building-2",Q);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Y=[["path",{d:"M3 3v16a2 2 0 0 0 2 2h16",key:"c24i48"}],["path",{d:"M18 17V9",key:"2bz60n"}],["path",{d:"M13 17V5",key:"1frdt8"}],["path",{d:"M8 17v-3",key:"17ska0"}]],ft=t("chart-column",Y);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ee=[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]],gt=t("check",ee);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const te=[["path",{d:"m6 9 6 6 6-6",key:"qrunsl"}]],vt=t("chevron-down",te);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ae=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M8 12h8",key:"1wcyev"}],["path",{d:"M12 8v8",key:"napkw2"}]],_t=t("circle-plus",ae);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const se=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"m15 9-6 6",key:"1uzhvr"}],["path",{d:"m9 9 6 6",key:"z0biqf"}]],wt=t("circle-x",se);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const oe=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M12 6v6l4 2",key:"mmk7yg"}]],Mt=t("clock",oe);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ne=[["rect",{width:"14",height:"14",x:"8",y:"8",rx:"2",ry:"2",key:"17jyea"}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",key:"zix9uf"}]],Nt=t("copy",ne);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const re=[["rect",{width:"20",height:"14",x:"2",y:"5",rx:"2",key:"ynyp8z"}],["line",{x1:"2",x2:"22",y1:"10",y2:"10",key:"1b3vmo"}]],jt=t("credit-card",re);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ce=[["line",{x1:"12",x2:"12",y1:"2",y2:"22",key:"7eqyqh"}],["path",{d:"M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",key:"1b0p4s"}]],Ct=t("dollar-sign",ce);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ie=[["path",{d:"M15 3h6v6",key:"1q9fwt"}],["path",{d:"M10 14 21 3",key:"gplh6r"}],["path",{d:"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",key:"a6xqqp"}]],$t=t("external-link",ie);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const le=[["path",{d:"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",key:"1nclc0"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]],St=t("eye",le);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const de=[["path",{d:"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",key:"1oefj6"}],["path",{d:"M14 2v5a1 1 0 0 0 1 1h5",key:"wfsgrz"}],["path",{d:"M10 9H8",key:"b1mrlr"}],["path",{d:"M16 13H8",key:"t4e002"}],["path",{d:"M16 17H8",key:"z1uh3a"}]],zt=t("file-text",de);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const pe=[["path",{d:"M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z",key:"sc7q7i"}]],Lt=t("funnel",pe);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const he=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20",key:"13o1zl"}],["path",{d:"M2 12h20",key:"9i4pu4"}]],At=t("globe",he);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ye=[["path",{d:"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z",key:"j76jl0"}],["path",{d:"M22 10v6",key:"1lu8f3"}],["path",{d:"M6 12.5V16a6 3 0 0 0 12 0v-3.5",key:"1r8lef"}]],qt=t("graduation-cap",ye);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ue=[["line",{x1:"4",x2:"20",y1:"9",y2:"9",key:"4lhtct"}],["line",{x1:"4",x2:"20",y1:"15",y2:"15",key:"vyu0kd"}],["line",{x1:"10",x2:"8",y1:"3",y2:"21",key:"1ggp8o"}],["line",{x1:"16",x2:"14",y1:"3",y2:"21",key:"weycgp"}]],Ht=t("hash",ue);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const xe=[["path",{d:"M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z",key:"1s6t7t"}],["circle",{cx:"16.5",cy:"7.5",r:".5",fill:"currentColor",key:"w0ekpg"}]],Et=t("key-round",xe);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const me=[["rect",{width:"7",height:"7",x:"3",y:"3",rx:"1",key:"1g98yp"}],["rect",{width:"7",height:"7",x:"14",y:"3",rx:"1",key:"6d4xhi"}],["rect",{width:"7",height:"7",x:"14",y:"14",rx:"1",key:"nxv5o0"}],["rect",{width:"7",height:"7",x:"3",y:"14",rx:"1",key:"1bb6yr"}]],Vt=t("layout-grid",me);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const be=[["rect",{width:"7",height:"9",x:"3",y:"3",rx:"1",key:"10lvy0"}],["rect",{width:"7",height:"5",x:"14",y:"3",rx:"1",key:"16une8"}],["rect",{width:"7",height:"9",x:"14",y:"12",rx:"1",key:"1hutg5"}],["rect",{width:"7",height:"5",x:"3",y:"16",rx:"1",key:"ldoo1y"}]],Bt=t("layout-dashboard",be);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ke=[["path",{d:"M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5",key:"1gvzjb"}],["path",{d:"M9 18h6",key:"x1upvd"}],["path",{d:"M10 22h4",key:"ceow96"}]],Dt=t("lightbulb",ke);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const fe=[["path",{d:"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",key:"1cjeqo"}],["path",{d:"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",key:"19qd67"}]],Pt=t("link",fe);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ge=[["path",{d:"M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z",key:"c2jq9f"}],["rect",{width:"4",height:"12",x:"2",y:"9",key:"mk3on5"}],["circle",{cx:"4",cy:"4",r:"2",key:"bt5ra8"}]],Ut=t("linkedin",ge);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ve=[["path",{d:"M21 12a9 9 0 1 1-6.219-8.56",key:"13zald"}]],Tt=t("loader-circle",ve);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const _e=[["rect",{width:"18",height:"11",x:"3",y:"11",rx:"2",ry:"2",key:"1w4ew1"}],["path",{d:"M7 11V7a5 5 0 0 1 10 0v4",key:"fwvmzm"}]],Rt=t("lock",_e);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const we=[["path",{d:"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7",key:"132q7q"}],["rect",{x:"2",y:"4",width:"20",height:"16",rx:"2",key:"izxlao"}]],Ft=t("mail",we);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Me=[["path",{d:"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",key:"1r0f0z"}],["circle",{cx:"12",cy:"10",r:"3",key:"ilqhr7"}]],Jt=t("map-pin",Me);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ne=[["path",{d:"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",key:"18887p"}]],Ot=t("message-square",Ne);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const je=[["rect",{width:"20",height:"14",x:"2",y:"3",rx:"2",key:"48i651"}],["line",{x1:"8",x2:"16",y1:"21",y2:"21",key:"1svkeh"}],["line",{x1:"12",x2:"12",y1:"17",y2:"21",key:"vw1qmm"}]],It=t("monitor",je);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ce=[["path",{d:"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401",key:"kfwtm"}]],Kt=t("moon",Ce);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const $e=[["path",{d:"m15 9-6 6",key:"1uzhvr"}],["path",{d:"M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z",key:"2d38gg"}],["path",{d:"m9 9 6 6",key:"z0biqf"}]],Wt=t("octagon-x",$e);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Se=[["path",{d:"M5.8 11.3 2 22l10.7-3.79",key:"gwxi1d"}],["path",{d:"M4 3h.01",key:"1vcuye"}],["path",{d:"M22 8h.01",key:"1mrtc2"}],["path",{d:"M15 2h.01",key:"1cjtqr"}],["path",{d:"M22 20h.01",key:"1mrys2"}],["path",{d:"m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10",key:"hbicv8"}],["path",{d:"m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17",key:"1i94pl"}],["path",{d:"m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7",key:"1cofks"}],["path",{d:"M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z",key:"4kbmks"}]],Zt=t("party-popper",Se);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ze=[["path",{d:"M13 21h8",key:"1jsn5i"}],["path",{d:"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",key:"1a8usu"}]],Gt=t("pen-line",ze);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Le=[["path",{d:"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z",key:"10ikf1"}]],Xt=t("play",Le);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ae=[["path",{d:"m21 21-4.34-4.34",key:"14j7rj"}],["circle",{cx:"11",cy:"11",r:"8",key:"4ej97u"}]],Qt=t("search",Ae);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const qe=[["path",{d:"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z",key:"1ffxy3"}],["path",{d:"m21.854 2.147-10.94 10.939",key:"12cjpa"}]],Yt=t("send",qe);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const He=[["path",{d:"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",key:"1i5ecw"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]],ea=t("settings",He);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ee=[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}],["path",{d:"M12 8v4",key:"1got3b"}],["path",{d:"M12 16h.01",key:"1drbdi"}]],ta=t("shield-alert",Ee);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ve=[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]],aa=t("shield-check",Ve);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Be=[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}]],sa=t("shield",Be);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const De=[["path",{d:"M10 5H3",key:"1qgfaw"}],["path",{d:"M12 19H3",key:"yhmn1j"}],["path",{d:"M14 3v4",key:"1sua03"}],["path",{d:"M16 17v4",key:"1q0r14"}],["path",{d:"M21 12h-9",key:"1o4lsq"}],["path",{d:"M21 19h-5",key:"1rlt1p"}],["path",{d:"M21 5h-7",key:"1oszz2"}],["path",{d:"M8 10v4",key:"tgpxqk"}],["path",{d:"M8 12H3",key:"a7s4jb"}]],oa=t("sliders-horizontal",De);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Pe=[["rect",{width:"14",height:"20",x:"5",y:"2",rx:"2",ry:"2",key:"1yt0o3"}],["path",{d:"M12 18h.01",key:"mhygvu"}]],na=t("smartphone",Pe);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ue=[["path",{d:"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z",key:"1s2grr"}],["path",{d:"M20 2v4",key:"1rf3ol"}],["path",{d:"M22 4h-4",key:"gwowj6"}],["circle",{cx:"4",cy:"20",r:"2",key:"6kqj1y"}]],ra=t("sparkles",Ue);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Te=[["path",{d:"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",key:"r04s7s"}]],ca=t("star",Te);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Re=[["circle",{cx:"12",cy:"12",r:"4",key:"4exip2"}],["path",{d:"M12 2v2",key:"tus03m"}],["path",{d:"M12 20v2",key:"1lh1kg"}],["path",{d:"m4.93 4.93 1.41 1.41",key:"149t6j"}],["path",{d:"m17.66 17.66 1.41 1.41",key:"ptbguv"}],["path",{d:"M2 12h2",key:"1t8f8n"}],["path",{d:"M20 12h2",key:"1q8mjw"}],["path",{d:"m6.34 17.66-1.41 1.41",key:"1m8zz5"}],["path",{d:"m19.07 4.93-1.41 1.41",key:"1shlcs"}]],ia=t("sun",Re);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Fe=[["path",{d:"M10 11v6",key:"nco0om"}],["path",{d:"M14 11v6",key:"outv1u"}],["path",{d:"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",key:"miytrc"}],["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",key:"e791ji"}]],la=t("trash-2",Fe);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Je=[["path",{d:"M16 7h6v6",key:"box55l"}],["path",{d:"m22 7-8.5 8.5-5-5L2 17",key:"1t1m79"}]],da=t("trending-up",Je);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Oe=[["path",{d:"M12 3v12",key:"1x0j5s"}],["path",{d:"m17 8-5-5-5 5",key:"7q97r8"}],["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",key:"ih7n3h"}]],pa=t("upload",Oe);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ie=[["path",{d:"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2",key:"975kel"}],["circle",{cx:"12",cy:"7",r:"4",key:"17ys0d"}]],ha=t("user",Ie);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ke=[["path",{d:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",key:"1yyitq"}],["path",{d:"M16 3.128a4 4 0 0 1 0 7.744",key:"16gr8j"}],["path",{d:"M22 21v-2a4 4 0 0 0-3-3.87",key:"kshegd"}],["circle",{cx:"9",cy:"7",r:"4",key:"nufk8"}]],ya=t("users",Ke);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const We=[["path",{d:"M18 6 6 18",key:"1bl5f8"}],["path",{d:"m6 6 12 12",key:"d8bk6v"}]],Ze=t("x",We);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ge=[["path",{d:"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z",key:"1xq2db"}]],ua=t("zap",Ge),Xe={primary:"bg-accent text-white border-accent hover:opacity-90 active:opacity-80",secondary:"bg-bg-card text-text border-border hover:border-border-hover hover:text-text active:bg-bg-hover",ghost:"bg-transparent text-text-dim border-transparent hover:bg-bg-hover hover:text-text active:bg-bg-input",danger:"bg-red text-white border-red hover:opacity-90 active:opacity-80"},Qe={sm:"px-3.5 py-[7px] text-xs rounded-md gap-1.5",md:"px-5 py-2.5 text-[13px] rounded-lg gap-2 font-semibold",lg:"px-8 py-3.5 text-[15px] rounded-lg gap-2 font-semibold"};function xa({variant:n="secondary",size:s="md",loading:a=!1,icon:c,fullWidth:p=!1,disabled:r,className:h="",children:y,...x}){const m="inline-flex items-center justify-center border font-medium transition-all cursor-pointer select-none",l=r||a?"opacity-50 cursor-not-allowed":"",v=p?"w-full":"";return e.jsxs("button",{className:`${m} ${Xe[n]} ${Qe[s]} ${l} ${v} ${h}`,disabled:r||a,...x,children:[a?e.jsx("span",{className:"inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"}):c?e.jsx("span",{className:"flex-shrink-0",children:c}):null,y]})}const Ye={default:"bg-bg-card border border-border",elevated:"bg-bg-card border border-border shadow-md",outline:"bg-transparent border border-border",inset:"bg-bg-input border border-border"},et={none:"",sm:"p-3",md:"p-6",lg:"p-6"};function ma({variant:n="default",padding:s="md",as:a="div",className:c="",children:p,...r}){return e.jsx(a,{className:`rounded-xl ${Ye[n]} ${et[s]} ${c}`,...r,children:p})}const tt={default:"bg-bg-input text-text-dim border-border",secondary:"bg-bg-card text-text-muted border-border/50",success:"bg-green-dim text-green border-green/20",warning:"bg-warm-dim text-warm border-warm/20",error:"bg-red-dim text-red border-red/20",info:"bg-accent-dim text-accent border-accent/20",purple:"bg-purple-dim text-purple border-purple/20"},at={sm:"px-2.5 py-[3px] text-[11px]",md:"px-2 py-0.5 text-xs"};function ba({variant:n="default",size:s="md",dot:a=!1,className:c="",children:p,...r}){return e.jsxs("span",{className:`inline-flex items-center gap-1 font-semibold rounded-lg border ${tt[n]} ${at[s]} ${c}`,...r,children:[a&&e.jsx("span",{className:"w-1.5 h-1.5 rounded-full bg-current flex-shrink-0"}),p]})}const st={sm:"max-w-sm",md:"max-w-md",lg:"max-w-lg",xl:"max-w-2xl"};function q({open:n,onClose:s,title:a,size:c="md",children:p,footer:r}){const h=i.useRef(null),y=i.useRef(null);i.useEffect(()=>{n?(y.current=document.activeElement,h.current?.focus()):y.current?.focus()},[n]);const x=i.useCallback(l=>{l.key==="Escape"&&(l.stopPropagation(),s())},[s]),m=i.useCallback(l=>{l.target===l.currentTarget&&s()},[s]);return n?e.jsxs("div",{className:"fixed inset-0 z-40 flex items-center justify-center p-4 animate-modal-fade",role:"presentation",onClick:m,children:[e.jsx("div",{className:"absolute inset-0 bg-black/50","aria-hidden":"true",onClick:s}),e.jsxs("dialog",{ref:h,open:!0,className:`
          relative z-50 w-full ${st[c]}
          bg-bg-card border border-border rounded-lg
          shadow-xl
          animate-modal-slide
          max-h-[85vh] overflow-hidden flex flex-col
        `,role:"dialog","aria-modal":"true","aria-labelledby":a?"modal-title":void 0,onKeyDown:x,tabIndex:-1,children:[a&&e.jsxs("div",{className:"flex items-center justify-between px-5 py-4 border-b border-border",children:[e.jsx("h2",{id:"modal-title",className:"text-lg font-semibold text-text",children:a}),e.jsx("button",{onClick:s,className:"text-text-faint hover:text-text p-1 rounded-md hover:bg-bg-hover transition-all","aria-label":"Close dialog",children:e.jsx("svg",{width:"16",height:"16",viewBox:"0 0 16 16",fill:"none",stroke:"currentColor",strokeWidth:"2","aria-hidden":"true",children:e.jsx("path",{d:"M4 4l8 8M12 4l-8 8"})})})]}),e.jsx("div",{className:"flex-1 overflow-y-auto px-5 py-4",children:p}),r&&e.jsx("div",{className:"flex items-center justify-end gap-2 px-5 py-3 border-t border-border",children:r})]})]}):null}const ot={feed:{title:"Jobs Feed",steps:["Check one or more saved searches in the sidebar to search jobs.","Shift+click column headers for multi-column sorting.","Click a job title to open the full description and apply.","Colored number badges show which filter matched each job.","Use the keyword insights panel to see term frequency and resume match scores."]},tuning:{title:"Search Tuning",steps:["Set global rules that apply across ALL your saved searches.","Location rules: US-only toggle and city/country exclusions.",'Title exclusions: remove common false positives (e.g. "intern").',"Company exclusions: block specific employers or industries.","Level hierarchy: define seniority levels and their keywords for automatic job ranking."]},pipeline:{title:"Pipeline",steps:["Track every job from saved through offer/rejection.","Click stage headers to collapse/expand sections.","Use the Move dropdown on any row to advance jobs through stages.","Stats at top show response rates and days-to-response.","Filter by saved search using the dropdown above the stages."]},resumes:{title:"Resumes",steps:["Upload a resume for each role type or seniority level you target.","Assign a level (Director, Manager, etc.) to each resume.","Click filter pills on each card to assign resumes to your saved searches.","When you apply, the matching resume is automatically selected.","Keyword extraction shows how well each resume matches job descriptions."]},applications:{title:"Applications",steps:["Queue tab: manage pending applications (manual add, batch process).","Rules tab: set default application mode (Manual, Notify, Auto) and auto-apply rules.","Notifications tab: configure email/SMS preferences for every alert type.","Verify your phone to unlock SMS notifications and escalation.","Set escalation rules: unanswered emails auto-escalate to SMS after your timeout.","Override notification settings per saved search for targeted control.","History tab: full audit trail of applications and notification delivery log."]},stats:{title:"Stats",steps:["View aggregated analytics across all your job search activity.","Track application volume, response rates, and pipeline velocity.","Compare performance across different filters and resume versions."]},"get-started":{title:"Setup",steps:["Connect the Chrome extension to scan your LinkedIn network.","Your connections are matched against our job database.","Jobs where you have an inside contact are flagged for priority."]},settings:{title:"Settings",steps:["Manage your account, notification preferences, and data.","Export or delete your data at any time."]},subscription:{title:"Subscription",steps:["View your current plan and usage.","Upgrade to Pro for auto-apply, advanced analytics, and more."]},notifications:{title:"Notification Center",steps:["Preferences tab: toggle email and SMS per notification type.","Verify your phone number to enable SMS alerts.","Log tab: view delivery history for all notifications."]},"interview-prep":{title:"Interview Prep",steps:["Browse the question bank by category.","Practice mode lets you record and review your answers.","AI scoring gives feedback on structure and content."]}};function nt({helpId:n,onClose:s}){const a=i.useRef(null);if(i.useEffect(()=>{if(!n)return;function p(h){a.current&&!a.current.contains(h.target)&&s()}const r=setTimeout(()=>document.addEventListener("click",p),50);return()=>{clearTimeout(r),document.removeEventListener("click",p)}},[n,s]),i.useEffect(()=>{if(!n)return;function p(r){r.key==="Escape"&&s()}return document.addEventListener("keydown",p),()=>document.removeEventListener("keydown",p)},[n,s]),!n)return null;const c=ot[n];return c?e.jsxs("div",{ref:a,className:"fixed z-[9998] overflow-y-auto",style:{bottom:80,right:24,width:340,maxHeight:"60vh",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:12,boxShadow:"0 8px 32px rgba(0,0,0,0.25)",padding:20},children:[e.jsxs("div",{className:"flex justify-between items-center mb-3",children:[e.jsx("div",{className:"text-[14px] font-bold text-text",children:c.title}),e.jsx("button",{onClick:s,className:"text-text-faint hover:text-text transition-colors p-0.5","aria-label":"Close help panel",children:e.jsx(Ze,{className:"w-4 h-4",strokeWidth:1.75})})]}),e.jsx("div",{className:"space-y-2.5",children:c.steps.map((p,r)=>e.jsxs("div",{className:"flex gap-2.5 items-start",children:[e.jsx("span",{className:"w-5 h-5 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0",children:r+1}),e.jsx("span",{className:"text-[12px] text-text-dim leading-[1.7]",children:p})]},r))})]}):null}function ka({title:n,subtitle:s,helpLink:a,children:c}){const[p,r]=i.useState(!1),h=i.useCallback(()=>{r(x=>!x)},[]),y=i.useCallback(()=>{r(!1)},[]);return e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"sticky top-0 z-10 border-b border-border -mx-10 mb-5",style:{padding:"28px 40px 20px",background:"var(--bg-white, var(--bg-main))"},children:[e.jsx("h2",{className:"font-bold text-text",style:{fontSize:"clamp(18px, 1.8vw + 0.5rem, 22px)",marginBottom:"2px"},children:n}),s&&e.jsxs("p",{className:"text-[13px] text-text-dim",children:[s,a&&e.jsxs(e.Fragment,{children:[" ",e.jsx("button",{type:"button",onClick:h,className:"text-accent hover:underline page-how-link",children:"How this works →"})]})]}),c]}),e.jsx(nt,{helpId:p&&a||null,onClose:y})]})}function fa({jobId:n,onClose:s}){const[a,c]=i.useState(null),[p,r]=i.useState(!1),[h,y]=i.useState(null),x=i.useCallback(async l=>{r(!0),y(null);try{const{data:v,error:k}=await C.from("ats_jobs").select("greenhouse_id, title, company_name, location, salary_min, salary_max, salary_currency, salary_rate, ats_source, url, content, created_at, updated_at").eq("greenhouse_id",l).single();if(k)throw k;c(v)}catch(v){y(v?.message||"Failed to load job")}finally{r(!1)}},[]);i.useEffect(()=>{n?x(n):c(null)},[n,x]);const m=l=>{if(!l.salary_min&&!l.salary_max)return null;const v=l.salary_currency||"USD",k=_=>new Intl.NumberFormat("en-US",{style:"currency",currency:v,maximumFractionDigits:0}).format(_);return l.salary_min&&l.salary_max?`${k(l.salary_min)} – ${k(l.salary_max)}${l.salary_rate?` / ${l.salary_rate}`:""}`:l.salary_min?`${k(l.salary_min)}+${l.salary_rate?` / ${l.salary_rate}`:""}`:l.salary_max?`Up to ${k(l.salary_max)}${l.salary_rate?` / ${l.salary_rate}`:""}`:null};return e.jsxs(q,{open:!!n,onClose:s,title:a?.title||"Job Details",size:"xl",footer:a?.url?e.jsx("a",{href:a.url,target:"_blank",rel:"noopener noreferrer",className:"px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:opacity-90",children:"View on Career Page"}):void 0,children:[p&&e.jsx("div",{className:"flex items-center justify-center py-12",children:e.jsx("div",{className:"w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"})}),h&&e.jsx("div",{className:"text-red-500 text-sm py-4",children:h}),a&&!p&&e.jsxs("div",{className:"space-y-4",children:[e.jsxs("div",{className:"flex flex-wrap gap-2 text-sm text-text-dim",children:[a.company_name&&e.jsx("span",{className:"font-medium text-text",children:a.company_name}),a.location&&e.jsxs("span",{children:["· ",a.location]})]}),m(a)&&e.jsx("div",{className:"text-sm font-medium text-accent",children:m(a)}),e.jsxs("div",{className:"flex gap-4 text-xs text-text-faint",children:[a.created_at&&e.jsxs("span",{children:["Posted: ",new Date(a.created_at).toLocaleDateString()]}),a.updated_at&&e.jsxs("span",{children:["Updated: ",new Date(a.updated_at).toLocaleDateString()]})]}),a.content&&e.jsxs("div",{className:"border-t border-border pt-4",children:[e.jsx("h3",{className:"text-sm font-semibold text-text mb-2",children:"Job Description"}),e.jsx("div",{className:"text-sm text-text-dim leading-relaxed prose prose-sm max-w-none",dangerouslySetInnerHTML:{__html:a.content}})]})]})]})}const L={company:"Browse Companies",title:"Browse Job Titles",skills:"Browse Skills",dept:"Browse Departments",level:"Browse Levels",location:"Browse Locations",jd:"Browse JD Keywords"};function ga({open:n,onClose:s,onSelect:a,dimension:c="company",levelHierarchy:p}){const[r,h]=i.useState([]),[y,x]=i.useState(""),[m,l]=i.useState("all"),[v,k]=i.useState(!1),[_,$]=i.useState("");i.useEffect(()=>{n&&(k(!0),h([]),x(""),(async()=>{try{if(c==="level"){const f=p&&p.length>0?p.map(b=>b.label):["Intern","Entry","Junior","Mid","Senior","Lead","Manager","Director","VP","Executive"];h(f.map(b=>({name:b,jobCount:0,status:"neutral"}))),k(!1);return}const o={title:"title",skills:"skill",dept:"dept"};if(o[c]){const{data:f,error:b}=await C.rpc("fn_filter_browser_top",{p_dimension:o[c],p_us_only:!1,p_limit:500});if(!b&&f?.length){const S=new Set;h(f.map(g=>({name:g.value.toLowerCase().trim(),jobCount:g.job_count})).filter(g=>g.name.length>=2&&g.name.length<=60&&!S.has(g.name)&&!!S.add(g.name)).map(g=>({name:g.name,jobCount:g.jobCount,status:"neutral"})))}k(!1);return}const{data:u,error:d}=await C.rpc("fn_filter_browser_top",{p_dimension:"company",p_us_only:!1,p_limit:1e3});if(!d&&u?.length){const f=new Set;h(u.map(b=>({name:b.value.toLowerCase().trim(),jobCount:b.job_count})).filter(b=>b.name.length>=1&&!f.has(b.name)&&!!f.add(b.name)).map(b=>({name:b.name,jobCount:b.jobCount,status:"neutral"})))}}catch(o){console.error("[Browse]",o)}k(!1)})())},[n,c]);const H=i.useCallback(o=>{h(u=>u.map(d=>d.name===o?{...d,status:d.status==="neutral"?"included":d.status==="included"?"excluded":"neutral"}:d))},[]),N=i.useMemo(()=>{let o=r;return y&&(o=o.filter(u=>u.name.toLowerCase().includes(y.toLowerCase()))),m==="included"&&(o=o.filter(u=>u.status==="included")),m==="excluded"&&(o=o.filter(u=>u.status==="excluded")),o},[r,y,m]),j=i.useMemo(()=>{const o={};return(_?N.filter(d=>(d.name[0]||"#").toUpperCase()===_):N).forEach(d=>{const f=(d.name[0]||"#").toUpperCase();o[f]||(o[f]=[]),o[f].push(d)}),o},[N,_]),E=i.useMemo(()=>{const o="ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),u=new Set(Object.keys(j));return o.map(d=>({letter:d,has:u.has(d)}))},[j]),V=L[c]||"Browse",w=r.filter(o=>o.status==="included").length,M=r.filter(o=>o.status==="excluded").length;return n?e.jsx(q,{open:n,onClose:s,title:L[c]||"Browse",size:"lg",children:e.jsxs("div",{className:"w-[90vw] max-w-[600px] max-h-[80vh] flex flex-col",children:[e.jsxs("div",{className:"px-5 py-4 border-b border-border flex-shrink-0",children:[e.jsx("div",{className:"text-[15px] font-bold text-text mb-3",children:V}),e.jsxs("div",{className:"flex items-center gap-2 flex-wrap",children:[e.jsx("input",{type:"text",value:y,onChange:o=>x(o.target.value),placeholder:"Search companies…",className:"flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-border bg-bg-input text-[13px] text-text focus:border-accent focus:outline-none"}),e.jsx("div",{className:"flex gap-0 rounded-lg overflow-hidden border border-border",children:["all","included","excluded"].map(o=>e.jsx("button",{onClick:()=>l(o),className:`px-3 py-1.5 text-[12px] font-semibold transition-all ${m===o?"bg-accent text-white":"bg-bg-input text-text-dim"}`,children:o==="all"?"All":o==="included"?`✓ (${w})`:`✕ (${M})`},o))})]})]}),e.jsxs("div",{className:"flex flex-wrap gap-[3px] px-5 py-2 border-b border-border flex-shrink-0",children:[e.jsx("button",{onClick:()=>$(""),className:`text-[11px] font-bold px-1.5 py-0.5 rounded transition-all mr-1 ${_?"text-accent hover:bg-accent/10 cursor-pointer":"bg-accent text-white"}`,children:"All"}),E.map(({letter:o,has:u})=>e.jsx("button",{onClick:()=>{u&&$(_===o?"":o)},className:`text-[11px] font-bold px-1.5 py-0.5 rounded transition-all ${u?_===o?"bg-accent text-white":"text-accent hover:bg-accent/10 cursor-pointer":"text-text-faint opacity-35"}`,children:o},o))]}),e.jsx("div",{className:"flex-1 overflow-y-auto px-5 py-2",style:{maxHeight:"55vh"},children:v?e.jsx("div",{className:"text-center py-12 text-text-faint text-[13px]",children:"Loading companies…"}):N.length===0?e.jsx("div",{className:"text-center py-12 text-text-faint text-[13px]",children:"No companies found"}):Object.entries(j).sort(([o],[u])=>o.localeCompare(u)).map(([o,u])=>e.jsxs("div",{className:"mb-5",id:`cb-${o}`,children:[e.jsx("div",{className:"text-[18px] font-bold text-accent py-1 pb-1.5 border-b border-border mb-2 sticky top-0 bg-bg-card z-[2]",children:o}),u.map(d=>e.jsxs("div",{className:"flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg cursor-pointer text-[13px] hover:bg-bg-hover transition-colors",onClick:()=>H(d.name),children:[e.jsx("div",{className:`w-[22px] h-[22px] rounded flex items-center justify-center flex-shrink-0 text-[12px] border-[1.5px] transition-all ${d.status==="included"?"bg-green border-green text-white":d.status==="excluded"?"bg-red border-red text-white":"border-border"}`,children:d.status==="included"?"✓":d.status==="excluded"?"✕":""}),e.jsx("span",{className:"flex-1 font-medium text-text",children:d.name}),e.jsxs("span",{className:"text-[11px] text-text-faint whitespace-nowrap",children:[d.jobCount," job",d.jobCount!==1?"s":""]})]},d.name))]},o))}),(w>0||M>0)&&e.jsxs("div",{className:"px-5 py-3 border-t border-border flex items-center gap-2 flex-shrink-0",children:[e.jsxs("span",{className:"text-[12px] font-semibold text-text-dim",children:[w>0&&e.jsxs("span",{className:"text-green",children:[w," included"]}),w>0&&M>0&&" · ",M>0&&e.jsxs("span",{className:"text-red",children:[M," excluded"]})]}),e.jsx("button",{onClick:()=>{const o=r.filter(d=>d.status==="included").map(d=>d.name),u=r.filter(d=>d.status==="excluded").map(d=>d.name);o.length&&a?.(o,"include"),u.length&&a?.(u,"exclude"),s()},className:"ml-auto px-4 py-2 rounded-lg bg-accent text-white text-[12px] font-semibold",children:"Apply Selections"})]})]})}):null}export{Vt as $,lt as A,mt as B,ma as C,Ct as D,$t as E,zt as F,qt as G,ka as H,ra as I,fa as J,ga as K,Bt as L,Ot as M,gt as N,Wt as O,Gt as P,pa as Q,_t as R,Qt as S,it as T,ya as U,Pt as V,ha as W,Ze as X,sa as Y,ua as Z,na as _,Mt as a,ba as a0,Jt as a1,kt as a2,At as a3,Ht as a4,Et as a5,vt as a6,wt as a7,Nt as a8,ut as a9,yt as aa,Xt as ab,bt as ac,Dt as ad,pt as b,xt as c,da as d,aa as e,ca as f,oa as g,ft as h,ea as i,jt as j,ht as k,Rt as l,It as m,Kt as n,ia as o,xa as p,Zt as q,Ut as r,ta as s,St as t,Ft as u,dt as v,Lt as w,la as x,Tt as y,Yt as z};
//# sourceMappingURL=design-system.js.map
