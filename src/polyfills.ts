/**
 * DOM polyfills required by three.js / three-stdlib / lottie in React Native.
 *
 * Several libraries feature-detect the browser DOM at module-load time —
 * `getElementsByTagName`, `getElementsByClassName`, `createElement('canvas')
 * .getContext('2d')` and so on. On Hermes those calls throw "runtime not
 * ready" before our app code ever runs.
 *
 * Rather than enumerate every API, we wrap a sparse object in a Proxy that
 * returns:
 *   - well-known shapes (createElement, head/body, …) for code that looks
 *     for them by name, and
 *   - a fall-through noop function for everything else, so unfamiliar
 *     getter-then-call patterns like `document.foo()` don't throw.
 *
 * Writes are always accepted and discarded. We deliberately don't pretend
 * to be a real DOM — accessors return falsy / empty values so feature
 * detection short-circuits gracefully.
 */
const g: any = globalThis as any;

const noop = (): any => undefined;
const emptyList = (): any[] => [];

function makeNoopProxy(): any {
  const fn: any = () => undefined;
  return new Proxy(fn, {
    get(_t, prop) {
      if (prop === "width" || prop === "height") return 0;
      if (prop === "length") return 0;
      if (prop === "style") return {};
      if (prop === Symbol.toPrimitive) return () => "";
      return makeNoopProxy();
    },
    set() {
      return true;
    },
    apply() {
      return makeNoopProxy();
    },
  });
}

function makeElement(tag?: string): any {
  const el: any = {
    tagName: (tag || "").toUpperCase(),
    nodeName: (tag || "").toUpperCase(),
    style: {},
    children: [],
    width: 0,
    height: 0,
    clientWidth: 0,
    clientHeight: 0,
    parentNode: null,
    setAttribute: noop,
    getAttribute: () => null,
    appendChild: (c: any) => c,
    removeChild: noop,
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: () => true,
    getContext: () => makeNoopProxy(),
    toDataURL: () => "",
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }),
  };
  return el;
}

function makeDocument() {
  const known: Record<string, any> = {
    createElement: (tag?: string) => makeElement(tag),
    createElementNS: (_ns?: string, tag?: string) => makeElement(tag),
    createTextNode: (text: string) => ({ nodeValue: text, textContent: text }),
    createDocumentFragment: () => makeElement("fragment"),
    getElementById: () => null,
    getElementsByTagName: emptyList,
    getElementsByClassName: emptyList,
    getElementsByName: emptyList,
    querySelector: () => null,
    querySelectorAll: emptyList,
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: () => true,
    head: makeElement("head"),
    body: makeElement("body"),
    documentElement: makeElement("html"),
    location: { href: "", protocol: "https:", host: "", hostname: "", pathname: "/" },
    cookie: "",
    readyState: "complete",
    title: "",
    visibilityState: "visible",
    hidden: false,
  };
  return new Proxy(known, {
    get(target, prop) {
      if (prop in target) return (target as any)[prop];
      if (typeof prop === "symbol") return undefined;
      // Unknown property — return a function that yields an empty list /
      // noop. Truthy enough to pass `if (document.x)` checks; safe to call.
      return emptyList;
    },
    set(target, prop, value) {
      (target as any)[prop] = value;
      return true;
    },
  });
}

if (typeof g.document === "undefined") {
  g.document = makeDocument();
}

if (typeof g.window === "undefined") {
  g.window = g;
}

if (typeof g.self === "undefined") {
  g.self = g;
}

if (typeof g.navigator === "undefined") {
  g.navigator = { userAgent: "ReactNative", platform: "ReactNative" };
}
