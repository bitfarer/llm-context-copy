import * as vscode from 'vscode';
import { PreviewPanelOptions, ProjectContext } from '../types';
import { PreviewService, PreviewContent } from './PreviewService';

export class PreviewPanel {
  public static readonly viewType = 'llm-context-copy.preview';

  private panel: vscode.WebviewPanel | undefined;
  private previewService: PreviewService;
  private options: PreviewPanelOptions;
  private currentContext: ProjectContext | undefined;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private extensionContext: vscode.ExtensionContext,
    tokenCounter: any,
    outputFormat: string = 'markdown'
  ) {
    this.previewService = new PreviewService(tokenCounter, outputFormat);
    this.options = {
      showSyntaxHighlighting: true,
      showTokenCount: true,
      autoRefresh: false,
      theme: 'dark',
    };
  }

  async show(context: ProjectContext): Promise<void> {
    this.currentContext = context;

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Two);
      this.updateContent(context);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        PreviewPanel.viewType,
        'Context Preview',
        {
          viewColumn: vscode.ViewColumn.Two,
          preserveFocus: true,
        },
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      );

      this.panel.onDidDispose(() => {
        this.panel = undefined;
      }, null, this.disposables);

      this.panel.onDidChangeViewState(() => {
        if (this.panel?.visible && this.currentContext) {
          this.updateContent(this.currentContext);
        }
      }, null, this.disposables);

      this.updateContent(context);
    }
  }

  private updateContent(context: ProjectContext): void {
    if (!this.panel) { return; }

    const preview = this.previewService.generatePreview(context);
    const html = this.generateHtml(preview);
    this.panel.webview.html = html;
  }

  private generateHtml(preview: PreviewContent): string {
    const isDark = this.options.theme === 'dark';
    const bgColor = isDark ? '#1e1e1e' : '#ffffff';
    const textColor = isDark ? '#d4d4d4' : '#333333';
    const borderColor = isDark ? '#404040' : '#e0e0e0';
    const codeBg = isDark ? '#2d2d2d' : '#f5f5f5';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: ${bgColor};
      color: ${textColor};
      padding: 16px;
      font-size: 14px;
      line-height: 1.6;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 12px;
      border-bottom: 1px solid ${borderColor};
      margin-bottom: 16px;
    }
    .title {
      font-size: 16px;
      font-weight: 600;
    }
    .stats {
      display: flex;
      gap: 16px;
      font-size: 12px;
      color: ${isDark ? '#888' : '#666'};
    }
    .stat-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .token-badge {
      background: ${isDark ? '#0e639c' : '#0078d4'};
      color: white;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
    }
    .content-wrapper {
      max-height: calc(100vh - 120px);
      overflow-y: auto;
    }
    pre {
      background: ${codeBg};
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    code {
      font-family: 'Fira Code', 'Consolas', monospace;
    }
    .file-header {
      color: ${isDark ? '#569cd6' : '#0066cc'};
      font-weight: 600;
      margin-top: 16px;
      margin-bottom: 8px;
    }
    .file-header:first-child { margin-top: 0; }
    h2 {
      font-size: 15px;
      margin: 12px 0 8px;
      color: ${isDark ? '#9cdcfe' : '#0066cc'};
    }
    .actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid ${borderColor};
    }
    button {
      padding: 6px 12px;
      border-radius: 4px;
      border: 1px solid ${borderColor};
      background: ${isDark ? '#2d2d2d' : '#f5f5f5'};
      color: ${textColor};
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s;
    }
    button:hover {
      background: ${isDark ? '#3d3d3d' : '#e0e0e0'};
    }
    button.primary {
      background: ${isDark ? '#0e639c' : '#0078d4'};
      color: white;
      border-color: ${isDark ? '#0e639c' : '#0078d4'};
    }
    button.primary:hover {
      background: ${isDark ? '#1177bb' : '#0066b8'};
    }
    .empty-state {
      text-align: center;
      padding: 40px;
      color: ${isDark ? '#888' : '#666'};
    }
    @keyframes tokenCount {
      from { opacity: 0.5; }
      to { opacity: 1; }
    }
    .token-count-animate {
      animation: tokenCount 0.3s ease-out;
    }
  </style>
</head>
<body>
  <div class="header">
    <span class="title">📋 LLM Context Preview</span>
    <div class="stats">
      <span class="stat-item">
        <span>📄</span>
        <span>${preview.fileCount} files</span>
      </span>
      <span class="stat-item">
        <span class="token-badge token-count-animate">~${preview.tokenCount.toLocaleString()} tokens</span>
      </span>
    </div>
  </div>
  
  <div class="content-wrapper">
    ${this.escapeHtml(preview.content)}
  </div>

  <div class="actions">
    <button class="primary" onclick="copyContent()">📋 Copy to Clipboard</button>
    <button onclick="refreshPreview()">🔄 Refresh</button>
  </div>

  <script>
    const content = \`${this.escapeForScript(preview.content)}\`;

    function copyContent() {
      vscode.postMessage({
        command: 'copy',
        content: content
      });
    }

    function refreshPreview() {
      vscode.postMessage({
        command: 'refresh'
      });
    }

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.command === 'update') {
        location.reload();
      }
    });
  </script>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private escapeForScript(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$');
  }

  updateOptions(options: Partial<PreviewPanelOptions>): void {
    this.options = { ...this.options, ...options };
    if (this.currentContext) {
      this.updateContent(this.currentContext);
    }
  }

  hide(): void {
    this.panel?.dispose();
    this.panel = undefined;
  }

  dispose(): void {
    this.hide();
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}
