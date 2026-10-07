/**
 * Whether WebGL 2 really works here (it can be listed but blocked). The test
 * context is let go at once: browsers allow only a few at a time.
 */
export function canDrawWebGL2(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}
