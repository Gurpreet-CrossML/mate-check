/**
 * DOM polyfills required by three.js / three-stdlib in React Native.
 *
 * Several three-stdlib loaders (and parts of three itself) feature-detect
 * the browser DOM at module-load time — e.g. `document.getElementsByTagName`
 * for shader sourcing, `document.createElementNS` for SVG-based curves.
 * On Hermes those calls throw "runtime not ready" before our app code
 * ever runs, so we install a minimal stub here that's imported *first*
 * from the entry file.
 *
 * We deliberately don't pretend to be a full DOM — calls return empty
 * arrays / no-op objects so detection short-circuits gracefully.
 */
const g: any = globalThis as any;

if (typeof g.document === "undefined") {
  const noopElement = () => ({
    style: {},
    setAttribute: () => undefined,
    appendChild: () => undefined,
    getContext: () => null,
  });
  g.document = {
    createElement: noopElement,
    createElementNS: noopElement,
    getElementsByTagName: () => [],
    getElementById: () => null,
    head: { appendChild: () => undefined },
    body: { appendChild: () => undefined },
    documentElement: { style: {} },
  };
}

if (typeof g.window === "undefined") {
  g.window = g;
}

// Some three loaders touch `self`. In RN it's already aliased to
// globalThis but be explicit so a re-bundle doesn't surprise us.
if (typeof g.self === "undefined") {
  g.self = g;
}
