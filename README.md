# DotVeil CLI

<p align="center">
  <img src="https://dotveil.com/logo.svg" alt="DotVeil Logo" width="120" />
</p>

<h1 align="center">DotVeil - Zero-Knowledge Secrets Management</h1>

<p align="center">
  <strong>Stop sharing .env files over Slack.</strong><br>
  Securely sync, manage, and inject environment variables across your team and infrastructure.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/dotveil"><img src="https://img.shields.io/npm/v/dotveil?style=flat-square&color=orange" alt="NPM Version"></a>
  <a href="https://dotveil.com"><img src="https://img.shields.io/badge/website-dotveil.com-black?style=flat-square" alt="Website"></a>
  <a href="https://github.com/klayserdev/dotveil/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/dotveil?style=flat-square&color=blue" alt="License"></a>
</p>

<p align="center">
  <a href="https://dotveil.com/docs"><strong>Documentation</strong></a> ·
  <a href="https://dotveil.com/dashboard"><strong>Dashboard</strong></a> ·
  <a href="https://github.com/klayserdev/dotveil/issues"><strong>Report Bug</strong></a>
</p>

---

## Why DotVeil?

- 🔐 **Zero-Knowledge Encryption**: Secrets are encrypted **on your device** (AES-256-GCM) before they ever touch our servers. We literally cannot see your data.
- ⚡ **Developer Experience**: A CLI that feels like magic. `dotveil push`, `dotveil pull`, done.
- 🚀 **CI/CD Ready**: Inject secrets into your builds with Service Tokens.
- 👥 **Team Access Control**: Granular permissions (Owner, Admin, Viewer) per project.
- 🔄 **Multi-Device Sync**: Your private key is encrypted with your Master Password, allowing secure access from any device.

## Installation

```bash
npm install -g dotveil
```

## Quick Start

### 1. Login & Setup
Authenticate with GitHub and create your Master Password (used to encrypt your private key).

```bash
dotveil login
```

### 2. Initialize a Project
Navigate to your project root and link it to DotVeil.

```bash
cd my-app
dotveil init
```

### 3. Push Secrets
Upload your local `.env` file (encrypted).

```bash
# Push to development environment (default)
dotveil push

# Push to production
dotveil push --env production
```

### 4. Pull Secrets
Download and decrypt secrets to a local `.env` file.

```bash
dotveil pull
```



## CI/CD Integration

Use **Service Tokens** to securely access secrets in GitHub Actions, Vercel, or Docker.

1. Go to your Project Dashboard > Settings > Service Tokens.
2. Create a token (e.g., "GitHub Actions").
3. Set `DOTVEIL_TOKEN` in your CI environment.

```yaml
# Example GitHub Action
steps:
  - name: Install DotVeil
    run: npm install -g dotveil

  - name: Pull Secrets
    run: dotveil pull --env production

  - name: Build
    run: npm run build
```

## Commands Reference

| Command | Description |
| :--- | :--- |
| `dotveil login` | Authenticate and set up encryption keys |
| `dotveil logout` | Clear local credentials |
| `dotveil init` | Initialize/Link a project in the current directory |
| `dotveil clone <id>` | Clone an existing project |
| `dotveil push` | Encrypt and upload `.env` file |
| `dotveil pull` | Download and decrypt to `.env` file |
| `dotveil env list` | List environments |
| `dotveil env create <name>` | Create a new environment |
| `dotveil env select <name>` | Switch current environment context |
| `dotveil member list` | List project members |
| `dotveil member invite <email>` | Invite a team member |
| `dotveil list` | List all your projects |
| `dotveil dashboard` | Open the project dashboard in browser |
| `dotveil rollback` | Rollback secrets to a previous version |
| `dotveil keys rotate` | Rotate your encryption keys |

## Troubleshooting

