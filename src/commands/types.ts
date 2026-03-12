import * as vscode from 'vscode';

export interface CommandRegistrar {
  register(): vscode.Disposable | vscode.Disposable[];
}
