(function registerTargetEnvironment() {
  if (customElements.get('chromation-target-environment')) return;

  class ChromationTargetEnvironment extends HTMLElement {
    connectedCallback() {
      this.setAttribute('role', 'status');
      this.setAttribute('aria-live', 'polite');
      if (!this.querySelector('i')) this.prepend(document.createElement('i'));
      if (!this.querySelector('[data-target-label]')) {
        const label = document.createElement('span');
        label.dataset.targetLabel = '';
        this.append(label);
      }
      this.setTarget(this.dataset.platform || 'web', this.dataset.name || 'Chrome');
    }

    setTarget(platform = 'web', name = 'Chrome') {
      const normalizedPlatform = platform === 'android' ? 'android' : platform === 'ios' ? 'ios' : 'web';
      const normalizedName = String(name || (normalizedPlatform === 'web' ? 'Chrome' : 'Device')).trim().slice(0, 120);
      const platformLabel = normalizedPlatform === 'android' ? 'Android' : normalizedPlatform === 'ios' ? 'iOS' : 'Web';
      this.dataset.platform = normalizedPlatform;
      this.dataset.name = normalizedName;
      const label = this.querySelector('[data-target-label]');
      if (label) label.textContent = `${platformLabel} \u00B7 ${normalizedName}`;
      this.title = `Active target: ${platformLabel} \u00B7 ${normalizedName}`;
      this.setAttribute('aria-label', this.title);
    }
  }

  customElements.define('chromation-target-environment', ChromationTargetEnvironment);
})();
