declare const globalThis: {
  atob: (data: string) => string;
  btoa: (data: string) => string;
};

const atob = globalThis.atob;
const btoa = globalThis.btoa;

/**
 * Basic utilities for the RealtimeAPI
 */
export class RealtimeUtils {
  /**
   * Converts Float32Array of amplitude data to ArrayBuffer in Int16Array format
   */
  static floatTo16BitPCM(float32Array: Float32Array): ArrayBuffer {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    let offset = 0;
    for (let i = 0; i < float32Array.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
  }

  /**
   * Converts a base64 string to an ArrayBuffer
   */
  static base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Converts an ArrayBuffer, Int16Array or Float32Array to a base64 string
   */
  static arrayBufferToBase64(arrayBuffer: ArrayBuffer | Int16Array | Float32Array): string {
    let buffer: ArrayBuffer;
    
    if (arrayBuffer instanceof Float32Array) {
      buffer = this.floatTo16BitPCM(arrayBuffer);
    } else if (arrayBuffer instanceof Int16Array) {
      buffer = arrayBuffer.buffer;
    } else {
      buffer = arrayBuffer;
    }

    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000; // 32KB chunk size
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return btoa(binary);
  }

  /**
   * Merge two Int16Arrays from Int16Arrays or ArrayBuffers
   */
  static mergeInt16Arrays(left: ArrayBuffer | Int16Array, right: ArrayBuffer | Int16Array): Int16Array {
    let leftArray: Int16Array;
    let rightArray: Int16Array;

    if (left instanceof ArrayBuffer) {
      leftArray = new Int16Array(left);
    } else {
      leftArray = left;
    }

    if (right instanceof ArrayBuffer) {
      rightArray = new Int16Array(right);
    } else {
      rightArray = right;
    }

    if (!(leftArray instanceof Int16Array) || !(rightArray instanceof Int16Array)) {
      throw new Error('Both items must be Int16Array');
    }

    const newValues = new Int16Array(leftArray.length + rightArray.length);
    newValues.set(leftArray, 0);
    newValues.set(rightArray, leftArray.length);
    return newValues;
  }

  /**
   * Generates an id to send with events and messages
   */
  static generateId(prefix: string, length: number = 21): string {
    // base58; non-repeating chars
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const str = Array(length - prefix.length)
      .fill(0)
      .map(() => chars[Math.floor(Math.random() * chars.length)])
      .join('');
    return `${prefix}${str}`;
  }
}
