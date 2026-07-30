(function exposeReportWorkspace() {
  function escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }

  function duration(milliseconds) {
    const value = Math.max(0, Number(milliseconds) || 0);
    if (value < 1000) return `${Math.round(value)} ms`;
    if (value < 60000) return `${(value / 1000).toFixed(2)} s`;
    return `${Math.floor(value / 60000)}m ${Math.round((value % 60000) / 1000)}s`;
  }

  function advice(step) {
    const error = String(step.error || '').toLowerCase();
    if (error.includes('timeout')) {
      return 'Check when the target becomes visible, then add a deterministic wait or adjust this step timeout.';
    }
    if (error.includes('not found') || error.includes('selector')) {
      return 'Inspect the locator and its frame/shadow context. Review the suggested healed locator if available.';
    }
    if (step.action.type === 'upload') {
      return 'Verify that the recorded file still exists and the target is an enabled file input.';
    }
    return 'Replay this step with evidence enabled and inspect the selector, page state, and preceding action.';
  }

  function metric(label, value, tone) {
    return `<div class="report-metric ${tone}"><span>${label}</span><strong>${value}</strong></div>`;
  }

  function signed(value, suffix = '') {
    const number = Number(value) || 0;
    return `${number > 0 ? '+' : ''}${number}${suffix}`;
  }

  function screenshotSource(step) {
    const value = step?.evidence?.screenshotBase64 ?? step?.screenshot;
    if (!value) return '';
    if (typeof value === 'string') {
      const normalized = value.trim();
      if (/^data:image\/(?:png|jpe?g|webp);base64,/i.test(normalized)) return normalized;
      if (/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return `data:image/png;base64,${normalized}`;
      return '';
    }
    const bytes = Array.isArray(value) ? value : value?.data;
    if (Array.isArray(bytes)) {
      let binary = '';
      for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
      }
      return `data:image/png;base64,${btoa(binary)}`;
    }
    return '';
  }

  function failedStep(step) {
    const screenshot = screenshotSource(step);
    const screenshotError = step.evidence?.screenshotError;
    return `
      <article class="report-issue failed">
        <div class="issue-index">#${step.index + 1}</div>
        <div class="issue-content">
          <div class="issue-title">${escape(step.action.type)} failed</div>
          <code>${escape(step.action.selector || 'No selector')}</code>
          <p>${escape(step.error || 'No error detail was captured.')}</p>
          ${step.expected !== undefined || step.actual !== undefined ? `<div class="assertion-comparison"><div><span>Expected</span><code>${escape(step.expected ?? '')}</code></div><div><span>Actual</span><code>${escape(step.actual ?? '')}</code></div></div>` : ''}
          <div class="issue-advice">${escape(advice(step))}</div>
          <div class="issue-remediation"><button class="secondary-btn" data-remediation="edit-step" data-step-index="${step.index}">Edit this step</button><button class="secondary-btn" data-remediation="inspect-target" data-step-index="${step.index}">Inspect target</button><button class="secondary-btn" data-remediation="open-help" data-help-query="${escape(step.error || step.action.type)}">Find guidance</button></div>
          <div class="issue-meta">Attempted ${step.retries + 1} time${step.retries === 0 ? '' : 's'} · ${duration(step.durationMs)}</div>
          ${screenshot ? `<details open><summary>Failure screenshot</summary><img class="report-screenshot" src="${screenshot}" alt="Failure screenshot for step ${step.index + 1}" data-report-screenshot></details>` : ''}
          ${!screenshot && screenshotError ? `<div class="screenshot-capture-error">Screenshot unavailable: ${escape(screenshotError)}</div>` : ''}
        </div>
      </article>`;
  }

  function healedStep(step) {
    return `
      <article class="report-issue healed">
        <div class="issue-index">#${step.index + 1}</div>
        <div class="issue-content">
          <div class="issue-title">${escape(step.action.type)} recovered · ${Math.round(step.healing.confidence * 100)}% confidence</div>
          <div class="locator-change"><code>${escape(step.healing.originalSelector)}</code><span>→</span><code>${escape(step.healing.healedSelector)}</code></div>
          <p>Strategy: ${escape(step.healing.strategy)}</p>
          <div class="issue-remediation"><button class="secondary-btn" data-remediation="review-healing" data-step-index="${step.index}">Review recovered locator</button><button class="secondary-btn" data-remediation="open-help" data-help-query="healing locator">Healing guidance</button></div>
        </div>
      </article>`;
  }

  function stepRow(step) {
    return `
      <div class="report-step-row">
        <span>#${step.index + 1}</span>
        <span>${escape(step.action.type)}</span>
        <code title="${escape(step.action.selector)}">${escape(step.action.selector || '—')}</code>
        <span class="step-status ${escape(step.status)}">${escape(step.status)}${step.healing ? ' · healed' : ''}</span>
        <span>${duration(step.durationMs)}</span>
      </div>`;
    container.querySelectorAll('[data-report-screenshot]').forEach((image) => {
      image.addEventListener('error', () => {
        const message = document.createElement('div');
        message.className = 'screenshot-capture-error';
        message.textContent = 'The screenshot was captured but could not be decoded. Export the JSON report to inspect the evidence payload.';
        image.replaceWith(message);
      }, { once: true });
    });
  }

  function render(container, report) {
    const failures = report.steps.filter((step) => step.status === 'failed');
    const healed = report.steps.filter((step) => step.healing);
    const statusLabel = report.status === 'passed' ? 'Passed' :
      report.status === 'cancelled' ? 'Cancelled' : 'Failed';
    const summary = failures.length === 0
      ? `${report.passed} executable steps completed successfully${report.healed ? ` with ${report.healed} automatic locator repair${report.healed === 1 ? '' : 's'}` : ''}.`
      : `${failures.length} step${failures.length === 1 ? '' : 's'} require attention. Start with step #${failures[0].index + 1}: ${failures[0].error || 'execution failed'}.`;

    container.innerHTML = `
      <div class="report-page">
        <header class="report-hero report-status-${escape(report.status)}">
          <div>
            <div class="report-eyebrow">Replay executive summary</div>
            <h1>${statusLabel}</h1>
            <p>${escape(summary)}</p>
            <div class="report-meta">
              <span>Run ${escape(report.runId)}</span>
              <span>${new Date(report.startedAt || Date.now()).toLocaleString()}</span>
              <span>${duration(report.durationMs)}</span>
            </div>
          </div>
          <div class="report-hero-actions">
            <div class="report-score">${report.passRate}%<small>pass rate</small></div>
            <button class="report-rerun-btn" data-rerun-report title="Replay this recording and compare the results">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
              Rerun and compare
            </button>
          </div>
        </header>

        <section class="report-metrics">
          ${metric('Total', report.total, 'neutral')}
          ${metric('Passed', report.passed, 'passed')}
          ${metric('Failed', report.failed, 'failed')}
          ${metric('Healed', report.healed, 'healed')}
          ${metric('Skipped', report.skipped, 'skipped')}
          ${metric('Duration', duration(report.durationMs), 'duration')}
        </section>

        ${report.comparison ? `<section class="rerun-comparison" aria-label="Rerun comparison">
          <div><span>Compared with previous run</span><strong>${escape(report.comparison.previousRunId)}</strong></div>
          <div><span>Status</span><strong class="${report.comparison.statusChanged ? 'changed' : ''}">${escape(report.comparison.previousStatus)} → ${escape(report.comparison.currentStatus)}</strong></div>
          <div><span>Pass rate</span><strong>${signed(report.comparison.passRateDelta, '%')}</strong></div>
          <div><span>Failures</span><strong>${signed(report.comparison.failedDelta)}</strong></div>
          <div><span>Healed</span><strong>${signed(report.comparison.healedDelta)}</strong></div>
          <div><span>Duration</span><strong>${signed(report.comparison.durationDeltaMs, ' ms')}</strong></div>
        </section>` : ''}

        ${report.runError ? `<section class="report-callout failed"><strong>Run-level error</strong><span>${escape(report.runError)}</span></section>` : ''}

        ${failures.length ? `<section class="report-section">
          <div class="report-section-heading"><div><span>Action required</span><h2>Failures</h2></div><b>${failures.length}</b></div>
          <div class="report-issue-list">${failures.map(failedStep).join('')}</div>
        </section>` : ''}

        ${healed.length ? `<section class="report-section">
          <div class="report-section-heading"><div><span>Recovered automatically</span><h2>Healing events</h2></div><b>${healed.length}</b></div>
          <div class="report-issue-list">${healed.map(healedStep).join('')}</div>
        </section>` : ''}

        <section class="report-section">
          <div class="report-section-heading"><div><span>Complete trace</span><h2>Execution steps</h2></div><b>${report.steps.length}</b></div>
          <div class="report-step-table">
            <div class="report-step-row report-step-head"><span>Step</span><span>Action</span><span>Target</span><span>Result</span><span>Time</span></div>
            ${report.steps.map(stepRow).join('')}
          </div>
        </section>

        <section class="report-section">
          <div class="report-section-heading"><div><span>Diagnostics</span><h2>Captured context</h2></div></div>
          <div class="diagnostic-grid">
            <div><strong>${report.consoleLogs.length}</strong><span>Console entries</span></div>
            <div><strong>${report.networkSummary.length}</strong><span>Network responses</span></div>
            <div><strong>${report.steps.filter((step) => screenshotSource(step)).length}</strong><span>Failure screenshots</span></div>
          </div>
        </section>

        <footer class="report-export-bar">
          <div><strong>Export this report</strong><span>Share or archive the complete result.</span></div>
          <div class="report-export-actions">
            <button class="secondary-btn" data-report-format="html">HTML</button>
            <button class="secondary-btn" data-report-format="json">JSON</button>
            <button class="secondary-btn" data-report-format="junit">JUnit</button>
            <button class="secondary-btn" data-report-format="har">HAR</button>
            <button class="primary-btn" data-export-all-reports>Export all</button>
          </div>
        </footer>
      </div>`;
    container.querySelectorAll('[data-report-screenshot]').forEach((image) => {
      image.addEventListener('error', () => {
        const message = document.createElement('div');
        message.className = 'screenshot-capture-error';
        message.textContent = 'The screenshot was captured but could not be decoded. Export JSON to inspect the evidence payload.';
        image.replaceWith(message);
      }, { once: true });
    });
    container.querySelectorAll('[data-remediation]').forEach((button) => button.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('chromation-remediation', { detail: {
        action: button.dataset.remediation,
        stepIndex: Number(button.dataset.stepIndex),
        query: button.dataset.helpQuery || '',
      } }));
    }));
    container.querySelector?.('[data-rerun-report]')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('chromation-rerun-report', { detail: { report } }));
    });
  }

  window.ChromationReportWorkspace = { render };
})();
