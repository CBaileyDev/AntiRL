/** Packed detail map: R albedo variation, AG tangent normal, B neutral roughness. */
export function drawTurfDetail(context: CanvasRenderingContext2D, size = 1024): void {
  const image = context.createImageData(size, size);
  const pixels = image.data;
  let seed = 709;
  const random = () => { seed = Math.imul(seed,1664525)+1013904223 | 0; return (seed>>>0)/4294967296; };
  for(let i=0;i<pixels.length;i+=4) {
    pixels[i]=121+Math.floor(random()*14); pixels[i+1]=128; pixels[i+2]=128; pixels[i+3]=128;
  }
  // Periodic, sub-centimeter fibers. Wrapping strokes keeps all four tile edges seamless.
  for(let blade=0;blade<90000;blade++) {
    const x=Math.floor(random()*size), y=Math.floor(random()*size);
    const angle=random()*Math.PI*2, length=5+Math.floor(random()*18);
    const dx=Math.cos(angle), dy=Math.sin(angle), tone=94+Math.floor(random()*68);
    for(let step=0;step<length;step++) {
      const px=(Math.round(x+dx*step)+size)%size, py=(Math.round(y+dy*step)+size)%size;
      const i=(py*size+px)*4;
      pixels[i]=tone;
      pixels[i+1]=128+Math.round(dx*13); pixels[i+3]=128+Math.round(dy*13);
    }
  }
  context.putImageData(image,0,0);
}

export function drawBrushedMetal(context: CanvasRenderingContext2D, size = 512): void {
  context.fillStyle="#293745"; context.fillRect(0,0,size,size);
  for(let y=0;y<size;y++) {
    const value=32+(y*17%15);
    context.fillStyle=`rgba(${value+12},${value+22},${value+33},0.35)`;
    context.fillRect(0,y,size,1);
  }
  context.strokeStyle="rgba(174,191,206,0.16)"; context.lineWidth=2;
  context.strokeRect(8,8,size-16,size-16);
  for(const x of [18,size-18]) for(const y of [18,size-18]) {
    context.fillStyle="#151d25"; context.beginPath();context.arc(x,y,3,0,Math.PI*2);context.fill();
  }
}
