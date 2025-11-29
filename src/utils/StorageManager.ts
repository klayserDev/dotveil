import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const SERVICE_NAME = 'dotveil';
const ACCESS_TOKEN_KEY = 'access_token';
const PRIVATE_KEY_KEY = 'private_key';

/**
 * Storage Manager - Handles secure storage of credentials
 * Uses system keychain (keytar) if available, otherwise falls back to file storage (~/.dotveil/config.json)
 */
export class StorageManager {
  private keytar: any;
  private useFallback: boolean = false;
  private configPath: string;

  constructor() {
    this.configPath = path.join(os.homedir(), '.dotveil', 'config.json');
    try {
      // Try to load keytar dynamically to avoid crashing if system deps are missing
      this.keytar = require('keytar');
    } catch (error) {
      this.useFallback = true;
      this.ensureConfigDir();
    }
  }

  private ensureConfigDir() {
    const configDir = path.dirname(this.configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
  }

  private getFallbackConfig(): Record<string, string> {
    if (!fs.existsSync(this.configPath)) return {};
    try {
      return JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
    } catch {
      return {};
    }
  }

  private saveFallbackConfig(config: Record<string, string>) {
    this.ensureConfigDir();
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
  }

  /**
   * Store access token
   */
  async storeAccessToken(token: string): Promise<void> {
    if (this.useFallback) {
      const config = this.getFallbackConfig();
      config[ACCESS_TOKEN_KEY] = token;
      this.saveFallbackConfig(config);
    } else {
      await this.keytar.setPassword(SERVICE_NAME, ACCESS_TOKEN_KEY, token);
    }
  }

  /**
   * Retrieve access token
   */
  async getAccessToken(): Promise<string | null> {
    if (this.useFallback) {
      const config = this.getFallbackConfig();
      return config[ACCESS_TOKEN_KEY] || null;
    } else {
      return await this.keytar.getPassword(SERVICE_NAME, ACCESS_TOKEN_KEY);
    }
  }

  /**
   * Store decrypted private key
   */
  async storePrivateKey(privateKey: string): Promise<void> {
    if (this.useFallback) {
      const config = this.getFallbackConfig();
      config[PRIVATE_KEY_KEY] = privateKey;
      this.saveFallbackConfig(config);
    } else {
      // Windows Credential Manager limit workaround
      const CHUNK_SIZE = 2000;
      const chunks = [];

      for (let i = 0; i < privateKey.length; i += CHUNK_SIZE) {
        chunks.push(privateKey.slice(i, i + CHUNK_SIZE));
      }

      await this.keytar.setPassword(SERVICE_NAME, `${PRIVATE_KEY_KEY}_count`, chunks.length.toString());

      for (let i = 0; i < chunks.length; i++) {
        await this.keytar.setPassword(SERVICE_NAME, `${PRIVATE_KEY_KEY}_${i}`, chunks[i]);
      }
    }
  }

  /**
   * Retrieve private key
   */
  async getPrivateKey(): Promise<string | null> {
    if (this.useFallback) {
      const config = this.getFallbackConfig();
      return config[PRIVATE_KEY_KEY] || null;
    } else {
      const countStr = await this.keytar.getPassword(SERVICE_NAME, `${PRIVATE_KEY_KEY}_count`);

      if (!countStr) {
        return await this.keytar.getPassword(SERVICE_NAME, PRIVATE_KEY_KEY);
      }

      const count = parseInt(countStr, 10);
      let privateKey = '';

      for (let i = 0; i < count; i++) {
        const chunk = await this.keytar.getPassword(SERVICE_NAME, `${PRIVATE_KEY_KEY}_${i}`);
        if (!chunk) return null;
        privateKey += chunk;
      }

      return privateKey;
    }
  }

  /**
   * Clear all stored credentials (logout)
   */
  async clearAll(): Promise<void> {
    if (this.useFallback) {
      if (fs.existsSync(this.configPath)) {
        fs.unlinkSync(this.configPath);
      }
    } else {
      await this.keytar.deletePassword(SERVICE_NAME, ACCESS_TOKEN_KEY);

      const countStr = await this.keytar.getPassword(SERVICE_NAME, `${PRIVATE_KEY_KEY}_count`);
      if (countStr) {
        const count = parseInt(countStr, 10);
        for (let i = 0; i < count; i++) {
          await this.keytar.deletePassword(SERVICE_NAME, `${PRIVATE_KEY_KEY}_${i}`);
        }
        await this.keytar.deletePassword(SERVICE_NAME, `${PRIVATE_KEY_KEY}_count`);
      } else {
        await this.keytar.deletePassword(SERVICE_NAME, PRIVATE_KEY_KEY);
      }
    }
  }

  /**
   * Check if user is logged in
   */
  async isLoggedIn(): Promise<boolean> {
    const token = await this.getAccessToken();
    return token !== null;
  }
}
