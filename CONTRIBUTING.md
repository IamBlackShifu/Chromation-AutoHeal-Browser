# Contributing to OmniFlow QA

Thank you for your interest in contributing to OmniFlow QA! We welcome contributions from the community.

## How to Contribute

### Reporting Bugs

If you find a bug, please open an issue with:
- A clear, descriptive title
- Steps to reproduce the issue
- Expected behavior
- Actual behavior
- Your environment (OS, Node.js version, etc.)

### Suggesting Features

We love feature suggestions! Please open an issue with:
- A clear description of the feature
- Why you think it would be useful
- Example use cases
- Any implementation ideas you might have

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Install dependencies**: `npm install`
3. **Make your changes**
4. **Add tests** for any new functionality
5. **Ensure tests pass**: `npm test`
6. **Lint your code**: `npm run lint`
7. **Build the project**: `npm run build`
8. **Commit your changes** with a clear commit message
9. **Push to your fork** and submit a pull request

### Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/omniflow-qa.git
cd omniflow-qa

# Install dependencies
npm install

# Run tests in watch mode
npm test -- --watch

# Start development mode
npm run dev
```

### Coding Standards

- Write clear, readable code with meaningful variable names
- Add comments for complex logic
- Follow the existing code style
- Use TypeScript types properly
- Write tests for new features
- Keep functions small and focused

### Commit Message Guidelines

We follow conventional commits:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `test:` Adding or updating tests
- `refactor:` Code refactoring
- `chore:` Maintenance tasks

Example:
```
feat: add support for CSS custom selectors
fix: resolve healing engine memory leak
docs: update API documentation for Reporter
```

### Testing

- Write unit tests for new functionality
- Ensure all tests pass before submitting PR
- Aim for high test coverage
- Test edge cases

### Documentation

- Update README.md if you change functionality
- Update API.md for API changes
- Add JSDoc comments to new functions
- Update GETTING_STARTED.md for new features

## Code of Conduct

### Our Standards

- Be respectful and inclusive
- Welcome newcomers
- Accept constructive criticism
- Focus on what's best for the community
- Show empathy towards others

### Unacceptable Behavior

- Harassment or discriminatory language
- Trolling or insulting comments
- Personal or political attacks
- Publishing others' private information
- Other unprofessional conduct

## Project Structure

```
omniflow-qa/
├── src/              # Source code
│   ├── core/         # Browser core functionality
│   ├── inspector/    # Element inspection module
│   ├── recorder/     # Action recording module
│   ├── healing/      # Auto-healing engine
│   ├── scraper/      # Scraping functionality
│   ├── reporter/     # Reporting engine
│   └── ui/           # UI and animations
├── tests/            # Test files
├── docs/             # Documentation
├── config/           # Build configuration
└── dist/             # Compiled output
```

## Areas for Contribution

We especially welcome contributions in these areas:

### High Priority
- Chromium fork integration
- CDP protocol implementation
- DevTools panel development
- Locator generation algorithms
- Healing strategy improvements

### Medium Priority
- Export format implementations (Selenium, Playwright, etc.)
- Scraping capabilities enhancement
- Report generation improvements
- UI/UX enhancements
- Performance optimizations

### Documentation
- Code examples
- Tutorial videos
- API documentation
- Architecture diagrams
- Use case guides

### Testing
- Additional unit tests
- Integration tests
- End-to-end tests
- Performance benchmarks

## Questions?

Feel free to open an issue with the `question` label if you need help or clarification on anything.

## License

By contributing to OmniFlow QA, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to OmniFlow QA! 🎉
