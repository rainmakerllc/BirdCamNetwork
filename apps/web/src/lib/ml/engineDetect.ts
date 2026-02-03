// Detect available ML execution backends

export type MLEngine = 'webgpu' | 'wasm-simd' | 'wasm' | 'none';

export interface EngineCapabilities {
  engine: MLEngine;
  webgpu: boolean;
  wasmSimd: boolean;
  wasm: boolean;
}

let cachedCapabilities: EngineCapabilities | null = null;

export async function detectEngine(): Promise<EngineCapabilities> {
  if (cachedCapabilities) return cachedCapabilities;

  const capabilities: EngineCapabilities = {
    engine: 'none',
    webgpu: false,
    wasmSimd: false,
    wasm: true, // WASM is always available in modern browsers
  };

  // Check WebGPU
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gpu = (navigator as any).gpu;
      const adapter = await gpu.requestAdapter();
      if (adapter) {
        capabilities.webgpu = true;
        capabilities.engine = 'webgpu';
      }
    } catch {
      // WebGPU not available
    }
  }

  // Check WASM SIMD
  if (typeof WebAssembly !== 'undefined') {
    try {
      // Test SIMD support with a small module
      const simdTest = new Uint8Array([
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
        0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b, 0x03,
        0x02, 0x01, 0x00, 0x0a, 0x0a, 0x01, 0x08, 0x00,
        0x41, 0x00, 0xfd, 0x0f, 0x0b,
      ]);
      await WebAssembly.instantiate(simdTest);
      capabilities.wasmSimd = true;
      if (capabilities.engine === 'none') {
        capabilities.engine = 'wasm-simd';
      }
    } catch {
      // SIMD not available
      if (capabilities.engine === 'none') {
        capabilities.engine = 'wasm';
      }
    }
  }

  cachedCapabilities = capabilities;
  return capabilities;
}

export function getOrtExecutionProviders(): string[] {
  // Return providers in order of preference
  // ORT Web will try each in order
  return ['webgpu', 'wasm'];
}
