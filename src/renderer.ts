const VERTEX_SHADER = `#version 300 es
out vec2 v_uv;
void main() {
  float x = float((gl_VertexID & 1) * 2 - 1);
  float y = float(((gl_VertexID >> 1) & 1) * 2 - 1);
  gl_Position = vec4(x, y, 0.0, 1.0);
  v_uv = vec2(x * 0.5 + 0.5, y * 0.5 + 0.5);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_spectrogram;
uniform sampler2D u_colormap;
uniform float u_dbMin;
uniform float u_dbMax;

in vec2 v_uv;
out vec4 fragColor;

void main() {
  // Texture layout: width=fftSize (frequency), height=frameCount (time)
  // Screen: v_uv.x = time (left to right), v_uv.y = frequency (bottom to top)
  // So swap: texture u = v_uv.y (frequency), texture v = v_uv.x (time)
  float db = texture(u_spectrogram, vec2(v_uv.y, v_uv.x)).r;
  float normalized = clamp((db - u_dbMin) / (u_dbMax - u_dbMin), 0.0, 1.0);
  fragColor = texture(u_colormap, vec2(normalized, 0.5));
}
`;

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}`);
  }
  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vs: WebGLShader,
  fs: WebGLShader,
): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create program");
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${info}`);
  }
  return program;
}

export class SpectrogramRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private spectrogramTex: WebGLTexture;
  private colormapTex: WebGLTexture;
  private uSpectrogram: WebGLUniformLocation;
  private uColormap: WebGLUniformLocation;
  private uDbMin: WebGLUniformLocation;
  private uDbMax: WebGLUniformLocation;
  private dbMin = -80;
  private dbMax = 0;
  private texWidth = 0;
  private texHeight = 0;
  private magnitudeData: Float32Array | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error("WebGL2 not supported");
    this.gl = gl;

    // Enable linear filtering on float textures
    gl.getExtension("OES_texture_float_linear");

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    this.program = createProgram(gl, vs, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    this.uSpectrogram = gl.getUniformLocation(this.program, "u_spectrogram")!;
    this.uColormap = gl.getUniformLocation(this.program, "u_colormap")!;
    this.uDbMin = gl.getUniformLocation(this.program, "u_dbMin")!;
    this.uDbMax = gl.getUniformLocation(this.program, "u_dbMax")!;

    // Empty VAO for gl_VertexID-based rendering
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("Failed to create VAO");
    this.vao = vao;

    // Create textures
    this.spectrogramTex = gl.createTexture()!;
    this.colormapTex = gl.createTexture()!;

    // Init spectrogram texture with 1x1 placeholder
    gl.bindTexture(gl.TEXTURE_2D, this.spectrogramTex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.R32F,
      1, 1, 0, gl.RED, gl.FLOAT,
      new Float32Array([-100]),
    );
    this.setTextureParams(gl);

    // Init colormap texture
    gl.bindTexture(gl.TEXTURE_2D, this.colormapTex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA,
      256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array(256 * 4).fill(128),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private setTextureParams(gl: WebGL2RenderingContext): void {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  setColormap(data: Uint8Array): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.colormapTex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA,
      256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      data,
    );
  }

  updateSpectrogram(
    magnitudes: Float32Array,
    fftSize: number,
    frameCount: number,
  ): void {
    const gl = this.gl;
    this.texWidth = fftSize;      // texture width = frequency bins
    this.texHeight = frameCount;  // texture height = time frames
    this.magnitudeData = magnitudes;
    gl.bindTexture(gl.TEXTURE_2D, this.spectrogramTex);
    // Data layout: frame-major [frame0-bin0, frame0-bin1, ..., frame1-bin0, ...]
    // texImage2D reads row-major, so width=fftSize gives one row per frame
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.R32F,
      fftSize, frameCount, 0,
      gl.RED, gl.FLOAT,
      magnitudes,
    );
    this.setTextureParams(gl);
  }

  setDbRange(min: number, max: number): void {
    this.dbMin = min;
    this.dbMax = max;
  }

  render(): void {
    const gl = this.gl;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.useProgram(this.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.spectrogramTex);
    gl.uniform1i(this.uSpectrogram, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.colormapTex);
    gl.uniform1i(this.uColormap, 1);

    gl.uniform1f(this.uDbMin, this.dbMin);
    gl.uniform1f(this.uDbMax, this.dbMax);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /**
   * Sample the magnitude at screen UV coordinates.
   * u = time fraction (0=left, 1=right), v = frequency fraction (0=bottom, 1=top)
   * Texture layout: width=fftSize (freq), height=frameCount (time)
   * Data layout: magnitudes[frame * fftSize + bin]
   */
  sampleAt(u: number, v: number): number {
    if (!this.magnitudeData || this.texWidth === 0 || this.texHeight === 0) {
      return -Infinity;
    }
    // u maps to time (frame index = row in texture)
    const frame = Math.floor(u * this.texHeight);
    // v maps to frequency (bin index = column in texture)
    const bin = Math.floor(v * this.texWidth);
    const cf = Math.max(0, Math.min(this.texHeight - 1, frame));
    const cb = Math.max(0, Math.min(this.texWidth - 1, bin));
    return this.magnitudeData[cf * this.texWidth + cb];
  }

  destroy(): void {
    const gl = this.gl;
    gl.deleteTexture(this.spectrogramTex);
    gl.deleteTexture(this.colormapTex);
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
  }
}
