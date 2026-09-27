import { ShelfAtlas } from './atlas.js';
import { decodeCommands } from './commands.js';
import { convertRegion, reliefMap } from './surface-pixels.js';
import { fitFrame } from '../viewport.js';

// WebGL2 renderer for native frames. Gameplay arrives as draw commands that
// reference CPU surfaces packed into atlas pages; story screens still arrive as
// whole pixel frames. Both are drawn into a scene target (colour + relief), then
// the post pass applies lighting at display resolution.

const SPRITE_VS = `#version 300 es
in vec2 aPos; in vec2 aUV; in vec4 aColor; in float aMode;
uniform vec2 uTarget;
out vec2 vUV; out vec4 vColor; flat out float vMode;
void main(){
  vUV=aUV; vColor=aColor; vMode=aMode;
  gl_Position=vec4(aPos.x/uTarget.x*2.-1., 1.-aPos.y/uTarget.y*2., 0., 1.);
}`;

const SPRITE_FS = `#version 300 es
precision highp float;
in vec2 vUV; in vec4 vColor; flat in float vMode;
uniform sampler2D uColor; uniform sampler2D uHeight;
uniform vec2 uTexel; uniform float uPixelScale; uniform float uSharp;
layout(location=0) out vec4 oColor;
layout(location=1) out vec4 oHeight;
// Sharp bilinear: crisp pixel interiors, softened edges at fractional scales.
vec2 sharpUV(vec2 p){
  vec2 px=p/uTexel; vec2 seam=floor(px+.5);
  return (seam+clamp((px-seam)*max(uPixelScale,1.),-.5,.5))*uTexel;
}
void main(){
  if(vMode>1.5){ oColor=vec4(vColor.rgb*vColor.a,vColor.a); oHeight=vec4(0.); return; }
  if(vMode>.5){
    float h=(80.+dot(vColor.rgb,vec3(54.,183.,19.))/256.*85.)/255.;
    oColor=vec4(vColor.rgb,1.); oHeight=vec4(h,h,h,1.); return;
  }
  vec2 uv=uSharp>.5?sharpUV(vUV):vUV;
  vec4 c=texture(uColor,uv); float h=texture(uHeight,uv).r;
  oColor=c; oHeight=vec4(h,h,h,c.a);
}`;

const QUAD_VS = `#version 300 es
in vec2 aPos; out vec2 vUV;
void main(){ vUV=aPos*.5+.5; gl_Position=vec4(aPos,0.,1.); }`;

