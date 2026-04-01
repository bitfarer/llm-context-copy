# Changelog

All notable changes to the "llm-context-copy" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Token counting support for more LLM models
- Custom exclusion rule templates
- Batch operation history records

## [0.0.3] - 2025-04-01

### Added
- `IgnoreMatcher` utility for parsing `.gitignore` patterns and custom exclusion rules
- `maxTotalSize` configuration option to limit total readable text size (default: 8MB)
- `estimateTokensFromBytes()` method for token estimation from byte length
- Warning notifications for oversized files and total size limit exceeded

### Changed
- Refactored file collection logic with centralized `collectFileContexts()` method
- Improved binary file detection in token counting (returns 0 tokens)
- Enhanced `.gitignore` pattern support with proper glob matching
- Better handling of large files exceeding `maxFileSize` limit

### Fixed
- File tree item description no longer shows "0" for zero-size files
- Proper exclusion of hidden files while preserving `.gitignore` access

## [0.0.2] - 2025-03-30

### Added
- Binary file detection for 40+ file types (images, fonts, archives, executables, databases, documents, media files)
- Graceful handling of binary files with path-only references
- User-friendly notification when binary files are included in selection
- Binary file category display (Image, Font, Archive, Executable, etc.)

### Fixed
- PNG and other binary files no longer cause UTF-8 decode errors
- Binary files are properly displayed in all output formats (Markdown, JSON, Plain, TOON)

## [0.0.1] - 2025-02-13

### Added

#### Core Features
- Native VS Code TreeView UI for seamless editor integration
- Checkbox file tree with partial selection and batch operations
- Folder expand/collapse functionality
- Real-time statistics display (file count, size, estimated tokens)
- Theme adaptation (auto-adapts to light/dark themes)

#### Token Optimization Strategies
- Remove Empty Lines: Reduce 3+ consecutive empty lines to at most 1
- Remove Comments: Delete single-line and multi-line comments
- Minify Whitespace: Remove indentation and extra spaces
- Truncate Long Files: Limit file lines (keep beginning and end)
- Deduplicate Code: Identify and remove duplicate code blocks
- Prioritize Important Files: Sort by importance and keep key files first

#### Output Formats
- Markdown format (default): Human-readable with syntax highlighting
- JSON format: Structured data for programmatic processing
- Plain Text format: Simple text without formatting
- TOON format: Token-optimized format for maximum compression

#### Smart Features
- Related Files Suggestion: Auto-suggest related files based on dependencies
- Smart File Sorting: Sort files by dependency order
- Context Relevance Scoring: Calculate relevance based on active file
- Semantic Compression: Intelligent semantic-level content compression

#### Advanced Features
- Token Budget Management: Set token limit and auto-optimize selection
- Precise Token Counting: Use real tokenizer for accurate calculation
- Incremental Copy: Copy only changed files
- Session Memory: Remember user selection history
- Multi-Workspace Support: Switch between multiple workspaces
- Preview Feature: Preview generated context before copying
- File Watching: Real-time file change detection

#### Configuration Options
- Exclusion patterns (Glob patterns)
- Maximum file size limit
- Maximum directory traversal depth
- Relevance scoring weight configuration
- Maximum suggested files limit
- Dependency analysis file extensions

#### Commands
- `Open Context Copy` - Open file tree view
- `Copy Selected Files` - Copy selected files
- `Copy Incremental Changes` - Copy incremental changes
- `Select All Files` - Select all files
- `Clear Selection` - Clear selection
- `Refresh File Tree` - Refresh file tree
- `Settings` - Open settings
- `Preview Context` - Preview context
- `Apply Token Budget` - Apply token budget
- `Switch Workspace` - Switch workspace
- `Suggest Related Files` - Suggest related files
- `Suggest Relevant Files` - Suggest relevant files (context-based)
- `Apply Semantic Compression` - Apply semantic compression
- `Auto Sort Files` - Auto sort files
- `Switch Tokenizer Model` - Switch tokenizer model
- `Clear Cache` - Clear cache
- `Select Output Format` - Select output format
- `Select Compression Strategies` - Select compression strategies

### Technical Implementation
- Dependency injection container architecture
- Modular service design
- Complete unit test coverage
- TypeScript type safety
- esbuild high-performance bundling
