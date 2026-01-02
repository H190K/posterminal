# Contributing to Serverless Cloudflare POS Terminal

Thank you for your interest in contributing to **Serverless Cloudflare POS Terminal** 🎉
We truly appreciate community involvement — whether it’s reporting bugs, suggesting features, or submitting code.

This guide is aligned with the project’s GitHub structure, links, and workflow used in the main repository.

---

## 📋 Table of Contents

* [Code of Conduct](#code-of-conduct)
* [How Can I Contribute?](#how-can-i-contribute)
* [Development Setup](#development-setup)
* [Pull Request Process](#pull-request-process)
* [Coding Standards](#coding-standards)
* [Commit Guidelines](#commit-guidelines)
* [Testing Checklist](#testing-checklist)
* [Documentation Updates](#documentation-updates)
* [Getting Help](#getting-help)

---

## Code of Conduct

This project follows a respectful, inclusive, and professional Code of Conduct. By participating, you agree to:

* Use welcoming and inclusive language
* Respect differing opinions and experiences
* Accept constructive criticism gracefully
* Focus on what benefits the community
* Show empathy and professionalism

Unacceptable behavior may be reported via GitHub Issues or Pull Requests.

---

## How Can I Contribute?

### 🐛 Reporting Bugs

Please report bugs using **GitHub Issues**:
👉 [https://github.com/h190k/posterminal/issues](https://github.com/h190k/posterminal/issues)

Before opening a new issue:

* Check existing issues to avoid duplicates
* Use a **clear and descriptive title**
* Provide **steps to reproduce** the issue
* Explain **expected vs actual behavior**
* Include screenshots or logs if possible
* Mention your environment (browser, OS, Wrangler version)

---

### ✨ Suggesting Features

Feature requests are also handled through **GitHub Issues**:

* Clearly describe the feature
* Explain the use case and benefits
* Mention similar solutions (if any)

👉 Request a feature here:
[https://github.com/h190k/posterminal/issues](https://github.com/h190k/posterminal/issues)

---

### 🚀 First-Time Contributors

New to the project? Start with issues labeled:

* `good-first-issue`
* `help-wanted`

These are beginner-friendly and well-scoped.

---

## Development Setup

### Prerequisites

* Node.js v16+
* npm
* Cloudflare account
* Wrangler CLI

Documentation:

* Cloudflare Workers: [https://developers.cloudflare.com/workers/](https://developers.cloudflare.com/workers/)
* Wrangler CLI: [https://developers.cloudflare.com/workers/wrangler/](https://developers.cloudflare.com/workers/wrangler/)

---

### Local Setup

1. **Fork the repository**

```bash
git clone https://github.com/h190k/posterminal.git
cd posterminal
```

2. **Install dependencies**

```bash
npm install
```

3. **Configure secrets (required)**

```bash
npx wrangler secret put TERMINAL_PASSWORD
npx wrangler secret put WEBHOOK_AUTH_SECRET
npx wrangler secret put LINK_SIGNING_SECRET
npx wrangler secret put PII_ENCRYPTION_SECRET
npx wrangler secret put API_KEY
```

4. **Run locally**

```bash
npx wrangler dev
```

5. **Open in browser**

```text
http://localhost:8787
```

---

## Pull Request Process

1. **Create a new branch**

```bash
git checkout -b feature/your-feature-name
```

2. **Make your changes**

   * Keep code clean and readable
   * Add comments where logic is complex
   * Follow existing structure and patterns

3. **Commit your changes**

```bash
git commit -m "feat: add new feature"
```

4. **Push to GitHub**

```bash
git push origin feature/your-feature-name
```

5. **Open a Pull Request**

👉 [https://github.com/h190k/posterminal/pulls](https://github.com/h190k/posterminal/pulls)

Include:

* Clear description of changes
* Screenshots or recordings (if UI-related)
* Linked issues (if applicable)

6. **Respond to reviews**

   * Address feedback
   * Push updates to the same branch

---

## Coding Standards

### JavaScript

* Use modern ES6+ syntax
* Prefer `const` over `let`
* Avoid `var`
* Keep functions short and focused
* Use async/await instead of promises
* Add JSDoc for complex logic

**Example:**

```js
/**
 * Generates an HMAC-SHA256 signature
 * @param {string} text
 * @param {string} type
 */
const generateSignature = async (text, type) => {
  // ...
};
```

---

### HTML & CSS

* Use semantic HTML5
* Mobile-first design
* Use CSS variables for theming
* Avoid inline styles
* Optimize for performance

---

### Security Rules

* ❌ Never commit secrets or API keys
* ✅ Validate all user input
* ✅ Use HMAC for integrity
* ✅ Follow Zero Trust principles
* ✅ Handle errors safely

---

## Commit Guidelines

This project follows **Conventional Commits**:
👉 [https://www.conventionalcommits.org/](https://www.conventionalcommits.org/)

### Format

```text
type(scope): short description
```

### Types

* `feat` – New feature
* `fix` – Bug fix
* `docs` – Documentation
* `style` – Formatting only
* `refactor` – Code restructuring
* `perf` – Performance improvements
* `test` – Tests
* `chore` – Maintenance

**Examples:**

```bash
feat(payment): add multi-currency support
fix(webhook): validate timestamp properly
docs(readme): update deployment guide
```

---

## Testing Checklist

Before submitting a PR, verify:

* [ ] Project runs locally
* [ ] All routes respond correctly
* [ ] Payment flow works end-to-end
* [ ] Webhooks validate properly
* [ ] No secrets committed
* [ ] UI works on mobile
* [ ] No console errors

---

## Documentation Updates

If your change affects usage or behavior:

* Update `README.md`
* Add inline comments or JSDoc
* Update or create examples

---

## Getting Help

Need help or clarification?

* Open a GitHub Issue:
  [https://github.com/h190k/posterminal/issues](https://github.com/h190k/posterminal/issues)

* Join discussions via Pull Requests

---

🙏 **Thank you for contributing to Serverless Cloudflare POS Terminal!**

Your support helps keep this project secure, reliable, and open for everyone.