### Linux / Headless Servers
If you see an error related to `libsecret` or `keytar` on a headless server (like a VPS or Docker container), don't worry.
DotVeil automatically falls back to a secure file-based storage (`~/.dotveil/config.json`) if the system keychain is unavailable.

## Security Architecture

DotVeil uses a **Hybrid Public-Key Encryption** scheme:

1.  **User Keys**: When you sign up, we generate a 4096-bit RSA keypair locally.
    *   **Public Key**: Sent to the server (to let others share secrets with you).
    *   **Private Key**: Encrypted with your Master Password (Argon2 derived) and stored on the server (so you can sync devices).
2.  **Project Keys**: Each project has a symmetric AES-256 key.
3.  **Secret Encryption**: Secrets are encrypted with the Project Key.
4.  **Key Sharing**: The Project Key is encrypted with the Public Key of each team member.

**This means:**
*   DotVeil servers only store encrypted blobs.
*   We cannot decrypt your secrets.
*   If you lose your Master Password, your data is lost forever (we can't recover it).

## License

MIT © DotVeil Inc.

## Features

- 🔐 **Zero-Knowledge Encryption**: Your secrets are encrypted client-side before being sent to the server
- 🔑 **Master Password Protection**: Private keys are protected by your master password
- 👥 **Team Collaboration**: Share projects with role-based access control (Owner, Admin, Viewer)
- 💻 **Multi-Device Sync**: Access your secrets from any device with encrypted key vaulting
- 🔄 **GitHub OAuth**: Seamless authentication via GitHub

## Installation

```bash
npm install -g dotveil
```

## Quick Start

### 1. Login (First Time - Computer A)

```bash
dotveil login
```

This will:
- Open GitHub OAuth in your browser
- Prompt you to create a Master Password
- Generate your encryption keypair
- Store your encrypted private key on the server

### 2. Login (New Device - Computer B)

```bash
dotveil login
```

This will:
- Open GitHub OAuth in your browser
- Detect existing encryption keys
- Prompt for your Master Password to decrypt your private key

### 3. Initialize a Project

```bash
cd /path/to/your/project
dotveil init
```

### 4. Push Secrets

```bash
dotveil push --env dev
```

### 5. Pull Secrets

```bash
dotveil pull --env dev
```

## Commands

- `dotveil login` - Authenticate with GitHub OAuth
- `dotveil logout` - Clear local credentials
- `dotveil init` - Initialize a new project
- `dotveil push` - Upload encrypted .env file
- `dotveil pull` - Download and decrypt .env file
- `dotveil invite <email>` - Invite a team member
- `dotveil list` - List all your projects

## Security Architecture

### Zero-Knowledge Design

1. **Client-Side Encryption**: All secrets are encrypted on your device before transmission
2. **Master Password**: Never sent to the server, used only to encrypt/decrypt your private key
3. **RSA 4096 Keypair**: Generated per user for secure key exchange
4. **AES-256-GCM**: Used for encrypting secrets and private keys
5. **Argon2**: Key derivation from master password

### How It Works

```
┌─────────────┐
│   User A    │
│  (Laptop)   │
└──────┬──────┘
       │ 1. Create Master Password
       │ 2. Generate RSA Keypair
       │ 3. Encrypt Private Key with Master Password
       │ 4. Upload Public Key + Encrypted Private Key
       │
       ▼
┌─────────────────────────────────┐
│   DotVeil Server (Blind Box)    │
│  - Stores encrypted data only   │
│  - Cannot decrypt anything      │
└─────────────────────────────────┘
       │
       │ 5. User B logs in from Desktop
       │ 6. Downloads Encrypted Private Key
       │ 7. Enters Master Password
       │ 8. Decrypts Private Key locally
       │
       ▼
┌─────────────┐
│   User B    │
│  (Desktop)  │
└─────────────┘
```

## RBAC (Role-Based Access Control)

- **Owner**: Full access, can delete project
- **Admin**: Can read/write secrets and invite members
- **Viewer**: Read-only access, can pull but not push

## License

MIT
