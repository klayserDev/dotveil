import * as crypto from 'crypto';
import { promisify } from 'util';

const generateKeyPairAsync = promisify(crypto.generateKeyPair);
const scryptAsync = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions
) => Promise<Buffer>;

/**
 * KeyManager - Handles all cryptographic operations for DotVeil CLI
 * 
 * Security Features:
 * - RSA 4096 keypair generation for PKI
 * - AES-256-GCM for symmetric encryption
 * - Argon2-like key derivation via scrypt
 * - Secure IV generation for each encryption
 */
export class KeyManager {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_LENGTH = 32; // 256 bits
  private static readonly SALT_LENGTH = 32;
  private static readonly IV_LENGTH = 16;
  private static readonly AUTH_TAG_LENGTH = 16;
  private static readonly SCRYPT_N = 32768; // CPU/memory cost (2^15)
  private static readonly SCRYPT_R = 8; // Block size
  private static readonly SCRYPT_P = 1; // Parallelization

  /**
   * Generate an RSA 4096-bit keypair for PKI
   * @returns Object containing publicKey and privateKey in PEM format
   */
  async generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    return {
      publicKey,
      privateKey,
    };
  }

  /**
   * Derive encryption key from master password using scrypt (Argon2-like)
   * @param masterPassword - User's master password
   * @param salt - Salt bytes
   * @returns Derived key
   */
  private async deriveKey(masterPassword: string, salt: Buffer): Promise<Buffer> {
    return (await scryptAsync(
      masterPassword,
      salt,
      KeyManager.KEY_LENGTH,
      {
        N: KeyManager.SCRYPT_N,
        r: KeyManager.SCRYPT_R,
        p: KeyManager.SCRYPT_P,
        maxmem: 64 * 1024 * 1024, // 64MB
      }
    )) as Buffer;
  }

  /**
   * Encrypt the private key using the master password
   * Used during registration to protect the private key before uploading
   * 
   * @param privateKey - RSA private key in PEM format
   * @param masterPassword - User's master password (never sent to server)
   * @returns Object containing encrypted private key, salt, and IV
   */
  async encryptPrivateKey(
    privateKey: string,
    masterPassword: string
  ): Promise<{ encrypted: string; salt: string; iv: string }> {
    // Generate random salt for key derivation
    const salt = crypto.randomBytes(KeyManager.SALT_LENGTH);

    // Derive encryption key from master password
    const key = await this.deriveKey(masterPassword, salt);

    // Generate random IV for AES-GCM
    const iv = crypto.randomBytes(KeyManager.IV_LENGTH);

    // Create cipher
    const cipher = crypto.createCipheriv(KeyManager.ALGORITHM, key, iv);

    // Encrypt the private key
    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get authentication tag for GCM mode
    const authTag = cipher.getAuthTag();

    // Combine encrypted data with auth tag
    const encryptedWithTag = encrypted + authTag.toString('hex');

    return {
      encrypted: encryptedWithTag,
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
    };
  }

  /**
   * Decrypt the private key using the master password
   * Used during login on a new device to restore access
   * 
   * @param encrypted - Encrypted private key (hex)
   * @param masterPassword - User's master password
   * @param salt - Salt used during encryption (hex)
   * @param iv - IV used during encryption (hex)
   * @returns Decrypted private key in PEM format
   * @throws Error if decryption fails (wrong password or corrupted data)
   */
  async decryptPrivateKey(
    encrypted: string,
    masterPassword: string,
    salt: string,
    iv: string
  ): Promise<string> {
    try {
      // Convert hex strings to buffers
      const saltBuffer = Buffer.from(salt, 'hex');
      const ivBuffer = Buffer.from(iv, 'hex');

      // Derive the same key from master password
      const key = await this.deriveKey(masterPassword, saltBuffer);

      // Split encrypted data and auth tag
      const authTag = Buffer.from(
        encrypted.slice(-KeyManager.AUTH_TAG_LENGTH * 2),
        'hex'
      );
      const encryptedData = encrypted.slice(0, -KeyManager.AUTH_TAG_LENGTH * 2);

      // Create decipher
      const decipher = crypto.createDecipheriv(KeyManager.ALGORITHM, key, ivBuffer);
      decipher.setAuthTag(authTag);

      // Decrypt
      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error('Failed to decrypt private key. Incorrect master password or corrupted data.');
    }
  }

  /**
   * Encrypt a message using RSA public key
   * Used to wrap project keys when sharing with team members
   * 
   * @param message - The message to encrypt (e.g., project symmetric key)
   * @param publicKey - Recipient's RSA public key in PEM format
   * @returns Encrypted message in base64
   */
  encryptMessage(message: string, publicKey: string): string {
    const encrypted = crypto.publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(message, 'utf8')
    );

    return encrypted.toString('base64');
  }

  /**
   * Decrypt a message using RSA private key
   * Used to unwrap project keys shared by project admins
   * 
   * @param encrypted - Encrypted message in base64
   * @param privateKey - User's RSA private key in PEM format
   * @returns Decrypted message
   */
  decryptMessage(encrypted: string, privateKey: string): string {
    const decrypted = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(encrypted, 'base64')
    );

    return decrypted.toString('utf8');
  }

  /**
   * Generate a random symmetric key for project encryption
   * Each project gets its own AES-256 key
   * 
   * @returns Random 256-bit key in hex format
   */
  generateProjectKey(): string {
    return crypto.randomBytes(KeyManager.KEY_LENGTH).toString('hex');
  }

  /**
   * Encrypt .env file contents with project key
   * 
   * @param envContent - The .env file contents
   * @param projectKey - Project symmetric key (hex)
   * @returns Object with encrypted data and IV
   */
  encryptEnvFile(envContent: string, projectKey: string): { encrypted: string; iv: string } {
    const iv = crypto.randomBytes(KeyManager.IV_LENGTH);
    const key = Buffer.from(projectKey, 'hex');

    const cipher = crypto.createCipheriv(KeyManager.ALGORITHM, key, iv);

    let encrypted = cipher.update(envContent, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();
    const encryptedWithTag = encrypted + authTag.toString('hex');

    return {
      encrypted: encryptedWithTag,
      iv: iv.toString('hex'),
    };
  }

  /**
   * Decrypt .env file contents with project key
   * 
   * @param encrypted - Encrypted data (hex)
   * @param projectKey - Project symmetric key (hex)
   * @param iv - IV used during encryption (hex)
   * @returns Decrypted .env file contents
   */
  decryptEnvFile(encrypted: string, projectKey: string, iv: string): string {
    const key = Buffer.from(projectKey, 'hex');
    const ivBuffer = Buffer.from(iv, 'hex');

    // Split encrypted data and auth tag
    const authTag = Buffer.from(
      encrypted.slice(-KeyManager.AUTH_TAG_LENGTH * 2),
      'hex'
    );
    const encryptedData = encrypted.slice(0, -KeyManager.AUTH_TAG_LENGTH * 2);

    const decipher = crypto.createDecipheriv(KeyManager.ALGORITHM, key, ivBuffer);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
