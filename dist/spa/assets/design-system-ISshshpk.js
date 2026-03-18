import{a as l,j as e}from"./react-vendor-DGWi3gCj.js";import{s as g}from"./providers-DOz4lzS7.js";/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=(...s)=>s.filter((o,t,n)=>!!o&&o.trim()!==""&&n.indexOf(o)===t).join(" ").trim();/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const f=s=>s.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase();/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const _=s=>s.replace(/^([A-Z])|[\s-_]+(\w)/g,(o,t,n)=>n?n.toUpperCase():t.toLowerCase());/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const u=s=>{const o=_(s);return o.charAt(0).toUpperCase()+o.slice(1)};/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var v={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const w=s=>{for(const o in s)if(o.startsWith("aria-")||o==="role"||o==="title")return!0;return!1};/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const N=l.forwardRef(({color:s="currentColor",size:o=24,strokeWidth:t=2,absoluteStrokeWidth:n,className:c="",children:d,iconNode:h,...p},m)=>l.createElement("svg",{ref:m,...v,width:o,height:o,stroke:s,strokeWidth:n?Number(t)*24/Number(o):t,className:k("lucide",c),...!d&&!w(p)&&{"aria-hidden":"true"},...p},[...h.map(([x,r])=>l.createElement(x,r)),...Array.isArray(d)?d:[d]]));/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const a=(s,o)=>{const t=l.forwardRef(({className:n,...c},d)=>l.createElement(N,{ref:d,iconNode:o,className:k(`lucide-${f(u(s))}`,`lucide-${s}`,n),...c}));return t.displayName=u(s),t};/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const M=[["path",{d:"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",key:"169zse"}]],Ee=a("activity",M);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const $=[["path",{d:"m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526",key:"1yiouv"}],["circle",{cx:"12",cy:"8",r:"6",key:"1vp47v"}]],Pe=a("award",$);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const j=[["path",{d:"M10.268 21a2 2 0 0 0 3.464 0",key:"vwvbt9"}],["path",{d:"M17 17H4a1 1 0 0 1-.74-1.673C4.59 13.956 6 12.499 6 8a6 6 0 0 1 .258-1.742",key:"178tsu"}],["path",{d:"m2 2 20 20",key:"1ooewy"}],["path",{d:"M8.668 3.01A6 6 0 0 1 18 8c0 2.687.77 4.653 1.707 6.05",key:"1hqiys"}]],Fe=a("bell-off",j);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const C=[["path",{d:"M10.268 21a2 2 0 0 0 3.464 0",key:"vwvbt9"}],["path",{d:"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326",key:"11g9vi"}]],Ie=a("bell",C);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const z=[["path",{d:"M10 2v8l3-3 3 3V2",key:"sqw3rj"}],["path",{d:"M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",key:"k3hazp"}]],Ue=a("book-marked",z);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const A=[["path",{d:"M12 7v14",key:"1akyts"}],["path",{d:"M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z",key:"ruj8y"}]],Je=a("book-open",A);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const q=[["path",{d:"M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z",key:"oz39mx"}],["path",{d:"m9 10 2 2 4-4",key:"1gnqz4"}]],Re=a("bookmark-check",q);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const L=[["path",{d:"M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z",key:"oz39mx"}]],Oe=a("bookmark",L);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const S=[["path",{d:"M12 8V4H8",key:"hb8ula"}],["rect",{width:"16",height:"12",x:"4",y:"8",rx:"2",key:"enze0r"}],["path",{d:"M2 14h2",key:"vft8re"}],["path",{d:"M20 14h2",key:"4cs60a"}],["path",{d:"M15 13v2",key:"1xurst"}],["path",{d:"M9 13v2",key:"rq6x2g"}]],Ke=a("bot",S);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const H=[["path",{d:"M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16",key:"jecpp"}],["rect",{width:"20",height:"14",x:"2",y:"6",rx:"2",key:"i6l2r4"}]],We=a("briefcase",H);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const V=[["path",{d:"M3 3v16a2 2 0 0 0 2 2h16",key:"c24i48"}],["path",{d:"M18 17V9",key:"2bz60n"}],["path",{d:"M13 17V5",key:"1frdt8"}],["path",{d:"M8 17v-3",key:"17ska0"}]],Ge=a("chart-column",V);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const B=[["path",{d:"M18 6 7 17l-5-5",key:"116fxf"}],["path",{d:"m22 10-7.5 7.5L13 16",key:"ke71qq"}]],Xe=a("check-check",B);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const T=[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]],Ze=a("check",T);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const D=[["path",{d:"m6 9 6 6 6-6",key:"qrunsl"}]],Qe=a("chevron-down",D);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const E=[["path",{d:"M21.801 10A10 10 0 1 1 17 3.335",key:"yps3ct"}],["path",{d:"m9 11 3 3L22 4",key:"1pflzl"}]],P=a("circle-check-big",E);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const F=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M8 12h8",key:"1wcyev"}],["path",{d:"M12 8v8",key:"napkw2"}]],Ye=a("circle-plus",F);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const I=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"m15 9-6 6",key:"1uzhvr"}],["path",{d:"m9 9 6 6",key:"z0biqf"}]],U=a("circle-x",I);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const J=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M12 6v6l4 2",key:"mmk7yg"}]],et=a("clock",J);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const R=[["rect",{width:"20",height:"14",x:"2",y:"5",rx:"2",key:"ynyp8z"}],["line",{x1:"2",x2:"22",y1:"10",y2:"10",key:"1b3vmo"}]],tt=a("credit-card",R);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const O=[["path",{d:"M15 3h6v6",key:"1q9fwt"}],["path",{d:"M10 14 21 3",key:"gplh6r"}],["path",{d:"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",key:"a6xqqp"}]],at=a("external-link",O);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const K=[["path",{d:"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",key:"1oefj6"}],["path",{d:"M14 2v5a1 1 0 0 0 1 1h5",key:"wfsgrz"}],["path",{d:"M10 9H8",key:"b1mrlr"}],["path",{d:"M16 13H8",key:"t4e002"}],["path",{d:"M16 17H8",key:"z1uh3a"}]],st=a("file-text",K);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const W=[["path",{d:"M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z",key:"sc7q7i"}]],rt=a("funnel",W);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const G=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M12 16v-4",key:"1dtifu"}],["path",{d:"M12 8h.01",key:"e9boi3"}]],X=a("info",G);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Z=[["rect",{width:"7",height:"7",x:"3",y:"3",rx:"1",key:"1g98yp"}],["rect",{width:"7",height:"7",x:"14",y:"3",rx:"1",key:"6d4xhi"}],["rect",{width:"7",height:"7",x:"14",y:"14",rx:"1",key:"nxv5o0"}],["rect",{width:"7",height:"7",x:"3",y:"14",rx:"1",key:"1bb6yr"}]],ot=a("layout-grid",Z);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Q=[["rect",{width:"7",height:"9",x:"3",y:"3",rx:"1",key:"10lvy0"}],["rect",{width:"7",height:"5",x:"14",y:"3",rx:"1",key:"16une8"}],["rect",{width:"7",height:"9",x:"14",y:"12",rx:"1",key:"1hutg5"}],["rect",{width:"7",height:"5",x:"3",y:"16",rx:"1",key:"ldoo1y"}]],nt=a("layout-dashboard",Q);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Y=[["path",{d:"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",key:"1cjeqo"}],["path",{d:"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",key:"19qd67"}]],ct=a("link",Y);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ee=[["path",{d:"M21 12a9 9 0 1 1-6.219-8.56",key:"13zald"}]],dt=a("loader-circle",ee);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const te=[["rect",{width:"18",height:"11",x:"3",y:"11",rx:"2",ry:"2",key:"1w4ew1"}],["path",{d:"M7 11V7a5 5 0 0 1 10 0v4",key:"fwvmzm"}]],lt=a("lock",te);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ae=[["path",{d:"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7",key:"132q7q"}],["rect",{x:"2",y:"4",width:"20",height:"16",rx:"2",key:"izxlao"}]],it=a("mail",ae);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const se=[["path",{d:"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",key:"18887p"}]],ht=a("message-square",se);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const re=[["rect",{width:"20",height:"14",x:"2",y:"3",rx:"2",key:"48i651"}],["line",{x1:"8",x2:"16",y1:"21",y2:"21",key:"1svkeh"}],["line",{x1:"12",x2:"12",y1:"17",y2:"21",key:"vw1qmm"}]],pt=a("monitor",re);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const oe=[["path",{d:"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401",key:"kfwtm"}]],yt=a("moon",oe);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ne=[["path",{d:"m15 9-6 6",key:"1uzhvr"}],["path",{d:"M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z",key:"2d38gg"}],["path",{d:"m9 9 6 6",key:"z0biqf"}]],mt=a("octagon-x",ne);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ce=[["path",{d:"M13 21h8",key:"1jsn5i"}],["path",{d:"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",key:"1a8usu"}]],xt=a("pen-line",ce);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const de=[["path",{d:"M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384",key:"9njp5v"}]],ut=a("phone",de);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const le=[["path",{d:"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z",key:"10ikf1"}]],kt=a("play",le);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ie=[["path",{d:"m21 21-4.34-4.34",key:"14j7rj"}],["circle",{cx:"11",cy:"11",r:"8",key:"4ej97u"}]],bt=a("search",ie);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const he=[["path",{d:"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z",key:"1ffxy3"}],["path",{d:"m21.854 2.147-10.94 10.939",key:"12cjpa"}]],gt=a("send",he);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const pe=[["path",{d:"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",key:"1i5ecw"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]],ft=a("settings",pe);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ye=[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]],_t=a("shield-check",ye);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const me=[["path",{d:"M10 5H3",key:"1qgfaw"}],["path",{d:"M12 19H3",key:"yhmn1j"}],["path",{d:"M14 3v4",key:"1sua03"}],["path",{d:"M16 17v4",key:"1q0r14"}],["path",{d:"M21 12h-9",key:"1o4lsq"}],["path",{d:"M21 19h-5",key:"1rlt1p"}],["path",{d:"M21 5h-7",key:"1oszz2"}],["path",{d:"M8 10v4",key:"tgpxqk"}],["path",{d:"M8 12H3",key:"a7s4jb"}]],vt=a("sliders-horizontal",me);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const xe=[["path",{d:"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",key:"r04s7s"}]],wt=a("star",xe);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ue=[["circle",{cx:"12",cy:"12",r:"4",key:"4exip2"}],["path",{d:"M12 2v2",key:"tus03m"}],["path",{d:"M12 20v2",key:"1lh1kg"}],["path",{d:"m4.93 4.93 1.41 1.41",key:"149t6j"}],["path",{d:"m17.66 17.66 1.41 1.41",key:"ptbguv"}],["path",{d:"M2 12h2",key:"1t8f8n"}],["path",{d:"M20 12h2",key:"1q8mjw"}],["path",{d:"m6.34 17.66-1.41 1.41",key:"1m8zz5"}],["path",{d:"m19.07 4.93-1.41 1.41",key:"1shlcs"}]],Nt=a("sun",ue);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ke=[["path",{d:"M10 11v6",key:"nco0om"}],["path",{d:"M14 11v6",key:"outv1u"}],["path",{d:"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",key:"miytrc"}],["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",key:"e791ji"}]],Mt=a("trash-2",ke);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const be=[["path",{d:"M16 7h6v6",key:"box55l"}],["path",{d:"m22 7-8.5 8.5-5-5L2 17",key:"1t1m79"}]],$t=a("trending-up",be);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ge=[["path",{d:"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",key:"wmoenq"}],["path",{d:"M12 9v4",key:"juzpu7"}],["path",{d:"M12 17h.01",key:"p32p05"}]],fe=a("triangle-alert",ge);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const _e=[["path",{d:"M12 3v12",key:"1x0j5s"}],["path",{d:"m17 8-5-5-5 5",key:"7q97r8"}],["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",key:"ih7n3h"}]],jt=a("upload",_e);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ve=[["path",{d:"M18 6 6 18",key:"1bl5f8"}],["path",{d:"m6 6 12 12",key:"d8bk6v"}]],we=a("x",ve),Ne=l.createContext(null);let Me=0;function Ct({children:s}){const[o,t]=l.useState([]),n=l.useCallback(r=>{t(i=>i.filter(y=>y.id!==r))},[]),c=l.useCallback(r=>{const i=`toast-${++Me}`;return t(y=>[...y.slice(-4),{...r,id:i}]),i},[]),d=l.useCallback((r,i)=>c({type:"success",title:r,message:i}),[c]),h=l.useCallback((r,i)=>c({type:"error",title:r,message:i,duration:6e3}),[c]),p=l.useCallback((r,i)=>c({type:"warning",title:r,message:i}),[c]),m=l.useCallback((r,i)=>c({type:"info",title:r,message:i}),[c]),x={toast:c,success:d,error:h,warning:p,info:m,dismiss:n};return e.jsxs(Ne.Provider,{value:x,children:[s,e.jsx("div",{className:"fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none","aria-live":"polite","aria-label":"Notifications",children:o.map(r=>e.jsx(Ce,{toast:r,onDismiss:n},r.id))})]})}const $e={success:P,error:U,warning:fe,info:X},je={success:{border:"border-emerald-500/30",icon:"text-emerald-500",bg:"bg-emerald-500/5"},error:{border:"border-red-500/30",icon:"text-red-500",bg:"bg-red-500/5"},warning:{border:"border-amber-500/30",icon:"text-amber-500",bg:"bg-amber-500/5"},info:{border:"border-blue-500/30",icon:"text-blue-500",bg:"bg-blue-500/5"}};function Ce({toast:s,onDismiss:o}){const[t,n]=l.useState(!1);l.useEffect(()=>{requestAnimationFrame(()=>n(!0));const h=setTimeout(()=>{n(!1),setTimeout(()=>o(s.id),200)},s.duration||4e3);return()=>clearTimeout(h)},[s.id,s.duration,o]);const c=$e[s.type],d=je[s.type];return e.jsxs("div",{className:`
        pointer-events-auto max-w-sm w-full
        rounded-lg border shadow-lg backdrop-blur-sm
        px-4 py-3 flex items-start gap-3
        transition-all duration-200
        ${d.border} ${d.bg}
        ${t?"translate-x-0 opacity-100":"translate-x-8 opacity-0"}
      `,style:{backgroundColor:"var(--bg-surface, #fff)"},role:"alert",children:[e.jsx(c,{className:`w-5 h-5 flex-shrink-0 mt-0.5 ${d.icon}`}),e.jsxs("div",{className:"flex-1 min-w-0",children:[e.jsx("p",{className:"text-sm font-medium text-text-primary",children:s.title}),s.message&&e.jsx("p",{className:"text-xs text-text-secondary mt-0.5",children:s.message})]}),e.jsx("button",{onClick:()=>{n(!1),setTimeout(()=>o(s.id),200)},className:"p-0.5 rounded hover:bg-black/5 text-text-faint hover:text-text-secondary transition-colors flex-shrink-0","aria-label":"Dismiss",children:e.jsx(we,{className:"w-3.5 h-3.5"})})]})}const ze={primary:"bg-accent text-white border-accent hover:opacity-90 active:opacity-80",secondary:"bg-bg-card text-text border-border hover:border-border-hover hover:text-text active:bg-bg-hover",ghost:"bg-transparent text-text-dim border-transparent hover:bg-bg-hover hover:text-text active:bg-bg-input",danger:"bg-red text-white border-red hover:opacity-90 active:opacity-80"},Ae={sm:"px-3 py-1.5 text-xs rounded-sm gap-1.5",md:"px-4 py-2 text-sm rounded-md gap-2",lg:"px-5 py-2.5 text-base rounded-md gap-2"};function zt({variant:s="secondary",size:o="md",loading:t=!1,icon:n,fullWidth:c=!1,disabled:d,className:h="",children:p,...m}){const x="inline-flex items-center justify-center border font-medium transition-all cursor-pointer select-none",r=d||t?"opacity-50 cursor-not-allowed":"",i=c?"w-full":"";return e.jsxs("button",{className:`${x} ${ze[s]} ${Ae[o]} ${r} ${i} ${h}`,disabled:d||t,...m,children:[t?e.jsx("span",{className:"inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"}):n?e.jsx("span",{className:"flex-shrink-0",children:n}):null,p]})}const qe={default:"bg-bg-card border border-border",elevated:"bg-bg-card border border-border shadow-md",outline:"bg-transparent border border-border",inset:"bg-bg-input border border-border"},Le={none:"",sm:"p-3",md:"p-4",lg:"p-6"};function At({variant:s="default",padding:o="md",as:t="div",className:n="",children:c,...d}){return e.jsx(t,{className:`rounded-lg ${qe[s]} ${Le[o]} ${n}`,...d,children:c})}const Se={default:"bg-bg-input text-text-dim border-border",secondary:"bg-bg-card text-text-muted border-border/50",success:"bg-green-dim text-green border-green/20",warning:"bg-warm-dim text-warm border-warm/20",error:"bg-red-dim text-red border-red/20",info:"bg-accent-dim text-accent border-accent/20",purple:"bg-purple-dim text-purple border-purple/20"},He={sm:"px-1.5 py-0.5 text-[10px]",md:"px-2 py-0.5 text-xs"};function qt({variant:s="default",size:o="md",dot:t=!1,className:n="",children:c,...d}){return e.jsxs("span",{className:`inline-flex items-center gap-1 font-medium rounded-full border ${Se[s]} ${He[o]} ${n}`,...d,children:[t&&e.jsx("span",{className:"w-1.5 h-1.5 rounded-full bg-current flex-shrink-0"}),c]})}const Ve={sm:"max-w-sm",md:"max-w-md",lg:"max-w-lg",xl:"max-w-2xl"};function Be({open:s,onClose:o,title:t,size:n="md",children:c,footer:d}){const h=l.useRef(null),p=l.useRef(null);l.useEffect(()=>{s?(p.current=document.activeElement,h.current?.focus()):p.current?.focus()},[s]);const m=l.useCallback(r=>{r.key==="Escape"&&(r.stopPropagation(),o())},[o]),x=l.useCallback(r=>{r.target===r.currentTarget&&o()},[o]);return s?e.jsxs("div",{className:"fixed inset-0 z-40 flex items-center justify-center p-4 animate-modal-fade",role:"presentation",onClick:x,children:[e.jsx("div",{className:"absolute inset-0 bg-black/50","aria-hidden":"true"}),e.jsxs("dialog",{ref:h,open:!0,className:`
          relative z-50 w-full ${Ve[n]}
          bg-bg-card border border-border rounded-lg
          shadow-xl
          animate-modal-slide
          max-h-[85vh] overflow-hidden flex flex-col
        `,role:"dialog","aria-modal":"true","aria-labelledby":t?"modal-title":void 0,onKeyDown:m,tabIndex:-1,children:[t&&e.jsxs("div",{className:"flex items-center justify-between px-5 py-4 border-b border-border",children:[e.jsx("h2",{id:"modal-title",className:"text-lg font-semibold text-text",children:t}),e.jsx("button",{onClick:o,className:"text-text-faint hover:text-text p-1 rounded-md hover:bg-bg-hover transition-all","aria-label":"Close dialog",children:e.jsx("svg",{width:"16",height:"16",viewBox:"0 0 16 16",fill:"none",stroke:"currentColor",strokeWidth:"2","aria-hidden":"true",children:e.jsx("path",{d:"M4 4l8 8M12 4l-8 8"})})})]}),e.jsx("div",{className:"flex-1 overflow-y-auto px-5 py-4",children:c}),d&&e.jsx("div",{className:"flex items-center justify-end gap-2 px-5 py-3 border-t border-border",children:d})]})]}):null}function Lt({title:s,subtitle:o,helpLink:t,onHelp:n,children:c}){return e.jsxs("div",{className:"sticky top-0 z-10 border-b border-border mb-5",style:{padding:"28px 0 20px",background:"var(--bg-white, var(--bg-main))"},children:[e.jsx("h2",{className:"font-bold text-text",style:{fontSize:"clamp(18px, 1.8vw + 0.5rem, 22px)",marginBottom:"2px"},children:s}),o&&e.jsxs("p",{className:"text-[13px] text-text-dim",children:[o,t&&n&&e.jsxs(e.Fragment,{children:[" ",e.jsx("button",{type:"button",onClick:n,className:"text-accent hover:underline",children:"How this works →"})]})]}),c]})}function St({jobId:s,onClose:o}){const[t,n]=l.useState(null),[c,d]=l.useState(!1),[h,p]=l.useState(null),m=l.useCallback(async r=>{d(!0),p(null);try{const{data:i,error:y}=await g.from("ats_jobs").select("greenhouse_id, title, company_name, location, salary_min, salary_max, salary_currency, salary_rate, ats_source, url, content, created_at, updated_at").eq("greenhouse_id",r).single();if(y)throw y;n(i)}catch(i){p(i?.message||"Failed to load job")}finally{d(!1)}},[]);l.useEffect(()=>{s?m(s):n(null)},[s,m]);const x=r=>{if(!r.salary_min&&!r.salary_max)return null;const i=r.salary_currency||"USD",y=b=>new Intl.NumberFormat("en-US",{style:"currency",currency:i,maximumFractionDigits:0}).format(b);return r.salary_min&&r.salary_max?`${y(r.salary_min)} – ${y(r.salary_max)}${r.salary_rate?` / ${r.salary_rate}`:""}`:r.salary_min?`${y(r.salary_min)}+${r.salary_rate?` / ${r.salary_rate}`:""}`:r.salary_max?`Up to ${y(r.salary_max)}${r.salary_rate?` / ${r.salary_rate}`:""}`:null};return e.jsxs(Be,{open:!!s,onClose:o,title:t?.title||"Job Details",size:"xl",footer:t?.url?e.jsxs("a",{href:t.url,target:"_blank",rel:"noopener noreferrer",className:"px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:opacity-90",children:["View on ",t.ats_source||"Career Page"]}):void 0,children:[c&&e.jsx("div",{className:"flex items-center justify-center py-12",children:e.jsx("div",{className:"w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"})}),h&&e.jsx("div",{className:"text-red-500 text-sm py-4",children:h}),t&&!c&&e.jsxs("div",{className:"space-y-4",children:[e.jsxs("div",{className:"flex flex-wrap gap-2 text-sm text-text-dim",children:[t.company_name&&e.jsx("span",{className:"font-medium text-text",children:t.company_name}),t.location&&e.jsxs("span",{children:["· ",t.location]}),t.ats_source&&e.jsxs("span",{children:["· ",t.ats_source]})]}),x(t)&&e.jsx("div",{className:"text-sm font-medium text-accent",children:x(t)}),e.jsxs("div",{className:"flex gap-4 text-xs text-text-faint",children:[t.created_at&&e.jsxs("span",{children:["Posted: ",new Date(t.created_at).toLocaleDateString()]}),t.updated_at&&e.jsxs("span",{children:["Updated: ",new Date(t.updated_at).toLocaleDateString()]})]}),t.content&&e.jsxs("div",{className:"border-t border-border pt-4",children:[e.jsx("h3",{className:"text-sm font-semibold text-text mb-2",children:"Job Description"}),e.jsx("div",{className:"text-sm text-text-dim leading-relaxed prose prose-sm max-w-none",dangerouslySetInnerHTML:{__html:t.content}})]})]})]})}export{Ee as A,We as B,At as C,Pe as D,at as E,st as F,Oe as G,Re as H,kt as I,St as J,Qe as K,nt as L,pt as M,Xe as N,mt as O,xt as P,Fe as Q,Ze as R,bt as S,$t as T,jt as U,it as V,ut as W,we as X,et as a,Ie as b,Ke as c,_t as d,wt as e,vt as f,Ue as g,Ge as h,ft as i,tt as j,lt as k,yt as l,Nt as m,Ct as n,zt as o,qt as p,ht as q,Mt as r,dt as s,gt as t,Lt as u,Ye as v,ct as w,rt as x,ot as y,Je as z};
//# sourceMappingURL=design-system-ISshshpk.js.map