// Original underwater bands: every two rows shift by round(amp*sin(phase+band+1)).
const WARP_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uColor; uniform sampler2D uHeight;
uniform vec2 uTarget; uniform vec4 uFrame; uniform float uScale; uniform float uCameraY; uniform float uPhase; uniform float uAmp;
layout(location=0) out vec4 oColor;
layout(location=1) out vec4 oHeight;
void main(){
  vec2 px=vec2(vUV.x*uTarget.x,(1.-vUV.y)*uTarget.y);
  float band=floor(((px.y-uFrame.y)/uScale+uCameraY)/2.);
  float shift=floor(uAmp*sin(radians(mod(uPhase+band+1.,360.)))+.5);
  float sx=px.x-shift*uScale;
  if(sx<uFrame.x||sx>=uFrame.x+uFrame.z){ oColor=vec4(0.,0.,0.,1.); oHeight=vec4(vec3(80./255.),1.); return; }
  vec2 uv=vec2(sx/uTarget.x,vUV.y);
  oColor=texture(uColor,uv); oHeight=texture(uHeight,uv);
}`;

const POST_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uColor; uniform sampler2D uHeight;
uniform vec4 uFrame; uniform vec2 uCover; uniform vec2 uWorldTexel; uniform vec2 uPlayer;
uniform float uAspect; uniform float uEnhanced; uniform float uDepthView; uniform float uFlash; uniform float uGameplay;
out vec4 oColor;
vec2 toScene(vec2 p){ return uFrame.xy+p*uFrame.zw; }
float heightAt(vec2 sceneUV){ return texture(uHeight,toScene(sceneUV)).r; }
void main(){
  vec2 sceneUV=(vUV-uFrame.xy)/uFrame.zw;
  if(sceneUV.x<0.||sceneUV.y<0.||sceneUV.x>1.||sceneUV.y>1.){
    // Space beside authored 4:3 story frames borrows a soft wash of the scene.
    vec2 p=clamp(.5+(vUV-.5)*uCover,0.,1.);
    vec3 a=texture(uColor,toScene(p)).rgb+texture(uColor,toScene(clamp(p+vec2(.035,.02),0.,1.))).rgb
      +texture(uColor,toScene(clamp(p-vec2(.035,.02),0.,1.))).rgb+texture(uColor,toScene(clamp(p+vec2(-.025,.035),0.,1.))).rgb
      +texture(uColor,toScene(clamp(p+vec2(.025,-.035),0.,1.))).rgb;
    oColor=vec4(a*.055,1.); return;
  }
  vec3 base=texture(uColor,vUV).rgb; float h=texture(uHeight,vUV).r;
  if(uDepthView>.5){ oColor=vec4(vec3(h),1.); return; }
  if(uEnhanced<.5||uGameplay<.5){ oColor=vec4(base,1.); return; }
  vec2 t=uWorldTexel;
  vec2 gradient=vec2(heightAt(sceneUV-vec2(t.x,0.))-heightAt(sceneUV+vec2(t.x,0.)),heightAt(sceneUV-vec2(0.,t.y))-heightAt(sceneUV+vec2(0.,t.y)));
  vec3 normal=normalize(vec3(gradient*2.5,.7));
  vec3 sun=normalize(vec3(-.45,.7,1.));
  float diffuse=max(dot(normal,sun),0.);
  vec2 delta=(sceneUV-uPlayer)*vec2(uAspect,1.);
  float attenuation=exp(-dot(delta,delta)*20.);
  float lamp=max(dot(normal,normalize(vec3(-delta,.23))),0.)*attenuation;
  vec3 color=base*(.90+diffuse*.18);
  color+=base*vec3(1.,.76,.43)*lamp*(.14+uFlash*.7);
  vec3 bloom=vec3(0.);
  for(int i=0;i<4;i++){ float a=float(i)*1.570796; bloom+=max(texture(uColor,toScene(sceneUV+vec2(cos(a),sin(a))*t*2.4)).rgb-.80,vec3(0.)); }
  color+=bloom*.04;
  vec2 v=(sceneUV-.5)*vec2(1.,.85);
  color*=1.-.055*dot(v,v);
  oColor=vec4(clamp(color,0.,1.),1.);
}`;

const FLOATS_PER_VERTEX = 9, MAX_QUADS = 4096;
const MODE_TEXTURE = 0, MODE_FILL = 1, MODE_OVERLAY = 2;

export class GpuCompositor {
  constructor(gl, { pageSize = 2048, maxPages = 6 } = {}) {
    this.gl = gl;
    this.pageSize = Math.min(pageSize, gl.getParameter(gl.MAX_TEXTURE_SIZE));
    this.maxPages = maxPages;
    this.surfaces = new Map();
    this.mode = 'enhanced';
    this.stats = { uploads: 0, uploadTexels: 0, draws: 0, quads: 0, atlasResets: 0 };
    this.init();
  }

