(function createChromationModuleRuntime() {
  if (window.ChromationUI) return;
  const factories = new Map();
  const instances = new WeakMap();

  window.ChromationUI = Object.freeze({
    register(name, factory) {
      if (!name || typeof factory !== 'function') throw new TypeError('Renderer modules require a name and factory');
      if (factories.has(name)) throw new Error(`Renderer module ${name} is already registered`);
      factories.set(name, factory);
    },
    mount(name, element, context = {}) {
      if (!(element instanceof Element)) throw new TypeError(`Renderer module ${name} requires a host element`);
      const factory = factories.get(name);
      if (!factory) throw new Error(`Renderer module ${name} is not registered`);
      const previous = instances.get(element);
      previous?.dispose?.();
      const instance = factory(element, context) || {};
      instances.set(element, instance);
      return instance;
    },
    unmount(element) {
      const instance = instances.get(element);
      instance?.dispose?.();
      instances.delete(element);
    },
  });
})();
