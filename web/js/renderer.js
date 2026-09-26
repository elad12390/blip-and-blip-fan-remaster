const VERTEX = `attribute vec2 position; varying vec2 uv; void main(){ uv=vec2(position.x*.5+.5,.5-position.y*.5); gl_Position=vec4(position,0.,1.); }`;
const FRAGMENT = `
precision mediump float;
varying vec2 uv;
uniform sampler2D colorMap;
uniform sampler2D depthMap;
uniform vec2 texel;
uniform vec2 player;
uniform float enhanced;
uniform float depthView;
uniform float hasDepth;
uniform float flash;
uniform float time;
uniform float gameplay;
float heightAt(vec2 p){
  if(hasDepth>.5) return texture2D(depthMap,p).r;
  vec3 c=texture2D(colorMap,p).rgb;
  return dot(c,vec3(.2126,.7152,.0722))*.3;
}
void main(){
  vec4 base=texture2D(colorMap,uv);
  if(enhanced<.5){ gl_FragColor=vec4(base.rgb,1.); return; }
  float h=heightAt(uv);
  if(depthView>.5){gl_FragColor=vec4(vec3(h),1.);return;}
  if(gameplay<.5 || uv.y<.075){gl_FragColor=vec4(base.rgb,1.);return;}
  vec2 gradient=vec2(heightAt(uv-vec2(texel.x,0.))-heightAt(uv+vec2(texel.x,0.)),heightAt(uv-vec2(0.,texel.y))-heightAt(uv+vec2(0.,texel.y)));
  vec3 normal=normalize(vec3(gradient*2.5,.7));
  vec3 sun=normalize(vec3(-.45,-.7,1.));
  float diffuse=max(dot(normal,sun),0.);
  vec2 delta=(uv-player)*vec2(1.333,1.);
  float attenuation=exp(-dot(delta,delta)*20.);
  vec3 localLight=normalize(vec3(-delta,.23));
  float lamp=max(dot(normal,localLight),0.)*attenuation;
  vec3 color=base.rgb*(.80+diffuse*.28);
  color+=base.rgb*vec3(1.,.72,.36)*lamp*(.18+flash*.85);
  vec3 bloom=vec3(0.);
  for(int i=0;i<8;i++){
    float a=float(i)*.785398;
    vec3 sampleColor=texture2D(colorMap,uv+vec2(cos(a),sin(a))*texel*2.4).rgb;
    bloom+=max(sampleColor-.76,vec3(0.));
  }
  color+=bloom*.045;
  float vignette=1.-.16*pow(length((uv-.5)*vec2(1.,.9)),1.5);
  color*=vignette;
  gl_FragColor=vec4(clamp(color,0.,1.),1.);
}`;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.mode = 'enhanced';
    this.state = {};
    this.fire = false;
    this.frames = 0;
    this.gl = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true });
    if (!this.gl) { this.ctx = canvas.getContext('2d', { alpha: false }); return; }
    const gl = this.gl;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    this.uniforms = Object.fromEntries(['colorMap','depthMap','texel','player','enhanced','depthView','hasDepth','flash','time','gameplay'].map(name => [name,gl.getUniformLocation(program,name)]));
    this.textures = [0,1].map(index => {
      const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([128,128,128,255]));
      return texture;
    });
    gl.uniform1i(this.uniforms.colorMap,0);gl.uniform1i(this.uniforms.depthMap,1);
  }
  draw(module, ptr, width=640, height=480, pitch=width*4, depthPtr=0) {
    if (!ptr || !module.HEAPU8) return;
    if (this.canvas.width!==width || this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
    let pixels=module.HEAPU8.subarray(ptr,ptr+pitch*height);
    if(pitch!==width*4){
      this.packed ??= new Uint8Array(width*height*4);
      for(let y=0;y<height;y++)this.packed.set(pixels.subarray(y*pitch,y*pitch+width*4),y*width*4);
      pixels=this.packed;
    }
    if(this.ctx){this.ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels),width,height),0,0);return;}
    const gl=this.gl,u=this.uniforms;
    gl.viewport(0,0,width,height);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.textures[0]);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    if(depthPtr){gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.textures[1]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,module.HEAPU8.subarray(depthPtr,depthPtr+width*height*4));}
    gl.uniform2f(u.texel,1/width,1/height);
    gl.uniform2f(u.player,(this.state.x??320)/width,(this.state.y??280)/height);
    gl.uniform1f(u.enhanced,this.mode==='original'?0:1);gl.uniform1f(u.depthView,this.mode==='depth'?1:0);
    gl.uniform1f(u.hasDepth,depthPtr?1:0);gl.uniform1f(u.time,performance.now()/1000);
    gl.uniform1f(u.gameplay,this.state.inGame?1:0);
    gl.uniform1f(u.flash,this.fire && this.frames%6<2?.7:0);
    gl.drawArrays(gl.TRIANGLES,0,6);this.frames++;
  }
}
