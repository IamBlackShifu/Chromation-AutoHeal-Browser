/**
 * Reporter - Execution Reporting Engine
 * 
 * Generates comprehensive test execution reports
 * Supports HTML, PDF, JSON, JUnit XML, HAR, and Allure-compatible formats
 */

import { ExecutionResult } from '../executor/types';

export type ReportFormat = 'html' | 'pdf' | 'json' | 'junit' | 'har' | 'allure';

export interface TestStep {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  screenshot?: string;
  error?: string;
  healedLocators?: string[];
}

export interface ExecutionReport {
  runId?: string;
  testName: string;
  startTime: number;
  endTime: number;
  duration: number;
  status: 'passed' | 'failed';
  steps: TestStep[];
  screenshots: string[];
  healingEvents: number;
  consoleLogs?: string[];
  environment?: {
    runtime: string;
    headless?: boolean;
  };
  networkLogs?: any[];
  performanceMetrics?: Record<string, number>;
}

export class Reporter {
  private currentReport: ExecutionReport | null = null;
  private reportHistory: ExecutionReport[] = [];

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
        return JSON.stringify(report, null, 2);
      case 'html':
        return this.generateHTMLReport(report);
      case 'junit':
        return this.generateJUnitReport(report);
      case 'har':
        return this.generateHARReport(report);
      case 'allure':
        return this.generateAllureReport(report);
      case 'pdf':
        // TODO: Implement PDF generation
        return 'PDF export placeholder';
      default:
        return '';
    }
  }

  private generateHTMLReport(report: ExecutionReport): string {
    // TODO: Generate rich HTML report with styling
    return `
<!DOCTYPE html>
<html>
<head>
  <title>${report.testName} - Test Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .passed { color: green; }
    .failed { color: red; }
    .summary { background: #f0f0f0; padding: 15px; border-radius: 5px; }
  </style>
</head>
<body>
  <h1>Test Report: ${report.testName}</h1>
  <div class="summary">
    <p>Status: <span class="${report.status}">${report.status.toUpperCase()}</span></p>
    <p>Duration: ${report.duration}ms</p>
    <p>Steps: ${report.steps.length}</p>
    <p>Healing Events: ${report.healingEvents}</p>
  </div>
  <h2>Steps</h2>
  <ul>
    ${report.steps.map(step => `
      <li class="${step.status}">
        ${step.name} - ${step.status} (${step.duration}ms)
        ${step.error ? `<br><em>Error: ${step.error}</em>` : ''}
      </li>
    `).join('')}
  </ul>
</body>
</html>
    `.trim();
  }

  private generateJUnitReport(report: ExecutionReport): string {
    const failures = report.steps.filter((step) => step.status === 'failed').length;
    const skipped = report.steps.filter((step) => step.status === 'skipped').length;

    return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="${report.testName}" tests="${report.steps.length}" failures="${failures}" skipped="${skipped}" time="${report.duration / 1000}">
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
    const entries = (report.networkLogs || []).map((entry: any) => ({
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
            name: 'Chromation AutoHeal Browser',
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
        { name: 'framework', value: 'chromation' },
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
      status: execution.status,
      steps: execution.steps.map((step) => ({
        name: `${step.index + 1}. ${step.action.type} ${step.action.selector}`,
        status: step.status,
        duration: step.durationMs,
        screenshot: step.evidence?.screenshotBase64,
        error: step.error,
      })),
      screenshots: execution.steps
        .map((step) => step.evidence?.screenshotBase64)
        .filter((value): value is string => Boolean(value)),
      healingEvents: 0,
      consoleLogs: execution.consoleLogs,
      networkLogs: execution.networkSummary,
      environment: {
        runtime: 'playwright-core',
      },
    };

    this.reportHistory.push(report);
    return report;
  }

  getReportHistory(): ExecutionReport[] {
    return [...this.reportHistory];
  }

  clearHistory(): void {
    this.reportHistory = [];
    console.log('Report history cleared');
  }
}
