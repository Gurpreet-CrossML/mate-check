/**
 * DOM polyfills required by three.js / three-stdlib in React Native.
 *
 * Several three-stdlib loaders (and parts of three itself) feature-detect
 * the browser DOM at module-load time — e.g. `document.getElementsByTagName`
 * for shader sourcing, `document.createElement('canvas').getContext('2d')`
 * for sprite/font texture generation. On Hermes those calls throw "runtime
 * not ready" before our app code ever runs, so we install minimal stubs
 * here that are imported *first* from the entry file.
 *
 * We don't pretend to be a real DOM. Getters return empty arrays / noop
 * objects so feature detection short-circuits; setters on those objects
 * are accepted and discarded.
 */
const g: any = globalThis as any;

// A Proxy whose every property read returns a no-op function, and every
// property write is silently swallowed. Lets code like
// `ctx.fillStyle = "red"; ctx.fillRect(...)` execute without throwing.
function makeNoopProxy(): any {
  const fn: any = () => undefined;
  return new Proxy(fn, {
    get(_t, prop) {
      // Common numeric/string fields three reads back; sensible defaults.
      if (prop === "width" || prop === "height") return 0;
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
  // Canvas-shaped element gets a slightly richer shape so the common
  // `canvas.getContext("2d")` -> set fillStyle pattern works.
  const el: any = {
    tagName: (tag || "").toUpperCase(),
    style: {},
    children: [] as any[],
    width: 0,
    height: 0,
    setAttribute: () => undefined,
    getAttribute: () => null,
    appendChild: (c: any) => c,
    removeChild: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    getContext: () => makeNoopProxy(),
    toDataURL: () => "",
  };
  return el;
}

if (typeof g.document === "undefined") {
  g.document = {
    createElement: (tag?: string) => makeElement(tag),
    createElementNS: (_ns?: string, tag?: string) => makeElement(tag),
    getElementsByTagName: () => [],
    getElementById: () => null,
    head: makeElement("head"),
    body: makeElement("body"),
    documentElement: makeElement("html"),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
}

if (typeof g.window === "undefined") {
  g.window = g;
}

if (typeof g.self === "undefined") {
  g.self = g;
}
