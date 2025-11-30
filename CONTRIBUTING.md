# Contributing to DotVeil CLI

First off, thanks for taking the time to contribute! 🎉

The following is a set of guidelines for contributing to DotVeil CLI. These are mostly guidelines, not rules. Use your best judgment, and feel free to propose changes to this document in a pull request.

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm

### Installation

1.  **Clone the repository**

    ```bash
    git clone https://github.com/dotveil/dotveil-cli.git
    cd dotveil-cli
    ```

2.  **Install dependencies**

    ```bash
    npm install
    ```

3.  **Build the project**

    ```bash
    npm run build
    ```

### Local Development

To run the CLI locally during development, you can use `ts-node` via the dev script:

```bash
# Run the CLI
npm run dev -- --help

# Example: Run the login command
npm run dev -- login
```

To test the built version globally on your machine:

```bash
# Link the package globally
npm link

# Now you can run 'dotveil' anywhere
dotveil --version
```

## Submitting Pull Requests

1.  **Fork the repo** and create your branch from `main`.
2.  **Test your changes** to ensure they work as expected.
3.  **Commit your changes** using descriptive commit messages.
4.  **Push to your fork** and submit a Pull Request.
5.  **Describe your changes** in the PR description. Link to any relevant issues.

## Code Style

- We use **TypeScript**. Please ensure your code is strongly typed.
- Keep functions small and focused.
- Use `chalk` for colored terminal output to keep the UX consistent.
- Handle errors gracefully.

## Reporting Bugs

Bugs are tracked as GitHub issues. When filing an issue, please include:

- The version of DotVeil CLI you are using (`dotveil --version`).
- Your operating system.
- Steps to reproduce the issue.
- Expected vs. actual behavior.

Thank you for contributing!
