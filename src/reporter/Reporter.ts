/**
 * Reporter - Execution Reporting Engine
 * 
 * Generates comprehensive test execution reports
 * Supports HTML, PDF, JSON, JUnit XML, HAR, and Allure-compatible formats
 */

import { ExecutionResult, NetworkEntry } from '../executor/types';
import type { HealingResult } from '../healing/HealingEngine';
import { HistoryQuery, RunAnalytics, RunHistoryStore } from './RunHistoryStore';

export type ReportFormat = 'html' | 'pdf' | 'json' | 'junit' | 'har' | 'allure';

export interface TestStep {
  name: string;
  status: 'passed' | 'failed' | 'skipped' | 'cancelled';
  duration: number;
  index?: number;
  actionType?: string;
  selector?: string;
  retries?: number;
  screenshot?: string;
  error?: string;
  healedLocators?: string[];
  healing?: HealingResult;
  expected?: string;
  actual?: string;
  attachments?: Array<{ name: string; contentType: string; data?: string; path?: string }>;
}

export interface ExecutionReport {
  runId?: string;
  testName: string;
  startTime: number;
  endTime: number;
  duration: number;
  status: 'passed' | 'failed' | 'cancelled';
  steps: TestStep[];
  screenshots: string[];
  healingEvents: number;
  healingDetails?: HealingResult[];
  consoleLogs?: string[];
  environment?: {
    runtime: string;
    headless?: boolean;
  };
  networkLogs?: NetworkEntry[];
  performanceMetrics?: Record<string, number>;
  attachments?: Array<{ name: string; contentType: string; data?: string; path?: string }>;
}

export class Reporter {
  private currentReport: ExecutionReport | null = null;
  private reportHistory: ExecutionReport[] = [];
  private runHistory = new RunHistoryStore();

  constructor() {
    console.log('Reporter initialized');
  }

  startReport(testName: string): void {
    this.currentReport = {
      testName,
      startTime: Date.now(),
      endTime: 0,
      duration: 0,
      status: 'passed',
      steps: [],
      screenshots: [],
      healingEvents: 0,
    };
    console.log(`Started reporting for: ${testName}`);
  }

  addStep(step: TestStep): void {
    if (this.currentReport) {
      this.currentReport.steps.push(step);
      if (step.status === 'failed') {
        this.currentReport.status = 'failed';
      }
      console.log(`Step added: ${step.name} - ${step.status}`);
    }
  }

  addScreenshot(screenshot: string): void {
    if (this.currentReport) {
      this.currentReport.screenshots.push(screenshot);
    }
  }

  addHealingEvent(): void {
    if (this.currentReport) {
      this.currentReport.healingEvents++;
    }
  }

  endReport(): ExecutionReport | null {
    if (this.currentReport) {
      this.currentReport.endTime = Date.now();
      this.currentReport.duration = this.currentReport.endTime - this.currentReport.startTime;
      this.reportHistory.push(this.currentReport);
      this.runHistory.add(this.currentReport);
      
      console.log(`Report completed for: ${this.currentReport.testName}`);
      console.log(`Status: ${this.currentReport.status}`);
      console.log(`Duration: ${this.currentReport.duration}ms`);
      console.log(`Steps: ${this.currentReport.steps.length}`);
      console.log(`Healing events: ${this.currentReport.healingEvents}`);
      
      const report = this.currentReport;
      this.currentReport = null;
      return report;
    }
    return null;
  }

  async exportReport(report: ExecutionReport, format: ReportFormat): Promise<string> {
    console.log(`Exporting report in ${format} format...`);
    
    switch (format) {
      case 'json':
        return JSON.stringify({ generator: 'OmniFlow QA (Infinity Lines of Code Pvt Ltd)', ...report }, null, 2);
      case 'html':
        return this.generateHTMLReport(report);
      case 'junit':
        return this.generateJUnitReport(report);
      case 'har':
        return this.generateHARReport(report);
      case 'allure':
        return this.generateAllureReport(report);
      case 'pdf':
        return this.generatePDFReport(report);
      default:
        return '';
    }
  }

