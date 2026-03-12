# LLM Context Copy

Smart context copy tool that optimizes format for LLMs (Claude, GPT, Gemini, DeepSeek, Qwen, etc).

**Native VS Code TreeView file selector with checkbox support and real-time statistics!**

## Features

### Core Features

#### Native TreeView Interface
- **VS Code Native TreeView**: Built on VS Code TreeView API for seamless integration
- **Checkbox Selection**: Each file/folder has a checkbox for multi-selection
- **Folder Expand/Collapse**: Click folder icons to expand or collapse directories
- **Real-time Statistics**: Display selected file count, total size, estimated tokens
- **Theme Adaptation**: Auto-adapts to VS Code light/dark themes

#### Easy Operations
- Click folder to expand/collapse directory
- Click checkbox to select/deselect files or folders
- Selecting a folder automatically selects all sub-files
- One-click select all/clear
- Refresh button to rescan files

#### Quick Actions
- **Copy to Clipboard** - Quick copy with default settings
- **Settings** - Customize token optimization strategies
- **Refresh** - Reload file tree
- **Select All** - Select all files
- **Clear** - Deselect all

### Advanced Features

#### Smart Recommendation System
- **Related Files Suggestion** - Auto-suggest related files based on dependencies
- **Smart File Sorting** - Sort files by dependency order for better LLM understanding
- **Context Relevance Scoring** - Calculate relevance scores based on active file

#### Token Management
- **Token Budget Management** - Set token limit and auto-optimize selection
- **Precise Token Counting** - Use real tokenizer for accurate token calculation
- **Token Optimization Strategies** - Multiple strategies to reduce token consumption

#### Enhanced Features
- **Incremental Copy** - Copy only changed files
- **Session Memory** - Remember user selection history for quick restore
- **Multi-Workspace Support** - Switch between multiple workspaces
- **Preview Feature** - Preview generated context before copying
- **File Watching** - Real-time file change detection

### Token Optimization Strategies

| Strategy | Description | Default |
|----------|-------------|---------|
| Remove Empty Lines | Reduce 3+ consecutive empty lines to at most 1 | ✅ Enabled by default |
| Remove Comments | Delete single-line and multi-line comments | Optional |
| Minify Whitespace | Remove indentation and extra spaces | Optional |
| Truncate Long Files | Limit file lines (keep beginning and end) | Optional |
| Deduplicate Code | Identify and remove duplicate code blocks | Optional |
| Prioritize Important Files | Sort by importance and keep key files first | Optional |

## Usage

### 1. Open Extension

In VS Code:
- Press `Ctrl/Cmd + Shift + P` to open command palette
- Type "Open Context Copy"
- Or use command `llm-context-copy.openFileTree` directly
- Or click the extension icon in the left activity bar

### 2. Select Files

- **Expand/Collapse folders**: Click folder icon
- **Select files**: Click checkbox `☐` → `☑` before file
- **Select folder**: Click checkbox before folder, auto-selects all sub-files
- **Multi-select**: Click checkboxes of multiple files individually
- **Select all**: Click "Select All" button at top
- **Clear**: Click "Clear" button at top

### 3. Copy Content

**Quick copy** (with default settings):
- Click "Copy to Clipboard" button at bottom

**Custom copy**:
- Click "Settings" button at bottom
- Select desired optimization strategies
- Click "Copy to Clipboard" in the panel

### 4. Paste to AI

Paste clipboard content to Claude, GPT-4, DeepSeek, etc. LLM chat.

## Output Formats

Supports 4 output formats:

| Format | Description | Best For |
|--------|-------------|----------|
| Markdown | Human-readable with syntax highlighting | General use |
| JSON | Structured data format | Programmatic processing |
| Plain Text | Simple text without formatting | Quick reference |
| TOON | Token-optimized format | Maximum compression |

### Markdown Format Example

```markdown
# Project Context

## Directory Structure
```
📁 src/
  📁 components/
    📄 Button.tsx
    📄 Card.tsx
  📁 utils/
    📄 helpers.ts
  📄 index.ts
```

## Statistics

- **Total Files:** 4
- **Total Size:** 12.5 KB
- **Output Format:** MARKDOWN
- **Estimated Tokens:** ~3,200 tokens
- **Generated At:** 2025-02-13T10:30:00.000Z

---

## File: src/components/Button.tsx

```typescript
import React from 'react';

export const Button = ({ onClick, children }) => {
  return <button onClick={onClick}>{children}</button>;
};
```

---

## File: src/utils/helpers.ts

```typescript
export const formatDate = (date: Date) => {
  return date.toLocaleDateString();
};
```
```

## Configuration

Search for `llm-context-copy` in VS Code settings to configure:

| Setting | Description | Default |
|---------|-------------|---------|
| `excludePatterns` | Glob patterns for files to exclude | `["**/node_modules/**", "**/dist/**", ...]` |
| `maxFileSize` | Maximum file size in bytes | 2097152 (2MB) |
| `maxDepth` | Maximum directory depth to traverse | 10 |
| `suggestMaxFiles` | Maximum number of files to suggest | 15 |
| `analyzeFileExtensions` | File extensions to analyze for dependencies | `[".ts", ".tsx", ".js", ".jsx", ...]` |

### Relevance Scoring Weights

| Setting | Description | Default |
|---------|-------------|---------|
| `suggestWeights.activeEditor` | Weight for active editor file | 30 |
| `suggestWeights.recentFiles` | Weight for recently opened files | 20 |
| `suggestWeights.dependencies` | Weight for dependency relationships | 25 |
| `suggestWeights.fileType` | Weight for file type priority | 15 |
| `suggestWeights.pathSimilarity` | Weight for path similarity | 10 |
| `suggestWeights.imports` | Weight for import relationships | 15 |

## Commands

| Command | Description |
|---------|-------------|
| `Open Context Copy` | Open file tree view |
| `Copy Selected Files` | Copy selected files |
| `Copy Incremental Changes` | Copy incremental changes |
| `Select All Files` | Select all files |
| `Clear Selection` | Clear selection |
| `Refresh File Tree` | Refresh file tree |
| `Settings` | Open settings |
| `Preview Context` | Preview context |
| `Apply Token Budget` | Apply token budget |
| `Switch Workspace` | Switch workspace |
| `Suggest Related Files` | Suggest related files |
| `Suggest Relevant Files` | Suggest relevant files (context-based) |
| `Apply Semantic Compression` | Apply semantic compression |
| `Auto Sort Files` | Auto sort files |
| `Switch Tokenizer Model` | Switch tokenizer model |
| `Clear Cache` | Clear cache |
| `Select Output Format` | Select output format |
| `Select Compression Strategies` | Select compression strategies |

## Use Cases

- **Code Review** - Quickly share code with AI
- **Bug Debugging** - Provide complete context
- **Documentation** - Auto-generate project docs
- **Code Understanding** - Help AI understand project structure
- **Technical Consultation** - Query specific module implementation

## Changelog

### v0.0.1
- ✨ Native VS Code TreeView UI
- ✅ Checkbox file tree with partial selection
- 📁 Folder expand/collapse
- 📊 Real-time statistics display
- 🎯 Token optimization strategies
- ⚙️ Settings panel
- 🧠 Smart recommendation system
- 📦 Multiple output format support
- 💾 Persistent settings storage

## License

MIT License

---

**Let AI understand your code better!** 💬
