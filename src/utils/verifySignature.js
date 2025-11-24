import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';

export const verifySignature = (message, signature, publicKey) => {
  try {
    // Convert message to Uint8Array
    const messageBytes = new TextEncoder().encode(message);
    
    // Decode signature from base58
    const signatureBytes = bs58.decode(signature);
    
    // Decode public key
    const publicKeyBytes = new PublicKey(publicKey).toBytes();
    
    // Verify signature
    const verified = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKeyBytes
    );
    
    return verified;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
};
