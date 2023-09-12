requestAnimationFrame(renderLoop);
const ctx = canvas.getContext("2d");

const canvasSize = {
    width: 1,
    height: 1,
}


const TAU = Math.PI * 2;
const ANG_512th = TAU / 512;
const ANG_FAST = 1 / ANG_512th;
const rndI = (min, max) => Math.round(Math.random() * (max - min) + min);
const rndF = (min, max) => Math.random() * (max - min) + min;
const rndTAU = () => Math.random() * TAU;

const createTag = tName => document.createElement(tName);
const assign = Object.assign;
const tagProps = (tagEl, props) => assign(tagEl, props)
const tag = (tag, props = {}, style = {}) => (tag = tagProps(createTag(tag), props), assign(tag.style, style), tag);
const feedback = [tag("canvas"), tag("canvas"), tag("canvas")];
function resize() {
  tagProps(canvas, canvasSize);
    for (const can of feedback) {
        tagProps(can, canvasSize);
        can._ctx = can.getContext("2d");
    }
    feedback[0]._ctx.globalCompositeOperation = "screen";
    feedback[0]._ctx.globalAlpha = 0.2;
    feedback[0]._ctx.filter = "hue-rotate(0.9deg) blur(1px)"; 
    feedback[1]._ctx.globalAlpha = 0.5;
    feedback[1]._ctx.filter = "hue-rotate(2.1deg)";
    feedback[2]._ctx.globalAlpha = 0.9
    feedback[2]._ctx.filter = "blur(1px)";  
}
resize();
const drawTo = feedback[0]._ctx;
function drawImage(ctx, img, x, y, cx, cy, scale, rot) {
    const xAx = Math.cos(rot) * scale;
    const xAy = Math.sin(rot) * scale;
    ctx.setTransform(xAx, xAy, -xAy, xAx, x, y);
    const w = img.width, h = img.height;
    ctx.drawImage(img, 0, 0, w, h, -w * cx, -h * cy, w, h)
}
class Vec2 {
    x = 0;
    y = 0;
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }
    set(v) {
        this.x = v.x;
        this.y = v.y;
        return this;
    }
    polar(ang, len = 1) {
        this.x = Math.cos(ang) * len;
        this.y = Math.sin(ang) * len;
        return this;
    }
    fastPolar(ang, len = 1) {
        this.x = FastCos[ang & 0x1FF] * len;
        this.y = FastCos[(ang + 128) & 0x1FF] * len;
        return this;
    }
    addVec(v) {
        this.x += v.x;
        this.y += v.y;
        return this;
    }
    addScaledVec(v, scale) {
        this.x += v.x * scale;
        this.y += v.y * scale;
        return this;
    }    
    direction() {
        return Math.atan2(this.y, this.x);
    }
    directionTo(v) {
        return Math.atan2(v.y - this.y, v.x -this.x);
    }
}
const V2 = (x, y) => new Vec2(x, y);
const FastCos = [];
(() => {
    var i = 512;
    while (i-- > 0) {
        FastCos.push(Math.cos(i * ANG_512th));
    }
    /* Fix possible float errors due to i * ANG_512th */
    FastCos[0] = 1;
    FastCos[256] = -1;
    FastCos[128] = 0;
    FastCos[256] = -1;
    FastCos[256 + 128] = 0;
})();
const dir = V2().polar(0);
const lastMouse = V2();

const DEFAULT_UPDATER = function () { 
    this.ang += this.angChange;
    this.delta.fastPolar((this.ang % 512) + 512);
    this.pos.addScaledVec(this.delta, this.speed);
    this.speed *= this.speedScale;
    this.size *= this.sizeScale;
    return this.age > 0; 
    
}
const DEFAULT_RENDER = function () { 
    ctx.setTransform();
}
const DEFAULT_PARTICLE = {
    age: 0,
    size: 19,
    sizeScale: 0.997,
    speedScale: 0.97,
    ang: 0,
    angChange: 0.1,
    speed: 2,
}
class Particle {
    age = 0;
    size = 19;
    speed = 1;
    pos = V2();
    delta = V2();
    rot = 0;
    shape
    updater;
    render;
    constructor() {
        Object.assign(this, DEFAULT_PARTICLE);
    }
    init(age, pos, delta, updater, render) {
        Object.assign(this, DEFAULT_PARTICLE);
        this.age = age;
        this.pos.set(pos);
        this.delta.set(delta);
        this.updater = (updater ?? DEFAULT_UPDATER).bind(this)
        this.render = (render ?? DEFAULT_RENDER).bind(this)
        
    }
    update() {
        if (this.updater()) {
            this.age--;

            
            return this.age > 0;
        }
        return false;
    }
    draw(ctx) {
        ctx.moveTo(this.pos.x +  this.size, this.pos.y);
        ctx.arc(this.pos.x, this.pos.y, this.size, 0, TAU);
    }
}
const P2 = () => new Particle();

