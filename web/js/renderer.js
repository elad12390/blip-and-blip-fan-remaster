import { measureViewport, fitFrame, gameplayView, followCameraY } from './viewport.js';
import { GpuCompositor } from './gpu/compositor.js';

const VERTEX = `attribute vec2 position; varying vec2 uv; void main(){ uv=vec2(position.x*.5+.5,.5-position.y*.5); gl_Position=vec4(position,0.,1.); }`;
const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 uv;
uniform sampler2D colorMap;
uniform sampler2D depthMap;
uniform vec2 texel;
uniform vec2 player;
uniform vec4 frameRect;
uniform vec2 coverScale;
uniform float sourceAspect;
uniform float pixelScale;
uniform float enhanced;
uniform float depthView;
uniform float hasDepth;
uniform float flash;
uniform float gameplay;
// Sharp bilinear filtering preserves broad pixel interiors while softening
// their edges at fractional scales. Original mode uses nearest-neighbour.
vec2 sharpUV(vec2 p){
  vec2 pixels=p/texel;
  vec2 seam=floor(pixels+.5);
  return (seam+clamp((pixels-seam)*max(pixelScale,1.),-.5,.5))*texel;
}
vec3 colorAt(vec2 p){return texture2D(colorMap,enhanced>.5?sharpUV(p):p).rgb;}
float heightAt(vec2 p){
  if(hasDepth>.5) return texture2D(depthMap,p).r;
  return dot(texture2D(colorMap,p).rgb,vec3(.2126,.7152,.0722))*.3;
}
void main(){
  vec2 sceneUV=(uv-frameRect.xy)/frameRect.zw;
  if(sceneUV.x<0. || sceneUV.y<0. || sceneUV.x>1. || sceneUV.y>1.){
    // Cinematic side space borrows a soft, dark wash from the same scene.
    vec2 p=.5+(uv-.5)*coverScale;
    vec3 ambient=texture2D(colorMap,p).rgb;
    ambient+=texture2D(colorMap,p+vec2(.035,.02)).rgb;
    ambient+=texture2D(colorMap,p-vec2(.035,.02)).rgb;
    ambient+=texture2D(colorMap,p+vec2(-.025,.035)).rgb;
    ambient+=texture2D(colorMap,p+vec2(.025,-.035)).rgb;
    gl_FragColor=vec4(ambient*.055,1.);return;
  }
  vec3 base=colorAt(sceneUV);
  float h=heightAt(sceneUV);
  if(depthView>.5){gl_FragColor=vec4(vec3(h),1.);return;}
  if(enhanced<.5 || gameplay<.5){gl_FragColor=vec4(base,1.);return;}
  vec2 gradient=vec2(heightAt(sceneUV-vec2(texel.x,0.))-heightAt(sceneUV+vec2(texel.x,0.)),heightAt(sceneUV-vec2(0.,texel.y))-heightAt(sceneUV+vec2(0.,texel.y)));
  vec3 normal=normalize(vec3(gradient*2.5,.7));
  vec3 sun=normalize(vec3(-.45,-.7,1.));
  float diffuse=max(dot(normal,sun),0.);
  vec2 delta=(sceneUV-player)*vec2(sourceAspect,1.);
  float attenuation=exp(-dot(delta,delta)*20.);
  vec3 localLight=normalize(vec3(-delta,.23));
  float lamp=max(dot(normal,localLight),0.)*attenuation;
  vec3 color=base*(.90+diffuse*.18);
  color+=base*vec3(1.,.76,.43)*lamp*(.14+flash*.7);
  vec3 bloom=vec3(0.);
  for(int i=0;i<4;i++){
    float a=float(i)*1.570796;
    vec3 sampleColor=texture2D(colorMap,sceneUV+vec2(cos(a),sin(a))*texel*2.4).rgb;
    bloom+=max(sampleColor-.80,vec3(0.));
  }
  color+=bloom*.04;
  color*=1.-.055*dot((sceneUV-.5)*vec2(1.,.85),(sceneUV-.5)*vec2(1.,.85));
  gl_FragColor=vec4(clamp(color,0.,1.),1.);
}`;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.mode = 'enhanced';
    this.state = {};
    this.fire = false;
    this.reducedMotion = false;
    this.frames = 0;
    this.disposed = false;
    this.contextLost = false;
    this.handleResize = () => this.resize();
    this.handleContextLost = event => {
      event.preventDefault();
      this.contextLost = true;
      this.onContextState?.('lost');
    };
    this.handleContextRestored = () => {
      this.contextLost = false;
      if (this.compositor) {
        this.compositor.init();
        this.compositor.resize(this.canvas.width, this.canvas.height);
        this.present();
        this.onContextState?.('restored');
        return;
      }
      this.initializeGL();
      this.uploadRetainedFrame();
      this.present();
      this.onContextState?.('restored');
    };
    const contextOptions = { alpha: false, antialias: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
    // WebGL2 renders gameplay from native draw commands. Without it the engine
    // keeps rasterising on the CPU and the legacy full-frame path below is used.
    const gl2 = canvas.getContext('webgl2', contextOptions);
    if (gl2) {
      try { this.compositor = new GpuCompositor(gl2); } catch (error) { console.warn('GPU compositor unavailable', error); }
    }
    if (this.compositor) {
      canvas.addEventListener('webglcontextlost', this.handleContextLost);
      canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
    } else if ((this.gl = canvas.getContext('webgl', contextOptions))) {
      this.initializeGL();
      canvas.addEventListener('webglcontextlost', this.handleContextLost);
      canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
    } else {
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.frameCanvas = document.createElement('canvas');
      this.frameContext = this.frameCanvas.getContext('2d', { alpha: false });
    }
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.handleResize);
      this.resizeObserver.observe(canvas);
    }
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', this.handleResize);
    window.visualViewport?.addEventListener('resize', this.handleResize);
    this.watchDpr();
    this.resize();
  }

  set onViewportChange(callback) {
    this._onViewportChange = callback;
    if (this.viewport) callback?.(this.viewport);
  }
  get onViewportChange() { return this._onViewportChange; }

  watchDpr() {
    this.dprQuery?.removeEventListener?.('change', this.handleDpr);
    this.dprQuery = window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    this.handleDpr = () => { this.watchDpr(); this.resize(); };
    this.dprQuery?.addEventListener?.('change', this.handleDpr);
  }

  resize() {
    if (this.disposed) return this.viewport;
    const rect = this.canvas.getBoundingClientRect();
    const next = measureViewport(rect.width, rect.height, window.devicePixelRatio || 1);
    // Hidden title screens must not replace the last real playfield size.
    if (!next) return this.viewport;
    const previous = this.viewport;
    this.viewport = next;
    if (this.canvas.width !== next.pixelWidth) this.canvas.width = next.pixelWidth;
    if (this.canvas.height !== next.pixelHeight) this.canvas.height = next.pixelHeight;
    this.compositor?.resize(next.pixelWidth, next.pixelHeight);
    if (!previous || Object.keys(next).some(key => next[key] !== previous[key])) this._onViewportChange?.(next);
    // Changing the canvas backing size clears its drawing buffer. Native code
    // may be paused, or may correctly ignore a DPR-only camera update. Reuse
    // the latest textures after the callback, which can deliver a newer frame.
    this.present();
    return next;
  }

  initializeGL() {
    const gl = this.gl;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw Error(message);
      }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, VERTEX), fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    this.program = program;
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    this.uniforms = Object.fromEntries(['colorMap','depthMap','texel','player','frameRect','coverScale','sourceAspect','pixelScale','enhanced','depthView','hasDepth','flash','gameplay'].map(name => [name, gl.getUniformLocation(program, name)]));
    this.textures = [0,1].map(index => {
      const texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + index);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128,128,128,255]));
      return texture;
    });
    this.textureSizes = [null, null];
    this.filterMode = null;
    gl.uniform1i(this.uniforms.colorMap, 0);
    gl.uniform1i(this.uniforms.depthMap, 1);
  }

  uploadTexture(index, width, height, pixels) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + index);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[index]);
    const size = `${width}x${height}`;
    if (this.textureSizes[index] !== size) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      this.textureSizes[index] = size;
    } else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    if (index === 0 && this.filterMode !== this.mode) {
      const filter = this.mode === 'original' ? gl.NEAREST : gl.LINEAR;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      this.filterMode = this.mode;
    }
  }

  // Native passes the gameplay flag and hero screen position with each frame.
  // Older cores omit them; the 200 ms state poll is only that fallback.
  draw(module, ptr, width = 640, height = 480, pitch = width * 4, depthPtr = 0, gameplay, playerX, playerY) {
    if (this.disposed || !ptr || !module.HEAPU8 || width <= 0 || height <= 0) return;
    // ResizeObserver normally does this. The first native frame may precede its
    // callback after revealing a previously hidden game view.
    if (!this.viewport) this.resize();
    let pixels = module.HEAPU8.subarray(ptr, ptr + pitch * height);
    if (pitch !== width * 4) {
      if (this.packed?.length !== width * height * 4) this.packed = new Uint8Array(width * height * 4);
      for (let y = 0; y < height; y++) this.packed.set(pixels.subarray(y * pitch, y * pitch + width * 4), y * width * 4);
      pixels = this.packed;
    }
    // Own the last frame. A native orientation resize can free its SDL surface
    // or grow WASM memory, so no replay may dereference an old heap pointer.
    const length = width * height * 4;
    if (this.retainedColor?.length !== length) this.retainedColor = new Uint8Array(length);
    this.retainedColor.set(pixels);
    if (depthPtr) {
      if (this.retainedDepth?.length !== length) this.retainedDepth = new Uint8Array(length);
      this.retainedDepth.set(module.HEAPU8.subarray(depthPtr, depthPtr + length));
    }
    const player = playerX >= 0 && playerY >= 0 ? { x: playerX, y: playerY } : null;
    this.retainedFrame = { kind: 'pixels', width, height, hasDepth: !!depthPtr, gameplay: gameplay === undefined ? undefined : !!gameplay, player };
    this.uploadRetainedFrame();
    this.present();
    this.frames++;
  }

  get supportsCommands() { return !!this.compositor; }

  // A gameplay frame as native draw commands (WebGL2 only). The command words
  // are retained so a paused resize or graphics-mode change can redraw them.
  drawCommands(module, ptr, count, width, height, playerX, playerY) {
    if (this.disposed || !this.compositor || !module.HEAP32) return;
    if (!this.viewport) this.resize();
    const words = module.HEAP32.slice(ptr >> 2, (ptr >> 2) + count);
    const player = playerX >= 0 && playerY >= 0 ? { x: playerX, y: playerY } : null;
    const now = performance.now();
    const view = gameplayView(width, this.canvas.width, this.canvas.height);
    // Snap after story screens or a resize; otherwise glide after the hero.
    const snap = this.retainedFrame?.kind !== 'commands' || this.cameraViewKey !== `${this.canvas.width}x${this.canvas.height}`;
    this.cameraY = followCameraY(snap ? undefined : this.cameraY, player?.y ?? 240, view, (now - (this.cameraTime ?? now)) / 1000);
    this.cameraTime = now;
    this.cameraViewKey = `${this.canvas.width}x${this.canvas.height}`;
    this.retainedFrame = { kind: 'commands', module, words, width, height, gameplay: true, player };
    this.present();
    this.frames++;
  }

  forgetSurfaces(module, ptr, count) {
    this.compositor?.forget(module.HEAP32.subarray(ptr >> 2, (ptr >> 2) + count));
  }

  isGameplayFrame() {
    return this.retainedFrame?.gameplay ?? !!(this.state.frameIsGameplay ?? this.state.inGame);
  }

  // Hero position in the pixels of the retained frame, for the local lamp.
  lampPosition() {
    const { width = 640, height = 480, player, gameplay } = this.retainedFrame ?? {};
    if (player) return player;
    if (gameplay === undefined && Number.isFinite(this.state.x) && Number.isFinite(this.state.y)) return { x: this.state.x, y: this.state.y };
    return { x: width / 2, y: height / 2 };
  }

  uploadRetainedFrame() {
    if (!this.gl || this.contextLost || !this.retainedFrame || this.retainedFrame.kind !== 'pixels') return;
    const { width, height, hasDepth } = this.retainedFrame;
    this.uploadTexture(0, width, height, this.retainedColor);
    if (hasDepth) this.uploadTexture(1, width, height, this.retainedDepth);
  }

  present() {
    if (this.disposed || this.contextLost || !this.retainedFrame) return;
    if (this.compositor) return this.presentGpu();
    const { width, height, hasDepth } = this.retainedFrame;
    const displayWidth = this.canvas.width, displayHeight = this.canvas.height;
    const fit = fitFrame(width, height, displayWidth, displayHeight);
    this.frame = { sourceWidth: width, sourceHeight: height, ...fit };
    if (this.ctx) {
      if (this.frameCanvas.width !== width) this.frameCanvas.width = width;
      if (this.frameCanvas.height !== height) this.frameCanvas.height = height;
      if (!this.imageData || this.imageData.width !== width || this.imageData.height !== height) this.imageData = this.frameContext.createImageData(width, height);
      this.imageData.data.set(this.mode === 'depth' && hasDepth ? this.retainedDepth : this.retainedColor);
      this.frameContext.putImageData(this.imageData, 0, 0);
      this.ctx.fillStyle = '#101913';
      this.ctx.fillRect(0, 0, displayWidth, displayHeight);
      this.ctx.imageSmoothingEnabled = this.mode !== 'original';
      this.ctx.drawImage(this.frameCanvas, fit.x, fit.y, fit.width, fit.height);
      return;
    }
    const gl = this.gl, u = this.uniforms;
    gl.viewport(0, 0, displayWidth, displayHeight);
    if (this.filterMode !== this.mode) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[0]);
      const filter = this.mode === 'original' ? gl.NEAREST : gl.LINEAR;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      this.filterMode = this.mode;
    }
    gl.uniform2f(u.texel, 1 / width, 1 / height);
    const lamp = this.lampPosition();
    gl.uniform2f(u.player, lamp.x / width, lamp.y / height);
    gl.uniform4f(u.frameRect, fit.x / displayWidth, fit.y / displayHeight, fit.width / displayWidth, fit.height / displayHeight);
    const cover = Math.max(displayWidth / width, displayHeight / height);
    gl.uniform2f(u.coverScale, displayWidth / (width * cover), displayHeight / (height * cover));
    gl.uniform1f(u.sourceAspect, width / height);
    gl.uniform1f(u.pixelScale, fit.scale);
    gl.uniform1f(u.enhanced, this.mode === 'original' ? 0 : 1);
    gl.uniform1f(u.depthView, this.mode === 'depth' ? 1 : 0);
    gl.uniform1f(u.hasDepth, hasDepth ? 1 : 0);
    gl.uniform1f(u.gameplay, this.isGameplayFrame() ? 1 : 0);
    gl.uniform1f(u.flash, !this.reducedMotion && this.fire && performance.now() % 110 < 32 ? .7 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  presentGpu() {
    const compositor = this.compositor, frame = this.retainedFrame;
    compositor.mode = this.mode;
    if (frame.kind === 'commands') {
      const view = gameplayView(frame.width, this.canvas.width, this.canvas.height);
      view.cameraY = Math.min(view.maxCameraY, Math.max(0, this.cameraY ?? 0));
      compositor.drawCommands(frame.module.HEAPU8, frame.words, frame.width, frame.height, view);
    }
    else compositor.drawPixels(this.retainedColor, frame.hasDepth ? this.retainedDepth : null, frame.width, frame.height);
    this.frame = { sourceWidth: frame.width, sourceHeight: frame.height, ...compositor.fit };
    compositor.present({
      gameplay: this.isGameplayFrame(),
      player: this.lampPosition(),
      flash: !this.reducedMotion && this.fire && performance.now() % 110 < 32 ? .7 : 0,
    });
  }

  destroy() {
    this.disposed = true;
    this.resizeObserver?.disconnect();
    this.dprQuery?.removeEventListener?.('change', this.handleDpr);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleResize);
    window.visualViewport?.removeEventListener('resize', this.handleResize);
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    if (this.gl && !this.contextLost) {
      for (const texture of this.textures) this.gl.deleteTexture(texture);
      this.gl.deleteBuffer(this.buffer);
      this.gl.deleteProgram(this.program);
    }
  }
}
