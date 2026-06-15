/* Key2MD shareable progress card. Renders a branded 1080x1080 PNG a student can
   download or share. window.MMIShareCard.renderTo(canvas, opts) draws; .generate(opts)
   draws offscreen then shares (navigator.share) or downloads. */
(function(){
  const NAVY='#0a1628', NAVY2='#0d1f3c', TEAL='#0ea5e9', TEAL2='#38bdf8', GOLD='#f59e0b';
  const FONT='"DM Sans","Segoe UI",system-ui,Arial,sans-serif';

  function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
  function clampScore(n){ n=Number(n); if(!isFinite(n)) return null; return Math.max(0,Math.min(10,Math.round(n*10)/10)); }

  function draw(ctx,o){
    const W=1080,H=1080;
    // background
    const g=ctx.createLinearGradient(0,0,W,H);
    g.addColorStop(0,NAVY); g.addColorStop(0.6,NAVY2); g.addColorStop(1,'#0a1f3d');
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    const glow=ctx.createRadialGradient(W-120,120,40,W-120,120,520);
    glow.addColorStop(0,'rgba(14,165,233,0.28)'); glow.addColorStop(1,'rgba(14,165,233,0)');
    ctx.fillStyle=glow; ctx.fillRect(0,0,W,H);
    // card inset border
    ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.lineWidth=2; rr(ctx,40,40,W-80,H-80,36); ctx.stroke();

    // wordmark
    ctx.textBaseline='alphabetic'; ctx.textAlign='left';
    ctx.font='800 46px '+FONT;
    let x=90; const y=140;
    ctx.fillStyle='#fff'; ctx.fillText('Key',x,y); x+=ctx.measureText('Key').width;
    ctx.fillStyle=TEAL; ctx.fillText('2',x,y); x+=ctx.measureText('2').width;
    ctx.fillStyle='#fff'; ctx.fillText('MD',x,y);
    // eyebrow
    ctx.font='800 22px '+FONT; ctx.fillStyle=TEAL2;
    ctx.fillText((o.product||'MMI')+' PRACTICE'.toUpperCase(),90,184);

    const cx=W/2;
    const isDelta = o.mode==='delta' && o.fromScore!=null && o.toScore!=null;

    if(isDelta){
      const from=clampScore(o.fromScore), to=clampScore(o.toScore);
      ctx.textAlign='center';
      ctx.font='800 40px '+FONT; ctx.fillStyle='rgba(255,255,255,0.72)';
      ctx.fillText('I improved my score', cx, 360);
      // from -> to
      ctx.font='800 230px '+FONT;
      const fromW=ctx.measureText(String(from)).width;
      const arrowW=150, toW=ctx.measureText(String(to)).width, gap=46;
      const totalW=fromW+gap+arrowW+gap+toW; let sx=cx-totalW/2;
      ctx.textAlign='left';
      ctx.fillStyle='rgba(255,255,255,0.5)'; ctx.fillText(String(from),sx,640); sx+=fromW+gap;
      // arrow
      ctx.strokeStyle=TEAL; ctx.lineWidth=18; ctx.lineCap='round';
      const ay=560; ctx.beginPath(); ctx.moveTo(sx+8,ay); ctx.lineTo(sx+arrowW-30,ay); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx+arrowW-58,ay-34); ctx.lineTo(sx+arrowW-18,ay); ctx.lineTo(sx+arrowW-58,ay+34); ctx.stroke();
      sx+=arrowW+gap;
      ctx.fillStyle=TEAL2; ctx.fillText(String(to),sx,640);
      ctx.textAlign='center'; ctx.font='800 38px '+FONT; ctx.fillStyle='rgba(255,255,255,0.55)';
      ctx.fillText('out of 10', cx, 712);
    } else {
      const sc=clampScore(o.score); const out=o.outOf||10;
      // ring
      const ringX=cx, ringY=560, R=200; const pct=sc!=null?(sc/out):0;
      ctx.lineWidth=34; ctx.lineCap='round';
      ctx.strokeStyle='rgba(255,255,255,0.10)'; ctx.beginPath(); ctx.arc(ringX,ringY,R,0,Math.PI*2); ctx.stroke();
      const rg=ctx.createLinearGradient(ringX-R,ringY-R,ringX+R,ringY+R); rg.addColorStop(0,TEAL3()); rg.addColorStop(1,TEAL2);
      ctx.strokeStyle=rg; ctx.beginPath(); ctx.arc(ringX,ringY,R,-Math.PI/2,-Math.PI/2+Math.PI*2*pct); ctx.stroke();
      ctx.textAlign='center';
      ctx.font='800 150px '+FONT; ctx.fillStyle='#fff'; ctx.fillText(sc!=null?String(sc):'-',ringX,ringY+30);
      ctx.font='800 40px '+FONT; ctx.fillStyle='rgba(255,255,255,0.55)'; ctx.fillText('/ '+out,ringX,ringY+96);
      ctx.font='800 40px '+FONT; ctx.fillStyle='rgba(255,255,255,0.72)';
      ctx.fillText(o.subtitle || ('on a Key2MD '+(o.product||'MMI')+' station'), cx, 300);
    }

    // takeaway line
    if(o.takeaway){
      ctx.textAlign='center'; ctx.font='600 34px '+FONT; ctx.fillStyle='rgba(255,255,255,0.78)';
      wrap(ctx,o.takeaway,cx,820,W-220,44);
    }

    // footer pill
    ctx.textAlign='center';
    const ft='Practise free at key2md.com';
    ctx.font='800 32px '+FONT; const fw=ctx.measureText(ft).width+72;
    ctx.fillStyle=TEAL; rr(ctx,cx-fw/2,H-150,fw,68,34); ctx.fill();
    ctx.fillStyle='#fff'; ctx.fillText(ft,cx,H-105);
  }
  function TEAL3(){return '#0284c7';}
  function wrap(ctx,text,cx,y,maxW,lh){
    const words=String(text).split(' '); let line='', lines=[];
    for(const w of words){ const t=line?line+' '+w:w; if(ctx.measureText(t).width>maxW && line){lines.push(line);line=w;} else line=t; }
    if(line)lines.push(line); lines=lines.slice(0,2);
    lines.forEach((ln,i)=>ctx.fillText(ln,cx,y+i*lh));
  }

  async function ready(){ try{ if(document.fonts&&document.fonts.ready){ await document.fonts.ready; } }catch(e){} }

  async function renderTo(canvas,o){ await ready(); canvas.width=1080; canvas.height=1080; draw(canvas.getContext('2d'),o||{}); return canvas; }

  async function generate(o){
    o=o||{};
    const canvas=document.createElement('canvas');
    await renderTo(canvas,o);
    const blob=await new Promise(res=>canvas.toBlob(res,'image/png',0.95));
    if(!blob){ return; }
    const file=new File([blob],'key2md-progress.png',{type:'image/png'});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      try{ await navigator.share({files:[file],title:'My Key2MD progress',text:o.takeaway||'My MMI practice progress'}); return; }catch(e){ /* fall through to download */ }
    }
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='key2md-progress.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
  }

  window.MMIShareCard={ renderTo, generate };
})();
