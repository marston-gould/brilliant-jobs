var dn={};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Zn=function(t){const e=[];let n=0;for(let r=0;r<t.length;r++){let s=t.charCodeAt(r);s<128?e[n++]=s:s<2048?(e[n++]=s>>6|192,e[n++]=s&63|128):(s&64512)===55296&&r+1<t.length&&(t.charCodeAt(r+1)&64512)===56320?(s=65536+((s&1023)<<10)+(t.charCodeAt(++r)&1023),e[n++]=s>>18|240,e[n++]=s>>12&63|128,e[n++]=s>>6&63|128,e[n++]=s&63|128):(e[n++]=s>>12|224,e[n++]=s>>6&63|128,e[n++]=s&63|128)}return e},Ms=function(t){const e=[];let n=0,r=0;for(;n<t.length;){const s=t[n++];if(s<128)e[r++]=String.fromCharCode(s);else if(s>191&&s<224){const i=t[n++];e[r++]=String.fromCharCode((s&31)<<6|i&63)}else if(s>239&&s<365){const i=t[n++],o=t[n++],a=t[n++],c=((s&7)<<18|(i&63)<<12|(o&63)<<6|a&63)-65536;e[r++]=String.fromCharCode(55296+(c>>10)),e[r++]=String.fromCharCode(56320+(c&1023))}else{const i=t[n++],o=t[n++];e[r++]=String.fromCharCode((s&15)<<12|(i&63)<<6|o&63)}}return e.join("")},er={byteToCharMap_:null,charToByteMap_:null,byteToCharMapWebSafe_:null,charToByteMapWebSafe_:null,ENCODED_VALS_BASE:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",get ENCODED_VALS(){return this.ENCODED_VALS_BASE+"+/="},get ENCODED_VALS_WEBSAFE(){return this.ENCODED_VALS_BASE+"-_."},HAS_NATIVE_SUPPORT:typeof atob=="function",encodeByteArray(t,e){if(!Array.isArray(t))throw Error("encodeByteArray takes an array as a parameter");this.init_();const n=e?this.byteToCharMapWebSafe_:this.byteToCharMap_,r=[];for(let s=0;s<t.length;s+=3){const i=t[s],o=s+1<t.length,a=o?t[s+1]:0,c=s+2<t.length,l=c?t[s+2]:0,u=i>>2,h=(i&3)<<4|a>>4;let m=(a&15)<<2|l>>6,y=l&63;c||(y=64,o||(m=64)),r.push(n[u],n[h],n[m],n[y])}return r.join("")},encodeString(t,e){return this.HAS_NATIVE_SUPPORT&&!e?btoa(t):this.encodeByteArray(Zn(t),e)},decodeString(t,e){return this.HAS_NATIVE_SUPPORT&&!e?atob(t):Ms(this.decodeStringToByteArray(t,e))},decodeStringToByteArray(t,e){this.init_();const n=e?this.charToByteMapWebSafe_:this.charToByteMap_,r=[];for(let s=0;s<t.length;){const i=n[t.charAt(s++)],a=s<t.length?n[t.charAt(s)]:0;++s;const l=s<t.length?n[t.charAt(s)]:64;++s;const h=s<t.length?n[t.charAt(s)]:64;if(++s,i==null||a==null||l==null||h==null)throw new Ls;const m=i<<2|a>>4;if(r.push(m),l!==64){const y=a<<4&240|l>>2;if(r.push(y),h!==64){const f=l<<6&192|h;r.push(f)}}}return r},init_(){if(!this.byteToCharMap_){this.byteToCharMap_={},this.charToByteMap_={},this.byteToCharMapWebSafe_={},this.charToByteMapWebSafe_={};for(let t=0;t<this.ENCODED_VALS.length;t++)this.byteToCharMap_[t]=this.ENCODED_VALS.charAt(t),this.charToByteMap_[this.byteToCharMap_[t]]=t,this.byteToCharMapWebSafe_[t]=this.ENCODED_VALS_WEBSAFE.charAt(t),this.charToByteMapWebSafe_[this.byteToCharMapWebSafe_[t]]=t,t>=this.ENCODED_VALS_BASE.length&&(this.charToByteMap_[this.ENCODED_VALS_WEBSAFE.charAt(t)]=t,this.charToByteMapWebSafe_[this.ENCODED_VALS.charAt(t)]=t)}}};class Ls extends Error{constructor(){super(...arguments),this.name="DecodeBase64StringError"}}const xs=function(t){const e=Zn(t);return er.encodeByteArray(e,!0)},tr=function(t){return xs(t).replace(/\./g,"")},nr=function(t){try{return er.decodeString(t,!0)}catch(e){console.error("base64Decode failed: ",e)}return null};/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Fs(){if(typeof self<"u")return self;if(typeof window<"u")return window;if(typeof global<"u")return global;throw new Error("Unable to locate global object.")}/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Bs=()=>Fs().__FIREBASE_DEFAULTS__,js=()=>{if(typeof process>"u"||typeof dn>"u")return;const t=dn.__FIREBASE_DEFAULTS__;if(t)return JSON.parse(t)},$s=()=>{if(typeof document>"u")return;let t;try{t=document.cookie.match(/__FIREBASE_DEFAULTS__=([^;]+)/)}catch{return}const e=t&&nr(t[1]);return e&&JSON.parse(e)},Gt=()=>{try{return Bs()||js()||$s()}catch(t){console.info(`Unable to get __FIREBASE_DEFAULTS__ due to: ${t}`);return}},Hs=t=>{var e,n;return(n=(e=Gt())===null||e===void 0?void 0:e.emulatorHosts)===null||n===void 0?void 0:n[t]},rr=()=>{var t;return(t=Gt())===null||t===void 0?void 0:t.config},sr=t=>{var e;return(e=Gt())===null||e===void 0?void 0:e[`_${t}`]};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Vs{constructor(){this.reject=()=>{},this.resolve=()=>{},this.promise=new Promise((e,n)=>{this.resolve=e,this.reject=n})}wrapCallback(e){return(n,r)=>{n?this.reject(n):this.resolve(r),typeof e=="function"&&(this.promise.catch(()=>{}),e.length===1?e(n):e(n,r))}}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function k(){return typeof navigator<"u"&&typeof navigator.userAgent=="string"?navigator.userAgent:""}function zs(){return typeof window<"u"&&!!(window.cordova||window.phonegap||window.PhoneGap)&&/ios|iphone|ipod|ipad|android|blackberry|iemobile/i.test(k())}function Ws(){return typeof navigator<"u"&&navigator.userAgent==="Cloudflare-Workers"}function qs(){const t=typeof chrome=="object"?chrome.runtime:typeof browser=="object"?browser.runtime:void 0;return typeof t=="object"&&t.id!==void 0}function Gs(){return typeof navigator=="object"&&navigator.product==="ReactNative"}function Ks(){const t=k();return t.indexOf("MSIE ")>=0||t.indexOf("Trident/")>=0}function Js(){try{return typeof indexedDB=="object"}catch{return!1}}function Xs(){return new Promise((t,e)=>{try{let n=!0;const r="validate-browser-context-for-indexeddb-analytics-module",s=self.indexedDB.open(r);s.onsuccess=()=>{s.result.close(),n||self.indexedDB.deleteDatabase(r),t(!0)},s.onupgradeneeded=()=>{n=!1},s.onerror=()=>{var i;e(((i=s.error)===null||i===void 0?void 0:i.message)||"")}}catch(n){e(n)}})}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ys="FirebaseError";class re extends Error{constructor(e,n,r){super(n),this.code=e,this.customData=r,this.name=Ys,Object.setPrototypeOf(this,re.prototype),Error.captureStackTrace&&Error.captureStackTrace(this,De.prototype.create)}}class De{constructor(e,n,r){this.service=e,this.serviceName=n,this.errors=r}create(e,...n){const r=n[0]||{},s=`${this.service}/${e}`,i=this.errors[e],o=i?Qs(i,r):"Error",a=`${this.serviceName}: ${o} (${s}).`;return new re(s,a,r)}}function Qs(t,e){return t.replace(Zs,(n,r)=>{const s=e[r];return s!=null?String(s):`<${r}?>`})}const Zs=/\{\$([^}]+)}/g;function ei(t){for(const e in t)if(Object.prototype.hasOwnProperty.call(t,e))return!1;return!0}function Ye(t,e){if(t===e)return!0;const n=Object.keys(t),r=Object.keys(e);for(const s of n){if(!r.includes(s))return!1;const i=t[s],o=e[s];if(hn(i)&&hn(o)){if(!Ye(i,o))return!1}else if(i!==o)return!1}for(const s of r)if(!n.includes(s))return!1;return!0}function hn(t){return t!==null&&typeof t=="object"}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Ue(t){const e=[];for(const[n,r]of Object.entries(t))Array.isArray(r)?r.forEach(s=>{e.push(encodeURIComponent(n)+"="+encodeURIComponent(s))}):e.push(encodeURIComponent(n)+"="+encodeURIComponent(r));return e.length?"&"+e.join("&"):""}function ti(t,e){const n=new ni(t,e);return n.subscribe.bind(n)}class ni{constructor(e,n){this.observers=[],this.unsubscribes=[],this.observerCount=0,this.task=Promise.resolve(),this.finalized=!1,this.onNoObservers=n,this.task.then(()=>{e(this)}).catch(r=>{this.error(r)})}next(e){this.forEachObserver(n=>{n.next(e)})}error(e){this.forEachObserver(n=>{n.error(e)}),this.close(e)}complete(){this.forEachObserver(e=>{e.complete()}),this.close()}subscribe(e,n,r){let s;if(e===void 0&&n===void 0&&r===void 0)throw new Error("Missing Observer.");ri(e,["next","error","complete"])?s=e:s={next:e,error:n,complete:r},s.next===void 0&&(s.next=bt),s.error===void 0&&(s.error=bt),s.complete===void 0&&(s.complete=bt);const i=this.unsubscribeOne.bind(this,this.observers.length);return this.finalized&&this.task.then(()=>{try{this.finalError?s.error(this.finalError):s.complete()}catch{}}),this.observers.push(s),i}unsubscribeOne(e){this.observers===void 0||this.observers[e]===void 0||(delete this.observers[e],this.observerCount-=1,this.observerCount===0&&this.onNoObservers!==void 0&&this.onNoObservers(this))}forEachObserver(e){if(!this.finalized)for(let n=0;n<this.observers.length;n++)this.sendOne(n,e)}sendOne(e,n){this.task.then(()=>{if(this.observers!==void 0&&this.observers[e]!==void 0)try{n(this.observers[e])}catch(r){typeof console<"u"&&console.error&&console.error(r)}})}close(e){this.finalized||(this.finalized=!0,e!==void 0&&(this.finalError=e),this.task.then(()=>{this.observers=void 0,this.onNoObservers=void 0}))}}function ri(t,e){if(typeof t!="object"||t===null)return!1;for(const n of e)if(n in t&&typeof t[n]=="function")return!0;return!1}function bt(){}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function he(t){return t&&t._delegate?t._delegate:t}class ve{constructor(e,n,r){this.name=e,this.instanceFactory=n,this.type=r,this.multipleInstances=!1,this.serviceProps={},this.instantiationMode="LAZY",this.onInstanceCreated=null}setInstantiationMode(e){return this.instantiationMode=e,this}setMultipleInstances(e){return this.multipleInstances=e,this}setServiceProps(e){return this.serviceProps=e,this}setInstanceCreatedCallback(e){return this.onInstanceCreated=e,this}}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const ie="[DEFAULT]";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class si{constructor(e,n){this.name=e,this.container=n,this.component=null,this.instances=new Map,this.instancesDeferred=new Map,this.instancesOptions=new Map,this.onInitCallbacks=new Map}get(e){const n=this.normalizeInstanceIdentifier(e);if(!this.instancesDeferred.has(n)){const r=new Vs;if(this.instancesDeferred.set(n,r),this.isInitialized(n)||this.shouldAutoInitialize())try{const s=this.getOrInitializeService({instanceIdentifier:n});s&&r.resolve(s)}catch{}}return this.instancesDeferred.get(n).promise}getImmediate(e){var n;const r=this.normalizeInstanceIdentifier(e==null?void 0:e.identifier),s=(n=e==null?void 0:e.optional)!==null&&n!==void 0?n:!1;if(this.isInitialized(r)||this.shouldAutoInitialize())try{return this.getOrInitializeService({instanceIdentifier:r})}catch(i){if(s)return null;throw i}else{if(s)return null;throw Error(`Service ${this.name} is not available`)}}getComponent(){return this.component}setComponent(e){if(e.name!==this.name)throw Error(`Mismatching Component ${e.name} for Provider ${this.name}.`);if(this.component)throw Error(`Component for ${this.name} has already been provided`);if(this.component=e,!!this.shouldAutoInitialize()){if(oi(e))try{this.getOrInitializeService({instanceIdentifier:ie})}catch{}for(const[n,r]of this.instancesDeferred.entries()){const s=this.normalizeInstanceIdentifier(n);try{const i=this.getOrInitializeService({instanceIdentifier:s});r.resolve(i)}catch{}}}}clearInstance(e=ie){this.instancesDeferred.delete(e),this.instancesOptions.delete(e),this.instances.delete(e)}async delete(){const e=Array.from(this.instances.values());await Promise.all([...e.filter(n=>"INTERNAL"in n).map(n=>n.INTERNAL.delete()),...e.filter(n=>"_delete"in n).map(n=>n._delete())])}isComponentSet(){return this.component!=null}isInitialized(e=ie){return this.instances.has(e)}getOptions(e=ie){return this.instancesOptions.get(e)||{}}initialize(e={}){const{options:n={}}=e,r=this.normalizeInstanceIdentifier(e.instanceIdentifier);if(this.isInitialized(r))throw Error(`${this.name}(${r}) has already been initialized`);if(!this.isComponentSet())throw Error(`Component ${this.name} has not been registered yet`);const s=this.getOrInitializeService({instanceIdentifier:r,options:n});for(const[i,o]of this.instancesDeferred.entries()){const a=this.normalizeInstanceIdentifier(i);r===a&&o.resolve(s)}return s}onInit(e,n){var r;const s=this.normalizeInstanceIdentifier(n),i=(r=this.onInitCallbacks.get(s))!==null&&r!==void 0?r:new Set;i.add(e),this.onInitCallbacks.set(s,i);const o=this.instances.get(s);return o&&e(o,s),()=>{i.delete(e)}}invokeOnInitCallbacks(e,n){const r=this.onInitCallbacks.get(n);if(r)for(const s of r)try{s(e,n)}catch{}}getOrInitializeService({instanceIdentifier:e,options:n={}}){let r=this.instances.get(e);if(!r&&this.component&&(r=this.component.instanceFactory(this.container,{instanceIdentifier:ii(e),options:n}),this.instances.set(e,r),this.instancesOptions.set(e,n),this.invokeOnInitCallbacks(r,e),this.component.onInstanceCreated))try{this.component.onInstanceCreated(this.container,e,r)}catch{}return r||null}normalizeInstanceIdentifier(e=ie){return this.component?this.component.multipleInstances?e:ie:e}shouldAutoInitialize(){return!!this.component&&this.component.instantiationMode!=="EXPLICIT"}}function ii(t){return t===ie?void 0:t}function oi(t){return t.instantiationMode==="EAGER"}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class ai{constructor(e){this.name=e,this.providers=new Map}addComponent(e){const n=this.getProvider(e.name);if(n.isComponentSet())throw new Error(`Component ${e.name} has already been registered with ${this.name}`);n.setComponent(e)}addOrOverwriteComponent(e){this.getProvider(e.name).isComponentSet()&&this.providers.delete(e.name),this.addComponent(e)}getProvider(e){if(this.providers.has(e))return this.providers.get(e);const n=new si(e,this);return this.providers.set(e,n),n}getProviders(){return Array.from(this.providers.values())}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */var E;(function(t){t[t.DEBUG=0]="DEBUG",t[t.VERBOSE=1]="VERBOSE",t[t.INFO=2]="INFO",t[t.WARN=3]="WARN",t[t.ERROR=4]="ERROR",t[t.SILENT=5]="SILENT"})(E||(E={}));const ci={debug:E.DEBUG,verbose:E.VERBOSE,info:E.INFO,warn:E.WARN,error:E.ERROR,silent:E.SILENT},li=E.INFO,ui={[E.DEBUG]:"log",[E.VERBOSE]:"log",[E.INFO]:"info",[E.WARN]:"warn",[E.ERROR]:"error"},di=(t,e,...n)=>{if(e<t.logLevel)return;const r=new Date().toISOString(),s=ui[e];if(s)console[s](`[${r}]  ${t.name}:`,...n);else throw new Error(`Attempted to log a message with an invalid logType (value: ${e})`)};class ir{constructor(e){this.name=e,this._logLevel=li,this._logHandler=di,this._userLogHandler=null}get logLevel(){return this._logLevel}set logLevel(e){if(!(e in E))throw new TypeError(`Invalid value "${e}" assigned to \`logLevel\``);this._logLevel=e}setLogLevel(e){this._logLevel=typeof e=="string"?ci[e]:e}get logHandler(){return this._logHandler}set logHandler(e){if(typeof e!="function")throw new TypeError("Value assigned to `logHandler` must be a function");this._logHandler=e}get userLogHandler(){return this._userLogHandler}set userLogHandler(e){this._userLogHandler=e}debug(...e){this._userLogHandler&&this._userLogHandler(this,E.DEBUG,...e),this._logHandler(this,E.DEBUG,...e)}log(...e){this._userLogHandler&&this._userLogHandler(this,E.VERBOSE,...e),this._logHandler(this,E.VERBOSE,...e)}info(...e){this._userLogHandler&&this._userLogHandler(this,E.INFO,...e),this._logHandler(this,E.INFO,...e)}warn(...e){this._userLogHandler&&this._userLogHandler(this,E.WARN,...e),this._logHandler(this,E.WARN,...e)}error(...e){this._userLogHandler&&this._userLogHandler(this,E.ERROR,...e),this._logHandler(this,E.ERROR,...e)}}const hi=(t,e)=>e.some(n=>t instanceof n);let fn,pn;function fi(){return fn||(fn=[IDBDatabase,IDBObjectStore,IDBIndex,IDBCursor,IDBTransaction])}function pi(){return pn||(pn=[IDBCursor.prototype.advance,IDBCursor.prototype.continue,IDBCursor.prototype.continuePrimaryKey])}const or=new WeakMap,Pt=new WeakMap,ar=new WeakMap,Et=new WeakMap,Kt=new WeakMap;function mi(t){const e=new Promise((n,r)=>{const s=()=>{t.removeEventListener("success",i),t.removeEventListener("error",o)},i=()=>{n(ee(t.result)),s()},o=()=>{r(t.error),s()};t.addEventListener("success",i),t.addEventListener("error",o)});return e.then(n=>{n instanceof IDBCursor&&or.set(n,t)}).catch(()=>{}),Kt.set(e,t),e}function gi(t){if(Pt.has(t))return;const e=new Promise((n,r)=>{const s=()=>{t.removeEventListener("complete",i),t.removeEventListener("error",o),t.removeEventListener("abort",o)},i=()=>{n(),s()},o=()=>{r(t.error||new DOMException("AbortError","AbortError")),s()};t.addEventListener("complete",i),t.addEventListener("error",o),t.addEventListener("abort",o)});Pt.set(t,e)}let Nt={get(t,e,n){if(t instanceof IDBTransaction){if(e==="done")return Pt.get(t);if(e==="objectStoreNames")return t.objectStoreNames||ar.get(t);if(e==="store")return n.objectStoreNames[1]?void 0:n.objectStore(n.objectStoreNames[0])}return ee(t[e])},set(t,e,n){return t[e]=n,!0},has(t,e){return t instanceof IDBTransaction&&(e==="done"||e==="store")?!0:e in t}};function _i(t){Nt=t(Nt)}function wi(t){return t===IDBDatabase.prototype.transaction&&!("objectStoreNames"in IDBTransaction.prototype)?function(e,...n){const r=t.call(Tt(this),e,...n);return ar.set(r,e.sort?e.sort():[e]),ee(r)}:pi().includes(t)?function(...e){return t.apply(Tt(this),e),ee(or.get(this))}:function(...e){return ee(t.apply(Tt(this),e))}}function yi(t){return typeof t=="function"?wi(t):(t instanceof IDBTransaction&&gi(t),hi(t,fi())?new Proxy(t,Nt):t)}function ee(t){if(t instanceof IDBRequest)return mi(t);if(Et.has(t))return Et.get(t);const e=yi(t);return e!==t&&(Et.set(t,e),Kt.set(e,t)),e}const Tt=t=>Kt.get(t);function vi(t,e,{blocked:n,upgrade:r,blocking:s,terminated:i}={}){const o=indexedDB.open(t,e),a=ee(o);return r&&o.addEventListener("upgradeneeded",c=>{r(ee(o.result),c.oldVersion,c.newVersion,ee(o.transaction),c)}),n&&o.addEventListener("blocked",c=>n(c.oldVersion,c.newVersion,c)),a.then(c=>{i&&c.addEventListener("close",()=>i()),s&&c.addEventListener("versionchange",l=>s(l.oldVersion,l.newVersion,l))}).catch(()=>{}),a}const bi=["get","getKey","getAll","getAllKeys","count"],Ei=["put","add","delete","clear"],It=new Map;function mn(t,e){if(!(t instanceof IDBDatabase&&!(e in t)&&typeof e=="string"))return;if(It.get(e))return It.get(e);const n=e.replace(/FromIndex$/,""),r=e!==n,s=Ei.includes(n);if(!(n in(r?IDBIndex:IDBObjectStore).prototype)||!(s||bi.includes(n)))return;const i=async function(o,...a){const c=this.transaction(o,s?"readwrite":"readonly");let l=c.store;return r&&(l=l.index(a.shift())),(await Promise.all([l[n](...a),s&&c.done]))[0]};return It.set(e,i),i}_i(t=>({...t,get:(e,n,r)=>mn(e,n)||t.get(e,n,r),has:(e,n)=>!!mn(e,n)||t.has(e,n)}));/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Ti{constructor(e){this.container=e}getPlatformInfoString(){return this.container.getProviders().map(n=>{if(Ii(n)){const r=n.getImmediate();return`${r.library}/${r.version}`}else return null}).filter(n=>n).join(" ")}}function Ii(t){const e=t.getComponent();return(e==null?void 0:e.type)==="VERSION"}const Dt="@firebase/app",gn="0.11.1";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const z=new ir("@firebase/app"),Si="@firebase/app-compat",Ai="@firebase/analytics-compat",Ri="@firebase/analytics",Ci="@firebase/app-check-compat",Oi="@firebase/app-check",ki="@firebase/auth",Pi="@firebase/auth-compat",Ni="@firebase/database",Di="@firebase/data-connect",Ui="@firebase/database-compat",Mi="@firebase/functions",Li="@firebase/functions-compat",xi="@firebase/installations",Fi="@firebase/installations-compat",Bi="@firebase/messaging",ji="@firebase/messaging-compat",$i="@firebase/performance",Hi="@firebase/performance-compat",Vi="@firebase/remote-config",zi="@firebase/remote-config-compat",Wi="@firebase/storage",qi="@firebase/storage-compat",Gi="@firebase/firestore",Ki="@firebase/vertexai",Ji="@firebase/firestore-compat",Xi="firebase",Yi="11.3.1";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ut="[DEFAULT]",Qi={[Dt]:"fire-core",[Si]:"fire-core-compat",[Ri]:"fire-analytics",[Ai]:"fire-analytics-compat",[Oi]:"fire-app-check",[Ci]:"fire-app-check-compat",[ki]:"fire-auth",[Pi]:"fire-auth-compat",[Ni]:"fire-rtdb",[Di]:"fire-data-connect",[Ui]:"fire-rtdb-compat",[Mi]:"fire-fn",[Li]:"fire-fn-compat",[xi]:"fire-iid",[Fi]:"fire-iid-compat",[Bi]:"fire-fcm",[ji]:"fire-fcm-compat",[$i]:"fire-perf",[Hi]:"fire-perf-compat",[Vi]:"fire-rc",[zi]:"fire-rc-compat",[Wi]:"fire-gcs",[qi]:"fire-gcs-compat",[Gi]:"fire-fst",[Ji]:"fire-fst-compat",[Ki]:"fire-vertex","fire-js":"fire-js",[Xi]:"fire-js-all"};/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Qe=new Map,Zi=new Map,Mt=new Map;function _n(t,e){try{t.container.addComponent(e)}catch(n){z.debug(`Component ${e.name} failed to register with FirebaseApp ${t.name}`,n)}}function Oe(t){const e=t.name;if(Mt.has(e))return z.debug(`There were multiple attempts to register component ${e}.`),!1;Mt.set(e,t);for(const n of Qe.values())_n(n,t);for(const n of Zi.values())_n(n,t);return!0}function cr(t,e){const n=t.container.getProvider("heartbeat").getImmediate({optional:!0});return n&&n.triggerHeartbeat(),t.container.getProvider(e)}function F(t){return t==null?!1:t.settings!==void 0}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const eo={"no-app":"No Firebase App '{$appName}' has been created - call initializeApp() first","bad-app-name":"Illegal App name: '{$appName}'","duplicate-app":"Firebase App named '{$appName}' already exists with different options or config","app-deleted":"Firebase App named '{$appName}' already deleted","server-app-deleted":"Firebase Server App has been deleted","no-options":"Need to provide options, when not being deployed to hosting via source.","invalid-app-argument":"firebase.{$appName}() takes either no argument or a Firebase App instance.","invalid-log-argument":"First argument to `onLog` must be null or a function.","idb-open":"Error thrown when opening IndexedDB. Original error: {$originalErrorMessage}.","idb-get":"Error thrown when reading from IndexedDB. Original error: {$originalErrorMessage}.","idb-set":"Error thrown when writing to IndexedDB. Original error: {$originalErrorMessage}.","idb-delete":"Error thrown when deleting from IndexedDB. Original error: {$originalErrorMessage}.","finalization-registry-not-supported":"FirebaseServerApp deleteOnDeref field defined but the JS runtime does not support FinalizationRegistry.","invalid-server-app-environment":"FirebaseServerApp is not for use in browser environments."},te=new De("app","Firebase",eo);/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class to{constructor(e,n,r){this._isDeleted=!1,this._options=Object.assign({},e),this._config=Object.assign({},n),this._name=n.name,this._automaticDataCollectionEnabled=n.automaticDataCollectionEnabled,this._container=r,this.container.addComponent(new ve("app",()=>this,"PUBLIC"))}get automaticDataCollectionEnabled(){return this.checkDestroyed(),this._automaticDataCollectionEnabled}set automaticDataCollectionEnabled(e){this.checkDestroyed(),this._automaticDataCollectionEnabled=e}get name(){return this.checkDestroyed(),this._name}get options(){return this.checkDestroyed(),this._options}get config(){return this.checkDestroyed(),this._config}get container(){return this._container}get isDeleted(){return this._isDeleted}set isDeleted(e){this._isDeleted=e}checkDestroyed(){if(this.isDeleted)throw te.create("app-deleted",{appName:this._name})}}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Me=Yi;function lr(t,e={}){let n=t;typeof e!="object"&&(e={name:e});const r=Object.assign({name:Ut,automaticDataCollectionEnabled:!1},e),s=r.name;if(typeof s!="string"||!s)throw te.create("bad-app-name",{appName:String(s)});if(n||(n=rr()),!n)throw te.create("no-options");const i=Qe.get(s);if(i){if(Ye(n,i.options)&&Ye(r,i.config))return i;throw te.create("duplicate-app",{appName:s})}const o=new ai(s);for(const c of Mt.values())o.addComponent(c);const a=new to(n,r,o);return Qe.set(s,a),a}function ur(t=Ut){const e=Qe.get(t);if(!e&&t===Ut&&rr())return lr();if(!e)throw te.create("no-app",{appName:t});return e}function ge(t,e,n){var r;let s=(r=Qi[t])!==null&&r!==void 0?r:t;n&&(s+=`-${n}`);const i=s.match(/\s|\//),o=e.match(/\s|\//);if(i||o){const a=[`Unable to register library "${s}" with version "${e}":`];i&&a.push(`library name "${s}" contains illegal characters (whitespace or "/")`),i&&o&&a.push("and"),o&&a.push(`version name "${e}" contains illegal characters (whitespace or "/")`),z.warn(a.join(" "));return}Oe(new ve(`${s}-version`,()=>({library:s,version:e}),"VERSION"))}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const no="firebase-heartbeat-database",ro=1,ke="firebase-heartbeat-store";let St=null;function dr(){return St||(St=vi(no,ro,{upgrade:(t,e)=>{switch(e){case 0:try{t.createObjectStore(ke)}catch(n){console.warn(n)}}}}).catch(t=>{throw te.create("idb-open",{originalErrorMessage:t.message})})),St}async function so(t){try{const n=(await dr()).transaction(ke),r=await n.objectStore(ke).get(hr(t));return await n.done,r}catch(e){if(e instanceof re)z.warn(e.message);else{const n=te.create("idb-get",{originalErrorMessage:e==null?void 0:e.message});z.warn(n.message)}}}async function wn(t,e){try{const r=(await dr()).transaction(ke,"readwrite");await r.objectStore(ke).put(e,hr(t)),await r.done}catch(n){if(n instanceof re)z.warn(n.message);else{const r=te.create("idb-set",{originalErrorMessage:n==null?void 0:n.message});z.warn(r.message)}}}function hr(t){return`${t.name}!${t.options.appId}`}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const io=1024,oo=30;class ao{constructor(e){this.container=e,this._heartbeatsCache=null;const n=this.container.getProvider("app").getImmediate();this._storage=new lo(n),this._heartbeatsCachePromise=this._storage.read().then(r=>(this._heartbeatsCache=r,r))}async triggerHeartbeat(){var e,n;try{const s=this.container.getProvider("platform-logger").getImmediate().getPlatformInfoString(),i=yn();if(((e=this._heartbeatsCache)===null||e===void 0?void 0:e.heartbeats)==null&&(this._heartbeatsCache=await this._heartbeatsCachePromise,((n=this._heartbeatsCache)===null||n===void 0?void 0:n.heartbeats)==null)||this._heartbeatsCache.lastSentHeartbeatDate===i||this._heartbeatsCache.heartbeats.some(o=>o.date===i))return;if(this._heartbeatsCache.heartbeats.push({date:i,agent:s}),this._heartbeatsCache.heartbeats.length>oo){const o=uo(this._heartbeatsCache.heartbeats);this._heartbeatsCache.heartbeats.splice(o,1)}return this._storage.overwrite(this._heartbeatsCache)}catch(r){z.warn(r)}}async getHeartbeatsHeader(){var e;try{if(this._heartbeatsCache===null&&await this._heartbeatsCachePromise,((e=this._heartbeatsCache)===null||e===void 0?void 0:e.heartbeats)==null||this._heartbeatsCache.heartbeats.length===0)return"";const n=yn(),{heartbeatsToSend:r,unsentEntries:s}=co(this._heartbeatsCache.heartbeats),i=tr(JSON.stringify({version:2,heartbeats:r}));return this._heartbeatsCache.lastSentHeartbeatDate=n,s.length>0?(this._heartbeatsCache.heartbeats=s,await this._storage.overwrite(this._heartbeatsCache)):(this._heartbeatsCache.heartbeats=[],this._storage.overwrite(this._heartbeatsCache)),i}catch(n){return z.warn(n),""}}}function yn(){return new Date().toISOString().substring(0,10)}function co(t,e=io){const n=[];let r=t.slice();for(const s of t){const i=n.find(o=>o.agent===s.agent);if(i){if(i.dates.push(s.date),vn(n)>e){i.dates.pop();break}}else if(n.push({agent:s.agent,dates:[s.date]}),vn(n)>e){n.pop();break}r=r.slice(1)}return{heartbeatsToSend:n,unsentEntries:r}}class lo{constructor(e){this.app=e,this._canUseIndexedDBPromise=this.runIndexedDBEnvironmentCheck()}async runIndexedDBEnvironmentCheck(){return Js()?Xs().then(()=>!0).catch(()=>!1):!1}async read(){if(await this._canUseIndexedDBPromise){const n=await so(this.app);return n!=null&&n.heartbeats?n:{heartbeats:[]}}else return{heartbeats:[]}}async overwrite(e){var n;if(await this._canUseIndexedDBPromise){const s=await this.read();return wn(this.app,{lastSentHeartbeatDate:(n=e.lastSentHeartbeatDate)!==null&&n!==void 0?n:s.lastSentHeartbeatDate,heartbeats:e.heartbeats})}else return}async add(e){var n;if(await this._canUseIndexedDBPromise){const s=await this.read();return wn(this.app,{lastSentHeartbeatDate:(n=e.lastSentHeartbeatDate)!==null&&n!==void 0?n:s.lastSentHeartbeatDate,heartbeats:[...s.heartbeats,...e.heartbeats]})}else return}}function vn(t){return tr(JSON.stringify({version:2,heartbeats:t})).length}function uo(t){if(t.length===0)return-1;let e=0,n=t[0].date;for(let r=1;r<t.length;r++)t[r].date<n&&(n=t[r].date,e=r);return e}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function ho(t){Oe(new ve("platform-logger",e=>new Ti(e),"PRIVATE")),Oe(new ve("heartbeat",e=>new ao(e),"PRIVATE")),ge(Dt,gn,t),ge(Dt,gn,"esm2017"),ge("fire-js","")}ho("");function Jt(t,e){var n={};for(var r in t)Object.prototype.hasOwnProperty.call(t,r)&&e.indexOf(r)<0&&(n[r]=t[r]);if(t!=null&&typeof Object.getOwnPropertySymbols=="function")for(var s=0,r=Object.getOwnPropertySymbols(t);s<r.length;s++)e.indexOf(r[s])<0&&Object.prototype.propertyIsEnumerable.call(t,r[s])&&(n[r[s]]=t[r[s]]);return n}function fr(){return{"dependent-sdk-initialized-before-auth":"Another Firebase SDK was initialized and is trying to use Auth before Auth is initialized. Please be sure to call `initializeAuth` or `getAuth` before starting any other Firebase SDK."}}const fo=fr,pr=new De("auth","Firebase",fr());/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ze=new ir("@firebase/auth");function po(t,...e){Ze.logLevel<=E.WARN&&Ze.warn(`Auth (${Me}): ${t}`,...e)}function ze(t,...e){Ze.logLevel<=E.ERROR&&Ze.error(`Auth (${Me}): ${t}`,...e)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function W(t,...e){throw Xt(t,...e)}function B(t,...e){return Xt(t,...e)}function mr(t,e,n){const r=Object.assign(Object.assign({},fo()),{[e]:n});return new De("auth","Firebase",r).create(e,{appName:t.name})}function ne(t){return mr(t,"operation-not-supported-in-this-environment","Operations that alter the current user are not supported in conjunction with FirebaseServerApp")}function Xt(t,...e){if(typeof t!="string"){const n=e[0],r=[...e.slice(1)];return r[0]&&(r[0].appName=t.name),t._errorFactory.create(n,...r)}return pr.create(t,...e)}function _(t,e,...n){if(!t)throw Xt(e,...n)}function $(t){const e="INTERNAL ASSERTION FAILED: "+t;throw ze(e),new Error(e)}function q(t,e){t||$(e)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Lt(){var t;return typeof self<"u"&&((t=self.location)===null||t===void 0?void 0:t.href)||""}function mo(){return bn()==="http:"||bn()==="https:"}function bn(){var t;return typeof self<"u"&&((t=self.location)===null||t===void 0?void 0:t.protocol)||null}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function go(){return typeof navigator<"u"&&navigator&&"onLine"in navigator&&typeof navigator.onLine=="boolean"&&(mo()||qs()||"connection"in navigator)?navigator.onLine:!0}function _o(){if(typeof navigator>"u")return null;const t=navigator;return t.languages&&t.languages[0]||t.language||null}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Le{constructor(e,n){this.shortDelay=e,this.longDelay=n,q(n>e,"Short delay should be less than long delay!"),this.isMobile=zs()||Gs()}get(){return go()?this.isMobile?this.longDelay:this.shortDelay:Math.min(5e3,this.shortDelay)}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Yt(t,e){q(t.emulator,"Emulator should always be set here");const{url:n}=t.emulator;return e?`${n}${e.startsWith("/")?e.slice(1):e}`:n}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class gr{static initialize(e,n,r){this.fetchImpl=e,n&&(this.headersImpl=n),r&&(this.responseImpl=r)}static fetch(){if(this.fetchImpl)return this.fetchImpl;if(typeof self<"u"&&"fetch"in self)return self.fetch;if(typeof globalThis<"u"&&globalThis.fetch)return globalThis.fetch;if(typeof fetch<"u")return fetch;$("Could not find fetch implementation, make sure you call FetchProvider.initialize() with an appropriate polyfill")}static headers(){if(this.headersImpl)return this.headersImpl;if(typeof self<"u"&&"Headers"in self)return self.Headers;if(typeof globalThis<"u"&&globalThis.Headers)return globalThis.Headers;if(typeof Headers<"u")return Headers;$("Could not find Headers implementation, make sure you call FetchProvider.initialize() with an appropriate polyfill")}static response(){if(this.responseImpl)return this.responseImpl;if(typeof self<"u"&&"Response"in self)return self.Response;if(typeof globalThis<"u"&&globalThis.Response)return globalThis.Response;if(typeof Response<"u")return Response;$("Could not find Response implementation, make sure you call FetchProvider.initialize() with an appropriate polyfill")}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const wo={CREDENTIAL_MISMATCH:"custom-token-mismatch",MISSING_CUSTOM_TOKEN:"internal-error",INVALID_IDENTIFIER:"invalid-email",MISSING_CONTINUE_URI:"internal-error",INVALID_PASSWORD:"wrong-password",MISSING_PASSWORD:"missing-password",INVALID_LOGIN_CREDENTIALS:"invalid-credential",EMAIL_EXISTS:"email-already-in-use",PASSWORD_LOGIN_DISABLED:"operation-not-allowed",INVALID_IDP_RESPONSE:"invalid-credential",INVALID_PENDING_TOKEN:"invalid-credential",FEDERATED_USER_ID_ALREADY_LINKED:"credential-already-in-use",MISSING_REQ_TYPE:"internal-error",EMAIL_NOT_FOUND:"user-not-found",RESET_PASSWORD_EXCEED_LIMIT:"too-many-requests",EXPIRED_OOB_CODE:"expired-action-code",INVALID_OOB_CODE:"invalid-action-code",MISSING_OOB_CODE:"internal-error",CREDENTIAL_TOO_OLD_LOGIN_AGAIN:"requires-recent-login",INVALID_ID_TOKEN:"invalid-user-token",TOKEN_EXPIRED:"user-token-expired",USER_NOT_FOUND:"user-token-expired",TOO_MANY_ATTEMPTS_TRY_LATER:"too-many-requests",PASSWORD_DOES_NOT_MEET_REQUIREMENTS:"password-does-not-meet-requirements",INVALID_CODE:"invalid-verification-code",INVALID_SESSION_INFO:"invalid-verification-id",INVALID_TEMPORARY_PROOF:"invalid-credential",MISSING_SESSION_INFO:"missing-verification-id",SESSION_EXPIRED:"code-expired",MISSING_ANDROID_PACKAGE_NAME:"missing-android-pkg-name",UNAUTHORIZED_DOMAIN:"unauthorized-continue-uri",INVALID_OAUTH_CLIENT_ID:"invalid-oauth-client-id",ADMIN_ONLY_OPERATION:"admin-restricted-operation",INVALID_MFA_PENDING_CREDENTIAL:"invalid-multi-factor-session",MFA_ENROLLMENT_NOT_FOUND:"multi-factor-info-not-found",MISSING_MFA_ENROLLMENT_ID:"missing-multi-factor-info",MISSING_MFA_PENDING_CREDENTIAL:"missing-multi-factor-session",SECOND_FACTOR_EXISTS:"second-factor-already-in-use",SECOND_FACTOR_LIMIT_EXCEEDED:"maximum-second-factor-count-exceeded",BLOCKING_FUNCTION_ERROR_RESPONSE:"internal-error",RECAPTCHA_NOT_ENABLED:"recaptcha-not-enabled",MISSING_RECAPTCHA_TOKEN:"missing-recaptcha-token",INVALID_RECAPTCHA_TOKEN:"invalid-recaptcha-token",INVALID_RECAPTCHA_ACTION:"invalid-recaptcha-action",MISSING_CLIENT_TYPE:"missing-client-type",MISSING_RECAPTCHA_VERSION:"missing-recaptcha-version",INVALID_RECAPTCHA_VERSION:"invalid-recaptcha-version",INVALID_REQ_TYPE:"invalid-req-type"};/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const yo=new Le(3e4,6e4);function ot(t,e){return t.tenantId&&!e.tenantId?Object.assign(Object.assign({},e),{tenantId:t.tenantId}):e}async function be(t,e,n,r,s={}){return _r(t,s,async()=>{let i={},o={};r&&(e==="GET"?o=r:i={body:JSON.stringify(r)});const a=Ue(Object.assign({key:t.config.apiKey},o)).slice(1),c=await t._getAdditionalHeaders();c["Content-Type"]="application/json",t.languageCode&&(c["X-Firebase-Locale"]=t.languageCode);const l=Object.assign({method:e,headers:c},i);return Ws()||(l.referrerPolicy="no-referrer"),gr.fetch()(yr(t,t.config.apiHost,n,a),l)})}async function _r(t,e,n){t._canInitEmulator=!1;const r=Object.assign(Object.assign({},wo),e);try{const s=new vo(t),i=await Promise.race([n(),s.promise]);s.clearNetworkTimeout();const o=await i.json();if("needConfirmation"in o)throw He(t,"account-exists-with-different-credential",o);if(i.ok&&!("errorMessage"in o))return o;{const a=i.ok?o.errorMessage:o.error.message,[c,l]=a.split(" : ");if(c==="FEDERATED_USER_ID_ALREADY_LINKED")throw He(t,"credential-already-in-use",o);if(c==="EMAIL_EXISTS")throw He(t,"email-already-in-use",o);if(c==="USER_DISABLED")throw He(t,"user-disabled",o);const u=r[c]||c.toLowerCase().replace(/[_\s]+/g,"-");if(l)throw mr(t,u,l);W(t,u)}}catch(s){if(s instanceof re)throw s;W(t,"network-request-failed",{message:String(s)})}}async function wr(t,e,n,r,s={}){const i=await be(t,e,n,r,s);return"mfaPendingCredential"in i&&W(t,"multi-factor-auth-required",{_serverResponse:i}),i}function yr(t,e,n,r){const s=`${e}${n}?${r}`;return t.config.emulator?Yt(t.config,s):`${t.config.apiScheme}://${s}`}class vo{clearNetworkTimeout(){clearTimeout(this.timer)}constructor(e){this.auth=e,this.timer=null,this.promise=new Promise((n,r)=>{this.timer=setTimeout(()=>r(B(this.auth,"network-request-failed")),yo.get())})}}function He(t,e,n){const r={appName:t.name};n.email&&(r.email=n.email),n.phoneNumber&&(r.phoneNumber=n.phoneNumber);const s=B(t,e,r);return s.customData._tokenResponse=n,s}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function bo(t,e){return be(t,"POST","/v1/accounts:delete",e)}async function vr(t,e){return be(t,"POST","/v1/accounts:lookup",e)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Ce(t){if(t)try{const e=new Date(Number(t));if(!isNaN(e.getTime()))return e.toUTCString()}catch{}}async function Eo(t,e=!1){const n=he(t),r=await n.getIdToken(e),s=Qt(r);_(s&&s.exp&&s.auth_time&&s.iat,n.auth,"internal-error");const i=typeof s.firebase=="object"?s.firebase:void 0,o=i==null?void 0:i.sign_in_provider;return{claims:s,token:r,authTime:Ce(At(s.auth_time)),issuedAtTime:Ce(At(s.iat)),expirationTime:Ce(At(s.exp)),signInProvider:o||null,signInSecondFactor:(i==null?void 0:i.sign_in_second_factor)||null}}function At(t){return Number(t)*1e3}function Qt(t){const[e,n,r]=t.split(".");if(e===void 0||n===void 0||r===void 0)return ze("JWT malformed, contained fewer than 3 sections"),null;try{const s=nr(n);return s?JSON.parse(s):(ze("Failed to decode base64 JWT payload"),null)}catch(s){return ze("Caught error parsing JWT payload as JSON",s==null?void 0:s.toString()),null}}function En(t){const e=Qt(t);return _(e,"internal-error"),_(typeof e.exp<"u","internal-error"),_(typeof e.iat<"u","internal-error"),Number(e.exp)-Number(e.iat)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Pe(t,e,n=!1){if(n)return e;try{return await e}catch(r){throw r instanceof re&&To(r)&&t.auth.currentUser===t&&await t.auth.signOut(),r}}function To({code:t}){return t==="auth/user-disabled"||t==="auth/user-token-expired"}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Io{constructor(e){this.user=e,this.isRunning=!1,this.timerId=null,this.errorBackoff=3e4}_start(){this.isRunning||(this.isRunning=!0,this.schedule())}_stop(){this.isRunning&&(this.isRunning=!1,this.timerId!==null&&clearTimeout(this.timerId))}getInterval(e){var n;if(e){const r=this.errorBackoff;return this.errorBackoff=Math.min(this.errorBackoff*2,96e4),r}else{this.errorBackoff=3e4;const s=((n=this.user.stsTokenManager.expirationTime)!==null&&n!==void 0?n:0)-Date.now()-3e5;return Math.max(0,s)}}schedule(e=!1){if(!this.isRunning)return;const n=this.getInterval(e);this.timerId=setTimeout(async()=>{await this.iteration()},n)}async iteration(){try{await this.user.getIdToken(!0)}catch(e){(e==null?void 0:e.code)==="auth/network-request-failed"&&this.schedule(!0);return}this.schedule()}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class xt{constructor(e,n){this.createdAt=e,this.lastLoginAt=n,this._initializeTime()}_initializeTime(){this.lastSignInTime=Ce(this.lastLoginAt),this.creationTime=Ce(this.createdAt)}_copy(e){this.createdAt=e.createdAt,this.lastLoginAt=e.lastLoginAt,this._initializeTime()}toJSON(){return{createdAt:this.createdAt,lastLoginAt:this.lastLoginAt}}}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function et(t){var e;const n=t.auth,r=await t.getIdToken(),s=await Pe(t,vr(n,{idToken:r}));_(s==null?void 0:s.users.length,n,"internal-error");const i=s.users[0];t._notifyReloadListener(i);const o=!((e=i.providerUserInfo)===null||e===void 0)&&e.length?br(i.providerUserInfo):[],a=Ao(t.providerData,o),c=t.isAnonymous,l=!(t.email&&i.passwordHash)&&!(a!=null&&a.length),u=c?l:!1,h={uid:i.localId,displayName:i.displayName||null,photoURL:i.photoUrl||null,email:i.email||null,emailVerified:i.emailVerified||!1,phoneNumber:i.phoneNumber||null,tenantId:i.tenantId||null,providerData:a,metadata:new xt(i.createdAt,i.lastLoginAt),isAnonymous:u};Object.assign(t,h)}async function So(t){const e=he(t);await et(e),await e.auth._persistUserIfCurrent(e),e.auth._notifyListenersIfCurrent(e)}function Ao(t,e){return[...t.filter(r=>!e.some(s=>s.providerId===r.providerId)),...e]}function br(t){return t.map(e=>{var{providerId:n}=e,r=Jt(e,["providerId"]);return{providerId:n,uid:r.rawId||"",displayName:r.displayName||null,email:r.email||null,phoneNumber:r.phoneNumber||null,photoURL:r.photoUrl||null}})}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Ro(t,e){const n=await _r(t,{},async()=>{const r=Ue({grant_type:"refresh_token",refresh_token:e}).slice(1),{tokenApiHost:s,apiKey:i}=t.config,o=yr(t,s,"/v1/token",`key=${i}`),a=await t._getAdditionalHeaders();return a["Content-Type"]="application/x-www-form-urlencoded",gr.fetch()(o,{method:"POST",headers:a,body:r})});return{accessToken:n.access_token,expiresIn:n.expires_in,refreshToken:n.refresh_token}}async function Co(t,e){return be(t,"POST","/v2/accounts:revokeToken",ot(t,e))}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class _e{constructor(){this.refreshToken=null,this.accessToken=null,this.expirationTime=null}get isExpired(){return!this.expirationTime||Date.now()>this.expirationTime-3e4}updateFromServerResponse(e){_(e.idToken,"internal-error"),_(typeof e.idToken<"u","internal-error"),_(typeof e.refreshToken<"u","internal-error");const n="expiresIn"in e&&typeof e.expiresIn<"u"?Number(e.expiresIn):En(e.idToken);this.updateTokensAndExpiration(e.idToken,e.refreshToken,n)}updateFromIdToken(e){_(e.length!==0,"internal-error");const n=En(e);this.updateTokensAndExpiration(e,null,n)}async getToken(e,n=!1){return!n&&this.accessToken&&!this.isExpired?this.accessToken:(_(this.refreshToken,e,"user-token-expired"),this.refreshToken?(await this.refresh(e,this.refreshToken),this.accessToken):null)}clearRefreshToken(){this.refreshToken=null}async refresh(e,n){const{accessToken:r,refreshToken:s,expiresIn:i}=await Ro(e,n);this.updateTokensAndExpiration(r,s,Number(i))}updateTokensAndExpiration(e,n,r){this.refreshToken=n||null,this.accessToken=e||null,this.expirationTime=Date.now()+r*1e3}static fromJSON(e,n){const{refreshToken:r,accessToken:s,expirationTime:i}=n,o=new _e;return r&&(_(typeof r=="string","internal-error",{appName:e}),o.refreshToken=r),s&&(_(typeof s=="string","internal-error",{appName:e}),o.accessToken=s),i&&(_(typeof i=="number","internal-error",{appName:e}),o.expirationTime=i),o}toJSON(){return{refreshToken:this.refreshToken,accessToken:this.accessToken,expirationTime:this.expirationTime}}_assign(e){this.accessToken=e.accessToken,this.refreshToken=e.refreshToken,this.expirationTime=e.expirationTime}_clone(){return Object.assign(new _e,this.toJSON())}_performRefresh(){return $("not implemented")}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function J(t,e){_(typeof t=="string"||typeof t>"u","internal-error",{appName:e})}class H{constructor(e){var{uid:n,auth:r,stsTokenManager:s}=e,i=Jt(e,["uid","auth","stsTokenManager"]);this.providerId="firebase",this.proactiveRefresh=new Io(this),this.reloadUserInfo=null,this.reloadListener=null,this.uid=n,this.auth=r,this.stsTokenManager=s,this.accessToken=s.accessToken,this.displayName=i.displayName||null,this.email=i.email||null,this.emailVerified=i.emailVerified||!1,this.phoneNumber=i.phoneNumber||null,this.photoURL=i.photoURL||null,this.isAnonymous=i.isAnonymous||!1,this.tenantId=i.tenantId||null,this.providerData=i.providerData?[...i.providerData]:[],this.metadata=new xt(i.createdAt||void 0,i.lastLoginAt||void 0)}async getIdToken(e){const n=await Pe(this,this.stsTokenManager.getToken(this.auth,e));return _(n,this.auth,"internal-error"),this.accessToken!==n&&(this.accessToken=n,await this.auth._persistUserIfCurrent(this),this.auth._notifyListenersIfCurrent(this)),n}getIdTokenResult(e){return Eo(this,e)}reload(){return So(this)}_assign(e){this!==e&&(_(this.uid===e.uid,this.auth,"internal-error"),this.displayName=e.displayName,this.photoURL=e.photoURL,this.email=e.email,this.emailVerified=e.emailVerified,this.phoneNumber=e.phoneNumber,this.isAnonymous=e.isAnonymous,this.tenantId=e.tenantId,this.providerData=e.providerData.map(n=>Object.assign({},n)),this.metadata._copy(e.metadata),this.stsTokenManager._assign(e.stsTokenManager))}_clone(e){const n=new H(Object.assign(Object.assign({},this),{auth:e,stsTokenManager:this.stsTokenManager._clone()}));return n.metadata._copy(this.metadata),n}_onReload(e){_(!this.reloadListener,this.auth,"internal-error"),this.reloadListener=e,this.reloadUserInfo&&(this._notifyReloadListener(this.reloadUserInfo),this.reloadUserInfo=null)}_notifyReloadListener(e){this.reloadListener?this.reloadListener(e):this.reloadUserInfo=e}_startProactiveRefresh(){this.proactiveRefresh._start()}_stopProactiveRefresh(){this.proactiveRefresh._stop()}async _updateTokensIfNecessary(e,n=!1){let r=!1;e.idToken&&e.idToken!==this.stsTokenManager.accessToken&&(this.stsTokenManager.updateFromServerResponse(e),r=!0),n&&await et(this),await this.auth._persistUserIfCurrent(this),r&&this.auth._notifyListenersIfCurrent(this)}async delete(){if(F(this.auth.app))return Promise.reject(ne(this.auth));const e=await this.getIdToken();return await Pe(this,bo(this.auth,{idToken:e})),this.stsTokenManager.clearRefreshToken(),this.auth.signOut()}toJSON(){return Object.assign(Object.assign({uid:this.uid,email:this.email||void 0,emailVerified:this.emailVerified,displayName:this.displayName||void 0,isAnonymous:this.isAnonymous,photoURL:this.photoURL||void 0,phoneNumber:this.phoneNumber||void 0,tenantId:this.tenantId||void 0,providerData:this.providerData.map(e=>Object.assign({},e)),stsTokenManager:this.stsTokenManager.toJSON(),_redirectEventId:this._redirectEventId},this.metadata.toJSON()),{apiKey:this.auth.config.apiKey,appName:this.auth.name})}get refreshToken(){return this.stsTokenManager.refreshToken||""}static _fromJSON(e,n){var r,s,i,o,a,c,l,u;const h=(r=n.displayName)!==null&&r!==void 0?r:void 0,m=(s=n.email)!==null&&s!==void 0?s:void 0,y=(i=n.phoneNumber)!==null&&i!==void 0?i:void 0,f=(o=n.photoURL)!==null&&o!==void 0?o:void 0,g=(a=n.tenantId)!==null&&a!==void 0?a:void 0,p=(c=n._redirectEventId)!==null&&c!==void 0?c:void 0,b=(l=n.createdAt)!==null&&l!==void 0?l:void 0,T=(u=n.lastLoginAt)!==null&&u!==void 0?u:void 0,{uid:v,emailVerified:C,isAnonymous:A,providerData:O,stsTokenManager:P}=n;_(v&&P,e,"internal-error");const G=_e.fromJSON(this.name,P);_(typeof v=="string",e,"internal-error"),J(h,e.name),J(m,e.name),_(typeof C=="boolean",e,"internal-error"),_(typeof A=="boolean",e,"internal-error"),J(y,e.name),J(f,e.name),J(g,e.name),J(p,e.name),J(b,e.name),J(T,e.name);const K=new H({uid:v,auth:e,email:m,emailVerified:C,displayName:h,isAnonymous:A,photoURL:f,phoneNumber:y,tenantId:g,stsTokenManager:G,createdAt:b,lastLoginAt:T});return O&&Array.isArray(O)&&(K.providerData=O.map(wt=>Object.assign({},wt))),p&&(K._redirectEventId=p),K}static async _fromIdTokenResponse(e,n,r=!1){const s=new _e;s.updateFromServerResponse(n);const i=new H({uid:n.localId,auth:e,stsTokenManager:s,isAnonymous:r});return await et(i),i}static async _fromGetAccountInfoResponse(e,n,r){const s=n.users[0];_(s.localId!==void 0,"internal-error");const i=s.providerUserInfo!==void 0?br(s.providerUserInfo):[],o=!(s.email&&s.passwordHash)&&!(i!=null&&i.length),a=new _e;a.updateFromIdToken(r);const c=new H({uid:s.localId,auth:e,stsTokenManager:a,isAnonymous:o}),l={uid:s.localId,displayName:s.displayName||null,photoURL:s.photoUrl||null,email:s.email||null,emailVerified:s.emailVerified||!1,phoneNumber:s.phoneNumber||null,tenantId:s.tenantId||null,providerData:i,metadata:new xt(s.createdAt,s.lastLoginAt),isAnonymous:!(s.email&&s.passwordHash)&&!(i!=null&&i.length)};return Object.assign(c,l),c}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Tn=new Map;function V(t){q(t instanceof Function,"Expected a class definition");let e=Tn.get(t);return e?(q(e instanceof t,"Instance stored in cache mismatched with class"),e):(e=new t,Tn.set(t,e),e)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Er{constructor(){this.type="NONE",this.storage={}}async _isAvailable(){return!0}async _set(e,n){this.storage[e]=n}async _get(e){const n=this.storage[e];return n===void 0?null:n}async _remove(e){delete this.storage[e]}_addListener(e,n){}_removeListener(e,n){}}Er.type="NONE";const In=Er;/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function We(t,e,n){return`firebase:${t}:${e}:${n}`}class we{constructor(e,n,r){this.persistence=e,this.auth=n,this.userKey=r;const{config:s,name:i}=this.auth;this.fullUserKey=We(this.userKey,s.apiKey,i),this.fullPersistenceKey=We("persistence",s.apiKey,i),this.boundEventHandler=n._onStorageEvent.bind(n),this.persistence._addListener(this.fullUserKey,this.boundEventHandler)}setCurrentUser(e){return this.persistence._set(this.fullUserKey,e.toJSON())}async getCurrentUser(){const e=await this.persistence._get(this.fullUserKey);return e?H._fromJSON(this.auth,e):null}removeCurrentUser(){return this.persistence._remove(this.fullUserKey)}savePersistenceForRedirect(){return this.persistence._set(this.fullPersistenceKey,this.persistence.type)}async setPersistence(e){if(this.persistence===e)return;const n=await this.getCurrentUser();if(await this.removeCurrentUser(),this.persistence=e,n)return this.setCurrentUser(n)}delete(){this.persistence._removeListener(this.fullUserKey,this.boundEventHandler)}static async create(e,n,r="authUser"){if(!n.length)return new we(V(In),e,r);const s=(await Promise.all(n.map(async l=>{if(await l._isAvailable())return l}))).filter(l=>l);let i=s[0]||V(In);const o=We(r,e.config.apiKey,e.name);let a=null;for(const l of n)try{const u=await l._get(o);if(u){const h=H._fromJSON(e,u);l!==i&&(a=h),i=l;break}}catch{}const c=s.filter(l=>l._shouldAllowMigration);return!i._shouldAllowMigration||!c.length?new we(i,e,r):(i=c[0],a&&await i._set(o,a.toJSON()),await Promise.all(n.map(async l=>{if(l!==i)try{await l._remove(o)}catch{}})),new we(i,e,r))}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Sn(t){const e=t.toLowerCase();if(e.includes("opera/")||e.includes("opr/")||e.includes("opios/"))return"Opera";if(Ar(e))return"IEMobile";if(e.includes("msie")||e.includes("trident/"))return"IE";if(e.includes("edge/"))return"Edge";if(Tr(e))return"Firefox";if(e.includes("silk/"))return"Silk";if(Cr(e))return"Blackberry";if(Or(e))return"Webos";if(Ir(e))return"Safari";if((e.includes("chrome/")||Sr(e))&&!e.includes("edge/"))return"Chrome";if(Rr(e))return"Android";{const n=/([a-zA-Z\d\.]+)\/[a-zA-Z\d\.]*$/,r=t.match(n);if((r==null?void 0:r.length)===2)return r[1]}return"Other"}function Tr(t=k()){return/firefox\//i.test(t)}function Ir(t=k()){const e=t.toLowerCase();return e.includes("safari/")&&!e.includes("chrome/")&&!e.includes("crios/")&&!e.includes("android")}function Sr(t=k()){return/crios\//i.test(t)}function Ar(t=k()){return/iemobile/i.test(t)}function Rr(t=k()){return/android/i.test(t)}function Cr(t=k()){return/blackberry/i.test(t)}function Or(t=k()){return/webos/i.test(t)}function Zt(t=k()){return/iphone|ipad|ipod/i.test(t)||/macintosh/i.test(t)&&/mobile/i.test(t)}function Oo(t=k()){var e;return Zt(t)&&!!(!((e=window.navigator)===null||e===void 0)&&e.standalone)}function ko(){return Ks()&&document.documentMode===10}function kr(t=k()){return Zt(t)||Rr(t)||Or(t)||Cr(t)||/windows phone/i.test(t)||Ar(t)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Pr(t,e=[]){let n;switch(t){case"Browser":n=Sn(k());break;case"Worker":n=`${Sn(k())}-${t}`;break;default:n=t}const r=e.length?e.join(","):"FirebaseCore-web";return`${n}/JsCore/${Me}/${r}`}/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Po{constructor(e){this.auth=e,this.queue=[]}pushCallback(e,n){const r=i=>new Promise((o,a)=>{try{const c=e(i);o(c)}catch(c){a(c)}});r.onAbort=n,this.queue.push(r);const s=this.queue.length-1;return()=>{this.queue[s]=()=>Promise.resolve()}}async runMiddleware(e){if(this.auth.currentUser===e)return;const n=[];try{for(const r of this.queue)await r(e),r.onAbort&&n.push(r.onAbort)}catch(r){n.reverse();for(const s of n)try{s()}catch{}throw this.auth._errorFactory.create("login-blocked",{originalMessage:r==null?void 0:r.message})}}}/**
 * @license
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function No(t,e={}){return be(t,"GET","/v2/passwordPolicy",ot(t,e))}/**
 * @license
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Do=6;class Uo{constructor(e){var n,r,s,i;const o=e.customStrengthOptions;this.customStrengthOptions={},this.customStrengthOptions.minPasswordLength=(n=o.minPasswordLength)!==null&&n!==void 0?n:Do,o.maxPasswordLength&&(this.customStrengthOptions.maxPasswordLength=o.maxPasswordLength),o.containsLowercaseCharacter!==void 0&&(this.customStrengthOptions.containsLowercaseLetter=o.containsLowercaseCharacter),o.containsUppercaseCharacter!==void 0&&(this.customStrengthOptions.containsUppercaseLetter=o.containsUppercaseCharacter),o.containsNumericCharacter!==void 0&&(this.customStrengthOptions.containsNumericCharacter=o.containsNumericCharacter),o.containsNonAlphanumericCharacter!==void 0&&(this.customStrengthOptions.containsNonAlphanumericCharacter=o.containsNonAlphanumericCharacter),this.enforcementState=e.enforcementState,this.enforcementState==="ENFORCEMENT_STATE_UNSPECIFIED"&&(this.enforcementState="OFF"),this.allowedNonAlphanumericCharacters=(s=(r=e.allowedNonAlphanumericCharacters)===null||r===void 0?void 0:r.join(""))!==null&&s!==void 0?s:"",this.forceUpgradeOnSignin=(i=e.forceUpgradeOnSignin)!==null&&i!==void 0?i:!1,this.schemaVersion=e.schemaVersion}validatePassword(e){var n,r,s,i,o,a;const c={isValid:!0,passwordPolicy:this};return this.validatePasswordLengthOptions(e,c),this.validatePasswordCharacterOptions(e,c),c.isValid&&(c.isValid=(n=c.meetsMinPasswordLength)!==null&&n!==void 0?n:!0),c.isValid&&(c.isValid=(r=c.meetsMaxPasswordLength)!==null&&r!==void 0?r:!0),c.isValid&&(c.isValid=(s=c.containsLowercaseLetter)!==null&&s!==void 0?s:!0),c.isValid&&(c.isValid=(i=c.containsUppercaseLetter)!==null&&i!==void 0?i:!0),c.isValid&&(c.isValid=(o=c.containsNumericCharacter)!==null&&o!==void 0?o:!0),c.isValid&&(c.isValid=(a=c.containsNonAlphanumericCharacter)!==null&&a!==void 0?a:!0),c}validatePasswordLengthOptions(e,n){const r=this.customStrengthOptions.minPasswordLength,s=this.customStrengthOptions.maxPasswordLength;r&&(n.meetsMinPasswordLength=e.length>=r),s&&(n.meetsMaxPasswordLength=e.length<=s)}validatePasswordCharacterOptions(e,n){this.updatePasswordCharacterOptionsStatuses(n,!1,!1,!1,!1);let r;for(let s=0;s<e.length;s++)r=e.charAt(s),this.updatePasswordCharacterOptionsStatuses(n,r>="a"&&r<="z",r>="A"&&r<="Z",r>="0"&&r<="9",this.allowedNonAlphanumericCharacters.includes(r))}updatePasswordCharacterOptionsStatuses(e,n,r,s,i){this.customStrengthOptions.containsLowercaseLetter&&(e.containsLowercaseLetter||(e.containsLowercaseLetter=n)),this.customStrengthOptions.containsUppercaseLetter&&(e.containsUppercaseLetter||(e.containsUppercaseLetter=r)),this.customStrengthOptions.containsNumericCharacter&&(e.containsNumericCharacter||(e.containsNumericCharacter=s)),this.customStrengthOptions.containsNonAlphanumericCharacter&&(e.containsNonAlphanumericCharacter||(e.containsNonAlphanumericCharacter=i))}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Mo{constructor(e,n,r,s){this.app=e,this.heartbeatServiceProvider=n,this.appCheckServiceProvider=r,this.config=s,this.currentUser=null,this.emulatorConfig=null,this.operations=Promise.resolve(),this.authStateSubscription=new An(this),this.idTokenSubscription=new An(this),this.beforeStateQueue=new Po(this),this.redirectUser=null,this.isProactiveRefreshEnabled=!1,this.EXPECTED_PASSWORD_POLICY_SCHEMA_VERSION=1,this._canInitEmulator=!0,this._isInitialized=!1,this._deleted=!1,this._initializationPromise=null,this._popupRedirectResolver=null,this._errorFactory=pr,this._agentRecaptchaConfig=null,this._tenantRecaptchaConfigs={},this._projectPasswordPolicy=null,this._tenantPasswordPolicies={},this.lastNotifiedUid=void 0,this.languageCode=null,this.tenantId=null,this.settings={appVerificationDisabledForTesting:!1},this.frameworks=[],this.name=e.name,this.clientVersion=s.sdkClientVersion}_initializeWithPersistence(e,n){return n&&(this._popupRedirectResolver=V(n)),this._initializationPromise=this.queue(async()=>{var r,s;if(!this._deleted&&(this.persistenceManager=await we.create(this,e),!this._deleted)){if(!((r=this._popupRedirectResolver)===null||r===void 0)&&r._shouldInitProactively)try{await this._popupRedirectResolver._initialize(this)}catch{}await this.initializeCurrentUser(n),this.lastNotifiedUid=((s=this.currentUser)===null||s===void 0?void 0:s.uid)||null,!this._deleted&&(this._isInitialized=!0)}}),this._initializationPromise}async _onStorageEvent(){if(this._deleted)return;const e=await this.assertedPersistence.getCurrentUser();if(!(!this.currentUser&&!e)){if(this.currentUser&&e&&this.currentUser.uid===e.uid){this._currentUser._assign(e),await this.currentUser.getIdToken();return}await this._updateCurrentUser(e,!0)}}async initializeCurrentUserFromIdToken(e){try{const n=await vr(this,{idToken:e}),r=await H._fromGetAccountInfoResponse(this,n,e);await this.directlySetCurrentUser(r)}catch(n){console.warn("FirebaseServerApp could not login user with provided authIdToken: ",n),await this.directlySetCurrentUser(null)}}async initializeCurrentUser(e){var n;if(F(this.app)){const o=this.app.settings.authIdToken;return o?new Promise(a=>{setTimeout(()=>this.initializeCurrentUserFromIdToken(o).then(a,a))}):this.directlySetCurrentUser(null)}const r=await this.assertedPersistence.getCurrentUser();let s=r,i=!1;if(e&&this.config.authDomain){await this.getOrInitRedirectPersistenceManager();const o=(n=this.redirectUser)===null||n===void 0?void 0:n._redirectEventId,a=s==null?void 0:s._redirectEventId,c=await this.tryRedirectSignIn(e);(!o||o===a)&&(c!=null&&c.user)&&(s=c.user,i=!0)}if(!s)return this.directlySetCurrentUser(null);if(!s._redirectEventId){if(i)try{await this.beforeStateQueue.runMiddleware(s)}catch(o){s=r,this._popupRedirectResolver._overrideRedirectResult(this,()=>Promise.reject(o))}return s?this.reloadAndSetCurrentUserOrClear(s):this.directlySetCurrentUser(null)}return _(this._popupRedirectResolver,this,"argument-error"),await this.getOrInitRedirectPersistenceManager(),this.redirectUser&&this.redirectUser._redirectEventId===s._redirectEventId?this.directlySetCurrentUser(s):this.reloadAndSetCurrentUserOrClear(s)}async tryRedirectSignIn(e){let n=null;try{n=await this._popupRedirectResolver._completeRedirectFn(this,e,!0)}catch{await this._setRedirectUser(null)}return n}async reloadAndSetCurrentUserOrClear(e){try{await et(e)}catch(n){if((n==null?void 0:n.code)!=="auth/network-request-failed")return this.directlySetCurrentUser(null)}return this.directlySetCurrentUser(e)}useDeviceLanguage(){this.languageCode=_o()}async _delete(){this._deleted=!0}async updateCurrentUser(e){if(F(this.app))return Promise.reject(ne(this));const n=e?he(e):null;return n&&_(n.auth.config.apiKey===this.config.apiKey,this,"invalid-user-token"),this._updateCurrentUser(n&&n._clone(this))}async _updateCurrentUser(e,n=!1){if(!this._deleted)return e&&_(this.tenantId===e.tenantId,this,"tenant-id-mismatch"),n||await this.beforeStateQueue.runMiddleware(e),this.queue(async()=>{await this.directlySetCurrentUser(e),this.notifyAuthListeners()})}async signOut(){return F(this.app)?Promise.reject(ne(this)):(await this.beforeStateQueue.runMiddleware(null),(this.redirectPersistenceManager||this._popupRedirectResolver)&&await this._setRedirectUser(null),this._updateCurrentUser(null,!0))}setPersistence(e){return F(this.app)?Promise.reject(ne(this)):this.queue(async()=>{await this.assertedPersistence.setPersistence(V(e))})}_getRecaptchaConfig(){return this.tenantId==null?this._agentRecaptchaConfig:this._tenantRecaptchaConfigs[this.tenantId]}async validatePassword(e){this._getPasswordPolicyInternal()||await this._updatePasswordPolicy();const n=this._getPasswordPolicyInternal();return n.schemaVersion!==this.EXPECTED_PASSWORD_POLICY_SCHEMA_VERSION?Promise.reject(this._errorFactory.create("unsupported-password-policy-schema-version",{})):n.validatePassword(e)}_getPasswordPolicyInternal(){return this.tenantId===null?this._projectPasswordPolicy:this._tenantPasswordPolicies[this.tenantId]}async _updatePasswordPolicy(){const e=await No(this),n=new Uo(e);this.tenantId===null?this._projectPasswordPolicy=n:this._tenantPasswordPolicies[this.tenantId]=n}_getPersistence(){return this.assertedPersistence.persistence.type}_updateErrorMap(e){this._errorFactory=new De("auth","Firebase",e())}onAuthStateChanged(e,n,r){return this.registerStateListener(this.authStateSubscription,e,n,r)}beforeAuthStateChanged(e,n){return this.beforeStateQueue.pushCallback(e,n)}onIdTokenChanged(e,n,r){return this.registerStateListener(this.idTokenSubscription,e,n,r)}authStateReady(){return new Promise((e,n)=>{if(this.currentUser)e();else{const r=this.onAuthStateChanged(()=>{r(),e()},n)}})}async revokeAccessToken(e){if(this.currentUser){const n=await this.currentUser.getIdToken(),r={providerId:"apple.com",tokenType:"ACCESS_TOKEN",token:e,idToken:n};this.tenantId!=null&&(r.tenantId=this.tenantId),await Co(this,r)}}toJSON(){var e;return{apiKey:this.config.apiKey,authDomain:this.config.authDomain,appName:this.name,currentUser:(e=this._currentUser)===null||e===void 0?void 0:e.toJSON()}}async _setRedirectUser(e,n){const r=await this.getOrInitRedirectPersistenceManager(n);return e===null?r.removeCurrentUser():r.setCurrentUser(e)}async getOrInitRedirectPersistenceManager(e){if(!this.redirectPersistenceManager){const n=e&&V(e)||this._popupRedirectResolver;_(n,this,"argument-error"),this.redirectPersistenceManager=await we.create(this,[V(n._redirectPersistence)],"redirectUser"),this.redirectUser=await this.redirectPersistenceManager.getCurrentUser()}return this.redirectPersistenceManager}async _redirectUserForId(e){var n,r;return this._isInitialized&&await this.queue(async()=>{}),((n=this._currentUser)===null||n===void 0?void 0:n._redirectEventId)===e?this._currentUser:((r=this.redirectUser)===null||r===void 0?void 0:r._redirectEventId)===e?this.redirectUser:null}async _persistUserIfCurrent(e){if(e===this.currentUser)return this.queue(async()=>this.directlySetCurrentUser(e))}_notifyListenersIfCurrent(e){e===this.currentUser&&this.notifyAuthListeners()}_key(){return`${this.config.authDomain}:${this.config.apiKey}:${this.name}`}_startProactiveRefresh(){this.isProactiveRefreshEnabled=!0,this.currentUser&&this._currentUser._startProactiveRefresh()}_stopProactiveRefresh(){this.isProactiveRefreshEnabled=!1,this.currentUser&&this._currentUser._stopProactiveRefresh()}get _currentUser(){return this.currentUser}notifyAuthListeners(){var e,n;if(!this._isInitialized)return;this.idTokenSubscription.next(this.currentUser);const r=(n=(e=this.currentUser)===null||e===void 0?void 0:e.uid)!==null&&n!==void 0?n:null;this.lastNotifiedUid!==r&&(this.lastNotifiedUid=r,this.authStateSubscription.next(this.currentUser))}registerStateListener(e,n,r,s){if(this._deleted)return()=>{};const i=typeof n=="function"?n:n.next.bind(n);let o=!1;const a=this._isInitialized?Promise.resolve():this._initializationPromise;if(_(a,this,"internal-error"),a.then(()=>{o||i(this.currentUser)}),typeof n=="function"){const c=e.addObserver(n,r,s);return()=>{o=!0,c()}}else{const c=e.addObserver(n);return()=>{o=!0,c()}}}async directlySetCurrentUser(e){this.currentUser&&this.currentUser!==e&&this._currentUser._stopProactiveRefresh(),e&&this.isProactiveRefreshEnabled&&e._startProactiveRefresh(),this.currentUser=e,e?await this.assertedPersistence.setCurrentUser(e):await this.assertedPersistence.removeCurrentUser()}queue(e){return this.operations=this.operations.then(e,e),this.operations}get assertedPersistence(){return _(this.persistenceManager,this,"internal-error"),this.persistenceManager}_logFramework(e){!e||this.frameworks.includes(e)||(this.frameworks.push(e),this.frameworks.sort(),this.clientVersion=Pr(this.config.clientPlatform,this._getFrameworks()))}_getFrameworks(){return this.frameworks}async _getAdditionalHeaders(){var e;const n={"X-Client-Version":this.clientVersion};this.app.options.appId&&(n["X-Firebase-gmpid"]=this.app.options.appId);const r=await((e=this.heartbeatServiceProvider.getImmediate({optional:!0}))===null||e===void 0?void 0:e.getHeartbeatsHeader());r&&(n["X-Firebase-Client"]=r);const s=await this._getAppCheckToken();return s&&(n["X-Firebase-AppCheck"]=s),n}async _getAppCheckToken(){var e;if(F(this.app)&&this.app.settings.appCheckToken)return this.app.settings.appCheckToken;const n=await((e=this.appCheckServiceProvider.getImmediate({optional:!0}))===null||e===void 0?void 0:e.getToken());return n!=null&&n.error&&po(`Error while retrieving App Check token: ${n.error}`),n==null?void 0:n.token}}function at(t){return he(t)}class An{constructor(e){this.auth=e,this.observer=null,this.addObserver=ti(n=>this.observer=n)}get next(){return _(this.observer,this.auth,"internal-error"),this.observer.next.bind(this.observer)}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let en={async loadJS(){throw new Error("Unable to load external scripts")},recaptchaV2Script:"",recaptchaEnterpriseScript:"",gapiScript:""};function Lo(t){en=t}function xo(t){return en.loadJS(t)}function Fo(){return en.gapiScript}function Bo(t){return`__${t}${Math.floor(Math.random()*1e6)}`}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function jo(t,e){const n=cr(t,"auth");if(n.isInitialized()){const s=n.getImmediate(),i=n.getOptions();if(Ye(i,e??{}))return s;W(s,"already-initialized")}return n.initialize({options:e})}function $o(t,e){const n=(e==null?void 0:e.persistence)||[],r=(Array.isArray(n)?n:[n]).map(V);e!=null&&e.errorMap&&t._updateErrorMap(e.errorMap),t._initializeWithPersistence(r,e==null?void 0:e.popupRedirectResolver)}function Ho(t,e,n){const r=at(t);_(r._canInitEmulator,r,"emulator-config-failed"),_(/^https?:\/\//.test(e),r,"invalid-emulator-scheme");const s=!1,i=Nr(e),{host:o,port:a}=Vo(e),c=a===null?"":`:${a}`;r.config.emulator={url:`${i}//${o}${c}/`},r.settings.appVerificationDisabledForTesting=!0,r.emulatorConfig=Object.freeze({host:o,port:a,protocol:i.replace(":",""),options:Object.freeze({disableWarnings:s})}),zo()}function Nr(t){const e=t.indexOf(":");return e<0?"":t.substr(0,e+1)}function Vo(t){const e=Nr(t),n=/(\/\/)?([^?#/]+)/.exec(t.substr(e.length));if(!n)return{host:"",port:null};const r=n[2].split("@").pop()||"",s=/^(\[[^\]]+\])(:|$)/.exec(r);if(s){const i=s[1];return{host:i,port:Rn(r.substr(i.length+1))}}else{const[i,o]=r.split(":");return{host:i,port:Rn(o)}}}function Rn(t){if(!t)return null;const e=Number(t);return isNaN(e)?null:e}function zo(){function t(){const e=document.createElement("p"),n=e.style;e.innerText="Running in emulator mode. Do not use with production credentials.",n.position="fixed",n.width="100%",n.backgroundColor="#ffffff",n.border=".1em solid #000000",n.color="#b50000",n.bottom="0px",n.left="0px",n.margin="0px",n.zIndex="10000",n.textAlign="center",e.classList.add("firebase-emulator-warning"),document.body.appendChild(e)}typeof console<"u"&&typeof console.info=="function"&&console.info("WARNING: You are using the Auth Emulator, which is intended for local testing only.  Do not use with production credentials."),typeof window<"u"&&typeof document<"u"&&(document.readyState==="loading"?window.addEventListener("DOMContentLoaded",t):t())}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Dr{constructor(e,n){this.providerId=e,this.signInMethod=n}toJSON(){return $("not implemented")}_getIdTokenResponse(e){return $("not implemented")}_linkToIdToken(e,n){return $("not implemented")}_getReauthenticationResolver(e){return $("not implemented")}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function ye(t,e){return wr(t,"POST","/v1/accounts:signInWithIdp",ot(t,e))}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Wo="http://localhost";class le extends Dr{constructor(){super(...arguments),this.pendingToken=null}static _fromParams(e){const n=new le(e.providerId,e.signInMethod);return e.idToken||e.accessToken?(e.idToken&&(n.idToken=e.idToken),e.accessToken&&(n.accessToken=e.accessToken),e.nonce&&!e.pendingToken&&(n.nonce=e.nonce),e.pendingToken&&(n.pendingToken=e.pendingToken)):e.oauthToken&&e.oauthTokenSecret?(n.accessToken=e.oauthToken,n.secret=e.oauthTokenSecret):W("argument-error"),n}toJSON(){return{idToken:this.idToken,accessToken:this.accessToken,secret:this.secret,nonce:this.nonce,pendingToken:this.pendingToken,providerId:this.providerId,signInMethod:this.signInMethod}}static fromJSON(e){const n=typeof e=="string"?JSON.parse(e):e,{providerId:r,signInMethod:s}=n,i=Jt(n,["providerId","signInMethod"]);if(!r||!s)return null;const o=new le(r,s);return o.idToken=i.idToken||void 0,o.accessToken=i.accessToken||void 0,o.secret=i.secret,o.nonce=i.nonce,o.pendingToken=i.pendingToken||null,o}_getIdTokenResponse(e){const n=this.buildRequest();return ye(e,n)}_linkToIdToken(e,n){const r=this.buildRequest();return r.idToken=n,ye(e,r)}_getReauthenticationResolver(e){const n=this.buildRequest();return n.autoCreate=!1,ye(e,n)}buildRequest(){const e={requestUri:Wo,returnSecureToken:!0};if(this.pendingToken)e.pendingToken=this.pendingToken;else{const n={};this.idToken&&(n.id_token=this.idToken),this.accessToken&&(n.access_token=this.accessToken),this.secret&&(n.oauth_token_secret=this.secret),n.providerId=this.providerId,this.nonce&&!this.pendingToken&&(n.nonce=this.nonce),e.postBody=Ue(n)}return e}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Ur{constructor(e){this.providerId=e,this.defaultLanguageCode=null,this.customParameters={}}setDefaultLanguage(e){this.defaultLanguageCode=e}setCustomParameters(e){return this.customParameters=e,this}getCustomParameters(){return this.customParameters}}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class xe extends Ur{constructor(){super(...arguments),this.scopes=[]}addScope(e){return this.scopes.includes(e)||this.scopes.push(e),this}getScopes(){return[...this.scopes]}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class X extends xe{constructor(){super("facebook.com")}static credential(e){return le._fromParams({providerId:X.PROVIDER_ID,signInMethod:X.FACEBOOK_SIGN_IN_METHOD,accessToken:e})}static credentialFromResult(e){return X.credentialFromTaggedObject(e)}static credentialFromError(e){return X.credentialFromTaggedObject(e.customData||{})}static credentialFromTaggedObject({_tokenResponse:e}){if(!e||!("oauthAccessToken"in e)||!e.oauthAccessToken)return null;try{return X.credential(e.oauthAccessToken)}catch{return null}}}X.FACEBOOK_SIGN_IN_METHOD="facebook.com";X.PROVIDER_ID="facebook.com";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Y extends xe{constructor(){super("google.com"),this.addScope("profile")}static credential(e,n){return le._fromParams({providerId:Y.PROVIDER_ID,signInMethod:Y.GOOGLE_SIGN_IN_METHOD,idToken:e,accessToken:n})}static credentialFromResult(e){return Y.credentialFromTaggedObject(e)}static credentialFromError(e){return Y.credentialFromTaggedObject(e.customData||{})}static credentialFromTaggedObject({_tokenResponse:e}){if(!e)return null;const{oauthIdToken:n,oauthAccessToken:r}=e;if(!n&&!r)return null;try{return Y.credential(n,r)}catch{return null}}}Y.GOOGLE_SIGN_IN_METHOD="google.com";Y.PROVIDER_ID="google.com";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Q extends xe{constructor(){super("github.com")}static credential(e){return le._fromParams({providerId:Q.PROVIDER_ID,signInMethod:Q.GITHUB_SIGN_IN_METHOD,accessToken:e})}static credentialFromResult(e){return Q.credentialFromTaggedObject(e)}static credentialFromError(e){return Q.credentialFromTaggedObject(e.customData||{})}static credentialFromTaggedObject({_tokenResponse:e}){if(!e||!("oauthAccessToken"in e)||!e.oauthAccessToken)return null;try{return Q.credential(e.oauthAccessToken)}catch{return null}}}Q.GITHUB_SIGN_IN_METHOD="github.com";Q.PROVIDER_ID="github.com";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Z extends xe{constructor(){super("twitter.com")}static credential(e,n){return le._fromParams({providerId:Z.PROVIDER_ID,signInMethod:Z.TWITTER_SIGN_IN_METHOD,oauthToken:e,oauthTokenSecret:n})}static credentialFromResult(e){return Z.credentialFromTaggedObject(e)}static credentialFromError(e){return Z.credentialFromTaggedObject(e.customData||{})}static credentialFromTaggedObject({_tokenResponse:e}){if(!e)return null;const{oauthAccessToken:n,oauthTokenSecret:r}=e;if(!n||!r)return null;try{return Z.credential(n,r)}catch{return null}}}Z.TWITTER_SIGN_IN_METHOD="twitter.com";Z.PROVIDER_ID="twitter.com";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class ue{constructor(e){this.user=e.user,this.providerId=e.providerId,this._tokenResponse=e._tokenResponse,this.operationType=e.operationType}static async _fromIdTokenResponse(e,n,r,s=!1){const i=await H._fromIdTokenResponse(e,r,s),o=Cn(r);return new ue({user:i,providerId:o,_tokenResponse:r,operationType:n})}static async _forOperation(e,n,r){await e._updateTokensIfNecessary(r,!0);const s=Cn(r);return new ue({user:e,providerId:s,_tokenResponse:r,operationType:n})}}function Cn(t){return t.providerId?t.providerId:"phoneNumber"in t?"phone":null}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class tt extends re{constructor(e,n,r,s){var i;super(n.code,n.message),this.operationType=r,this.user=s,Object.setPrototypeOf(this,tt.prototype),this.customData={appName:e.name,tenantId:(i=e.tenantId)!==null&&i!==void 0?i:void 0,_serverResponse:n.customData._serverResponse,operationType:r}}static _fromErrorAndOperation(e,n,r,s){return new tt(e,n,r,s)}}function Mr(t,e,n,r){return(e==="reauthenticate"?n._getReauthenticationResolver(t):n._getIdTokenResponse(t)).catch(i=>{throw i.code==="auth/multi-factor-auth-required"?tt._fromErrorAndOperation(t,i,e,r):i})}async function qo(t,e,n=!1){const r=await Pe(t,e._linkToIdToken(t.auth,await t.getIdToken()),n);return ue._forOperation(t,"link",r)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Go(t,e,n=!1){const{auth:r}=t;if(F(r.app))return Promise.reject(ne(r));const s="reauthenticate";try{const i=await Pe(t,Mr(r,s,e,t),n);_(i.idToken,r,"internal-error");const o=Qt(i.idToken);_(o,r,"internal-error");const{sub:a}=o;return _(t.uid===a,r,"user-mismatch"),ue._forOperation(t,s,i)}catch(i){throw(i==null?void 0:i.code)==="auth/user-not-found"&&W(r,"user-mismatch"),i}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Ko(t,e,n=!1){if(F(t.app))return Promise.reject(ne(t));const r="signIn",s=await Mr(t,r,e),i=await ue._fromIdTokenResponse(t,r,s);return n||await t._updateCurrentUser(i.user),i}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Jo(t,e){return wr(t,"POST","/v1/accounts:signInWithCustomToken",ot(t,e))}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Xo(t,e){if(F(t.app))return Promise.reject(ne(t));const n=at(t),r=await Jo(n,{token:e,returnSecureToken:!0}),s=await ue._fromIdTokenResponse(n,"signIn",r);return await n._updateCurrentUser(s.user),s}function Yo(t,e,n,r){return he(t).onIdTokenChanged(e,n,r)}function Qo(t,e,n){return he(t).beforeAuthStateChanged(e,n)}function Ru(t,e,n,r){return he(t).onAuthStateChanged(e,n,r)}const nt="__sak";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Lr{constructor(e,n){this.storageRetriever=e,this.type=n}_isAvailable(){try{return this.storage?(this.storage.setItem(nt,"1"),this.storage.removeItem(nt),Promise.resolve(!0)):Promise.resolve(!1)}catch{return Promise.resolve(!1)}}_set(e,n){return this.storage.setItem(e,JSON.stringify(n)),Promise.resolve()}_get(e){const n=this.storage.getItem(e);return Promise.resolve(n?JSON.parse(n):null)}_remove(e){return this.storage.removeItem(e),Promise.resolve()}get storage(){return this.storageRetriever()}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Zo=1e3,ea=10;class xr extends Lr{constructor(){super(()=>window.localStorage,"LOCAL"),this.boundEventHandler=(e,n)=>this.onStorageEvent(e,n),this.listeners={},this.localCache={},this.pollTimer=null,this.fallbackToPolling=kr(),this._shouldAllowMigration=!0}forAllChangedKeys(e){for(const n of Object.keys(this.listeners)){const r=this.storage.getItem(n),s=this.localCache[n];r!==s&&e(n,s,r)}}onStorageEvent(e,n=!1){if(!e.key){this.forAllChangedKeys((o,a,c)=>{this.notifyListeners(o,c)});return}const r=e.key;n?this.detachListener():this.stopPolling();const s=()=>{const o=this.storage.getItem(r);!n&&this.localCache[r]===o||this.notifyListeners(r,o)},i=this.storage.getItem(r);ko()&&i!==e.newValue&&e.newValue!==e.oldValue?setTimeout(s,ea):s()}notifyListeners(e,n){this.localCache[e]=n;const r=this.listeners[e];if(r)for(const s of Array.from(r))s(n&&JSON.parse(n))}startPolling(){this.stopPolling(),this.pollTimer=setInterval(()=>{this.forAllChangedKeys((e,n,r)=>{this.onStorageEvent(new StorageEvent("storage",{key:e,oldValue:n,newValue:r}),!0)})},Zo)}stopPolling(){this.pollTimer&&(clearInterval(this.pollTimer),this.pollTimer=null)}attachListener(){window.addEventListener("storage",this.boundEventHandler)}detachListener(){window.removeEventListener("storage",this.boundEventHandler)}_addListener(e,n){Object.keys(this.listeners).length===0&&(this.fallbackToPolling?this.startPolling():this.attachListener()),this.listeners[e]||(this.listeners[e]=new Set,this.localCache[e]=this.storage.getItem(e)),this.listeners[e].add(n)}_removeListener(e,n){this.listeners[e]&&(this.listeners[e].delete(n),this.listeners[e].size===0&&delete this.listeners[e]),Object.keys(this.listeners).length===0&&(this.detachListener(),this.stopPolling())}async _set(e,n){await super._set(e,n),this.localCache[e]=JSON.stringify(n)}async _get(e){const n=await super._get(e);return this.localCache[e]=JSON.stringify(n),n}async _remove(e){await super._remove(e),delete this.localCache[e]}}xr.type="LOCAL";const ta=xr;/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Fr extends Lr{constructor(){super(()=>window.sessionStorage,"SESSION")}_addListener(e,n){}_removeListener(e,n){}}Fr.type="SESSION";const Br=Fr;/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function na(t){return Promise.all(t.map(async e=>{try{return{fulfilled:!0,value:await e}}catch(n){return{fulfilled:!1,reason:n}}}))}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class ct{constructor(e){this.eventTarget=e,this.handlersMap={},this.boundEventHandler=this.handleEvent.bind(this)}static _getInstance(e){const n=this.receivers.find(s=>s.isListeningto(e));if(n)return n;const r=new ct(e);return this.receivers.push(r),r}isListeningto(e){return this.eventTarget===e}async handleEvent(e){const n=e,{eventId:r,eventType:s,data:i}=n.data,o=this.handlersMap[s];if(!(o!=null&&o.size))return;n.ports[0].postMessage({status:"ack",eventId:r,eventType:s});const a=Array.from(o).map(async l=>l(n.origin,i)),c=await na(a);n.ports[0].postMessage({status:"done",eventId:r,eventType:s,response:c})}_subscribe(e,n){Object.keys(this.handlersMap).length===0&&this.eventTarget.addEventListener("message",this.boundEventHandler),this.handlersMap[e]||(this.handlersMap[e]=new Set),this.handlersMap[e].add(n)}_unsubscribe(e,n){this.handlersMap[e]&&n&&this.handlersMap[e].delete(n),(!n||this.handlersMap[e].size===0)&&delete this.handlersMap[e],Object.keys(this.handlersMap).length===0&&this.eventTarget.removeEventListener("message",this.boundEventHandler)}}ct.receivers=[];/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function tn(t="",e=10){let n="";for(let r=0;r<e;r++)n+=Math.floor(Math.random()*10);return t+n}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class ra{constructor(e){this.target=e,this.handlers=new Set}removeMessageHandler(e){e.messageChannel&&(e.messageChannel.port1.removeEventListener("message",e.onMessage),e.messageChannel.port1.close()),this.handlers.delete(e)}async _send(e,n,r=50){const s=typeof MessageChannel<"u"?new MessageChannel:null;if(!s)throw new Error("connection_unavailable");let i,o;return new Promise((a,c)=>{const l=tn("",20);s.port1.start();const u=setTimeout(()=>{c(new Error("unsupported_event"))},r);o={messageChannel:s,onMessage(h){const m=h;if(m.data.eventId===l)switch(m.data.status){case"ack":clearTimeout(u),i=setTimeout(()=>{c(new Error("timeout"))},3e3);break;case"done":clearTimeout(i),a(m.data.response);break;default:clearTimeout(u),clearTimeout(i),c(new Error("invalid_response"));break}}},this.handlers.add(o),s.port1.addEventListener("message",o.onMessage),this.target.postMessage({eventType:e,eventId:l,data:n},[s.port2])}).finally(()=>{o&&this.removeMessageHandler(o)})}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function j(){return window}function sa(t){j().location.href=t}/**
 * @license
 * Copyright 2020 Google LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function jr(){return typeof j().WorkerGlobalScope<"u"&&typeof j().importScripts=="function"}async function ia(){if(!(navigator!=null&&navigator.serviceWorker))return null;try{return(await navigator.serviceWorker.ready).active}catch{return null}}function oa(){var t;return((t=navigator==null?void 0:navigator.serviceWorker)===null||t===void 0?void 0:t.controller)||null}function aa(){return jr()?self:null}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const $r="firebaseLocalStorageDb",ca=1,rt="firebaseLocalStorage",Hr="fbase_key";class Fe{constructor(e){this.request=e}toPromise(){return new Promise((e,n)=>{this.request.addEventListener("success",()=>{e(this.request.result)}),this.request.addEventListener("error",()=>{n(this.request.error)})})}}function lt(t,e){return t.transaction([rt],e?"readwrite":"readonly").objectStore(rt)}function la(){const t=indexedDB.deleteDatabase($r);return new Fe(t).toPromise()}function Ft(){const t=indexedDB.open($r,ca);return new Promise((e,n)=>{t.addEventListener("error",()=>{n(t.error)}),t.addEventListener("upgradeneeded",()=>{const r=t.result;try{r.createObjectStore(rt,{keyPath:Hr})}catch(s){n(s)}}),t.addEventListener("success",async()=>{const r=t.result;r.objectStoreNames.contains(rt)?e(r):(r.close(),await la(),e(await Ft()))})})}async function On(t,e,n){const r=lt(t,!0).put({[Hr]:e,value:n});return new Fe(r).toPromise()}async function ua(t,e){const n=lt(t,!1).get(e),r=await new Fe(n).toPromise();return r===void 0?null:r.value}function kn(t,e){const n=lt(t,!0).delete(e);return new Fe(n).toPromise()}const da=800,ha=3;class Vr{constructor(){this.type="LOCAL",this._shouldAllowMigration=!0,this.listeners={},this.localCache={},this.pollTimer=null,this.pendingWrites=0,this.receiver=null,this.sender=null,this.serviceWorkerReceiverAvailable=!1,this.activeServiceWorker=null,this._workerInitializationPromise=this.initializeServiceWorkerMessaging().then(()=>{},()=>{})}async _openDb(){return this.db?this.db:(this.db=await Ft(),this.db)}async _withRetries(e){let n=0;for(;;)try{const r=await this._openDb();return await e(r)}catch(r){if(n++>ha)throw r;this.db&&(this.db.close(),this.db=void 0)}}async initializeServiceWorkerMessaging(){return jr()?this.initializeReceiver():this.initializeSender()}async initializeReceiver(){this.receiver=ct._getInstance(aa()),this.receiver._subscribe("keyChanged",async(e,n)=>({keyProcessed:(await this._poll()).includes(n.key)})),this.receiver._subscribe("ping",async(e,n)=>["keyChanged"])}async initializeSender(){var e,n;if(this.activeServiceWorker=await ia(),!this.activeServiceWorker)return;this.sender=new ra(this.activeServiceWorker);const r=await this.sender._send("ping",{},800);r&&!((e=r[0])===null||e===void 0)&&e.fulfilled&&!((n=r[0])===null||n===void 0)&&n.value.includes("keyChanged")&&(this.serviceWorkerReceiverAvailable=!0)}async notifyServiceWorker(e){if(!(!this.sender||!this.activeServiceWorker||oa()!==this.activeServiceWorker))try{await this.sender._send("keyChanged",{key:e},this.serviceWorkerReceiverAvailable?800:50)}catch{}}async _isAvailable(){try{if(!indexedDB)return!1;const e=await Ft();return await On(e,nt,"1"),await kn(e,nt),!0}catch{}return!1}async _withPendingWrite(e){this.pendingWrites++;try{await e()}finally{this.pendingWrites--}}async _set(e,n){return this._withPendingWrite(async()=>(await this._withRetries(r=>On(r,e,n)),this.localCache[e]=n,this.notifyServiceWorker(e)))}async _get(e){const n=await this._withRetries(r=>ua(r,e));return this.localCache[e]=n,n}async _remove(e){return this._withPendingWrite(async()=>(await this._withRetries(n=>kn(n,e)),delete this.localCache[e],this.notifyServiceWorker(e)))}async _poll(){const e=await this._withRetries(s=>{const i=lt(s,!1).getAll();return new Fe(i).toPromise()});if(!e)return[];if(this.pendingWrites!==0)return[];const n=[],r=new Set;if(e.length!==0)for(const{fbase_key:s,value:i}of e)r.add(s),JSON.stringify(this.localCache[s])!==JSON.stringify(i)&&(this.notifyListeners(s,i),n.push(s));for(const s of Object.keys(this.localCache))this.localCache[s]&&!r.has(s)&&(this.notifyListeners(s,null),n.push(s));return n}notifyListeners(e,n){this.localCache[e]=n;const r=this.listeners[e];if(r)for(const s of Array.from(r))s(n)}startPolling(){this.stopPolling(),this.pollTimer=setInterval(async()=>this._poll(),da)}stopPolling(){this.pollTimer&&(clearInterval(this.pollTimer),this.pollTimer=null)}_addListener(e,n){Object.keys(this.listeners).length===0&&this.startPolling(),this.listeners[e]||(this.listeners[e]=new Set,this._get(e)),this.listeners[e].add(n)}_removeListener(e,n){this.listeners[e]&&(this.listeners[e].delete(n),this.listeners[e].size===0&&delete this.listeners[e]),Object.keys(this.listeners).length===0&&this.stopPolling()}}Vr.type="LOCAL";const fa=Vr;new Le(3e4,6e4);/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function pa(t,e){return e?V(e):(_(t._popupRedirectResolver,t,"argument-error"),t._popupRedirectResolver)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class nn extends Dr{constructor(e){super("custom","custom"),this.params=e}_getIdTokenResponse(e){return ye(e,this._buildIdpRequest())}_linkToIdToken(e,n){return ye(e,this._buildIdpRequest(n))}_getReauthenticationResolver(e){return ye(e,this._buildIdpRequest())}_buildIdpRequest(e){const n={requestUri:this.params.requestUri,sessionId:this.params.sessionId,postBody:this.params.postBody,tenantId:this.params.tenantId,pendingToken:this.params.pendingToken,returnSecureToken:!0,returnIdpCredential:!0};return e&&(n.idToken=e),n}}function ma(t){return Ko(t.auth,new nn(t),t.bypassAuthState)}function ga(t){const{auth:e,user:n}=t;return _(n,e,"internal-error"),Go(n,new nn(t),t.bypassAuthState)}async function _a(t){const{auth:e,user:n}=t;return _(n,e,"internal-error"),qo(n,new nn(t),t.bypassAuthState)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class zr{constructor(e,n,r,s,i=!1){this.auth=e,this.resolver=r,this.user=s,this.bypassAuthState=i,this.pendingPromise=null,this.eventManager=null,this.filter=Array.isArray(n)?n:[n]}execute(){return new Promise(async(e,n)=>{this.pendingPromise={resolve:e,reject:n};try{this.eventManager=await this.resolver._initialize(this.auth),await this.onExecution(),this.eventManager.registerConsumer(this)}catch(r){this.reject(r)}})}async onAuthEvent(e){const{urlResponse:n,sessionId:r,postBody:s,tenantId:i,error:o,type:a}=e;if(o){this.reject(o);return}const c={auth:this.auth,requestUri:n,sessionId:r,tenantId:i||void 0,postBody:s||void 0,user:this.user,bypassAuthState:this.bypassAuthState};try{this.resolve(await this.getIdpTask(a)(c))}catch(l){this.reject(l)}}onError(e){this.reject(e)}getIdpTask(e){switch(e){case"signInViaPopup":case"signInViaRedirect":return ma;case"linkViaPopup":case"linkViaRedirect":return _a;case"reauthViaPopup":case"reauthViaRedirect":return ga;default:W(this.auth,"internal-error")}}resolve(e){q(this.pendingPromise,"Pending promise was never set"),this.pendingPromise.resolve(e),this.unregisterAndCleanUp()}reject(e){q(this.pendingPromise,"Pending promise was never set"),this.pendingPromise.reject(e),this.unregisterAndCleanUp()}unregisterAndCleanUp(){this.eventManager&&this.eventManager.unregisterConsumer(this),this.pendingPromise=null,this.cleanUp()}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const wa=new Le(2e3,1e4);class me extends zr{constructor(e,n,r,s,i){super(e,n,s,i),this.provider=r,this.authWindow=null,this.pollId=null,me.currentPopupAction&&me.currentPopupAction.cancel(),me.currentPopupAction=this}async executeNotNull(){const e=await this.execute();return _(e,this.auth,"internal-error"),e}async onExecution(){q(this.filter.length===1,"Popup operations only handle one event");const e=tn();this.authWindow=await this.resolver._openPopup(this.auth,this.provider,this.filter[0],e),this.authWindow.associatedEvent=e,this.resolver._originValidation(this.auth).catch(n=>{this.reject(n)}),this.resolver._isIframeWebStorageSupported(this.auth,n=>{n||this.reject(B(this.auth,"web-storage-unsupported"))}),this.pollUserCancellation()}get eventId(){var e;return((e=this.authWindow)===null||e===void 0?void 0:e.associatedEvent)||null}cancel(){this.reject(B(this.auth,"cancelled-popup-request"))}cleanUp(){this.authWindow&&this.authWindow.close(),this.pollId&&window.clearTimeout(this.pollId),this.authWindow=null,this.pollId=null,me.currentPopupAction=null}pollUserCancellation(){const e=()=>{var n,r;if(!((r=(n=this.authWindow)===null||n===void 0?void 0:n.window)===null||r===void 0)&&r.closed){this.pollId=window.setTimeout(()=>{this.pollId=null,this.reject(B(this.auth,"popup-closed-by-user"))},8e3);return}this.pollId=window.setTimeout(e,wa.get())};e()}}me.currentPopupAction=null;/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const ya="pendingRedirect",qe=new Map;class va extends zr{constructor(e,n,r=!1){super(e,["signInViaRedirect","linkViaRedirect","reauthViaRedirect","unknown"],n,void 0,r),this.eventId=null}async execute(){let e=qe.get(this.auth._key());if(!e){try{const r=await ba(this.resolver,this.auth)?await super.execute():null;e=()=>Promise.resolve(r)}catch(n){e=()=>Promise.reject(n)}qe.set(this.auth._key(),e)}return this.bypassAuthState||qe.set(this.auth._key(),()=>Promise.resolve(null)),e()}async onAuthEvent(e){if(e.type==="signInViaRedirect")return super.onAuthEvent(e);if(e.type==="unknown"){this.resolve(null);return}if(e.eventId){const n=await this.auth._redirectUserForId(e.eventId);if(n)return this.user=n,super.onAuthEvent(e);this.resolve(null)}}async onExecution(){}cleanUp(){}}async function ba(t,e){const n=Ia(e),r=Ta(t);if(!await r._isAvailable())return!1;const s=await r._get(n)==="true";return await r._remove(n),s}function Ea(t,e){qe.set(t._key(),e)}function Ta(t){return V(t._redirectPersistence)}function Ia(t){return We(ya,t.config.apiKey,t.name)}async function Sa(t,e,n=!1){if(F(t.app))return Promise.reject(ne(t));const r=at(t),s=pa(r,e),o=await new va(r,s,n).execute();return o&&!n&&(delete o.user._redirectEventId,await r._persistUserIfCurrent(o.user),await r._setRedirectUser(null,e)),o}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Aa=10*60*1e3;class Ra{constructor(e){this.auth=e,this.cachedEventUids=new Set,this.consumers=new Set,this.queuedRedirectEvent=null,this.hasHandledPotentialRedirect=!1,this.lastProcessedEventTime=Date.now()}registerConsumer(e){this.consumers.add(e),this.queuedRedirectEvent&&this.isEventForConsumer(this.queuedRedirectEvent,e)&&(this.sendToConsumer(this.queuedRedirectEvent,e),this.saveEventToCache(this.queuedRedirectEvent),this.queuedRedirectEvent=null)}unregisterConsumer(e){this.consumers.delete(e)}onEvent(e){if(this.hasEventBeenHandled(e))return!1;let n=!1;return this.consumers.forEach(r=>{this.isEventForConsumer(e,r)&&(n=!0,this.sendToConsumer(e,r),this.saveEventToCache(e))}),this.hasHandledPotentialRedirect||!Ca(e)||(this.hasHandledPotentialRedirect=!0,n||(this.queuedRedirectEvent=e,n=!0)),n}sendToConsumer(e,n){var r;if(e.error&&!Wr(e)){const s=((r=e.error.code)===null||r===void 0?void 0:r.split("auth/")[1])||"internal-error";n.onError(B(this.auth,s))}else n.onAuthEvent(e)}isEventForConsumer(e,n){const r=n.eventId===null||!!e.eventId&&e.eventId===n.eventId;return n.filter.includes(e.type)&&r}hasEventBeenHandled(e){return Date.now()-this.lastProcessedEventTime>=Aa&&this.cachedEventUids.clear(),this.cachedEventUids.has(Pn(e))}saveEventToCache(e){this.cachedEventUids.add(Pn(e)),this.lastProcessedEventTime=Date.now()}}function Pn(t){return[t.type,t.eventId,t.sessionId,t.tenantId].filter(e=>e).join("-")}function Wr({type:t,error:e}){return t==="unknown"&&(e==null?void 0:e.code)==="auth/no-auth-event"}function Ca(t){switch(t.type){case"signInViaRedirect":case"linkViaRedirect":case"reauthViaRedirect":return!0;case"unknown":return Wr(t);default:return!1}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Oa(t,e={}){return be(t,"GET","/v1/projects",e)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const ka=/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,Pa=/^https?/;async function Na(t){if(t.config.emulator)return;const{authorizedDomains:e}=await Oa(t);for(const n of e)try{if(Da(n))return}catch{}W(t,"unauthorized-domain")}function Da(t){const e=Lt(),{protocol:n,hostname:r}=new URL(e);if(t.startsWith("chrome-extension://")){const o=new URL(t);return o.hostname===""&&r===""?n==="chrome-extension:"&&t.replace("chrome-extension://","")===e.replace("chrome-extension://",""):n==="chrome-extension:"&&o.hostname===r}if(!Pa.test(n))return!1;if(ka.test(t))return r===t;const s=t.replace(/\./g,"\\.");return new RegExp("^(.+\\."+s+"|"+s+")$","i").test(r)}/**
 * @license
 * Copyright 2020 Google LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ua=new Le(3e4,6e4);function Nn(){const t=j().___jsl;if(t!=null&&t.H){for(const e of Object.keys(t.H))if(t.H[e].r=t.H[e].r||[],t.H[e].L=t.H[e].L||[],t.H[e].r=[...t.H[e].L],t.CP)for(let n=0;n<t.CP.length;n++)t.CP[n]=null}}function Ma(t){return new Promise((e,n)=>{var r,s,i;function o(){Nn(),gapi.load("gapi.iframes",{callback:()=>{e(gapi.iframes.getContext())},ontimeout:()=>{Nn(),n(B(t,"network-request-failed"))},timeout:Ua.get()})}if(!((s=(r=j().gapi)===null||r===void 0?void 0:r.iframes)===null||s===void 0)&&s.Iframe)e(gapi.iframes.getContext());else if(!((i=j().gapi)===null||i===void 0)&&i.load)o();else{const a=Bo("iframefcb");return j()[a]=()=>{gapi.load?o():n(B(t,"network-request-failed"))},xo(`${Fo()}?onload=${a}`).catch(c=>n(c))}}).catch(e=>{throw Ge=null,e})}let Ge=null;function La(t){return Ge=Ge||Ma(t),Ge}/**
 * @license
 * Copyright 2020 Google LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const xa=new Le(5e3,15e3),Fa="__/auth/iframe",Ba="emulator/auth/iframe",ja={style:{position:"absolute",top:"-100px",width:"1px",height:"1px"},"aria-hidden":"true",tabindex:"-1"},$a=new Map([["identitytoolkit.googleapis.com","p"],["staging-identitytoolkit.sandbox.googleapis.com","s"],["test-identitytoolkit.sandbox.googleapis.com","t"]]);function Ha(t){const e=t.config;_(e.authDomain,t,"auth-domain-config-required");const n=e.emulator?Yt(e,Ba):`https://${t.config.authDomain}/${Fa}`,r={apiKey:e.apiKey,appName:t.name,v:Me},s=$a.get(t.config.apiHost);s&&(r.eid=s);const i=t._getFrameworks();return i.length&&(r.fw=i.join(",")),`${n}?${Ue(r).slice(1)}`}async function Va(t){const e=await La(t),n=j().gapi;return _(n,t,"internal-error"),e.open({where:document.body,url:Ha(t),messageHandlersFilter:n.iframes.CROSS_ORIGIN_IFRAMES_FILTER,attributes:ja,dontclear:!0},r=>new Promise(async(s,i)=>{await r.restyle({setHideOnLeave:!1});const o=B(t,"network-request-failed"),a=j().setTimeout(()=>{i(o)},xa.get());function c(){j().clearTimeout(a),s(r)}r.ping(c).then(c,()=>{i(o)})}))}/**
 * @license
 * Copyright 2020 Google LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const za={location:"yes",resizable:"yes",statusbar:"yes",toolbar:"no"},Wa=500,qa=600,Ga="_blank",Ka="http://localhost";class Dn{constructor(e){this.window=e,this.associatedEvent=null}close(){if(this.window)try{this.window.close()}catch{}}}function Ja(t,e,n,r=Wa,s=qa){const i=Math.max((window.screen.availHeight-s)/2,0).toString(),o=Math.max((window.screen.availWidth-r)/2,0).toString();let a="";const c=Object.assign(Object.assign({},za),{width:r.toString(),height:s.toString(),top:i,left:o}),l=k().toLowerCase();n&&(a=Sr(l)?Ga:n),Tr(l)&&(e=e||Ka,c.scrollbars="yes");const u=Object.entries(c).reduce((m,[y,f])=>`${m}${y}=${f},`,"");if(Oo(l)&&a!=="_self")return Xa(e||"",a),new Dn(null);const h=window.open(e||"",a,u);_(h,t,"popup-blocked");try{h.focus()}catch{}return new Dn(h)}function Xa(t,e){const n=document.createElement("a");n.href=t,n.target=e;const r=document.createEvent("MouseEvent");r.initMouseEvent("click",!0,!0,window,1,0,0,0,0,!1,!1,!1,!1,1,null),n.dispatchEvent(r)}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ya="__/auth/handler",Qa="emulator/auth/handler",Za=encodeURIComponent("fac");async function Un(t,e,n,r,s,i){_(t.config.authDomain,t,"auth-domain-config-required"),_(t.config.apiKey,t,"invalid-api-key");const o={apiKey:t.config.apiKey,appName:t.name,authType:n,redirectUrl:r,v:Me,eventId:s};if(e instanceof Ur){e.setDefaultLanguage(t.languageCode),o.providerId=e.providerId||"",ei(e.getCustomParameters())||(o.customParameters=JSON.stringify(e.getCustomParameters()));for(const[u,h]of Object.entries({}))o[u]=h}if(e instanceof xe){const u=e.getScopes().filter(h=>h!=="");u.length>0&&(o.scopes=u.join(","))}t.tenantId&&(o.tid=t.tenantId);const a=o;for(const u of Object.keys(a))a[u]===void 0&&delete a[u];const c=await t._getAppCheckToken(),l=c?`#${Za}=${encodeURIComponent(c)}`:"";return`${ec(t)}?${Ue(a).slice(1)}${l}`}function ec({config:t}){return t.emulator?Yt(t,Qa):`https://${t.authDomain}/${Ya}`}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Rt="webStorageSupport";class tc{constructor(){this.eventManagers={},this.iframes={},this.originValidationPromises={},this._redirectPersistence=Br,this._completeRedirectFn=Sa,this._overrideRedirectResult=Ea}async _openPopup(e,n,r,s){var i;q((i=this.eventManagers[e._key()])===null||i===void 0?void 0:i.manager,"_initialize() not called before _openPopup()");const o=await Un(e,n,r,Lt(),s);return Ja(e,o,tn())}async _openRedirect(e,n,r,s){await this._originValidation(e);const i=await Un(e,n,r,Lt(),s);return sa(i),new Promise(()=>{})}_initialize(e){const n=e._key();if(this.eventManagers[n]){const{manager:s,promise:i}=this.eventManagers[n];return s?Promise.resolve(s):(q(i,"If manager is not set, promise should be"),i)}const r=this.initAndGetManager(e);return this.eventManagers[n]={promise:r},r.catch(()=>{delete this.eventManagers[n]}),r}async initAndGetManager(e){const n=await Va(e),r=new Ra(e);return n.register("authEvent",s=>(_(s==null?void 0:s.authEvent,e,"invalid-auth-event"),{status:r.onEvent(s.authEvent)?"ACK":"ERROR"}),gapi.iframes.CROSS_ORIGIN_IFRAMES_FILTER),this.eventManagers[e._key()]={manager:r},this.iframes[e._key()]=n,r}_isIframeWebStorageSupported(e,n){this.iframes[e._key()].send(Rt,{type:Rt},s=>{var i;const o=(i=s==null?void 0:s[0])===null||i===void 0?void 0:i[Rt];o!==void 0&&n(!!o),W(e,"internal-error")},gapi.iframes.CROSS_ORIGIN_IFRAMES_FILTER)}_originValidation(e){const n=e._key();return this.originValidationPromises[n]||(this.originValidationPromises[n]=Na(e)),this.originValidationPromises[n]}get _shouldInitProactively(){return kr()||Ir()||Zt()}}const nc=tc;var Mn="@firebase/auth",Ln="1.9.0";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class rc{constructor(e){this.auth=e,this.internalListeners=new Map}getUid(){var e;return this.assertAuthConfigured(),((e=this.auth.currentUser)===null||e===void 0?void 0:e.uid)||null}async getToken(e){return this.assertAuthConfigured(),await this.auth._initializationPromise,this.auth.currentUser?{accessToken:await this.auth.currentUser.getIdToken(e)}:null}addAuthTokenListener(e){if(this.assertAuthConfigured(),this.internalListeners.has(e))return;const n=this.auth.onIdTokenChanged(r=>{e((r==null?void 0:r.stsTokenManager.accessToken)||null)});this.internalListeners.set(e,n),this.updateProactiveRefresh()}removeAuthTokenListener(e){this.assertAuthConfigured();const n=this.internalListeners.get(e);n&&(this.internalListeners.delete(e),n(),this.updateProactiveRefresh())}assertAuthConfigured(){_(this.auth._initializationPromise,"dependent-sdk-initialized-before-auth")}updateProactiveRefresh(){this.internalListeners.size>0?this.auth._startProactiveRefresh():this.auth._stopProactiveRefresh()}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function sc(t){switch(t){case"Node":return"node";case"ReactNative":return"rn";case"Worker":return"webworker";case"Cordova":return"cordova";case"WebExtension":return"web-extension";default:return}}function ic(t){Oe(new ve("auth",(e,{options:n})=>{const r=e.getProvider("app").getImmediate(),s=e.getProvider("heartbeat"),i=e.getProvider("app-check-internal"),{apiKey:o,authDomain:a}=r.options;_(o&&!o.includes(":"),"invalid-api-key",{appName:r.name});const c={apiKey:o,authDomain:a,clientPlatform:t,apiHost:"identitytoolkit.googleapis.com",tokenApiHost:"securetoken.googleapis.com",apiScheme:"https",sdkClientVersion:Pr(t)},l=new Mo(r,s,i,c);return $o(l,n),l},"PUBLIC").setInstantiationMode("EXPLICIT").setInstanceCreatedCallback((e,n,r)=>{e.getProvider("auth-internal").initialize()})),Oe(new ve("auth-internal",e=>{const n=at(e.getProvider("auth").getImmediate());return(r=>new rc(r))(n)},"PRIVATE").setInstantiationMode("EXPLICIT")),ge(Mn,Ln,sc(t)),ge(Mn,Ln,"esm2017")}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const oc=5*60,ac=sr("authIdTokenMaxAge")||oc;let xn=null;const cc=t=>async e=>{const n=e&&await e.getIdTokenResult(),r=n&&(new Date().getTime()-Date.parse(n.issuedAtTime))/1e3;if(r&&r>ac)return;const s=n==null?void 0:n.token;xn!==s&&(xn=s,await fetch(t,{method:s?"POST":"DELETE",headers:s?{Authorization:`Bearer ${s}`}:{}}))};function lc(t=ur()){const e=cr(t,"auth");if(e.isInitialized())return e.getImmediate();const n=jo(t,{popupRedirectResolver:nc,persistence:[fa,ta,Br]}),r=sr("authTokenSyncURL");if(r&&typeof isSecureContext=="boolean"&&isSecureContext){const i=new URL(r,location.origin);if(location.origin===i.origin){const o=cc(i.toString());Qo(n,o,()=>o(n.currentUser)),Yo(n,a=>o(a))}}const s=Hs("auth");return s&&Ho(n,`http://${s}`),n}function uc(){var t,e;return(e=(t=document.getElementsByTagName("head"))===null||t===void 0?void 0:t[0])!==null&&e!==void 0?e:document}Lo({loadJS(t){return new Promise((e,n)=>{const r=document.createElement("script");r.setAttribute("src",t),r.onload=e,r.onerror=s=>{const i=B("internal-error");i.customData=s,n(i)},r.type="text/javascript",r.charset="UTF-8",uc().appendChild(r)})},gapiScript:"",recaptchaV2Script:"",recaptchaEnterpriseScript:""});ic("Browser");var dc="firebase",hc="11.3.1";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */ge(dc,hc,"app");const fc={apiKey:"AIzaSyCpxCxHBkg0SB37Nk3eRBrlUKN9vdeHETg",authDomain:"preplaced-prod.firebaseapp.com",projectId:"preplaced-prod",databaseURL:"https://preplaced-dev-default-rtdb.asia-southeast1.firebasedatabase.app",storageBucket:"preplaced-prod.appspot.com",messagingSenderId:"772755083885",appId:"1:772755083885:web:64e6c7579f31112ef8a564",measurementId:"G-ZJPLFVNB4J"};function pc(t){try{return ur()}catch{return lr(t)}}const mc=pc(fc),Bt=lc(mc),gc={"pro-pilot":{"whitelisted-urls":["https://leetcode.com/problems/*","https://takeuforward.org/*","https://medium.com/*","https://hackerrank.com/challenges/*","https://www.medium.com/*","https://www.geeksforgeeks.org/*","https://youtube.com/watch*","https://youtu.be/*","https://developer.mozilla.org/*","https://javascript.info/*","https://www.mindtools.com/*","https://www.w3schools.com/*","https://www.tutorialspoint.com/*","https://legacy.reactjs.org/*","https://www.freecodecamp.org/*","https://v1.scrimba.com/*","https://reactrouter.com/*","https://redux.js.org/*","https://react.dev/*","https://jestjs.io/*","https://testing-library.com/*","https://graphql.org/*","https://jwt.io/*","https://infisical.com/*","https://nodejs.org/*","https://docs.npmjs.com/*","https://blog.postman.com/*","https://expressjs.com/*","https://www.npmjs.com/*","https://dev.to/*","https://blog.logrocket.com/*","https://www.atlassian.com/*","https://azure.microsoft.com/*","https://learn.microsoft.com/*","https://www.redhat.com/*","https://docs.gitlab.com/*","https://docs.netlify.com/*","https://kubernetes.io/*","https://aws.amazon.com/*","https://microservices.io/*","https://www.designgurus.io/*","https://www.digitalocean.com/*","https://www.cloudflare.com/*","https://www.visual-paradigm.com/*","https://refactoring.guru/*","https://www.integrate.io/*","https://workat.tech/*","https://www.interaction-design.org/*","https://www.interviewbit.com/*"],"blacklisted-urls":["https://naukri.com/*","https://accounts.google.com/*","https://preplaced.in/*","https://facebook.com/*","https://instagram.com/*","https://twitter.com/*","https://x.com/*","https://reddit.com/*","https://tiktok.com/*","https://discord.com/*","https://twitch.tv/*","https://snapchat.com/*","https://pinterest.com/*","https://linkedin.com/feed/*","https://netflix.com/*","https://primevideo.com/*","https://hotstar.com/*","https://hulu.com/*","https://hbomax.com/*","https://disneyplus.com/*","https://sonyliv.com/*","https://voot.com/*","https://zee5.com/*","https://apple.com/tv/*","https://youtube.com/feed/trending*","https://youtube.com/shorts*","https://meet.google.com/*"]},default:{"whitelisted-urls":["https://leetcode.com/*","https://medium.com/*","https://hackerrank.com/challenges/*","https://www.medium.com/*","https://www.geeksforgeeks.org/*","https://youtube.com/watch*","https://youtu.be/*","https://developer.mozilla.org/*","https://javascript.info/*","https://www.mindtools.com/*","https://www.w3schools.com/*","https://www.tutorialspoint.com/*","https://legacy.reactjs.org/*","https://www.freecodecamp.org/*","https://v1.scrimba.com/*","https://reactrouter.com/*","https://redux.js.org/*","https://react.dev/*","https://jestjs.io/*","https://testing-library.com/*","https://graphql.org/*","https://jwt.io/*","https://infisical.com/*","https://nodejs.org/*","https://docs.npmjs.com/*","https://blog.postman.com/*","https://expressjs.com/*","https://www.npmjs.com/*","https://dev.to/*","https://blog.logrocket.com/*","https://www.atlassian.com/*","https://azure.microsoft.com/*","https://learn.microsoft.com/*","https://www.redhat.com/*","https://docs.gitlab.com/*","https://docs.netlify.com/*","https://kubernetes.io/*","https://aws.amazon.com/*","https://microservices.io/*","https://www.designgurus.io/*","https://www.digitalocean.com/*","https://www.cloudflare.com/*","https://www.visual-paradigm.com/*","https://refactoring.guru/*","https://www.integrate.io/*","https://workat.tech/*","https://www.interaction-design.org/*","https://www.interviewbit.com/*"],"blacklisted-urls":["https://naukri.com/*","https://accounts.google.com/*","https://preplaced.in/*","https://facebook.com/*","https://instagram.com/*","https://twitter.com/*","https://x.com/*","https://reddit.com/*","https://tiktok.com/*","https://discord.com/*","https://twitch.tv/*","https://snapchat.com/*","https://pinterest.com/*","https://linkedin.com/feed/*","https://netflix.com/*","https://primevideo.com/*","https://hotstar.com/*","https://hulu.com/*","https://hbomax.com/*","https://disneyplus.com/*","https://sonyliv.com/*","https://voot.com/*","https://zee5.com/*","https://apple.com/tv/*","https://youtube.com/feed/trending*","https://youtube.com/shorts*","https://meet.google.com/*"]}},_c={"Coding Practice":["leetcode.com/problems","needcode.io/problems","takeuforward.org/plus","geeksforgeeks.org/problems","hackerrank.com/challenges"],Youtube:["youtube.com/watch?v="]},wc=t=>t&&t.includes("youtube.com/watch?v=")?`https://www.youtube.com/watch?v=${t.split("watch?v=")[1].split("&")[0]}`:t,yc=(t,e)=>{const n=gc[e],r=(n==null?void 0:n["blacklisted-urls"])||[],s=(n==null?void 0:n["whitelisted-urls"])||[],i=r.some(a=>new RegExp("^https?:\\/\\/(www\\.)?"+a.replace(/https?:\/\//,"").replace(/\*/g,".*")+"$").test(t)),o=s.some(a=>new RegExp("^https?:\\/\\/(www\\.)?"+a.replace(/https?:\/\//,"").replace(/\*/g,".*")+"$").test(t));return i?"blacklisted":o?"whitelisted":"normal"},Cu=t=>{let n=new URLSearchParams(t).get("session_type");!n&&window.location.hash&&(n=new URLSearchParams(window.location.hash.slice(1)).get("session_type"));for(const[r,s]of Object.entries(_c))if(s.some(i=>t.includes(i))){n=r;break}return n},qr=async()=>{try{return(await chrome.storage.local.get(["chatMessages"])).chatMessages||[]}catch(t){return console.error("Error getting chat messages from storage:",t),[]}},Ou=async()=>{try{const t=await qr(),n=new Date().toDateString();return t.filter(s=>s.sent_by==="user"?new Date(parseInt(s.createdAt||s.created_at)).toDateString()===n:!1).length}catch(t){return console.error("Error getting today's message count:",t),0}},ku=async(t=20)=>{try{const n=(await qr()).filter(r=>{if(r.sent_by==="user"){const s=new Date(parseInt(r.createdAt||r.created_at)),i=new Date;if(s.toDateString()===i.toDateString())return!0}return!1}).length;return Math.max(t-n,0)}catch(e){return console.error("Error calculating daily messages left:",e),t}},vc=()=>new Date().toISOString().split("T")[0];function Pu(t){try{const n=new URL(t).pathname.split("/").filter(Boolean);return n[0]==="problems"&&n[1]?n[1]:null}catch(e){return console.error("Invalid URL:",e),null}}const Nu=async()=>{try{const t=vc(),e=await chrome.storage.local.get(["extensionUsedDaysCount","lastMessageSentDate"]),n=parseInt(e.extensionUsedDaysCount||"0"),r=e.lastMessageSentDate;if(isNaN(n)||n<0)return console.warn(`Invalid extensionUsedDaysCount found: ${e.extensionUsedDaysCount}, resetting to 0`),await chrome.storage.local.set({extensionUsedDaysCount:"0",lastMessageSentDate:t}),0;if(r!==t){const s=n+1;return await chrome.storage.local.set({extensionUsedDaysCount:s.toString(),lastMessageSentDate:t}),s}else return n}catch(t){console.error("Error incrementing extensionUsedDaysCount:",t);const e=await chrome.storage.local.get("extensionUsedDaysCount");return parseInt(e.extensionUsedDaysCount||"0")}},bc=async()=>{try{const t=await chrome.storage.local.get("extensionUsedDaysCount"),e=parseInt(t.extensionUsedDaysCount||"0");return isNaN(e)?0:e}catch(t){return console.error("Error getting extensionUsedDaysCount:",t),0}},Ec=t=>{var a;if(!t)return 0;let e=new Date(t);`${e}`.includes("Invalid")&&(e=new Date((a=t==null?void 0:t.split("T"))==null?void 0:a[0]));const n=new Date,r=new Date(Date.UTC(n.getFullYear(),n.getMonth(),n.getDate())),i=new Date(Date.UTC(e.getFullYear(),e.getMonth(),e.getDate())).getTime()-r.getTime(),o=Math.floor(i/(1e3*60*60*24));return Math.max(0,o)},Tc=t=>!t||!Array.isArray(t)?[]:[...t].sort((e,n)=>{const r=new Date(e.created);return new Date(n.created).getTime()-r.getTime()}),Gr=t=>{const e=Tc(t);return e.find(n=>n.status==="Active")||e[0]||null},Fn=t=>{if(!t||!t.pricing_plan)return!1;const e=Gr(t.subscriptions);return t.pricing_plan.user_type==="trial"&&!(e!=null&&e.cancelledOn)},jt=t=>!t||!t.pricing_plan?!1:t.pricing_plan.user_type==="paid",Kr=t=>t?(t==null?void 0:t.subscriptionTrialDays)===7?"7":(t==null?void 0:t.subscriptionTrialDays)===30?"30":null:null,rn=t=>{var e;return t?(t==null?void 0:t.status)==="Active"&&!!(t!=null&&t.cancelledOn)&&((e=t==null?void 0:t.pricing_plan)==null?void 0:e.user_type)!=="trial":!1},Ic=t=>t?(t==null?void 0:t.status)==="Expired":!1,Sc=t=>t?(t==null?void 0:t.status)==="Active":!1,Jr=(t,e,n)=>{if(!t||!rn(t))return!1;const r=Kr(t);return r==="7"?e<=5:r==="30"||jt(n)?e<=7:!1},Ac=(t,e,n)=>rn(t)?e<=1?"last_day":Jr(t,e,n)?"during":"before":"none",Du=t=>{var y,f;const e=((y=t==null?void 0:t.subscriptions)==null?void 0:y.find(g=>g.status==="Active"))||((f=t==null?void 0:t.subscriptions)==null?void 0:f[0]);let n="free";Fn(t)?n="trial":jt(t)&&(n="paid");const r=Fn(t),s=jt(t),i=!r&&!s,o=rn(e),a=Ic(e),c=Sc(e),l=Kr(e),u=Ec((e==null?void 0:e.actualExpirationDate)||(e==null?void 0:e.nextRenewalDate)),h=Ac(e,u,t),m=Jr(e,u,t);return{userType:n,isTrial:r,isPaid:s,isFree:i,isCancelled:o,isExpired:a,isActive:c,trialDuration:l||void 0,daysRemaining:u,triggerPeriod:h,isInTriggerPeriod:m}},Rc=()=>{try{const t=Intl.DateTimeFormat().resolvedOptions().timeZone;if(!(t==="Asia/Calcutta"||t==="Asia/Kolkata"))return"USD"}catch(t){console.error(t)}return"INR"},Uu=(t,e="int")=>Rc()==="USD"?e==="float"?`$${t.toFixed(1).toLocaleString()}`:`$${Math.floor(t).toLocaleString("en-US")}`:e==="float"?`₹${t.toFixed().toLocaleString()}`:`₹${Math.floor(t).toLocaleString("en-IN")}`;function Xr(t,e){return function(){return t.apply(e,arguments)}}const{toString:Cc}=Object.prototype,{getPrototypeOf:sn}=Object,ut=(t=>e=>{const n=Cc.call(e);return t[n]||(t[n]=n.slice(8,-1).toLowerCase())})(Object.create(null)),L=t=>(t=t.toLowerCase(),e=>ut(e)===t),dt=t=>e=>typeof e===t,{isArray:Ee}=Array,Ne=dt("undefined");function Oc(t){return t!==null&&!Ne(t)&&t.constructor!==null&&!Ne(t.constructor)&&U(t.constructor.isBuffer)&&t.constructor.isBuffer(t)}const Yr=L("ArrayBuffer");function kc(t){let e;return typeof ArrayBuffer<"u"&&ArrayBuffer.isView?e=ArrayBuffer.isView(t):e=t&&t.buffer&&Yr(t.buffer),e}const Pc=dt("string"),U=dt("function"),Qr=dt("number"),ht=t=>t!==null&&typeof t=="object",Nc=t=>t===!0||t===!1,Ke=t=>{if(ut(t)!=="object")return!1;const e=sn(t);return(e===null||e===Object.prototype||Object.getPrototypeOf(e)===null)&&!(Symbol.toStringTag in t)&&!(Symbol.iterator in t)},Dc=L("Date"),Uc=L("File"),Mc=L("Blob"),Lc=L("FileList"),xc=t=>ht(t)&&U(t.pipe),Fc=t=>{let e;return t&&(typeof FormData=="function"&&t instanceof FormData||U(t.append)&&((e=ut(t))==="formdata"||e==="object"&&U(t.toString)&&t.toString()==="[object FormData]"))},Bc=L("URLSearchParams"),[jc,$c,Hc,Vc]=["ReadableStream","Request","Response","Headers"].map(L),zc=t=>t.trim?t.trim():t.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,"");function Be(t,e,{allOwnKeys:n=!1}={}){if(t===null||typeof t>"u")return;let r,s;if(typeof t!="object"&&(t=[t]),Ee(t))for(r=0,s=t.length;r<s;r++)e.call(null,t[r],r,t);else{const i=n?Object.getOwnPropertyNames(t):Object.keys(t),o=i.length;let a;for(r=0;r<o;r++)a=i[r],e.call(null,t[a],a,t)}}function Zr(t,e){e=e.toLowerCase();const n=Object.keys(t);let r=n.length,s;for(;r-- >0;)if(s=n[r],e===s.toLowerCase())return s;return null}const ae=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:global,es=t=>!Ne(t)&&t!==ae;function $t(){const{caseless:t}=es(this)&&this||{},e={},n=(r,s)=>{const i=t&&Zr(e,s)||s;Ke(e[i])&&Ke(r)?e[i]=$t(e[i],r):Ke(r)?e[i]=$t({},r):Ee(r)?e[i]=r.slice():e[i]=r};for(let r=0,s=arguments.length;r<s;r++)arguments[r]&&Be(arguments[r],n);return e}const Wc=(t,e,n,{allOwnKeys:r}={})=>(Be(e,(s,i)=>{n&&U(s)?t[i]=Xr(s,n):t[i]=s},{allOwnKeys:r}),t),qc=t=>(t.charCodeAt(0)===65279&&(t=t.slice(1)),t),Gc=(t,e,n,r)=>{t.prototype=Object.create(e.prototype,r),t.prototype.constructor=t,Object.defineProperty(t,"super",{value:e.prototype}),n&&Object.assign(t.prototype,n)},Kc=(t,e,n,r)=>{let s,i,o;const a={};if(e=e||{},t==null)return e;do{for(s=Object.getOwnPropertyNames(t),i=s.length;i-- >0;)o=s[i],(!r||r(o,t,e))&&!a[o]&&(e[o]=t[o],a[o]=!0);t=n!==!1&&sn(t)}while(t&&(!n||n(t,e))&&t!==Object.prototype);return e},Jc=(t,e,n)=>{t=String(t),(n===void 0||n>t.length)&&(n=t.length),n-=e.length;const r=t.indexOf(e,n);return r!==-1&&r===n},Xc=t=>{if(!t)return null;if(Ee(t))return t;let e=t.length;if(!Qr(e))return null;const n=new Array(e);for(;e-- >0;)n[e]=t[e];return n},Yc=(t=>e=>t&&e instanceof t)(typeof Uint8Array<"u"&&sn(Uint8Array)),Qc=(t,e)=>{const r=(t&&t[Symbol.iterator]).call(t);let s;for(;(s=r.next())&&!s.done;){const i=s.value;e.call(t,i[0],i[1])}},Zc=(t,e)=>{let n;const r=[];for(;(n=t.exec(e))!==null;)r.push(n);return r},el=L("HTMLFormElement"),tl=t=>t.toLowerCase().replace(/[-_\s]([a-z\d])(\w*)/g,function(n,r,s){return r.toUpperCase()+s}),Bn=(({hasOwnProperty:t})=>(e,n)=>t.call(e,n))(Object.prototype),nl=L("RegExp"),ts=(t,e)=>{const n=Object.getOwnPropertyDescriptors(t),r={};Be(n,(s,i)=>{let o;(o=e(s,i,t))!==!1&&(r[i]=o||s)}),Object.defineProperties(t,r)},rl=t=>{ts(t,(e,n)=>{if(U(t)&&["arguments","caller","callee"].indexOf(n)!==-1)return!1;const r=t[n];if(U(r)){if(e.enumerable=!1,"writable"in e){e.writable=!1;return}e.set||(e.set=()=>{throw Error("Can not rewrite read-only method '"+n+"'")})}})},sl=(t,e)=>{const n={},r=s=>{s.forEach(i=>{n[i]=!0})};return Ee(t)?r(t):r(String(t).split(e)),n},il=()=>{},ol=(t,e)=>t!=null&&Number.isFinite(t=+t)?t:e;function al(t){return!!(t&&U(t.append)&&t[Symbol.toStringTag]==="FormData"&&t[Symbol.iterator])}const cl=t=>{const e=new Array(10),n=(r,s)=>{if(ht(r)){if(e.indexOf(r)>=0)return;if(!("toJSON"in r)){e[s]=r;const i=Ee(r)?[]:{};return Be(r,(o,a)=>{const c=n(o,s+1);!Ne(c)&&(i[a]=c)}),e[s]=void 0,i}}return r};return n(t,0)},ll=L("AsyncFunction"),ul=t=>t&&(ht(t)||U(t))&&U(t.then)&&U(t.catch),ns=((t,e)=>t?setImmediate:e?((n,r)=>(ae.addEventListener("message",({source:s,data:i})=>{s===ae&&i===n&&r.length&&r.shift()()},!1),s=>{r.push(s),ae.postMessage(n,"*")}))(`axios@${Math.random()}`,[]):n=>setTimeout(n))(typeof setImmediate=="function",U(ae.postMessage)),dl=typeof queueMicrotask<"u"?queueMicrotask.bind(ae):typeof process<"u"&&process.nextTick||ns,d={isArray:Ee,isArrayBuffer:Yr,isBuffer:Oc,isFormData:Fc,isArrayBufferView:kc,isString:Pc,isNumber:Qr,isBoolean:Nc,isObject:ht,isPlainObject:Ke,isReadableStream:jc,isRequest:$c,isResponse:Hc,isHeaders:Vc,isUndefined:Ne,isDate:Dc,isFile:Uc,isBlob:Mc,isRegExp:nl,isFunction:U,isStream:xc,isURLSearchParams:Bc,isTypedArray:Yc,isFileList:Lc,forEach:Be,merge:$t,extend:Wc,trim:zc,stripBOM:qc,inherits:Gc,toFlatObject:Kc,kindOf:ut,kindOfTest:L,endsWith:Jc,toArray:Xc,forEachEntry:Qc,matchAll:Zc,isHTMLForm:el,hasOwnProperty:Bn,hasOwnProp:Bn,reduceDescriptors:ts,freezeMethods:rl,toObjectSet:sl,toCamelCase:tl,noop:il,toFiniteNumber:ol,findKey:Zr,global:ae,isContextDefined:es,isSpecCompliantForm:al,toJSONObject:cl,isAsyncFn:ll,isThenable:ul,setImmediate:ns,asap:dl};function w(t,e,n,r,s){Error.call(this),Error.captureStackTrace?Error.captureStackTrace(this,this.constructor):this.stack=new Error().stack,this.message=t,this.name="AxiosError",e&&(this.code=e),n&&(this.config=n),r&&(this.request=r),s&&(this.response=s,this.status=s.status?s.status:null)}d.inherits(w,Error,{toJSON:function(){return{message:this.message,name:this.name,description:this.description,number:this.number,fileName:this.fileName,lineNumber:this.lineNumber,columnNumber:this.columnNumber,stack:this.stack,config:d.toJSONObject(this.config),code:this.code,status:this.status}}});const rs=w.prototype,ss={};["ERR_BAD_OPTION_VALUE","ERR_BAD_OPTION","ECONNABORTED","ETIMEDOUT","ERR_NETWORK","ERR_FR_TOO_MANY_REDIRECTS","ERR_DEPRECATED","ERR_BAD_RESPONSE","ERR_BAD_REQUEST","ERR_CANCELED","ERR_NOT_SUPPORT","ERR_INVALID_URL"].forEach(t=>{ss[t]={value:t}});Object.defineProperties(w,ss);Object.defineProperty(rs,"isAxiosError",{value:!0});w.from=(t,e,n,r,s,i)=>{const o=Object.create(rs);return d.toFlatObject(t,o,function(c){return c!==Error.prototype},a=>a!=="isAxiosError"),w.call(o,t.message,e,n,r,s),o.cause=t,o.name=t.name,i&&Object.assign(o,i),o};const hl=null;function Ht(t){return d.isPlainObject(t)||d.isArray(t)}function is(t){return d.endsWith(t,"[]")?t.slice(0,-2):t}function jn(t,e,n){return t?t.concat(e).map(function(s,i){return s=is(s),!n&&i?"["+s+"]":s}).join(n?".":""):e}function fl(t){return d.isArray(t)&&!t.some(Ht)}const pl=d.toFlatObject(d,{},null,function(e){return/^is[A-Z]/.test(e)});function ft(t,e,n){if(!d.isObject(t))throw new TypeError("target must be an object");e=e||new FormData,n=d.toFlatObject(n,{metaTokens:!0,dots:!1,indexes:!1},!1,function(g,p){return!d.isUndefined(p[g])});const r=n.metaTokens,s=n.visitor||u,i=n.dots,o=n.indexes,c=(n.Blob||typeof Blob<"u"&&Blob)&&d.isSpecCompliantForm(e);if(!d.isFunction(s))throw new TypeError("visitor must be a function");function l(f){if(f===null)return"";if(d.isDate(f))return f.toISOString();if(!c&&d.isBlob(f))throw new w("Blob is not supported. Use a Buffer instead.");return d.isArrayBuffer(f)||d.isTypedArray(f)?c&&typeof Blob=="function"?new Blob([f]):Buffer.from(f):f}function u(f,g,p){let b=f;if(f&&!p&&typeof f=="object"){if(d.endsWith(g,"{}"))g=r?g:g.slice(0,-2),f=JSON.stringify(f);else if(d.isArray(f)&&fl(f)||(d.isFileList(f)||d.endsWith(g,"[]"))&&(b=d.toArray(f)))return g=is(g),b.forEach(function(v,C){!(d.isUndefined(v)||v===null)&&e.append(o===!0?jn([g],C,i):o===null?g:g+"[]",l(v))}),!1}return Ht(f)?!0:(e.append(jn(p,g,i),l(f)),!1)}const h=[],m=Object.assign(pl,{defaultVisitor:u,convertValue:l,isVisitable:Ht});function y(f,g){if(!d.isUndefined(f)){if(h.indexOf(f)!==-1)throw Error("Circular reference detected in "+g.join("."));h.push(f),d.forEach(f,function(b,T){(!(d.isUndefined(b)||b===null)&&s.call(e,b,d.isString(T)?T.trim():T,g,m))===!0&&y(b,g?g.concat(T):[T])}),h.pop()}}if(!d.isObject(t))throw new TypeError("data must be an object");return y(t),e}function $n(t){const e={"!":"%21","'":"%27","(":"%28",")":"%29","~":"%7E","%20":"+","%00":"\0"};return encodeURIComponent(t).replace(/[!'()~]|%20|%00/g,function(r){return e[r]})}function on(t,e){this._pairs=[],t&&ft(t,this,e)}const os=on.prototype;os.append=function(e,n){this._pairs.push([e,n])};os.toString=function(e){const n=e?function(r){return e.call(this,r,$n)}:$n;return this._pairs.map(function(s){return n(s[0])+"="+n(s[1])},"").join("&")};function ml(t){return encodeURIComponent(t).replace(/%3A/gi,":").replace(/%24/g,"$").replace(/%2C/gi,",").replace(/%20/g,"+").replace(/%5B/gi,"[").replace(/%5D/gi,"]")}function as(t,e,n){if(!e)return t;const r=n&&n.encode||ml;d.isFunction(n)&&(n={serialize:n});const s=n&&n.serialize;let i;if(s?i=s(e,n):i=d.isURLSearchParams(e)?e.toString():new on(e,n).toString(r),i){const o=t.indexOf("#");o!==-1&&(t=t.slice(0,o)),t+=(t.indexOf("?")===-1?"?":"&")+i}return t}class Hn{constructor(){this.handlers=[]}use(e,n,r){return this.handlers.push({fulfilled:e,rejected:n,synchronous:r?r.synchronous:!1,runWhen:r?r.runWhen:null}),this.handlers.length-1}eject(e){this.handlers[e]&&(this.handlers[e]=null)}clear(){this.handlers&&(this.handlers=[])}forEach(e){d.forEach(this.handlers,function(r){r!==null&&e(r)})}}const cs={silentJSONParsing:!0,forcedJSONParsing:!0,clarifyTimeoutError:!1},gl=typeof URLSearchParams<"u"?URLSearchParams:on,_l=typeof FormData<"u"?FormData:null,wl=typeof Blob<"u"?Blob:null,yl={isBrowser:!0,classes:{URLSearchParams:gl,FormData:_l,Blob:wl},protocols:["http","https","file","blob","url","data"]},an=typeof window<"u"&&typeof document<"u",Vt=typeof navigator=="object"&&navigator||void 0,vl=an&&(!Vt||["ReactNative","NativeScript","NS"].indexOf(Vt.product)<0),bl=typeof WorkerGlobalScope<"u"&&self instanceof WorkerGlobalScope&&typeof self.importScripts=="function",El=an&&window.location.href||"http://localhost",Tl=Object.freeze(Object.defineProperty({__proto__:null,hasBrowserEnv:an,hasStandardBrowserEnv:vl,hasStandardBrowserWebWorkerEnv:bl,navigator:Vt,origin:El},Symbol.toStringTag,{value:"Module"})),R={...Tl,...yl};function Il(t,e){return ft(t,new R.classes.URLSearchParams,Object.assign({visitor:function(n,r,s,i){return R.isNode&&d.isBuffer(n)?(this.append(r,n.toString("base64")),!1):i.defaultVisitor.apply(this,arguments)}},e))}function Sl(t){return d.matchAll(/\w+|\[(\w*)]/g,t).map(e=>e[0]==="[]"?"":e[1]||e[0])}function Al(t){const e={},n=Object.keys(t);let r;const s=n.length;let i;for(r=0;r<s;r++)i=n[r],e[i]=t[i];return e}function ls(t){function e(n,r,s,i){let o=n[i++];if(o==="__proto__")return!0;const a=Number.isFinite(+o),c=i>=n.length;return o=!o&&d.isArray(s)?s.length:o,c?(d.hasOwnProp(s,o)?s[o]=[s[o],r]:s[o]=r,!a):((!s[o]||!d.isObject(s[o]))&&(s[o]=[]),e(n,r,s[o],i)&&d.isArray(s[o])&&(s[o]=Al(s[o])),!a)}if(d.isFormData(t)&&d.isFunction(t.entries)){const n={};return d.forEachEntry(t,(r,s)=>{e(Sl(r),s,n,0)}),n}return null}function Rl(t,e,n){if(d.isString(t))try{return(e||JSON.parse)(t),d.trim(t)}catch(r){if(r.name!=="SyntaxError")throw r}return(n||JSON.stringify)(t)}const je={transitional:cs,adapter:["xhr","http","fetch"],transformRequest:[function(e,n){const r=n.getContentType()||"",s=r.indexOf("application/json")>-1,i=d.isObject(e);if(i&&d.isHTMLForm(e)&&(e=new FormData(e)),d.isFormData(e))return s?JSON.stringify(ls(e)):e;if(d.isArrayBuffer(e)||d.isBuffer(e)||d.isStream(e)||d.isFile(e)||d.isBlob(e)||d.isReadableStream(e))return e;if(d.isArrayBufferView(e))return e.buffer;if(d.isURLSearchParams(e))return n.setContentType("application/x-www-form-urlencoded;charset=utf-8",!1),e.toString();let a;if(i){if(r.indexOf("application/x-www-form-urlencoded")>-1)return Il(e,this.formSerializer).toString();if((a=d.isFileList(e))||r.indexOf("multipart/form-data")>-1){const c=this.env&&this.env.FormData;return ft(a?{"files[]":e}:e,c&&new c,this.formSerializer)}}return i||s?(n.setContentType("application/json",!1),Rl(e)):e}],transformResponse:[function(e){const n=this.transitional||je.transitional,r=n&&n.forcedJSONParsing,s=this.responseType==="json";if(d.isResponse(e)||d.isReadableStream(e))return e;if(e&&d.isString(e)&&(r&&!this.responseType||s)){const o=!(n&&n.silentJSONParsing)&&s;try{return JSON.parse(e)}catch(a){if(o)throw a.name==="SyntaxError"?w.from(a,w.ERR_BAD_RESPONSE,this,null,this.response):a}}return e}],timeout:0,xsrfCookieName:"XSRF-TOKEN",xsrfHeaderName:"X-XSRF-TOKEN",maxContentLength:-1,maxBodyLength:-1,env:{FormData:R.classes.FormData,Blob:R.classes.Blob},validateStatus:function(e){return e>=200&&e<300},headers:{common:{Accept:"application/json, text/plain, */*","Content-Type":void 0}}};d.forEach(["delete","get","head","post","put","patch"],t=>{je.headers[t]={}});const Cl=d.toObjectSet(["age","authorization","content-length","content-type","etag","expires","from","host","if-modified-since","if-unmodified-since","last-modified","location","max-forwards","proxy-authorization","referer","retry-after","user-agent"]),Ol=t=>{const e={};let n,r,s;return t&&t.split(`
`).forEach(function(o){s=o.indexOf(":"),n=o.substring(0,s).trim().toLowerCase(),r=o.substring(s+1).trim(),!(!n||e[n]&&Cl[n])&&(n==="set-cookie"?e[n]?e[n].push(r):e[n]=[r]:e[n]=e[n]?e[n]+", "+r:r)}),e},Vn=Symbol("internals");function Re(t){return t&&String(t).trim().toLowerCase()}function Je(t){return t===!1||t==null?t:d.isArray(t)?t.map(Je):String(t)}function kl(t){const e=Object.create(null),n=/([^\s,;=]+)\s*(?:=\s*([^,;]+))?/g;let r;for(;r=n.exec(t);)e[r[1]]=r[2];return e}const Pl=t=>/^[-_a-zA-Z0-9^`|~,!#$%&'*+.]+$/.test(t.trim());function Ct(t,e,n,r,s){if(d.isFunction(r))return r.call(this,e,n);if(s&&(e=n),!!d.isString(e)){if(d.isString(r))return e.indexOf(r)!==-1;if(d.isRegExp(r))return r.test(e)}}function Nl(t){return t.trim().toLowerCase().replace(/([a-z\d])(\w*)/g,(e,n,r)=>n.toUpperCase()+r)}function Dl(t,e){const n=d.toCamelCase(" "+e);["get","set","has"].forEach(r=>{Object.defineProperty(t,r+n,{value:function(s,i,o){return this[r].call(this,e,s,i,o)},configurable:!0})})}let N=class{constructor(e){e&&this.set(e)}set(e,n,r){const s=this;function i(a,c,l){const u=Re(c);if(!u)throw new Error("header name must be a non-empty string");const h=d.findKey(s,u);(!h||s[h]===void 0||l===!0||l===void 0&&s[h]!==!1)&&(s[h||c]=Je(a))}const o=(a,c)=>d.forEach(a,(l,u)=>i(l,u,c));if(d.isPlainObject(e)||e instanceof this.constructor)o(e,n);else if(d.isString(e)&&(e=e.trim())&&!Pl(e))o(Ol(e),n);else if(d.isHeaders(e))for(const[a,c]of e.entries())i(c,a,r);else e!=null&&i(n,e,r);return this}get(e,n){if(e=Re(e),e){const r=d.findKey(this,e);if(r){const s=this[r];if(!n)return s;if(n===!0)return kl(s);if(d.isFunction(n))return n.call(this,s,r);if(d.isRegExp(n))return n.exec(s);throw new TypeError("parser must be boolean|regexp|function")}}}has(e,n){if(e=Re(e),e){const r=d.findKey(this,e);return!!(r&&this[r]!==void 0&&(!n||Ct(this,this[r],r,n)))}return!1}delete(e,n){const r=this;let s=!1;function i(o){if(o=Re(o),o){const a=d.findKey(r,o);a&&(!n||Ct(r,r[a],a,n))&&(delete r[a],s=!0)}}return d.isArray(e)?e.forEach(i):i(e),s}clear(e){const n=Object.keys(this);let r=n.length,s=!1;for(;r--;){const i=n[r];(!e||Ct(this,this[i],i,e,!0))&&(delete this[i],s=!0)}return s}normalize(e){const n=this,r={};return d.forEach(this,(s,i)=>{const o=d.findKey(r,i);if(o){n[o]=Je(s),delete n[i];return}const a=e?Nl(i):String(i).trim();a!==i&&delete n[i],n[a]=Je(s),r[a]=!0}),this}concat(...e){return this.constructor.concat(this,...e)}toJSON(e){const n=Object.create(null);return d.forEach(this,(r,s)=>{r!=null&&r!==!1&&(n[s]=e&&d.isArray(r)?r.join(", "):r)}),n}[Symbol.iterator](){return Object.entries(this.toJSON())[Symbol.iterator]()}toString(){return Object.entries(this.toJSON()).map(([e,n])=>e+": "+n).join(`
`)}get[Symbol.toStringTag](){return"AxiosHeaders"}static from(e){return e instanceof this?e:new this(e)}static concat(e,...n){const r=new this(e);return n.forEach(s=>r.set(s)),r}static accessor(e){const r=(this[Vn]=this[Vn]={accessors:{}}).accessors,s=this.prototype;function i(o){const a=Re(o);r[a]||(Dl(s,o),r[a]=!0)}return d.isArray(e)?e.forEach(i):i(e),this}};N.accessor(["Content-Type","Content-Length","Accept","Accept-Encoding","User-Agent","Authorization"]);d.reduceDescriptors(N.prototype,({value:t},e)=>{let n=e[0].toUpperCase()+e.slice(1);return{get:()=>t,set(r){this[n]=r}}});d.freezeMethods(N);function Ot(t,e){const n=this||je,r=e||n,s=N.from(r.headers);let i=r.data;return d.forEach(t,function(a){i=a.call(n,i,s.normalize(),e?e.status:void 0)}),s.normalize(),i}function us(t){return!!(t&&t.__CANCEL__)}function Te(t,e,n){w.call(this,t??"canceled",w.ERR_CANCELED,e,n),this.name="CanceledError"}d.inherits(Te,w,{__CANCEL__:!0});function ds(t,e,n){const r=n.config.validateStatus;!n.status||!r||r(n.status)?t(n):e(new w("Request failed with status code "+n.status,[w.ERR_BAD_REQUEST,w.ERR_BAD_RESPONSE][Math.floor(n.status/100)-4],n.config,n.request,n))}function Ul(t){const e=/^([-+\w]{1,25})(:?\/\/|:)/.exec(t);return e&&e[1]||""}function Ml(t,e){t=t||10;const n=new Array(t),r=new Array(t);let s=0,i=0,o;return e=e!==void 0?e:1e3,function(c){const l=Date.now(),u=r[i];o||(o=l),n[s]=c,r[s]=l;let h=i,m=0;for(;h!==s;)m+=n[h++],h=h%t;if(s=(s+1)%t,s===i&&(i=(i+1)%t),l-o<e)return;const y=u&&l-u;return y?Math.round(m*1e3/y):void 0}}function Ll(t,e){let n=0,r=1e3/e,s,i;const o=(l,u=Date.now())=>{n=u,s=null,i&&(clearTimeout(i),i=null),t.apply(null,l)};return[(...l)=>{const u=Date.now(),h=u-n;h>=r?o(l,u):(s=l,i||(i=setTimeout(()=>{i=null,o(s)},r-h)))},()=>s&&o(s)]}const st=(t,e,n=3)=>{let r=0;const s=Ml(50,250);return Ll(i=>{const o=i.loaded,a=i.lengthComputable?i.total:void 0,c=o-r,l=s(c),u=o<=a;r=o;const h={loaded:o,total:a,progress:a?o/a:void 0,bytes:c,rate:l||void 0,estimated:l&&a&&u?(a-o)/l:void 0,event:i,lengthComputable:a!=null,[e?"download":"upload"]:!0};t(h)},n)},zn=(t,e)=>{const n=t!=null;return[r=>e[0]({lengthComputable:n,total:t,loaded:r}),e[1]]},Wn=t=>(...e)=>d.asap(()=>t(...e)),xl=R.hasStandardBrowserEnv?((t,e)=>n=>(n=new URL(n,R.origin),t.protocol===n.protocol&&t.host===n.host&&(e||t.port===n.port)))(new URL(R.origin),R.navigator&&/(msie|trident)/i.test(R.navigator.userAgent)):()=>!0,Fl=R.hasStandardBrowserEnv?{write(t,e,n,r,s,i){const o=[t+"="+encodeURIComponent(e)];d.isNumber(n)&&o.push("expires="+new Date(n).toGMTString()),d.isString(r)&&o.push("path="+r),d.isString(s)&&o.push("domain="+s),i===!0&&o.push("secure"),document.cookie=o.join("; ")},read(t){const e=document.cookie.match(new RegExp("(^|;\\s*)("+t+")=([^;]*)"));return e?decodeURIComponent(e[3]):null},remove(t){this.write(t,"",Date.now()-864e5)}}:{write(){},read(){return null},remove(){}};function Bl(t){return/^([a-z][a-z\d+\-.]*:)?\/\//i.test(t)}function jl(t,e){return e?t.replace(/\/?\/$/,"")+"/"+e.replace(/^\/+/,""):t}function hs(t,e,n){let r=!Bl(e);return t&&r||n==!1?jl(t,e):e}const qn=t=>t instanceof N?{...t}:t;function de(t,e){e=e||{};const n={};function r(l,u,h,m){return d.isPlainObject(l)&&d.isPlainObject(u)?d.merge.call({caseless:m},l,u):d.isPlainObject(u)?d.merge({},u):d.isArray(u)?u.slice():u}function s(l,u,h,m){if(d.isUndefined(u)){if(!d.isUndefined(l))return r(void 0,l,h,m)}else return r(l,u,h,m)}function i(l,u){if(!d.isUndefined(u))return r(void 0,u)}function o(l,u){if(d.isUndefined(u)){if(!d.isUndefined(l))return r(void 0,l)}else return r(void 0,u)}function a(l,u,h){if(h in e)return r(l,u);if(h in t)return r(void 0,l)}const c={url:i,method:i,data:i,baseURL:o,transformRequest:o,transformResponse:o,paramsSerializer:o,timeout:o,timeoutMessage:o,withCredentials:o,withXSRFToken:o,adapter:o,responseType:o,xsrfCookieName:o,xsrfHeaderName:o,onUploadProgress:o,onDownloadProgress:o,decompress:o,maxContentLength:o,maxBodyLength:o,beforeRedirect:o,transport:o,httpAgent:o,httpsAgent:o,cancelToken:o,socketPath:o,responseEncoding:o,validateStatus:a,headers:(l,u,h)=>s(qn(l),qn(u),h,!0)};return d.forEach(Object.keys(Object.assign({},t,e)),function(u){const h=c[u]||s,m=h(t[u],e[u],u);d.isUndefined(m)&&h!==a||(n[u]=m)}),n}const fs=t=>{const e=de({},t);let{data:n,withXSRFToken:r,xsrfHeaderName:s,xsrfCookieName:i,headers:o,auth:a}=e;e.headers=o=N.from(o),e.url=as(hs(e.baseURL,e.url),t.params,t.paramsSerializer),a&&o.set("Authorization","Basic "+btoa((a.username||"")+":"+(a.password?unescape(encodeURIComponent(a.password)):"")));let c;if(d.isFormData(n)){if(R.hasStandardBrowserEnv||R.hasStandardBrowserWebWorkerEnv)o.setContentType(void 0);else if((c=o.getContentType())!==!1){const[l,...u]=c?c.split(";").map(h=>h.trim()).filter(Boolean):[];o.setContentType([l||"multipart/form-data",...u].join("; "))}}if(R.hasStandardBrowserEnv&&(r&&d.isFunction(r)&&(r=r(e)),r||r!==!1&&xl(e.url))){const l=s&&i&&Fl.read(i);l&&o.set(s,l)}return e},$l=typeof XMLHttpRequest<"u",Hl=$l&&function(t){return new Promise(function(n,r){const s=fs(t);let i=s.data;const o=N.from(s.headers).normalize();let{responseType:a,onUploadProgress:c,onDownloadProgress:l}=s,u,h,m,y,f;function g(){y&&y(),f&&f(),s.cancelToken&&s.cancelToken.unsubscribe(u),s.signal&&s.signal.removeEventListener("abort",u)}let p=new XMLHttpRequest;p.open(s.method.toUpperCase(),s.url,!0),p.timeout=s.timeout;function b(){if(!p)return;const v=N.from("getAllResponseHeaders"in p&&p.getAllResponseHeaders()),A={data:!a||a==="text"||a==="json"?p.responseText:p.response,status:p.status,statusText:p.statusText,headers:v,config:t,request:p};ds(function(P){n(P),g()},function(P){r(P),g()},A),p=null}"onloadend"in p?p.onloadend=b:p.onreadystatechange=function(){!p||p.readyState!==4||p.status===0&&!(p.responseURL&&p.responseURL.indexOf("file:")===0)||setTimeout(b)},p.onabort=function(){p&&(r(new w("Request aborted",w.ECONNABORTED,t,p)),p=null)},p.onerror=function(){r(new w("Network Error",w.ERR_NETWORK,t,p)),p=null},p.ontimeout=function(){let C=s.timeout?"timeout of "+s.timeout+"ms exceeded":"timeout exceeded";const A=s.transitional||cs;s.timeoutErrorMessage&&(C=s.timeoutErrorMessage),r(new w(C,A.clarifyTimeoutError?w.ETIMEDOUT:w.ECONNABORTED,t,p)),p=null},i===void 0&&o.setContentType(null),"setRequestHeader"in p&&d.forEach(o.toJSON(),function(C,A){p.setRequestHeader(A,C)}),d.isUndefined(s.withCredentials)||(p.withCredentials=!!s.withCredentials),a&&a!=="json"&&(p.responseType=s.responseType),l&&([m,f]=st(l,!0),p.addEventListener("progress",m)),c&&p.upload&&([h,y]=st(c),p.upload.addEventListener("progress",h),p.upload.addEventListener("loadend",y)),(s.cancelToken||s.signal)&&(u=v=>{p&&(r(!v||v.type?new Te(null,t,p):v),p.abort(),p=null)},s.cancelToken&&s.cancelToken.subscribe(u),s.signal&&(s.signal.aborted?u():s.signal.addEventListener("abort",u)));const T=Ul(s.url);if(T&&R.protocols.indexOf(T)===-1){r(new w("Unsupported protocol "+T+":",w.ERR_BAD_REQUEST,t));return}p.send(i||null)})},Vl=(t,e)=>{const{length:n}=t=t?t.filter(Boolean):[];if(e||n){let r=new AbortController,s;const i=function(l){if(!s){s=!0,a();const u=l instanceof Error?l:this.reason;r.abort(u instanceof w?u:new Te(u instanceof Error?u.message:u))}};let o=e&&setTimeout(()=>{o=null,i(new w(`timeout ${e} of ms exceeded`,w.ETIMEDOUT))},e);const a=()=>{t&&(o&&clearTimeout(o),o=null,t.forEach(l=>{l.unsubscribe?l.unsubscribe(i):l.removeEventListener("abort",i)}),t=null)};t.forEach(l=>l.addEventListener("abort",i));const{signal:c}=r;return c.unsubscribe=()=>d.asap(a),c}},zl=function*(t,e){let n=t.byteLength;if(n<e){yield t;return}let r=0,s;for(;r<n;)s=r+e,yield t.slice(r,s),r=s},Wl=async function*(t,e){for await(const n of ql(t))yield*zl(n,e)},ql=async function*(t){if(t[Symbol.asyncIterator]){yield*t;return}const e=t.getReader();try{for(;;){const{done:n,value:r}=await e.read();if(n)break;yield r}}finally{await e.cancel()}},Gn=(t,e,n,r)=>{const s=Wl(t,e);let i=0,o,a=c=>{o||(o=!0,r&&r(c))};return new ReadableStream({async pull(c){try{const{done:l,value:u}=await s.next();if(l){a(),c.close();return}let h=u.byteLength;if(n){let m=i+=h;n(m)}c.enqueue(new Uint8Array(u))}catch(l){throw a(l),l}},cancel(c){return a(c),s.return()}},{highWaterMark:2})},pt=typeof fetch=="function"&&typeof Request=="function"&&typeof Response=="function",ps=pt&&typeof ReadableStream=="function",Gl=pt&&(typeof TextEncoder=="function"?(t=>e=>t.encode(e))(new TextEncoder):async t=>new Uint8Array(await new Response(t).arrayBuffer())),ms=(t,...e)=>{try{return!!t(...e)}catch{return!1}},Kl=ps&&ms(()=>{let t=!1;const e=new Request(R.origin,{body:new ReadableStream,method:"POST",get duplex(){return t=!0,"half"}}).headers.has("Content-Type");return t&&!e}),Kn=64*1024,zt=ps&&ms(()=>d.isReadableStream(new Response("").body)),it={stream:zt&&(t=>t.body)};pt&&(t=>{["text","arrayBuffer","blob","formData","stream"].forEach(e=>{!it[e]&&(it[e]=d.isFunction(t[e])?n=>n[e]():(n,r)=>{throw new w(`Response type '${e}' is not supported`,w.ERR_NOT_SUPPORT,r)})})})(new Response);const Jl=async t=>{if(t==null)return 0;if(d.isBlob(t))return t.size;if(d.isSpecCompliantForm(t))return(await new Request(R.origin,{method:"POST",body:t}).arrayBuffer()).byteLength;if(d.isArrayBufferView(t)||d.isArrayBuffer(t))return t.byteLength;if(d.isURLSearchParams(t)&&(t=t+""),d.isString(t))return(await Gl(t)).byteLength},Xl=async(t,e)=>{const n=d.toFiniteNumber(t.getContentLength());return n??Jl(e)},Yl=pt&&(async t=>{let{url:e,method:n,data:r,signal:s,cancelToken:i,timeout:o,onDownloadProgress:a,onUploadProgress:c,responseType:l,headers:u,withCredentials:h="same-origin",fetchOptions:m}=fs(t);l=l?(l+"").toLowerCase():"text";let y=Vl([s,i&&i.toAbortSignal()],o),f;const g=y&&y.unsubscribe&&(()=>{y.unsubscribe()});let p;try{if(c&&Kl&&n!=="get"&&n!=="head"&&(p=await Xl(u,r))!==0){let A=new Request(e,{method:"POST",body:r,duplex:"half"}),O;if(d.isFormData(r)&&(O=A.headers.get("content-type"))&&u.setContentType(O),A.body){const[P,G]=zn(p,st(Wn(c)));r=Gn(A.body,Kn,P,G)}}d.isString(h)||(h=h?"include":"omit");const b="credentials"in Request.prototype;f=new Request(e,{...m,signal:y,method:n.toUpperCase(),headers:u.normalize().toJSON(),body:r,duplex:"half",credentials:b?h:void 0});let T=await fetch(f);const v=zt&&(l==="stream"||l==="response");if(zt&&(a||v&&g)){const A={};["status","statusText","headers"].forEach(K=>{A[K]=T[K]});const O=d.toFiniteNumber(T.headers.get("content-length")),[P,G]=a&&zn(O,st(Wn(a),!0))||[];T=new Response(Gn(T.body,Kn,P,()=>{G&&G(),g&&g()}),A)}l=l||"text";let C=await it[d.findKey(it,l)||"text"](T,t);return!v&&g&&g(),await new Promise((A,O)=>{ds(A,O,{data:C,headers:N.from(T.headers),status:T.status,statusText:T.statusText,config:t,request:f})})}catch(b){throw g&&g(),b&&b.name==="TypeError"&&/fetch/i.test(b.message)?Object.assign(new w("Network Error",w.ERR_NETWORK,t,f),{cause:b.cause||b}):w.from(b,b&&b.code,t,f)}}),Wt={http:hl,xhr:Hl,fetch:Yl};d.forEach(Wt,(t,e)=>{if(t){try{Object.defineProperty(t,"name",{value:e})}catch{}Object.defineProperty(t,"adapterName",{value:e})}});const Jn=t=>`- ${t}`,Ql=t=>d.isFunction(t)||t===null||t===!1,gs={getAdapter:t=>{t=d.isArray(t)?t:[t];const{length:e}=t;let n,r;const s={};for(let i=0;i<e;i++){n=t[i];let o;if(r=n,!Ql(n)&&(r=Wt[(o=String(n)).toLowerCase()],r===void 0))throw new w(`Unknown adapter '${o}'`);if(r)break;s[o||"#"+i]=r}if(!r){const i=Object.entries(s).map(([a,c])=>`adapter ${a} `+(c===!1?"is not supported by the environment":"is not available in the build"));let o=e?i.length>1?`since :
`+i.map(Jn).join(`
`):" "+Jn(i[0]):"as no adapter specified";throw new w("There is no suitable adapter to dispatch the request "+o,"ERR_NOT_SUPPORT")}return r},adapters:Wt};function kt(t){if(t.cancelToken&&t.cancelToken.throwIfRequested(),t.signal&&t.signal.aborted)throw new Te(null,t)}function Xn(t){return kt(t),t.headers=N.from(t.headers),t.data=Ot.call(t,t.transformRequest),["post","put","patch"].indexOf(t.method)!==-1&&t.headers.setContentType("application/x-www-form-urlencoded",!1),gs.getAdapter(t.adapter||je.adapter)(t).then(function(r){return kt(t),r.data=Ot.call(t,t.transformResponse,r),r.headers=N.from(r.headers),r},function(r){return us(r)||(kt(t),r&&r.response&&(r.response.data=Ot.call(t,t.transformResponse,r.response),r.response.headers=N.from(r.response.headers))),Promise.reject(r)})}const _s="1.8.1",mt={};["object","boolean","number","function","string","symbol"].forEach((t,e)=>{mt[t]=function(r){return typeof r===t||"a"+(e<1?"n ":" ")+t}});const Yn={};mt.transitional=function(e,n,r){function s(i,o){return"[Axios v"+_s+"] Transitional option '"+i+"'"+o+(r?". "+r:"")}return(i,o,a)=>{if(e===!1)throw new w(s(o," has been removed"+(n?" in "+n:"")),w.ERR_DEPRECATED);return n&&!Yn[o]&&(Yn[o]=!0,console.warn(s(o," has been deprecated since v"+n+" and will be removed in the near future"))),e?e(i,o,a):!0}};mt.spelling=function(e){return(n,r)=>(console.warn(`${r} is likely a misspelling of ${e}`),!0)};function Zl(t,e,n){if(typeof t!="object")throw new w("options must be an object",w.ERR_BAD_OPTION_VALUE);const r=Object.keys(t);let s=r.length;for(;s-- >0;){const i=r[s],o=e[i];if(o){const a=t[i],c=a===void 0||o(a,i,t);if(c!==!0)throw new w("option "+i+" must be "+c,w.ERR_BAD_OPTION_VALUE);continue}if(n!==!0)throw new w("Unknown option "+i,w.ERR_BAD_OPTION)}}const Xe={assertOptions:Zl,validators:mt},x=Xe.validators;let ce=class{constructor(e){this.defaults=e,this.interceptors={request:new Hn,response:new Hn}}async request(e,n){try{return await this._request(e,n)}catch(r){if(r instanceof Error){let s={};Error.captureStackTrace?Error.captureStackTrace(s):s=new Error;const i=s.stack?s.stack.replace(/^.+\n/,""):"";try{r.stack?i&&!String(r.stack).endsWith(i.replace(/^.+\n.+\n/,""))&&(r.stack+=`
`+i):r.stack=i}catch{}}throw r}}_request(e,n){typeof e=="string"?(n=n||{},n.url=e):n=e||{},n=de(this.defaults,n);const{transitional:r,paramsSerializer:s,headers:i}=n;r!==void 0&&Xe.assertOptions(r,{silentJSONParsing:x.transitional(x.boolean),forcedJSONParsing:x.transitional(x.boolean),clarifyTimeoutError:x.transitional(x.boolean)},!1),s!=null&&(d.isFunction(s)?n.paramsSerializer={serialize:s}:Xe.assertOptions(s,{encode:x.function,serialize:x.function},!0)),n.allowAbsoluteUrls!==void 0||(this.defaults.allowAbsoluteUrls!==void 0?n.allowAbsoluteUrls=this.defaults.allowAbsoluteUrls:n.allowAbsoluteUrls=!0),Xe.assertOptions(n,{baseUrl:x.spelling("baseURL"),withXsrfToken:x.spelling("withXSRFToken")},!0),n.method=(n.method||this.defaults.method||"get").toLowerCase();let o=i&&d.merge(i.common,i[n.method]);i&&d.forEach(["delete","get","head","post","put","patch","common"],f=>{delete i[f]}),n.headers=N.concat(o,i);const a=[];let c=!0;this.interceptors.request.forEach(function(g){typeof g.runWhen=="function"&&g.runWhen(n)===!1||(c=c&&g.synchronous,a.unshift(g.fulfilled,g.rejected))});const l=[];this.interceptors.response.forEach(function(g){l.push(g.fulfilled,g.rejected)});let u,h=0,m;if(!c){const f=[Xn.bind(this),void 0];for(f.unshift.apply(f,a),f.push.apply(f,l),m=f.length,u=Promise.resolve(n);h<m;)u=u.then(f[h++],f[h++]);return u}m=a.length;let y=n;for(h=0;h<m;){const f=a[h++],g=a[h++];try{y=f(y)}catch(p){g.call(this,p);break}}try{u=Xn.call(this,y)}catch(f){return Promise.reject(f)}for(h=0,m=l.length;h<m;)u=u.then(l[h++],l[h++]);return u}getUri(e){e=de(this.defaults,e);const n=hs(e.baseURL,e.url,e.allowAbsoluteUrls);return as(n,e.params,e.paramsSerializer)}};d.forEach(["delete","get","head","options"],function(e){ce.prototype[e]=function(n,r){return this.request(de(r||{},{method:e,url:n,data:(r||{}).data}))}});d.forEach(["post","put","patch"],function(e){function n(r){return function(i,o,a){return this.request(de(a||{},{method:e,headers:r?{"Content-Type":"multipart/form-data"}:{},url:i,data:o}))}}ce.prototype[e]=n(),ce.prototype[e+"Form"]=n(!0)});let eu=class ws{constructor(e){if(typeof e!="function")throw new TypeError("executor must be a function.");let n;this.promise=new Promise(function(i){n=i});const r=this;this.promise.then(s=>{if(!r._listeners)return;let i=r._listeners.length;for(;i-- >0;)r._listeners[i](s);r._listeners=null}),this.promise.then=s=>{let i;const o=new Promise(a=>{r.subscribe(a),i=a}).then(s);return o.cancel=function(){r.unsubscribe(i)},o},e(function(i,o,a){r.reason||(r.reason=new Te(i,o,a),n(r.reason))})}throwIfRequested(){if(this.reason)throw this.reason}subscribe(e){if(this.reason){e(this.reason);return}this._listeners?this._listeners.push(e):this._listeners=[e]}unsubscribe(e){if(!this._listeners)return;const n=this._listeners.indexOf(e);n!==-1&&this._listeners.splice(n,1)}toAbortSignal(){const e=new AbortController,n=r=>{e.abort(r)};return this.subscribe(n),e.signal.unsubscribe=()=>this.unsubscribe(n),e.signal}static source(){let e;return{token:new ws(function(s){e=s}),cancel:e}}};function tu(t){return function(n){return t.apply(null,n)}}function nu(t){return d.isObject(t)&&t.isAxiosError===!0}const qt={Continue:100,SwitchingProtocols:101,Processing:102,EarlyHints:103,Ok:200,Created:201,Accepted:202,NonAuthoritativeInformation:203,NoContent:204,ResetContent:205,PartialContent:206,MultiStatus:207,AlreadyReported:208,ImUsed:226,MultipleChoices:300,MovedPermanently:301,Found:302,SeeOther:303,NotModified:304,UseProxy:305,Unused:306,TemporaryRedirect:307,PermanentRedirect:308,BadRequest:400,Unauthorized:401,PaymentRequired:402,Forbidden:403,NotFound:404,MethodNotAllowed:405,NotAcceptable:406,ProxyAuthenticationRequired:407,RequestTimeout:408,Conflict:409,Gone:410,LengthRequired:411,PreconditionFailed:412,PayloadTooLarge:413,UriTooLong:414,UnsupportedMediaType:415,RangeNotSatisfiable:416,ExpectationFailed:417,ImATeapot:418,MisdirectedRequest:421,UnprocessableEntity:422,Locked:423,FailedDependency:424,TooEarly:425,UpgradeRequired:426,PreconditionRequired:428,TooManyRequests:429,RequestHeaderFieldsTooLarge:431,UnavailableForLegalReasons:451,InternalServerError:500,NotImplemented:501,BadGateway:502,ServiceUnavailable:503,GatewayTimeout:504,HttpVersionNotSupported:505,VariantAlsoNegotiates:506,InsufficientStorage:507,LoopDetected:508,NotExtended:510,NetworkAuthenticationRequired:511};Object.entries(qt).forEach(([t,e])=>{qt[e]=t});function ys(t){const e=new ce(t),n=Xr(ce.prototype.request,e);return d.extend(n,ce.prototype,e,{allOwnKeys:!0}),d.extend(n,e,null,{allOwnKeys:!0}),n.create=function(s){return ys(de(t,s))},n}const I=ys(je);I.Axios=ce;I.CanceledError=Te;I.CancelToken=eu;I.isCancel=us;I.VERSION=_s;I.toFormData=ft;I.AxiosError=w;I.Cancel=I.CanceledError;I.all=function(e){return Promise.all(e)};I.spread=tu;I.isAxiosError=nu;I.mergeConfig=de;I.AxiosHeaders=N;I.formToJSON=t=>ls(d.isHTMLForm(t)?new FormData(t):t);I.getAdapter=gs.getAdapter;I.HttpStatusCode=qt;I.default=I;const{Axios:xu,AxiosError:Fu,CanceledError:Bu,isCancel:ju,CancelToken:$u,VERSION:Hu,all:Vu,Cancel:zu,isAxiosError:Wu,spread:qu,toFormData:Gu,AxiosHeaders:Ku,HttpStatusCode:Ju,formToJSON:Xu,getAdapter:Yu,mergeConfig:Qu}=I,$e=I.create({baseURL:"https://common-api.preplaced.in/"});$e.defaults.headers.post["Content-Type"]="*";$e.defaults.headers.post["Access-Control-Allow-Origin"]="*";const gt=I.create({baseURL:"https://dashboard-api.preplaced.in"});gt.defaults.headers.post["Content-Type"]="*";gt.defaults.headers.post["Access-Control-Allow-Origin"]="*";const Ie=I.create({baseURL:"https://preplaced-ai-backend.preplaced.in"});Ie.defaults.headers.post["Content-Type"]="*";Ie.defaults.headers.post["Access-Control-Allow-Origin"]="*";const fe=async t=>{let e="";return typeof window<"u"&&Bt.currentUser?e=await Bt.currentUser.getIdToken():t&&t.authHeader?e=t.authHeader:e=(await chrome.storage.local.get("mentorAIUserAuthToken")).mentorAIUserAuthToken,`Bearer ${e}`},_t=(t,e=!0)=>{let n;return e?t?n={requestType:"mentors",...t}:n={requestType:"mentors"}:n=t,n},ru=async(t,e)=>{try{const n=_t(e),r=await gt({method:"GET",url:t,params:n,headers:{Authorization:await fe(e)}});if(r.status===200){const{data:s}=r;return{status:r.status,data:s,headers:r.headers,url:r.url}}throw new Error(r.statusText)}catch(n){const r=n.message?n.message:"";return Promise.reject(r)}},Zu=async(t,e,n,r,s,i)=>{try{const o=_t(n);return(await gt({method:"POST",url:t,baseURL:i,headers:{Authorization:await fe(n),...s},data:e,params:r?o:void 0})).data}catch(o){return console.log("err in handlePost",o),o.message&&o.message,Promise.reject(o)}},ed=async(t,e,n,r=!0)=>{try{const s=r?_t(n):{},i=await $e({method:"POST",url:t,headers:{Authorization:await fe(n)},data:e,params:s});if(i.status===200){const{data:o}=i;return{status:i.status,data:o,headers:i.headers,url:i.url}}return i}catch(s){return Promise.reject(s)}},su=async(t,e,n=!0)=>{try{const r=_t(e,n),s=await Ie({method:"GET",url:t,params:r,headers:{Authorization:await fe(e)}});if(s.status===200){const{data:i}=s;return{status:s.status,data:i,headers:s.headers,url:s.url}}throw new Error(s.statusText)}catch(r){const s=r.message?r.message:"";return Promise.reject(s)}},td=async(t,e,n,r)=>{r=r||{};try{const s=n,i=await Ie({method:"POST",url:t,headers:{Authorization:await fe(n),"Content-Type":"application/json",...r},data:JSON.stringify(e),params:s});if(i.status===200){const{data:o}=i;return{status:i.status,data:o,headers:i.headers,url:i.url}}return i}catch(s){return Promise.reject(s)}},nd=async(t,e,n,r)=>{r=r||{};try{const s=await fetch(`https://preplaced-ai-backend.preplaced.in${t}${n?`?${new URLSearchParams(n).toString()}`:""}`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:await fe(n),...r},body:JSON.stringify(e)});if(!s.ok)throw new Error("Something went wrong! Please wait a moment and try again. If the issue persists, please contact support.");return s}catch(s){return Promise.reject(s)}},rd=async(t,e)=>{try{const n=await Ie({method:"DELETE",url:t,data:e,headers:{Authorization:await fe(e),"Content-Type":"application/json"}});if(n.status===200){const{data:r}=n;return{status:n.status,data:r,headers:n.headers,url:n.url}}throw new Error(n.statusText)}catch(n){const r=n.message?n.message:"";return Promise.reject(r)}},iu=async t=>{try{return(await $e({method:"POST",url:"/analytics/track",data:t})).data}catch(e){console.error(e)}},ou=async t=>{try{return(await $e({method:"POST",url:"/analytics/identify",data:t})).data}catch(e){console.error(e)}},au=async t=>{try{return(await Ie({method:"POST",url:"/mixpanel/rudderstack/identify",data:t,headers:{"Content-Type":"application/json"}})).data}catch(e){console.error(e)}},cu=async()=>{try{const{mentorai:t}=await chrome.storage.local.get("mentorai");return(await I.get(`https://preplaced-ai-backend.preplaced.in/mentor-ai/mentors/${(t==null?void 0:t.mentorai)||"pro-pilot"}`)).data.find(n=>n.mode==="Live")}catch(t){console.error("Error fetching mentorai from storage:",t)}},lu=t=>{if(!t||!t.pricing_plan)return!1;const e=Gr(t.subscriptions);return t.pricing_plan.user_type==="paid"?!0:t.pricing_plan.user_type==="trial"?!e.cancelledOn:!1},uu=()=>{var n,r,s;const t=navigator.userAgent,e={browser_name:"",browser_version:"",os_family:"",os_version:"",engine_name:"",device:""};return t.includes("Firefox/")?(e.browser_name="Firefox",e.browser_version=t.split("Firefox/")[1].split(" ")[0]):t.includes("Chrome/")?(e.browser_name="Chrome",e.browser_version=t.split("Chrome/")[1].split(" ")[0]):t.includes("Safari/")&&(e.browser_name="Safari",e.browser_version=(n=t.split("Version/")[1])==null?void 0:n.split(" ")[0]),t.includes("Windows")?(e.os_family="Windows",e.os_version=(r=t.split("Windows ")[1])==null?void 0:r.split(";")[0]):t.includes("Mac OS X")?(e.os_family="Mac OS",e.os_version=(s=t.split("Mac OS X ")[1])==null?void 0:s.split(")")[0]):t.includes("Linux")&&(e.os_family="Linux"),t.includes("Gecko/")?e.engine_name="Gecko":t.includes("WebKit/")?e.engine_name="WebKit":t.includes("Blink/")&&(e.engine_name="Blink"),e.device=navigator.platform,e},du=async(t,e)=>{var n,r,s,i,o,a,c,l,u,h,m;try{let y=await bc(),f=Object.fromEntries(new URLSearchParams((t==null?void 0:t.split("?")[1])||{}).entries());const g=new URL(t).origin,p=uu(),b=await chrome.storage.local.get("mentorai_data"),T=await chrome.storage.local.get("context"),v=(r=(n=T==null?void 0:T.context)==null?void 0:n[g])==null?void 0:r["profile-data"],{interviewModeStatus:C,interviewCount:A,practiceModeStatus:O,practiceCount:P,coding_prompt_version:G,speech_to_text:K,lc_theme:wt,model_version:vs,interview_mode_access_option_variant:bs,daily_message_limit_variant:Es,menteeSubscription:se,dynamic_easy_action_option_variant:Ts,initial_default_tab_variant:Is,show_trial_screen:cn,sample_resources_practice_mode_variant:Ss}=await chrome.storage.local.get(["interviewModeStatus","interviewCount","practiceModeStatus","practiceCount","coding_prompt_version","speech_to_text","lc_theme","model_version","interview_mode_access_option_variant","daily_message_limit_variant","menteeSubscription","dynamic_easy_action_option_variant","initial_default_tab_variant","show_trial_screen","sample_resources_practice_mode_variant"]),As=await chrome.storage.local.get("utmParams"),Rs=lu(se);let M;b!=null&&b.mentorai_data?M=b==null?void 0:b.mentorai_data:(M=await cu(),await chrome.storage.local.set({mentorai_data:M}));const Cs={name:M==null?void 0:M.name,record_id:M==null?void 0:M.recordId,public_profile_id:(s=M==null?void 0:M["publicProfileId(FromMentors)"])==null?void 0:s[0]};let Se={};["PREVIEW","ONGOING","FEEDBACK_GENERATED","FEEDBACK"].includes(C)&&(Se={interview_mode_version:"beta",interview_count:A}),["PM_PREVIEW","PM_ONGOING","PM_FEEDBACK_GENERATED","PM_FEEDBACK"].includes(O)&&(Se={practice_count:typeof P=="number"?P:P||1});let yt="default";["PM_PREVIEW","PM_ONGOING","PM_FEEDBACK_GENERATED","PM_FEEDBACK"].includes(O)?yt="Practice Mode":["PREVIEW","ONGOING","FEEDBACK_GENERATED","FEEDBACK"].includes(C)&&(yt="Interview Mode"),cn&&(Se={...Se,show_trial_screen:cn});const Ae={};try{const S=((i=se==null?void 0:se.subscriptions)==null?void 0:i.find(pe=>pe.status==="Active"))||((o=se==null?void 0:se.subscriptions)==null?void 0:o[0]),Os=!!(S!=null&&S.subscriptionId),ks=(S==null?void 0:S.status)==="Active",Ps=(S==null?void 0:S.status)==="Active"&&!!(S!=null&&S.cancelledOn),ln=pe=>{var un;let vt=new Date(pe);`${vt}`.includes("Invalid")&&(vt=new Date((un=pe==null?void 0:pe.split("T"))==null?void 0:un[0]));const Ns=new Date,Ds=vt.getTime()-Ns.getTime(),Us=Math.ceil(Ds/(1e3*60*60*24));return Math.max(0,Us)};Os&&(Ps&&(S!=null&&S.actualExpirationDate)?(Ae.has_cancelled=!0,Ae.days_from_expiry=ln(S.actualExpirationDate)):ks&&(S!=null&&S.nextRenewalDate)&&(Ae.has_cancelled=!1,Ae.days_from_renewal=ln(S.nextRenewalDate)))}catch{}return{source:"Extension",browser_name:p.browser_name,browser_version:p.browser_version,os_family:p.os_family,os_version:p.os_version,engine_name:p.engine_name,device:p.device,product_name:"MentorAi Extension",url:t,url_params:f,mentorai:Cs,extension_version:chrome.runtime.getManifest().version,extensionUsedDaysCount:y,coding_prompt_version:G,model_version:vs,leetcode_profile_data:{problems_solved:(c=(a=v==null?void 0:v.analysis)==null?void 0:a.statistics)==null?void 0:c.problems_solved,submissions:(u=(l=v==null?void 0:v.analysis)==null?void 0:l.statistics)==null?void 0:u.submissions,rank:(m=(h=v==null?void 0:v.analysis)==null?void 0:h.profile)==null?void 0:m.rank},...e,...As,lc_theme:wt,speech_to_text:K,interview_mode_access_option_variant:bs,daily_message_limit_variant:Es,initial_default_tab_variant:Is,sample_resources_practice_mode_variant:Ss,is_paid_user:Rs,...Ae,...Se,session_type:yt,dynamic_easy_action_option_variant:Ts}}catch(y){console.error("Error in eventPropertyBuilder",y)}},hu=async(t,e,n,r)=>{try{const s=await du(e,r);return await iu({user_id:t,event:n,properties:s})}catch(s){console.error(s)}},oe=async(t,e)=>{try{return await ou({user_id:t,traits:{...e}})}catch(n){console.error(n)}},fu=async(t,e,n)=>{try{return await au({userId:t,anonymousId:e,context:{traits:n||{}}})}catch(r){console.error("[DEBUG] identifyUserV2 error",r)}},Ve=new Set,sd=(t,e,n)=>{const r=`${t}_${Date.now()}`;if(Array.from(Ve).filter(o=>{const a=parseInt(o.split("_").pop()||"0");return Date.now()-a<5e3}).length>0)return;Ve.add(r);const i=Date.now()-6e4;Array.from(Ve).forEach(o=>{parseInt(o.split("_").pop()||"0")<i&&Ve.delete(o)}),chrome.runtime.sendMessage({action:"sendAnalytics",url:window.location.href,eventName:e,eventProperties:n})},pu=async(t,e,n=!1)=>{const{menteeSubscription:r}=await chrome.storage.local.get("menteeSubscription");if(n===!1&&r&&r.lastFetchDateTime&&new Date(r.lastFetchDateTime).getTime()+1e3*60*60*1>new Date().getTime())return{mentee_subscription:r};const s=await su("/mentorai/subscriptions/fetch_subscriptions",{mentee_id:t,mentorai_id:e});return s&&s.data?(await chrome.storage.local.set({menteeSubscription:{...s.data,lastFetchDateTime:new Date().toISOString()}}),{mentee_subscription:s.data}):{mentee_subscription:null}},mu="authCustomToken",D="authEmail",gu=30*60*1e3,Qn=4*60*60*1e3,_u=async(t,e,n)=>{if(e.status==="complete"&&n.url){const r=new URL(n.url);if(r.origin==="https://www.leeco.ai"){const s=r.searchParams.get("custom_token"),i=r.searchParams.get("email"),o=r.searchParams.get("originalTabId");s&&i&&await wu(t,s,i,o?parseInt(o):void 0)}}};async function wu(t,e,n,r){try{await chrome.storage.sync.set({[mu]:e}),await chrome.storage.sync.set({[D]:n}),await Xo(Bt,e);const{model_version:s,coding_prompt_version:i,leetcode_profile_collection:o,editorial_used:a,user_context_used:c,speech_to_text:l,interview_mode_access_option_variant:u,initial_default_tab_variant:h,show_trial_screen:m}=await chrome.storage.local.get(["model_version","coding_prompt_version","leetcode_profile_collection","editorial_used","user_context_used","speech_to_text","interview_mode_access_option_variant","leeco_anonymous_id","initial_default_tab_variant","show_trial_screen"]),{leeco_anonymous_id:y}=await chrome.storage.sync.get("leeco_anonymous_id");y&&await fu(n,y),r&&(await chrome.tabs.remove(t),await chrome.tabs.update(r,{active:!0}),await chrome.tabs.reload(r)),oe(n,{leetcode_profile_collection:o,coding_prompt_version:i,editorial_used:a,user_context_used:c,speech_to_text:l,model_version:s,interview_mode_access_option_variant:u,initial_default_tab_variant:h,show_trial_screen:m});const{pendingMessage:f}=await chrome.storage.local.get(["pendingMessage"]);f&&(chrome.runtime.sendMessage({action:"sendMessageToAi",message:f.message,message_by:"user"}),await chrome.storage.local.set({pendingMessage:null}))}catch(s){console.error("Error handling custom token: ",s)}}const yu=async(t,e)=>{chrome.runtime.sendMessage({action:"updateSidePanelOnTabUpdate",tabId:t,url:e})},vu=async(t,e)=>{chrome.tabs.sendMessage(t,{action:"updateContentScriptOnTabUpdate",tabId:t,url:e})},bu=t=>{try{const e=new URL(t);switch(e.hostname){case"leetcode.com":const n=e.pathname.split("/").filter(Boolean);if(n[0]==="problems")return`${e.origin}/problems/${n[1]}`;break;default:return`${e.origin}${e.pathname}`}return`${e.origin}${e.pathname}`}catch(e){return console.error("Error normalizing URL:",e),t}},Eu=async t=>{try{const{tabVisits:e={}}=await chrome.storage.local.get("tabVisits"),n=Date.now(),r=Object.fromEntries(Object.entries(e).filter(([o,a])=>Number.isFinite(a)?n-a<Qn:!1)),s=t.includes("leetcode.com")?bu(t):wc(t),i=r[s];return!i||n-i>=Qn?(await chrome.storage.local.set({tabVisits:{...r,[s]:n}}),!0):(Object.keys(r).length!==Object.keys(e).length&&await chrome.storage.local.set({tabVisits:r}),!1)}catch(e){return console.error("Error checking tab visit time:",e),!1}},Tu=async t=>{if(t.url)try{new URL(t.url).searchParams.get("action")==="context-collection"&&setTimeout(()=>{chrome.tabs.sendMessage(t.id,{action:"capturePageScreenshot",url:t.url})},3e3)}catch(e){console.error("Error handling context collection:",e)}},Iu=async()=>{try{const t=await ru("/candidates",{});if(t&&t.data)return t.data}catch(t){return console.error("Error fetching mentee data:",t),null}},Su=async()=>{const{menteeDataLastFetched:t=0}=await chrome.storage.local.get("menteeDataLastFetched"),e=Date.now();if(e-t>gu){const n=await Iu();n&&await chrome.storage.local.set({menteeData:n,menteeDataLastFetched:e})}},Au=async()=>{const{menteeData:t,mentorai_data:e}=await chrome.storage.local.get(["menteeData","mentorai_data"]);if(t&&e){const{mentee_subscription:n}=await pu(t.recordId,e.recordId,!0);return n}return null},id=async(t,e,n)=>{if(e.status==="complete"&&n.url){await Tu(n),_u(t,e,n),yu(t,n.url),vu(t,n.url);try{await Su()}catch(o){console.error("Error handling LeetCode URL:",o)}let r="pro-pilot";chrome.storage.local.get(["mentorai"],o=>{o.mentorai&&(r=o.mentorai)}),chrome.storage.local.get(["coding_prompt_version"],async o=>{if(!o.coding_prompt_version||o.coding_prompt_version==="v1"){const a="v2";await chrome.storage.local.set({coding_prompt_version:a}),chrome.storage.sync.get([D],async c=>{const l=c[D];l&&oe(l,{coding_prompt_version:a})})}}),chrome.storage.local.get(["interview_mode_access_option_variant","addedAsWaitlistedUser"],async o=>{if(!o.interview_mode_access_option_variant&&!o.addedAsWaitlistedUser){const a=Math.random()<.5?"sharing":"rating";await chrome.storage.local.set({interview_mode_access_option_variant:a}),chrome.storage.sync.get([D],async c=>{const l=c[D];l&&oe(l,{interview_mode_access_option_variant:a})})}}),chrome.storage.local.get(["user_context_used"],async o=>{if(!o.user_context_used){const a=Math.random()<.5?"true":"false";await chrome.storage.local.set({user_context_used:a}),chrome.storage.sync.get([D],async c=>{const l=c[D];l&&oe(l,{user_context_used:a})})}}),chrome.storage.local.get(["speech_to_text"],async o=>{if(o.speech_to_text){if(o.speech_to_text==="false"){const{menteeData:a,isInterviewModeEnabled:c}=await chrome.storage.local.get(["menteeData","isInterviewModeEnabled"]),l=a==null?void 0:a.email;c&&l&&(await chrome.storage.local.set({speech_to_text:"true"}),oe(l,{speech_to_text:"true"}))}}else{const a=Math.random()<.2?"true":"false";await chrome.storage.local.set({speech_to_text:a}),chrome.storage.sync.get([D],async c=>{const l=c[D];l&&oe(l,{speech_to_text:a})})}}),chrome.storage.local.get(["sample_resources_practice_mode_variant"],async o=>{if(!o.sample_resources_practice_mode_variant){const a=Math.random()<.5?"enabled":"disabled";await chrome.storage.local.set({sample_resources_practice_mode_variant:a}),chrome.storage.sync.get([D],async c=>{const l=c[D];l&&oe(l,{sample_resources_practice_mode_variant:a})})}}),yc(n.url||"",r)==="whitelisted"&&chrome.storage.sync.get([D],async o=>{const a=o[D];if(a&&(n!=null&&n.url)&&await Eu(n.url)){let l={url:n.url};if(n.url.includes("youtube.com/watch"))try{const u=await chrome.tabs.sendMessage(t,{action:"getYoutubeVideoCategory"});!u||(u==null?void 0:u.changed)===!1||(l.video={category:(u==null?void 0:u.videoCategory)??void 0,title:(u==null?void 0:u.videoTitle)??void 0,duration:(u==null?void 0:u.duration)??void 0,learning_video:(u==null?void 0:u.learningVideo)??void 0})}catch(u){console.log("[DEBUG] Error getting video category:",u)}hu(a,n.url,"Tab Visited",l)}}),new URL(n.url).searchParams.get("purchaseState")==="purchased-mentor-ai-extension"&&(chrome.runtime.sendMessage({action:"purchaseSuccess"}),Au())}};export{rd as A,oe as B,ed as C,pu as D,yc as E,I as F,fu as G,id as H,bc as a,Gr as b,lu as c,wc as d,Cu as e,Bt as f,Du as g,nd as h,qr as i,ku as j,du as k,ru as l,su as m,hu as n,Ru as o,td as p,vc as q,Ou as r,Nu as s,Uu as t,Rc as u,Zu as v,uu as w,bu as x,sd as y,Pu as z};
//# sourceMappingURL=tabUpdated.BhCmg7uj.js.map