  private generateHTMLReport(report: ExecutionReport): string {
    const healingDetails = report.healingDetails ?? [];
    const passed = report.steps.filter((step) => step.status === 'passed').length;
    const failed = report.steps.filter((step) => step.status === 'failed').length;
    const skipped = report.steps.filter((step) => step.status === 'skipped').length;
    const passRate = report.steps.length > 0
      ? Math.round((passed / report.steps.length) * 1000) / 10
      : 0;
    return `
<!DOCTYPE html>
<html>
<head>
  <title>OmniFlow QA - Execution Diagnostics Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 32px auto; max-width: 1100px; color: #202124; }
    .passed { color: green; }
    .failed { color: red; }
    .cancelled, .skipped { color: #8a5a00; }
    .summary { background: #f0f0f0; padding: 15px; border-radius: 5px; }
    .healing { background: #fff8e1; border-left: 4px solid #f9ab00; margin: 8px 0; padding: 10px; }
    .metrics { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin: 16px 0; }
    .metric { border: 1px solid #dadce0; border-radius: 8px; padding: 14px; }
    .metric strong { display: block; font-size: 24px; }
    .failure { border: 1px solid #dadce0; border-left: 4px solid #d93025; border-radius: 8px; margin: 10px 0; padding: 14px; }
    .advice { background: #f1f3f4; border-radius: 5px; margin-top: 8px; padding: 8px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #dadce0; padding: 9px; text-align: left; }
    img { border: 1px solid #dadce0; border-radius: 6px; max-width: 100%; }
    code { overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <h1>OmniFlow QA - Execution Diagnostics Report</h1><p>${this.escapeHTML(report.testName)}</p>
  <div class="summary">
    <p>Status: <span class="${report.status}">${report.status.toUpperCase()}</span></p>
    <p>Duration: ${report.duration}ms</p>
    <p>Steps: ${report.steps.length}</p>
    <p>Healing Events: ${report.healingEvents}</p>
  </div>
  <div class="metrics">
    <div class="metric">Pass rate<strong>${passRate}%</strong></div>
    <div class="metric">Passed<strong>${passed}</strong></div>
    <div class="metric">Failed<strong>${failed}</strong></div>
    <div class="metric">Skipped<strong>${skipped}</strong></div>
    <div class="metric">Duration<strong>${report.duration}ms</strong></div>
  </div>
  ${failed > 0 ? `
  <h2>Action required</h2>
  ${report.steps.filter((step) => step.status === 'failed').map((step) => `
    <div class="failure">
      <strong>Step #${(step.index ?? 0) + 1}: ${this.escapeHTML(step.actionType ?? step.name)}</strong><br>
      <code>${this.escapeHTML(step.selector ?? '')}</code>
      <p>${this.escapeHTML(step.error ?? 'Execution failed')}</p>
      <div class="advice">${this.failureAdvice(step)}</div>
      <small>${step.retries ?? 0} retries · ${step.duration}ms</small>
      ${step.screenshot ? `<details open><summary>Failure screenshot</summary><img src="${this.screenshotSource(step.screenshot)}" alt="Failure evidence"></details>` : ''}
    </div>
  `).join('')}
  ` : ''}
  ${healingDetails.length > 0 ? `
  <h2>Healing Events</h2>
  ${healingDetails.map((healing) => `
    <div class="healing">
      <strong>${Math.round(healing.confidence * 100)}% confidence</strong><br>
      <code>${this.escapeHTML(healing.originalSelector)}</code>
      &rarr;
      <code>${this.escapeHTML(healing.healedSelector)}</code><br>
      <small>Strategy: ${this.escapeHTML(healing.strategy)}</small>
    </div>
  `).join('')}
  ` : ''}
  <h2>Steps</h2>
  <table><thead><tr><th>Step</th><th>Action</th><th>Target</th><th>Result</th><th>Time</th></tr></thead><tbody>
    ${report.steps.map(step => `<tr>
      <td>#${(step.index ?? 0) + 1}</td>
      <td>${this.escapeHTML(step.actionType ?? step.name)}</td>
      <td><code>${this.escapeHTML(step.selector ?? '')}</code></td>
      <td class="${step.status}">${step.status}${step.healing ? ' · healed' : ''}</td>
      <td>${step.duration}ms</td>
    </tr>`).join('')}
  </tbody></table>
  <footer>Generated by OmniFlow QA • Infinity Lines of Code Pvt Ltd</footer>
</body>
</html>
    `.trim();
  }