  // (Re)creates every GPU object. Also used after a lost context is restored.
  init() {
    const gl = this.gl;
    this.sprite = this.program(SPRITE_VS, SPRITE_FS);
    this.warpProgram = this.program(QUAD_VS, WARP_FS);
    this.post = this.program(QUAD_VS, POST_FS);
    this.vertices = new Float32Array(MAX_QUADS * 4 * FLOATS_PER_VERTEX);
    this.quadCount = 0;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertices.byteLength, gl.DYNAMIC_DRAW);
    const indices = new Uint16Array(MAX_QUADS * 6);
    for (let q = 0; q < MAX_QUADS; q++) indices.set([q*4, q*4+1, q*4+2, q*4+2, q*4+1, q*4+3], q * 6);
    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    const stride = FLOATS_PER_VERTEX * 4;
    for (const [name, size, offset] of [['aPos', 2, 0], ['aUV', 2, 2], ['aColor', 4, 4], ['aMode', 1, 8]]) {
      const location = gl.getAttribLocation(this.sprite.program, name);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset * 4);
    }
    this.quadVao = gl.createVertexArray();
    gl.bindVertexArray(this.quadVao);
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    for (const p of [this.warpProgram, this.post]) {
      const location = gl.getAttribLocation(p.program, 'aPos');
      if (location >= 0) { gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0); }
    }
    gl.bindVertexArray(null);
    this.atlas = new ShelfAtlas(this.pageSize, this.maxPages);
    this.pages = [];
    this.dedicated = new Map();
    for (const surface of this.surfaces.values()) surface.slot = null;
    this.frameTextures = [this.texture(gl.RGBA8, 1, 1), this.texture(gl.RGBA8, 1, 1)];
    this.frameTextureSize = null;
    this.targets = [];
    this.targetSize = null;
    this.filter = null;
  }

  program(vs, fs) {
    const gl = this.gl;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const program = gl.createProgram();
    const v = compile(gl.VERTEX_SHADER, vs), f = compile(gl.FRAGMENT_SHADER, fs);
    gl.attachShader(program, v); gl.attachShader(program, f);
    gl.linkProgram(program);
    gl.deleteShader(v); gl.deleteShader(f);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    const uniforms = new Proxy({}, { get: (cache, name) => cache[name] ??= gl.getUniformLocation(program, name) });
    return { program, uniforms };
  }

  // Texture creation and uploads use unit 2 so the pages bound to units 0/1 for
  // quads that are still queued in the batch are never disturbed.
  texture(format, width, height) {
    const gl = this.gl, texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, format, width, height);
    for (const [key, value] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, key, value);
    return texture;
  }

  resize(width, height) {
    if (this.targetSize?.width === width && this.targetSize?.height === height) return;
    const gl = this.gl;
    for (const target of this.targets) { gl.deleteFramebuffer(target.framebuffer); gl.deleteTexture(target.color); gl.deleteTexture(target.height); }
    this.targets = [0, 1].map(() => {
      const color = this.texture(gl.RGBA8, width, height), height_ = this.texture(gl.RGBA8, width, height);
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, height_, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      return { framebuffer, color, height: height_ };
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.targetSize = { width, height };
    this.current = 0;
  }

  // ---------- surfaces ----------
  forget(ids) { for (const id of ids) this.surfaces.delete(id); }

  upload(heap, info) {
    const known = this.surfaces.get(info.id);
    const replaced = !known || known.width !== info.width || known.height !== info.height;
    const surface = replaced ? { ...info, slot: null } : Object.assign(known, info);
    this.surfaces.set(info.id, surface);
    surface.relief = null;
    if (surface.slot && !replaced) this.writeTexels(heap, surface, info.dirty);
  }

  resident(heap, surface) {
    if (surface.slot && surface.slot.generation === this.slotGeneration(surface.slot)) return surface.slot;
    const width = surface.width + 2, height = surface.height + 2;
    let slot;
    if (!this.atlas.fits(width, height)) {
      slot = this.dedicatedSlot(surface.id, width, height);
    } else {
      let place = this.atlas.allocate(width, height);
      if (!place) {
        // Full: flush pending quads that reference the old layout, start over.
        this.flush();
        this.atlas.reset();
        this.stats.atlasResets++;
        place = this.atlas.allocate(width, height);
      }
      slot = { ...place, generation: this.atlas.generation, size: this.pageSize };
      while (this.pages.length <= place.page) this.pages.push({ color: this.texture(this.gl.RGBA8, this.pageSize, this.pageSize), height: this.texture(this.gl.R8, this.pageSize, this.pageSize) });
      slot.textures = this.pages[place.page];
    }
    surface.slot = slot;
    this.writeTexels(heap, surface, null);
    return slot;
  }

  slotGeneration(slot) { return slot.dedicated ? slot.generation : this.atlas.generation; }

  dedicatedSlot(id, width, height) {
    let page = this.dedicated.get(id);
    if (!page || page.width !== width || page.height !== height) {
      if (page) { this.gl.deleteTexture(page.textures.color); this.gl.deleteTexture(page.textures.height); }
      page = { width, height, textures: { color: this.texture(this.gl.RGBA8, width, height), height: this.texture(this.gl.R8, width, height) } };
      this.dedicated.set(id, page);
    }
    return { page: -1, x: 0, y: 0, dedicated: true, generation: 0, size: Math.max(width, height), width, height, textures: page.textures };
  }

  writeTexels(heap, surface, dirty) {
    const { width, height } = surface;
    const x0 = dirty ? Math.max(-1, dirty.x - 1) : -1, y0 = dirty ? Math.max(-1, dirty.y - 1) : -1;
    const x1 = dirty ? Math.min(width + 1, dirty.x + dirty.width + 1) : width + 1;
    const y1 = dirty ? Math.min(height + 1, dirty.y + dirty.height + 1) : height + 1;
    if (x1 <= x0 || y1 <= y0) return;
    // Keyed sprites need whole-surface edge distances; opaque scenery (such as
    // the constantly updated scroll ring) derives relief per texel.
    if (surface.keyed) surface.relief ??= reliefMap(heap, surface);
    const region = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    const { rgba, depth } = convertRegion(heap, surface, region, surface.keyed ? surface.relief : null);
    const gl = this.gl, slot = surface.slot;
    gl.activeTexture(gl.TEXTURE2);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.bindTexture(gl.TEXTURE_2D, slot.textures.color);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, slot.x + 1 + x0, slot.y + 1 + y0, region.width, region.height, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    gl.bindTexture(gl.TEXTURE_2D, slot.textures.height);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, slot.x + 1 + x0, slot.y + 1 + y0, region.width, region.height, gl.RED, gl.UNSIGNED_BYTE, depth);
    this.stats.uploads++;
    this.stats.uploadTexels += region.width * region.height;
  }

  // ---------- batching ----------
  bind(textures, texel) {
    if (this.bound?.textures === textures) return;
    this.flush();
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, textures.color);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, textures.height);
    const filter = this.mode === 'original' ? gl.NEAREST : gl.LINEAR;
    for (const unit of [0, 1]) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    }
    gl.uniform2f(this.sprite.uniforms.uTexel, texel[0], texel[1]);
    this.bound = { textures };
  }

  quad(x0, y0, x1, y1, u0, v0, u1, v1, r, g, b, a, mode, alphas) {
    if (this.quadCount === MAX_QUADS) this.flush();
    const t = this.transform, v = this.vertices;
    const X0 = t.x + x0 * t.scale, Y0 = t.y + y0 * t.scale, X1 = t.x + x1 * t.scale, Y1 = t.y + y1 * t.scale;
    let o = this.quadCount * 4 * FLOATS_PER_VERTEX;
    const corners = [[X0, Y0, u0, v0], [X1, Y0, u1, v0], [X0, Y1, u0, v1], [X1, Y1, u1, v1]];
    for (let c = 0; c < 4; c++) {
      const [X, Y, U, V] = corners[c];
      v[o++] = X; v[o++] = Y; v[o++] = U; v[o++] = V; v[o++] = r; v[o++] = g; v[o++] = b; v[o++] = alphas ? alphas[c] : a; v[o++] = mode;
    }
    this.quadCount++;
  }

  flush() {
    if (!this.quadCount) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertices, 0, this.quadCount * 4 * FLOATS_PER_VERTEX);
    gl.drawElements(gl.TRIANGLES, this.quadCount * 6, gl.UNSIGNED_SHORT, 0);
    this.stats.draws++;
    this.stats.quads += this.quadCount;
    this.quadCount = 0;
  }

  // `view` (gameplay) shows a vertical slice of the frame starting at world row
  // view.cameraY; without it the whole frame is fitted (story screens).
  beginScene(frameWidth, frameHeight, view = null) {
    const gl = this.gl, { width, height } = this.targetSize;
    if (view) {
      this.fit = { x: view.x, y: view.y, width: view.width, height: view.height, scale: view.scale, frameWidth, frameHeight: view.visibleHeight, cameraY: view.cameraY };
    } else {
      this.fit = { ...fitFrame(frameWidth, frameHeight, width, height), frameWidth, frameHeight, cameraY: 0 };
    }
    this.transform = { x: this.fit.x, y: this.fit.y - this.fit.cameraY * this.fit.scale, scale: this.fit.scale };
    this.current = 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets[0].framebuffer);
    gl.viewport(0, 0, width, height);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 1]);
    gl.clearBufferfv(gl.COLOR, 1, [80 / 255, 80 / 255, 80 / 255, 1]);
    this.useSprite();
  }

  useSprite() {
    const gl = this.gl, u = this.sprite.uniforms;
    gl.useProgram(this.sprite.program);
    gl.bindVertexArray(this.vao);
    gl.uniform1i(u.uColor, 0); gl.uniform1i(u.uHeight, 1);
    gl.uniform2f(u.uTarget, this.targetSize.width, this.targetSize.height);
    gl.uniform1f(u.uPixelScale, this.transform.scale);
    gl.uniform1f(u.uSharp, this.mode === 'original' ? 0 : 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.bound = null;
  }

  // ---------- frames ----------
  drawCommands(heap, words, frameWidth, frameHeight, view = null) {
    this.beginScene(frameWidth, frameHeight, view);
    const white = this.whiteTextures ??= this.solidTextures();
    decodeCommands(words, {
      upload: info => this.upload(heap, info),
      blit: (id, sx, sy, sw, sh, dx, dy) => {
        const surface = this.surfaces.get(id);
        if (!surface) return;
        const slot = this.resident(heap, surface);
        const pw = slot.dedicated ? slot.width : slot.size, ph = slot.dedicated ? slot.height : slot.size;
        this.bind(slot.textures, [1 / pw, 1 / ph]);
        const u0 = (slot.x + 1 + sx) / pw, v0 = (slot.y + 1 + sy) / ph;
        this.quad(dx, dy, dx + sw, dy + sh, u0, v0, u0 + sw / pw, v0 + sh / ph, 1, 1, 1, 1, MODE_TEXTURE);
      },
      fill: (x, y, w, h, abgr) => {
        this.bind(white, [1, 1]);
        this.quad(x, y, x + w, y + h, 0, 0, 1, 1, (abgr & 255) / 255, ((abgr >>> 8) & 255) / 255, ((abgr >>> 16) & 255) / 255, 1, MODE_FILL);
      },
      shade: (left, right, ramp, dimAlpha) => {
        this.bind(white, [1, 1]);
        const a = dimAlpha / 255, w = frameWidth, h = frameHeight;
        if (left > 0) {
          this.quad(Math.min(0, left - ramp) - 1, 0, left - ramp, h, 0, 0, 1, 1, 0, 0, 0, a, MODE_OVERLAY);
          this.quad(left - ramp, 0, left, h, 0, 0, 1, 1, 0, 0, 0, a, MODE_OVERLAY, [a, 0, a, 0]);
        }
        if (right < w) {
          this.quad(right, 0, right + ramp, h, 0, 0, 1, 1, 0, 0, 0, a, MODE_OVERLAY, [0, a, 0, a]);
          this.quad(right + ramp, 0, Math.max(w, right + ramp) + 1, h, 0, 0, 1, 1, 0, 0, 0, a, MODE_OVERLAY);
        }
      },
      warp: (phase, amplitude) => this.warp(phase, amplitude),
    });
    this.flush();
  }

  solidTextures() {
    const gl = this.gl;
    const textures = { color: this.texture(gl.RGBA8, 1, 1), height: this.texture(gl.R8, 1, 1) };
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, textures.color);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    return textures;
  }

  warp(phase, amplitude) {
    this.flush();
    const gl = this.gl, source = this.targets[this.current], destination = this.targets[1 - this.current];
    const u = this.warpProgram.uniforms, { width, height } = this.targetSize;
    gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer);
    gl.disable(gl.BLEND);
    gl.useProgram(this.warpProgram.program);
    gl.bindVertexArray(this.quadVao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, source.color);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, source.height);
    gl.uniform1i(u.uColor, 0); gl.uniform1i(u.uHeight, 1);
    gl.uniform2f(u.uTarget, width, height);
    gl.uniform4f(u.uFrame, this.fit.x, this.fit.y, this.fit.width, this.fit.height);
    gl.uniform1f(u.uScale, this.transform.scale);
    gl.uniform1f(u.uCameraY, this.fit.cameraY);
    gl.uniform1f(u.uPhase, phase);
    gl.uniform1f(u.uAmp, amplitude);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.current = 1 - this.current;
    this.useSprite();
  }

  // Whole CPU-rendered frame (story screens): packed RGBA plus optional relief.
  drawPixels(color, depth, width, height) {
    const gl = this.gl;
    if (this.frameTextureSize?.width !== width || this.frameTextureSize?.height !== height) {
      for (const texture of this.frameTextures) gl.deleteTexture(texture);
      this.frameTextures = [this.texture(gl.RGBA8, width, height), this.texture(gl.RGBA8, width, height)];
      this.frameTextureSize = { width, height };
    }
    gl.activeTexture(gl.TEXTURE2);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.bindTexture(gl.TEXTURE_2D, this.frameTextures[0]);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, color);
    if (depth) {
      gl.bindTexture(gl.TEXTURE_2D, this.frameTextures[1]);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, depth);
    }
    this.beginScene(width, height);
    gl.disable(gl.BLEND);
    this.bind({ color: this.frameTextures[0], height: this.frameTextures[1] }, [1 / width, 1 / height]);
    this.quad(0, 0, width, height, 0, 0, 1, 1, 1, 1, 1, 1, MODE_TEXTURE);
    this.flush();
    gl.enable(gl.BLEND);
  }

  present({ gameplay, player, flash }) {
    const gl = this.gl, u = this.post.uniforms, { width, height } = this.targetSize, fit = this.fit;
    if (!fit) return;
    const scene = this.targets[this.current];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    gl.useProgram(this.post.program);
    gl.bindVertexArray(this.quadVao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, scene.color);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, scene.height);
    const filter = gl.NEAREST;
    for (const unit of [0, 1]) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    }
    gl.uniform1i(u.uColor, 0); gl.uniform1i(u.uHeight, 1);
    // Frame rect in bottom-up texture space.
    gl.uniform4f(u.uFrame, fit.x / width, 1 - (fit.y + fit.height) / height, fit.width / width, fit.height / height);
    const cover = Math.max(width / fit.frameWidth, height / fit.frameHeight);
    gl.uniform2f(u.uCover, width / (fit.frameWidth * cover), height / (fit.frameHeight * cover));
    gl.uniform2f(u.uWorldTexel, 1 / fit.frameWidth, 1 / fit.frameHeight);
    const lamp = player ?? { x: fit.frameWidth / 2, y: fit.frameHeight / 2 };
    gl.uniform2f(u.uPlayer, lamp.x / fit.frameWidth, 1 - (lamp.y - fit.cameraY) / fit.frameHeight);
    gl.uniform1f(u.uAspect, fit.frameWidth / fit.frameHeight);
    gl.uniform1f(u.uEnhanced, this.mode === 'original' ? 0 : 1);
    gl.uniform1f(u.uDepthView, this.mode === 'depth' ? 1 : 0);
    gl.uniform1f(u.uFlash, flash);
    gl.uniform1f(u.uGameplay, gameplay ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