/* Object Pool of particles, dead objects bubble to top (larger indexes) of array */
const Particles = (() => {
    var size = 0;
    const items = [];
    return Object.assign(items, {
        bubble() {
            var head = 0, tail = 0;
            while (head < size) {
                const p = items[head];
                if (p.update()) {
                    if (head != tail) {
                        items[head] = items[tail];
                        items[tail] = p;
                    }
                    tail ++;
                }
                head ++;
            }
            size = tail;
        },
        spawn() {
            var p;
            if (size < items.length) {
                p = items[size];
            } else {
                items.push(p = P2())
            }
            size++
            return p;
        },
        draw(ctx) {
            var i = size;
            while (i-- > 0) { items[i].draw(ctx) }
        }
    });
})();

const mouse = {
    captured : 0,
    onbutton : null,
    onGlobalClick : null,
    onmove : null,
    x : 0,
    y : 0,
    page : { x : innerWidth * 0.5, y : innerHeight * 0.5},
    button : 0,
    oldButton : 0,
    buttons : [1, 2, 4, 6, 5, 3],
    wheel : 0,
    bounds : null,
    downOn : null,
    getPos(pos) { return (pos.x = mouse.x, pos.y = mouse.y, pos) },
    forElement(el){
        mouse.bounds = el.getBoundingClientRect();
        mouse.x = mouse.page.x - mouse.bounds.left - scrollX;
        mouse.y = mouse.page.y - mouse.bounds.top - scrollY;
        if(mouse.x < 0 || mouse.x >= mouse.bounds.width || mouse.y < 0 || mouse.y >= mouse.bounds.height){
            mouse.over = false;
        }else {
            mouse.over = true;
        }
    }
}
function keyEvents(e){
	mouse.ctrl = e.ctrlKey;
	mouse.shift = e.shiftKey;
	mouse.alt = e.altKey;	
}
function mouseEvents(e){
    mouse.x = mouse.page.x = e.pageX;
    mouse.y = mouse.page.y = e.pageY;
    if (e.type === "mousemove") {
        if (mouse.onmove) { mouse.onmove(mouse) }
    }else if (e.type === "mousedown") {
        mouse.oldButton = mouse.button;
        mouse.button |= mouse.buttons[e.which-1];
        mouse.downOn = e.target;
        if (mouse.onbutton) { mouse.onbutton(mouse) }
    } else if (e.type === "mouseup") {
        mouse.oldButton = mouse.button;
        mouse.button &= mouse.buttons[e.which + 2];
        if(mouse.captured === 0 && mouse.downOn !== null && mouse.downOn === e.target && mouse.onGlobalClick){
            mouse.onGlobalClick(e);
        }
        if (mouse.onbutton) { mouse.onbutton(mouse) }
        mouse.downOn  = null;
    } else if (e.type === "wheel") { mouse.wheel += -e.deltaY }
}
["mousedown","mouseup","mousemove","wheel"].forEach(name => document.addEventListener(name,mouseEvents));
document.addEventListener("keydown",keyEvents);
document.addEventListener("keyup",keyEvents);
document.addEventListener("contextmenu", (e) => e.preventDefault() );

function renderLoop(time) {
    mouse.forElement(canvas);
    if (canvasSize.width !== innerWidth || canvasSize.height !== innerHeight || mouse.button) {
        canvasSize.width = innerWidth;
        canvasSize.height = innerHeight;
        mouse.button = 0;
        resize();
    }
    const w = canvasSize.width, hW = w * 0.5;
    const h = canvasSize.height, hH = h * 0.5;
    
    const ang = lastMouse.directionTo(mouse) + Math.sin(time * 0.0011) * TAU;
    drawTo.setTransform(1,0,0,1,0,0);
    drawTo.clearRect(0, 0, w, h);
    if (mouse.x >= 0 && mouse.x < w && mouse.y >= 0 && mouse.y < h) {
        dir.polar(time);
        const p = Particles.spawn();
        p.init(rndI(100, 200), mouse, dir);
        p.speed = rndF(3, 6);
        p.speedScale = rndF(0.99, 0.999);
        p.sizeScale = rndF(0.9, 0.999);
        p.ang = rndF(ang - 1, ang + 1) * ANG_FAST;
        p.angChange = rndF(- 1 , + 1);
    }
    Particles.bubble(); 
    drawTo.lineWidth = 5;
    drawTo.strokeStyle = "hsl(" + (Math.sin(time * 0.00023) * 360) + ", 100%, 25%)";
    drawTo.fillStyle = "hsl(" + ((Math.sin(time * 0.00023) * 360 + 180) % 360) + ", 100%, 50%)";
    drawTo.beginPath();
    Particles.draw(drawTo);
    drawTo.fill();
    drawTo.stroke();
    const mx = mouse.x;
    const my =mouse.y;

    drawImage(feedback[0]._ctx, canvas, mx, my, mx / w, my / h, 1.03 + Math.sin(time * 0.00007) * 0.03, Math.sin(time * 0.0001) * 0.001);

    drawImage(feedback[1]._ctx, feedback[0], mx, my, mx / w, my / h, 1.015 + Math.sin(time * 0.000019) * -0.01, Math.sin(time * 0.000031) * -0.001);
  
    drawImage(feedback[2]._ctx, feedback[1], mx, my, mx / w, my / h, 1.0 + Math.sin(time * 0.000019) * 0.003, Math.sin(time * 0.0007) * 0.001);
    
    ctx.globalAlpha = 0.5;
    ctx.drawImage(feedback[2], 0, 0);

    lastMouse.set(mouse);
    requestAnimationFrame(renderLoop);

}