  private generateJUnitReport(report: ExecutionReport): string {
    const failures = report.steps.filter((step) => step.status === 'failed').length;
    const skipped = report.steps.filter((step) => step.status === 'skipped').length;

    return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="${report.testName}" generator="OmniFlow QA (Infinity Lines of Code Pvt Ltd)" tests="${report.steps.length}" failures="${failures}" skipped="${skipped}" time="${report.duration / 1000}">
    ${report.steps.map(step => `
    <testcase name="${step.name}" time="${step.duration / 1000}">
      ${step.status === 'failed' ? `<failure message="${step.error || 'Test failed'}"/>` : ''}
      ${step.status === 'skipped' ? '<skipped />' : ''}
    </testcase>
    `).join('')}
  </testsuite>
</testsuites>`.trim();
  }

  private generateHARReport(report: ExecutionReport): string {
    const startedDateTime = new Date(report.startTime).toISOString();
    const entries = (report.networkLogs || []).map((entry) => ({
      startedDateTime: new Date(entry.timestamp || report.startTime).toISOString(),
      time: 0,
      request: {
        method: entry.method || 'GET',
        url: entry.url || '',
        httpVersion: 'HTTP/1.1',
        headers: [],
        queryString: [],
        cookies: [],
        headersSize: -1,
        bodySize: -1,
      },
      response: {
        status: entry.status || 0,
        statusText: '',
        httpVersion: 'HTTP/1.1',
        headers: [],
        cookies: [],
        content: {
          size: -1,
          mimeType: 'text/plain',
        },
        redirectURL: '',
        headersSize: -1,
        bodySize: -1,
      },
      cache: {},
      timings: {
        send: 0,
        wait: 0,
        receive: 0,
      },
    }));

    return JSON.stringify(
      {
        log: {
          version: '1.2',
          creator: {
            name: 'OmniFlow QA',
            version: '0.2.0',
          },
          pages: [
            {
              startedDateTime,
              id: report.runId || report.testName,
              title: report.testName,
              pageTimings: {
                onLoad: report.duration,
              },
            },
          ],
          entries,
        },
      },
      null,
      2
    );
  }

  private generateAllureReport(report: ExecutionReport): string {
    const statusMap: Record<string, 'passed' | 'failed' | 'skipped'> = {
      passed: 'passed',
      failed: 'failed',
      skipped: 'skipped',
    };

    const allureResult = {
      uuid: report.runId || `${report.testName}-${report.startTime}`,
      name: report.testName,
      status: statusMap[report.status] || 'failed',
      stage: 'finished',
      start: report.startTime,
      stop: report.endTime,
      steps: report.steps.map((step) => ({
        name: step.name,
        status: statusMap[step.status] || 'failed',
        stage: 'finished',
        start: report.startTime,
        stop: report.startTime + step.duration,
        statusDetails: step.error
          ? {
              message: step.error,
            }
          : undefined,
      })),
      attachments: report.screenshots.map((_, index) => ({
        name: `screenshot-${index + 1}`,
        type: 'image/png',
        source: `screenshot-${index + 1}.png`,
      })),
      labels: [
        { name: 'framework', value: 'omniflow-qa' },
        { name: 'suite', value: report.testName },
      ],
    };

    return JSON.stringify(allureResult, null, 2);
  }

  fromExecutionResult(testName: string, execution: ExecutionResult): ExecutionReport {
    const report: ExecutionReport = {
      runId: execution.runId,
      testName,
      startTime: execution.startedAt,
      endTime: execution.endedAt,
      duration: execution.durationMs,
      status: execution.finalState === 'cancelled' ? 'cancelled' : execution.status,
      steps: execution.steps.map((step) => ({
        index: step.index,
        name: `${step.index + 1}. ${step.action.type} ${step.action.selector}`,
        actionType: step.action.type,
        selector: step.action.selector,
        status: step.status,
        duration: step.durationMs,
        retries: step.retries,
        screenshot: step.evidence?.screenshotBase64,
        error: step.error,
        healing: step.healing,
        expected: step.expected,
        actual: step.actual,
        healedLocators: step.healing
          ? [`${step.healing.originalSelector} -> ${step.healing.healedSelector}`]
          : undefined,
      })),
      screenshots: execution.steps
        .map((step) => step.evidence?.screenshotBase64)
        .filter((value): value is string => Boolean(value)),
      healingEvents: execution.steps.filter((step) => Boolean(step.healing)).length,
      healingDetails: execution.steps
        .map((step) => step.healing)
        .filter((healing): healing is HealingResult => Boolean(healing)),
      consoleLogs: execution.consoleLogs,
      networkLogs: execution.networkSummary,
      environment: {
        runtime: 'playwright-core',
      },
      attachments: execution.attachments,
    };

    this.reportHistory.push(report);
    this.runHistory.add(report);
    return report;
  }

  getReportHistory(): ExecutionReport[] {
    return [...this.reportHistory];
  }

  clearHistory(): void {
    this.reportHistory = [];
    this.runHistory.clear();
    console.log('Report history cleared');
  }

  searchHistory(query?: HistoryQuery): ExecutionReport[] { return this.runHistory.search(query); }
  getRunAnalytics(): RunAnalytics { return this.runHistory.analytics(); }
  recordReport(report: ExecutionReport): ExecutionReport {
    const stored = JSON.parse(JSON.stringify(report)) as ExecutionReport;
    this.reportHistory.push(stored);
    this.runHistory.add(stored);
    return stored;
  }
  exportHistory(): string { return this.runHistory.export(); }
  importHistory(value: string): void { this.runHistory.import(value); }

  private generatePDFReport(report: ExecutionReport): string {
    const lines = [
      `OmniFlow QA - Execution Diagnostics Report: ${report.testName}`,
      `Status: ${report.status.toUpperCase()}`,
      `Duration: ${report.duration} ms`,
      `Steps: ${report.steps.length}  Healing events: ${report.healingEvents}`,
      ...report.steps.map((step, index) =>
        `${index + 1}. ${step.name} - ${step.status.toUpperCase()} (${step.duration} ms)${step.error ? ` - ${step.error}` : ''}`
      ),
      'Generated by OmniFlow QA • Infinity Lines of Code Pvt Ltd',
    ];
    const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    const stream = `BT /F1 11 Tf 40 800 Td ${lines.slice(0, 42).map((line, index) =>
      `${index ? '0 -17 Td ' : ''}(${escape(line.slice(0, 110))}) Tj`
    ).join(' ')} ET`;
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) =>
      `${String(offset).padStart(10, '0')} 00000 n `
    ).join('\n')}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return pdf;
  }

  private escapeHTML(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character] ?? character);
  }

  private screenshotSource(value: string): string {
    const normalized = value.trim();
    return /^data:image\/(?:png|jpe?g|webp);base64,/i.test(normalized)
      ? normalized
      : `data:image/png;base64,${normalized}`;
  }

  private failureAdvice(step: TestStep): string {
    const error = (step.error ?? '').toLowerCase();
    if (error.includes('timeout')) {
      return 'Check target readiness, add a deterministic wait, or adjust this step timeout.';
    }
    if (error.includes('not found') || error.includes('selector')) {
      return 'Inspect the selector and its frame or shadow-root context, then review available healing candidates.';
    }
    if (step.actionType === 'upload') {
      return 'Verify that the file exists and the target is an enabled file input.';
    }
    return 'Inspect this step, its preceding page state, and the captured diagnostic evidence.';
  }
}
