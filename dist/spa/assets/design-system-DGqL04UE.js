import{a as l,j as r}from"./react-vendor-DGWi3gCj.js";import{s as f}from"./providers-BuGZ6ErJ.js";/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=(...s)=>s.filter((o,e,n)=>!!o&&o.trim()!==""&&n.indexOf(o)===e).join(" ").trim();/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const g=s=>s.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase();/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const _=s=>s.replace(/^([A-Z])|[\s-_]+(\w)/g,(o,e,n)=>n?n.toUpperCase():e.toLowerCase());/**
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
 */const M=l.forwardRef(({color:s="currentColor",size:o=24,strokeWidth:e=2,absoluteStrokeWidth:n,className:c="",children:d,iconNode:h,...p},y)=>l.createElement("svg",{ref:y,...v,width:o,height:o,stroke:s,strokeWidth:n?Number(e)*24/Number(o):e,className:k("lucide",c),...!d&&!w(p)&&{"aria-hidden":"true"},...p},[...h.map(([x,t])=>l.createElement(x,t)),...Array.isArray(d)?d:[d]]));/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const a=(s,o)=>{const e=l.forwardRef(({className:n,...c},d)=>l.createElement(M,{ref:d,iconNode:o,className:k(`lucide-${g(u(s))}`,`lucide-${s}`,n),...c}));return e.displayName=u(s),e};/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const N=[["path",{d:"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",key:"169zse"}]],Ve=a("activity",N);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const $=[["path",{d:"m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526",key:"1yiouv"}],["circle",{cx:"12",cy:"8",r:"6",key:"1vp47v"}]],Be=a("award",$);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const C=[["path",{d:"M10.268 21a2 2 0 0 0 3.464 0",key:"vwvbt9"}],["path",{d:"M17 17H4a1 1 0 0 1-.74-1.673C4.59 13.956 6 12.499 6 8a6 6 0 0 1 .258-1.742",key:"178tsu"}],["path",{d:"m2 2 20 20",key:"1ooewy"}],["path",{d:"M8.668 3.01A6 6 0 0 1 18 8c0 2.687.77 4.653 1.707 6.05",key:"1hqiys"}]],Te=a("bell-off",C);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const j=[["path",{d:"M10.268 21a2 2 0 0 0 3.464 0",key:"vwvbt9"}],["path",{d:"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326",key:"11g9vi"}]],De=a("bell",j);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const z=[["path",{d:"M10 2v8l3-3 3 3V2",key:"sqw3rj"}],["path",{d:"M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",key:"k3hazp"}]],Ee=a("book-marked",z);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const A=[["path",{d:"M12 7v14",key:"1akyts"}],["path",{d:"M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z",key:"ruj8y"}]],Pe=a("book-open",A);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const q=[["path",{d:"M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z",key:"oz39mx"}],["path",{d:"m9 10 2 2 4-4",key:"1gnqz4"}]],Fe=a("bookmark-check",q);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const L=[["path",{d:"M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z",key:"oz39mx"}]],Ie=a("bookmark",L);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const S=[["path",{d:"M12 8V4H8",key:"hb8ula"}],["rect",{width:"16",height:"12",x:"4",y:"8",rx:"2",key:"enze0r"}],["path",{d:"M2 14h2",key:"vft8re"}],["path",{d:"M20 14h2",key:"4cs60a"}],["path",{d:"M15 13v2",key:"1xurst"}],["path",{d:"M9 13v2",key:"rq6x2g"}]],Ue=a("bot",S);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const H=[["path",{d:"M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16",key:"jecpp"}],["rect",{width:"20",height:"14",x:"2",y:"6",rx:"2",key:"i6l2r4"}]],Je=a("briefcase",H);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const V=[["path",{d:"M3 3v16a2 2 0 0 0 2 2h16",key:"c24i48"}],["path",{d:"M18 17V9",key:"2bz60n"}],["path",{d:"M13 17V5",key:"1frdt8"}],["path",{d:"M8 17v-3",key:"17ska0"}]],Oe=a("chart-column",V);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const B=[["path",{d:"M18 6 7 17l-5-5",key:"116fxf"}],["path",{d:"m22 10-7.5 7.5L13 16",key:"ke71qq"}]],Re=a("check-check",B);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const T=[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]],Ke=a("check",T);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const D=[["path",{d:"m6 9 6 6 6-6",key:"qrunsl"}]],We=a("chevron-down",D);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const E=[["path",{d:"M21.801 10A10 10 0 1 1 17 3.335",key:"yps3ct"}],["path",{d:"m9 11 3 3L22 4",key:"1pflzl"}]],P=a("circle-check-big",E);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const F=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"m15 9-6 6",key:"1uzhvr"}],["path",{d:"m9 9 6 6",key:"z0biqf"}]],I=a("circle-x",F);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const U=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M12 6v6l4 2",key:"mmk7yg"}]],Xe=a("clock",U);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const J=[["rect",{width:"20",height:"14",x:"2",y:"5",rx:"2",key:"ynyp8z"}],["line",{x1:"2",x2:"22",y1:"10",y2:"10",key:"1b3vmo"}]],Ge=a("credit-card",J);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const O=[["path",{d:"M15 3h6v6",key:"1q9fwt"}],["path",{d:"M10 14 21 3",key:"gplh6r"}],["path",{d:"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",key:"a6xqqp"}]],Ze=a("external-link",O);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const R=[["path",{d:"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",key:"1oefj6"}],["path",{d:"M14 2v5a1 1 0 0 0 1 1h5",key:"wfsgrz"}],["path",{d:"M10 9H8",key:"b1mrlr"}],["path",{d:"M16 13H8",key:"t4e002"}],["path",{d:"M16 17H8",key:"z1uh3a"}]],Ye=a("file-text",R);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const K=[["path",{d:"M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z",key:"sc7q7i"}]],Qe=a("funnel",K);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const W=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M12 16v-4",key:"1dtifu"}],["path",{d:"M12 8h.01",key:"e9boi3"}]],X=a("info",W);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const G=[["rect",{width:"7",height:"9",x:"3",y:"3",rx:"1",key:"10lvy0"}],["rect",{width:"7",height:"5",x:"14",y:"3",rx:"1",key:"16une8"}],["rect",{width:"7",height:"9",x:"14",y:"12",rx:"1",key:"1hutg5"}],["rect",{width:"7",height:"5",x:"3",y:"16",rx:"1",key:"ldoo1y"}]],et=a("layout-dashboard",G);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Z=[["path",{d:"M21 12a9 9 0 1 1-6.219-8.56",key:"13zald"}]],tt=a("loader-circle",Z);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Y=[["rect",{width:"18",height:"11",x:"3",y:"11",rx:"2",ry:"2",key:"1w4ew1"}],["path",{d:"M7 11V7a5 5 0 0 1 10 0v4",key:"fwvmzm"}]],at=a("lock",Y);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Q=[["path",{d:"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7",key:"132q7q"}],["rect",{x:"2",y:"4",width:"20",height:"16",rx:"2",key:"izxlao"}]],st=a("mail",Q);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ee=[["path",{d:"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",key:"18887p"}]],rt=a("message-square",ee);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const te=[["rect",{width:"20",height:"14",x:"2",y:"3",rx:"2",key:"48i651"}],["line",{x1:"8",x2:"16",y1:"21",y2:"21",key:"1svkeh"}],["line",{x1:"12",x2:"12",y1:"17",y2:"21",key:"vw1qmm"}]],ot=a("monitor",te);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ae=[["path",{d:"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401",key:"kfwtm"}]],nt=a("moon",ae);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const se=[["path",{d:"m15 9-6 6",key:"1uzhvr"}],["path",{d:"M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z",key:"2d38gg"}],["path",{d:"m9 9 6 6",key:"z0biqf"}]],ct=a("octagon-x",se);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const re=[["path",{d:"M13 21h8",key:"1jsn5i"}],["path",{d:"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",key:"1a8usu"}]],dt=a("pen-line",re);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const oe=[["path",{d:"M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384",key:"9njp5v"}]],lt=a("phone",oe);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ne=[["path",{d:"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z",key:"10ikf1"}]],it=a("play",ne);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ce=[["path",{d:"m21 21-4.34-4.34",key:"14j7rj"}],["circle",{cx:"11",cy:"11",r:"8",key:"4ej97u"}]],ht=a("search",ce);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const de=[["path",{d:"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z",key:"1ffxy3"}],["path",{d:"m21.854 2.147-10.94 10.939",key:"12cjpa"}]],pt=a("send",de);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const le=[["path",{d:"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",key:"1i5ecw"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]],mt=a("settings",le);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ie=[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]],yt=a("shield-check",ie);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const he=[["path",{d:"M10 5H3",key:"1qgfaw"}],["path",{d:"M12 19H3",key:"yhmn1j"}],["path",{d:"M14 3v4",key:"1sua03"}],["path",{d:"M16 17v4",key:"1q0r14"}],["path",{d:"M21 12h-9",key:"1o4lsq"}],["path",{d:"M21 19h-5",key:"1rlt1p"}],["path",{d:"M21 5h-7",key:"1oszz2"}],["path",{d:"M8 10v4",key:"tgpxqk"}],["path",{d:"M8 12H3",key:"a7s4jb"}]],xt=a("sliders-horizontal",he);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const pe=[["path",{d:"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",key:"r04s7s"}]],ut=a("star",pe);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const me=[["circle",{cx:"12",cy:"12",r:"4",key:"4exip2"}],["path",{d:"M12 2v2",key:"tus03m"}],["path",{d:"M12 20v2",key:"1lh1kg"}],["path",{d:"m4.93 4.93 1.41 1.41",key:"149t6j"}],["path",{d:"m17.66 17.66 1.41 1.41",key:"ptbguv"}],["path",{d:"M2 12h2",key:"1t8f8n"}],["path",{d:"M20 12h2",key:"1q8mjw"}],["path",{d:"m6.34 17.66-1.41 1.41",key:"1m8zz5"}],["path",{d:"m19.07 4.93-1.41 1.41",key:"1shlcs"}]],kt=a("sun",me);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ye=[["path",{d:"M10 11v6",key:"nco0om"}],["path",{d:"M14 11v6",key:"outv1u"}],["path",{d:"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",key:"miytrc"}],["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",key:"e791ji"}]],bt=a("trash-2",ye);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const xe=[["path",{d:"M16 7h6v6",key:"box55l"}],["path",{d:"m22 7-8.5 8.5-5-5L2 17",key:"1t1m79"}]],ft=a("trending-up",xe);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ue=[["path",{d:"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",key:"wmoenq"}],["path",{d:"M12 9v4",key:"juzpu7"}],["path",{d:"M12 17h.01",key:"p32p05"}]],ke=a("triangle-alert",ue);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const be=[["path",{d:"M18 6 6 18",key:"1bl5f8"}],["path",{d:"m6 6 12 12",key:"d8bk6v"}]],fe=a("x",be),ge=l.createContext(null);let _e=0;function gt({children:s}){const[o,e]=l.useState([]),n=l.useCallback(t=>{e(i=>i.filter(m=>m.id!==t))},[]),c=l.useCallback(t=>{const i=`toast-${++_e}`;return e(m=>[...m.slice(-4),{...t,id:i}]),i},[]),d=l.useCallback((t,i)=>c({type:"success",title:t,message:i}),[c]),h=l.useCallback((t,i)=>c({type:"error",title:t,message:i,duration:6e3}),[c]),p=l.useCallback((t,i)=>c({type:"warning",title:t,message:i}),[c]),y=l.useCallback((t,i)=>c({type:"info",title:t,message:i}),[c]),x={toast:c,success:d,error:h,warning:p,info:y,dismiss:n};return r.jsxs(ge.Provider,{value:x,children:[s,r.jsx("div",{className:"fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none","aria-live":"polite","aria-label":"Notifications",children:o.map(t=>r.jsx(Me,{toast:t,onDismiss:n},t.id))})]})}const ve={success:P,error:I,warning:ke,info:X},we={success:{border:"border-emerald-500/30",icon:"text-emerald-500",bg:"bg-emerald-500/5"},error:{border:"border-red-500/30",icon:"text-red-500",bg:"bg-red-500/5"},warning:{border:"border-amber-500/30",icon:"text-amber-500",bg:"bg-amber-500/5"},info:{border:"border-blue-500/30",icon:"text-blue-500",bg:"bg-blue-500/5"}};function Me({toast:s,onDismiss:o}){const[e,n]=l.useState(!1);l.useEffect(()=>{requestAnimationFrame(()=>n(!0));const h=setTimeout(()=>{n(!1),setTimeout(()=>o(s.id),200)},s.duration||4e3);return()=>clearTimeout(h)},[s.id,s.duration,o]);const c=ve[s.type],d=we[s.type];return r.jsxs("div",{className:`
        pointer-events-auto max-w-sm w-full
        rounded-lg border shadow-lg backdrop-blur-sm
        px-4 py-3 flex items-start gap-3
        transition-all duration-200
        ${d.border} ${d.bg}
        ${e?"translate-x-0 opacity-100":"translate-x-8 opacity-0"}
      `,style:{backgroundColor:"var(--bg-surface, #fff)"},role:"alert",children:[r.jsx(c,{className:`w-5 h-5 flex-shrink-0 mt-0.5 ${d.icon}`}),r.jsxs("div",{className:"flex-1 min-w-0",children:[r.jsx("p",{className:"text-sm font-medium text-text-primary",children:s.title}),s.message&&r.jsx("p",{className:"text-xs text-text-secondary mt-0.5",children:s.message})]}),r.jsx("button",{onClick:()=>{n(!1),setTimeout(()=>o(s.id),200)},className:"p-0.5 rounded hover:bg-black/5 text-text-faint hover:text-text-secondary transition-colors flex-shrink-0","aria-label":"Dismiss",children:r.jsx(fe,{className:"w-3.5 h-3.5"})})]})}const Ne={primary:"bg-accent text-white border-accent hover:opacity-90 active:opacity-80",secondary:"bg-bg-card text-text border-border hover:border-border-hover hover:text-text active:bg-bg-hover",ghost:"bg-transparent text-text-dim border-transparent hover:bg-bg-hover hover:text-text active:bg-bg-input",danger:"bg-red text-white border-red hover:opacity-90 active:opacity-80"},$e={sm:"px-3 py-1.5 text-xs rounded-sm gap-1.5",md:"px-4 py-2 text-sm rounded-md gap-2",lg:"px-5 py-2.5 text-base rounded-md gap-2"};function _t({variant:s="secondary",size:o="md",loading:e=!1,icon:n,fullWidth:c=!1,disabled:d,className:h="",children:p,...y}){const x="inline-flex items-center justify-center border font-medium transition-all cursor-pointer select-none",t=d||e?"opacity-50 cursor-not-allowed":"",i=c?"w-full":"";return r.jsxs("button",{className:`${x} ${Ne[s]} ${$e[o]} ${t} ${i} ${h}`,disabled:d||e,...y,children:[e?r.jsx("span",{className:"inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"}):n?r.jsx("span",{className:"flex-shrink-0",children:n}):null,p]})}const Ce={default:"bg-bg-card border border-border",elevated:"bg-bg-card border border-border shadow-md",outline:"bg-transparent border border-border",inset:"bg-bg-input border border-border"},je={none:"",sm:"p-3",md:"p-4",lg:"p-6"};function vt({variant:s="default",padding:o="md",as:e="div",className:n="",children:c,...d}){return r.jsx(e,{className:`rounded-lg ${Ce[s]} ${je[o]} ${n}`,...d,children:c})}const ze={default:"bg-bg-input text-text-dim border-border",secondary:"bg-bg-card text-text-muted border-border/50",success:"bg-green-dim text-green border-green/20",warning:"bg-warm-dim text-warm border-warm/20",error:"bg-red-dim text-red border-red/20",info:"bg-accent-dim text-accent border-accent/20",purple:"bg-purple-dim text-purple border-purple/20"},Ae={sm:"px-1.5 py-0.5 text-[10px]",md:"px-2 py-0.5 text-xs"};function wt({variant:s="default",size:o="md",dot:e=!1,className:n="",children:c,...d}){return r.jsxs("span",{className:`inline-flex items-center gap-1 font-medium rounded-full border ${ze[s]} ${Ae[o]} ${n}`,...d,children:[e&&r.jsx("span",{className:"w-1.5 h-1.5 rounded-full bg-current flex-shrink-0"}),c]})}const qe={sm:"max-w-sm",md:"max-w-md",lg:"max-w-lg",xl:"max-w-2xl"};function Le({open:s,onClose:o,title:e,size:n="md",children:c,footer:d}){const h=l.useRef(null),p=l.useRef(null);l.useEffect(()=>{s?(p.current=document.activeElement,h.current?.focus()):p.current?.focus()},[s]);const y=l.useCallback(t=>{t.key==="Escape"&&(t.stopPropagation(),o())},[o]),x=l.useCallback(t=>{t.target===t.currentTarget&&o()},[o]);return s?r.jsxs("div",{className:"fixed inset-0 z-40 flex items-center justify-center p-4 animate-modal-fade",role:"presentation",onClick:x,children:[r.jsx("div",{className:"absolute inset-0 bg-black/50","aria-hidden":"true"}),r.jsxs("dialog",{ref:h,open:!0,className:`
          relative z-50 w-full ${qe[n]}
          bg-bg-card border border-border rounded-lg
          shadow-xl
          animate-modal-slide
          max-h-[85vh] overflow-hidden flex flex-col
        `,role:"dialog","aria-modal":"true","aria-labelledby":e?"modal-title":void 0,onKeyDown:y,tabIndex:-1,children:[e&&r.jsxs("div",{className:"flex items-center justify-between px-5 py-4 border-b border-border",children:[r.jsx("h2",{id:"modal-title",className:"text-lg font-semibold text-text",children:e}),r.jsx("button",{onClick:o,className:"text-text-faint hover:text-text p-1 rounded-md hover:bg-bg-hover transition-all","aria-label":"Close dialog",children:r.jsx("svg",{width:"16",height:"16",viewBox:"0 0 16 16",fill:"none",stroke:"currentColor",strokeWidth:"2","aria-hidden":"true",children:r.jsx("path",{d:"M4 4l8 8M12 4l-8 8"})})})]}),r.jsx("div",{className:"flex-1 overflow-y-auto px-5 py-4",children:c}),d&&r.jsx("div",{className:"flex items-center justify-end gap-2 px-5 py-3 border-t border-border",children:d})]})]}):null}function Mt({jobId:s,onClose:o}){const[e,n]=l.useState(null),[c,d]=l.useState(!1),[h,p]=l.useState(null),y=l.useCallback(async t=>{d(!0),p(null);try{const{data:i,error:m}=await f.from("ats_jobs").select("greenhouse_id, title, company_name, location, salary_min, salary_max, salary_currency, salary_rate, ats_source, url, content, created_at, updated_at").eq("greenhouse_id",t).single();if(m)throw m;n(i)}catch(i){p(i?.message||"Failed to load job")}finally{d(!1)}},[]);l.useEffect(()=>{s?y(s):n(null)},[s,y]);const x=t=>{if(!t.salary_min&&!t.salary_max)return null;const i=t.salary_currency||"USD",m=b=>new Intl.NumberFormat("en-US",{style:"currency",currency:i,maximumFractionDigits:0}).format(b);return t.salary_min&&t.salary_max?`${m(t.salary_min)} – ${m(t.salary_max)}${t.salary_rate?` / ${t.salary_rate}`:""}`:t.salary_min?`${m(t.salary_min)}+${t.salary_rate?` / ${t.salary_rate}`:""}`:t.salary_max?`Up to ${m(t.salary_max)}${t.salary_rate?` / ${t.salary_rate}`:""}`:null};return r.jsxs(Le,{open:!!s,onClose:o,title:e?.title||"Job Details",size:"xl",footer:e?.url?r.jsxs("a",{href:e.url,target:"_blank",rel:"noopener noreferrer",className:"px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:opacity-90",children:["View on ",e.ats_source||"Career Page"]}):void 0,children:[c&&r.jsx("div",{className:"flex items-center justify-center py-12",children:r.jsx("div",{className:"w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"})}),h&&r.jsx("div",{className:"text-red-500 text-sm py-4",children:h}),e&&!c&&r.jsxs("div",{className:"space-y-4",children:[r.jsxs("div",{className:"flex flex-wrap gap-2 text-sm text-text-dim",children:[e.company_name&&r.jsx("span",{className:"font-medium text-text",children:e.company_name}),e.location&&r.jsxs("span",{children:["· ",e.location]}),e.ats_source&&r.jsxs("span",{children:["· ",e.ats_source]})]}),x(e)&&r.jsx("div",{className:"text-sm font-medium text-accent",children:x(e)}),r.jsxs("div",{className:"flex gap-4 text-xs text-text-faint",children:[e.created_at&&r.jsxs("span",{children:["Posted: ",new Date(e.created_at).toLocaleDateString()]}),e.updated_at&&r.jsxs("span",{children:["Updated: ",new Date(e.updated_at).toLocaleDateString()]})]}),e.content&&r.jsxs("div",{className:"border-t border-border pt-4",children:[r.jsx("h3",{className:"text-sm font-semibold text-text mb-2",children:"Job Description"}),r.jsx("div",{className:"text-sm text-text-dim leading-relaxed prose prose-sm max-w-none",dangerouslySetInnerHTML:{__html:e.content}})]})]})]})}export{Ve as A,Je as B,vt as C,We as D,Ze as E,Ye as F,Re as G,Te as H,Ke as I,Mt as J,st as K,et as L,ot as M,lt as N,ct as O,dt as P,ht as S,ft as T,fe as X,Xe as a,De as b,Ue as c,yt as d,ut as e,xt as f,Ee as g,Oe as h,mt as i,Ge as j,at as k,nt as l,kt as m,gt as n,_t as o,wt as p,rt as q,bt as r,tt as s,pt as t,Pe as u,Be as v,Qe as w,Ie as x,Fe as y,it as z};
//# sourceMappingURL=design-system-DGqL04UE.js.map
