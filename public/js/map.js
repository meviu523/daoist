/* 原生 SVG 城市地图，滚轮缩放、单指平移、双指缩放，不载入在线地图。 */
(function(root){
  'use strict';const G=root.NightCourier;
  const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const shape={home:'M-8 0 0-7 8 0M-5-1V8H5V-1M-1 8V3H2V8',garage:'M-6-7a5 5 0 0 0 6 6L7 6 4 9-3 2a5 5 0 0 0-6-6l4 1 2-2z',clinic:'M-2-8H2V-2H8V2H2V8H-2V2H-8V-2H-2Z',book:'M0-5Q-4-9-9-6V7Q-4 4 0 8Q4 4 9 7V-6Q4-9 0-5V8',temple:'M-10 0H10M-7-4H7M-3-8H3M0-11V-8M-7 0V8M7 0V8M-10 8H10M-2 8V3H2V8',leaf:'M-7 8Q-9-8 9-8Q9 7-7 8M-7 8 5-4',market:'M-8-2H8L6-7H-6ZM-7-2V8H7V-2M-2 8V2H3V8',delivery:'M-7-5H7V7H-7ZM-7-5-3-8H3L7-5M0-5V1'};
  G.CityMap=class{
    constructor(el,onSelect){
      this.el=el;this.onSelect=onSelect;this.s=null;this.scale=.7;this.tx=0;this.ty=0;this.selected=null;this.pointers=new Map();this.multi=false;this.dragged=false;
      el.innerHTML=`<svg class="city-svg" xmlns="http://www.w3.org/2000/svg" aria-label="青岚城交互地图，使用方向键平移，加减号缩放" role="group"><defs><pattern id="water-lines" width="50" height="36" patternUnits="userSpaceOnUse"><path d="M0 18Q12 10 25 18T50 18" fill="none" stroke="#40716b" stroke-width="1" opacity=".24"/></pattern><pattern id="park-lines" width="15" height="15" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r="1" fill="#698070" opacity=".22"/></pattern><filter id="point-shadow" x="-70%" y="-70%" width="240%" height="240%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#041516" flood-opacity=".5"/></filter></defs><g class="world-layer"><g class="base-layer"></g><g class="trail-layer"></g><g class="points-layer"></g><g class="player-layer"></g></g></svg>`;
      this.svg=el.querySelector('svg');this.layer=el.querySelector('.world-layer');this.buildBase();this.bind();
      this.observer=new ResizeObserver(()=>{const w=el.clientWidth,h=el.clientHeight;if(!w||!h)return;if(!this.width){this.width=w;this.height=h;if(w<800&&this.s)this.center();else this.fit();}else{this.tx+=(w-this.width)/2;this.ty+=(h-this.height)/2;this.width=w;this.height=h;this.transform();}});this.observer.observe(el);
    }
    buildBase(){
      const worldW=G.WORLD.width,worldH=G.WORLD.height;
      const leftX=G.GRID_X[G.RIVER_LEFT_COLUMN],rightX=G.GRID_X[G.RIVER_LEFT_COLUMN+1],roadEnd=G.GRID_X.at(-1)+75;
      let h=`<rect x="-2000" y="-2000" width="${worldW+4000}" height="${worldH+4000}" fill="#122727"/><rect x="30" y="30" width="${worldW-60}" height="${worldH-60}" rx="95" fill="#193130"/>`;
      h+=`<path d="M${rightX+130} 20Q${worldW-260}-30 ${worldW-30} 200L${worldW-70} 560 ${rightX+360} 465 ${rightX+100} 305Z" fill="#233e32"/><path d="M${rightX+130} 20Q${worldW-260}-30 ${worldW-30} 200L${worldW-70} 560 ${rightX+360} 465 ${rightX+100} 305Z" fill="url(#park-lines)"/>`;
      const riverLeft=leftX+96,riverRight=rightX+10;
      h+=`<path d="M${riverLeft}-90C${riverLeft-60} 180 ${riverLeft+85} 340 ${riverLeft+8} 545S${riverLeft+52} 860 ${riverLeft+6} 1060S${riverLeft+32} ${worldH-70} ${riverLeft+65} ${worldH+90}L${riverRight+70} ${worldH+90}C${riverRight+10} ${worldH-160} ${riverRight+70} ${worldH-350} ${riverRight+25} ${worldH-520}S${riverRight-20} 730 ${riverRight+38} 470 ${riverRight-28} 120 ${riverRight+25}-90Z" fill="#143b3e"/><path d="M${riverLeft}-90C${riverLeft-60} 180 ${riverLeft+85} 340 ${riverLeft+8} 545S${riverLeft+52} 860 ${riverLeft+6} 1060S${riverLeft+32} ${worldH-70} ${riverLeft+65} ${worldH+90}L${riverRight+70} ${worldH+90}C${riverRight+10} ${worldH-160} ${riverRight+70} ${worldH-350} ${riverRight+25} ${worldH-520}S${riverRight-20} 730 ${riverRight+38} 470 ${riverRight-28} 120 ${riverRight+25}-90Z" fill="url(#water-lines)"/>`;
      // 所有画出的道路与寻路算法共用同一套网格和桥梁规则。
      let roads='';for(const x of G.GRID_X)roads+=`M${x} 55V${G.GRID_Y.at(-1)+60}`;
      for(const [r,y]of G.GRID_Y.entries())roads+=`M55 ${y}H${leftX}${G.BRIDGE_ROWS.includes(r)?`H${roadEnd}`:`M${rightX} ${y}H${roadEnd}`}`;
      h+=`<path d="${roads}" fill="none" stroke="#102222" stroke-width="43" stroke-linecap="round"/><path d="${roads}" fill="none" stroke="#304644" stroke-width="30" stroke-linecap="round"/><path d="${roads}" fill="none" stroke="#a1b2a0" stroke-opacity=".15" stroke-width="1.2" stroke-dasharray="8 12"/>`;
      for(const r of G.BRIDGE_ROWS){const y=G.GRID_Y[r];h+=`<path d="M${leftX+62} ${y-18}H${rightX-10}M${leftX+62} ${y+18}H${rightX-10}" stroke="#839185" stroke-opacity=".7" stroke-width="3"/>`;}
      for(let r=0;r<G.GRID_Y.length-1;r++)for(let c=0;c<G.GRID_X.length-1;c++){
        if(c===G.RIVER_LEFT_COLUMN)continue;
        const x=G.GRID_X[c]+30,y=G.GRID_Y[r]+30,w=G.GRID_X[c+1]-G.GRID_X[c]-60,hh=G.GRID_Y[r+1]-G.GRID_Y[r]-60;
        const park=(c===4&&r===3)||(c===5&&r===0)||(c===6&&r===5)||(c===7&&r===1)||(c===1&&r===6);
        if(park){
          h+=`<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="25" fill="#284838"/><rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="25" fill="url(#park-lines)"/>`;
          for(let j=0;j<6;j++)h+=`<circle cx="${x+20+j*Math.max(18,(w-35)/6)}" cy="${y+38+(j%2)*Math.max(28,hh*.3)}" r="${11+j%3*3}" fill="#42634d" opacity=".7"/>`;
        }else{
          const cols=['#2a4240','#2d4542','#30473f','#263f40'],bw=(w-15)/2,bh=(hh-15)/2;
          for(let j=0;j<4;j++){const bx=x+(j%2)*(bw+15),by=y+Math.floor(j/2)*(bh+15);h+=`<rect x="${bx+3}" y="${by+4}" width="${bw}" height="${bh}" rx="5" fill="#0e2425" opacity=".4"/><rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="5" fill="${cols[(r+c+j)%4]}" stroke="#789084" stroke-opacity=".15"/><path d="M${bx+12} ${by+Math.max(13,bh*.3)}H${bx+bw-12}M${bx+12} ${by+Math.max(26,bh*.62)}H${bx+bw-12}" stroke="#8ba397" stroke-opacity=".1" stroke-width="2"/>`;}}
        }
      }
      const tree=(x,y,r)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="#375441" stroke="#587562" stroke-opacity=".3"/>`;
      for(let i=0;i<46;i++)h+=tree(65+(i*239)%(worldW-120),55+(i*277)%(worldH-110),5+i%4);
      h+='<g fill="#a9bbad" font-family="system-ui, sans-serif" font-size="17" letter-spacing="7" opacity=".42"><text x="198" y="245">旧 城 里</text><text x="652" y="440">长 乐 坊</text><text x="1260" y="425">临 江 新 城</text><text x="180" y="968">南 市</text><text x="1220" y="915">月 渡</text><text x="1680" y="300">东 港</text><text x="1640" y="1110">云 栖 新 区</text><text x="370" y="1325">南 渡</text></g>';
      h+=`<text x="${(leftX+rightX)/2}" y="${worldH/2}" text-anchor="middle" fill="#759996" opacity=".6" font-size="16" letter-spacing="7" transform="rotate(86 ${(leftX+rightX)/2} ${worldH/2})">青 岚 江</text>`;
      h+=`<g transform="translate(${worldW-120} 70)" fill="none" stroke="#869d8f" opacity=".65"><path d="M0 38V-8M-8 12 0-8 8 12"/><text y="-19" text-anchor="middle" fill="#a0b0a3" stroke="none" font-size="12">N</text></g>`;
      this.el.querySelector('.base-layer').innerHTML=h;
    }
    point(p,order){
      const active=!!order,fill=active?'#e3bd75':'#d2dfc8',glyph=active?'delivery':p.kind,w=p.name.length*13+22;
      return `<g class="map-point ${active?'order-point':'service-point'} ${this.selected===p.id?'selected':''}" transform="translate(${p.x} ${p.y})" data-place="${escape(p.id)}" role="button" tabindex="0" aria-label="${escape(p.name)}${active?'，可接配送任务':''}"><circle class="point-halo" r="28" fill="${fill}" opacity=".10"/><circle r="19" fill="#182e2c" stroke="${fill}" stroke-width="1.8" filter="url(#point-shadow)"/><path d="${shape[glyph]||shape.delivery}" fill="none" stroke="${fill}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="${-w/2}" y="27" width="${w}" height="24" rx="7" fill="#132a28" fill-opacity=".94"/><text y="43" text-anchor="middle" fill="${fill}" font-size="12.5" font-family="system-ui,sans-serif">${escape(p.name)}</text>${active?`<circle cx="16" cy="-16" r="7" fill="#e3bd75"/><text x="16" y="-13" text-anchor="middle" fill="#273b33" font-size="9" font-weight="700">${order.coins}</text>`:''}</g>`;
    }
    render(s){
      this.s=s;if(!s)return;this.el.dataset.night=String(G.isNight(s));
      const live=new Set([...G.PLACES.filter(p=>p.permanent).map(p=>p.id),...s.orders.map(o=>o.target),...(s.activeOrder?[s.activeOrder.target]:[]) ]);
      this.el.querySelector('.points-layer').innerHTML=[...live].map(id=>this.point(G.place(id),s.activeOrder?.target===id?s.activeOrder:s.orders.find(o=>o.target===id))).join('');
      const player=G.playerPoint(s);
      this.el.querySelector('.player-layer').innerHTML=`<g class="player-marker" transform="translate(${player.x} ${player.y-39})" role="img" aria-label="玩家${escape(s.name)}位于${escape(G.locationName(s))}"><circle class="player-pulse" r="20" fill="#8cd6c4" opacity=".16"/><path d="M-8 9 0 18 8 9" fill="#8ad1bd"/><circle r="12" fill="#a6e5cd" stroke="#133c34" stroke-width="3"/><circle cy="-3" r="3" fill="#244a3f"/><path d="M-5 6Q0-2 5 6" fill="#244a3f"/></g>`;
      this.renderTrail();
    }
    renderTrail(){
      if(!this.s)return;let trail='';
      const a=this.s.activity;
      // 已完成路线只保留在状态中用于存档/记录，不继续画在地图上。
      let route=this.selected?G.routeFrom(this.s,this.selected):a?.phase==='travel'?a.route:null;
      if(!this.selected&&a?.phase==='travel'){
        let length=0;const points=[G.playerPoint(this.s)];
        for(let i=1;i<a.route.points.length;i++){
          const p=a.route.points[i-1],q=a.route.points[i];length+=(Math.abs(p.x-q.x)+Math.abs(p.y-q.y))*G.WORLD.metersPerUnit;
          if(length>a.travelled+1e-8)points.push(q);
        }
        route={points};
      }
      if(route?.points.length>1){const d=route.points.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ');trail=`<path d="${d}" fill="none" stroke="${this.selected?'#e4c489':'#81b8a5'}" stroke-width="4" stroke-linecap="round" stroke-dasharray="8 8" opacity="${this.selected?'.85':'.4'}"/>`;}
      this.el.querySelector('.trail-layer').innerHTML=trail;
    }
    updatePosition(s){
      this.s=s;const marker=this.el.querySelector('.player-marker');if(!marker)return this.render(s);
      const p=G.playerPoint(s);marker.setAttribute('transform',`translate(${p.x} ${p.y-39})`);
      marker.setAttribute('aria-label',`玩家${s.name}位于${G.locationName(s)}`);
      this.el.dataset.night=String(G.isNight(s));this.renderTrail();
    }
    select(id){this.selected=id;this.render(this.s);}
    transform(){const w=this.el.clientWidth,h=this.el.clientHeight;this.scale=G.clamp(this.scale,.2,2.8);this.tx=G.clamp(this.tx,-G.WORLD.width*this.scale+80,w-80);this.ty=G.clamp(this.ty,-G.WORLD.height*this.scale+80,h-80);this.layer.setAttribute('transform',`translate(${this.tx} ${this.ty}) scale(${this.scale})`);this.el.dataset.zoom=this.scale.toFixed(2);}
    fit(){const w=this.el.clientWidth,h=this.el.clientHeight;if(!w||!h)return;this.scale=G.clamp(Math.min(w/G.WORLD.width,(h-95)/G.WORLD.height)*.97,.2,2.8);this.tx=(w-G.WORLD.width*this.scale)/2;this.ty=(h-95-G.WORLD.height*this.scale)/2;this.transform();}
    center(){if(!this.s)return;const p=G.playerPoint(this.s);this.scale=Math.max(this.el.clientWidth<800?.95:.7,this.scale);this.tx=this.el.clientWidth*.48-p.x*this.scale;this.ty=this.el.clientHeight*.52-p.y*this.scale;this.transform();}
    zoom(mult,x=this.el.clientWidth/2,y=this.el.clientHeight/2){const prev=this.scale,next=G.clamp(prev*mult,.2,2.8);this.tx=x-(x-this.tx)*next/prev;this.ty=y-(y-this.ty)*next/prev;this.scale=next;this.transform();}
    local(e){const b=this.el.getBoundingClientRect();return{x:e.clientX-b.left,y:e.clientY-b.top};}
    resetPinch(){const a=[...this.pointers.values()];if(a.length<2)return;const mid={x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2};this.pinch={distance:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)||1,scale:this.scale,wx:(mid.x-this.tx)/this.scale,wy:(mid.y-this.ty)/this.scale};}
    bind(){
      this.el.addEventListener('wheel',e=>{e.preventDefault();const p=this.local(e);this.zoom(Math.exp(-e.deltaY*.0015),p.x,p.y);},{passive:false});
      this.el.addEventListener('pointerdown',e=>{if(e.button!==0&&e.pointerType==='mouse')return;const p=this.local(e);this.pointers.set(e.pointerId,p);this.el.setPointerCapture(e.pointerId);if(this.pointers.size===1){this.start=p;this.last=p;this.dragged=false;this.multi=false;this.downTarget=e.target.closest('[data-place]')?.dataset.place;}else{this.multi=true;this.dragged=true;this.resetPinch();}this.el.classList.add('dragging');});
      this.el.addEventListener('pointermove',e=>{if(!this.pointers.has(e.pointerId))return;const p=this.local(e);this.pointers.set(e.pointerId,p);
        if(this.pointers.size>=2){const a=[...this.pointers.values()];if(!this.pinch)this.resetPinch();const d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),mid={x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2};this.scale=G.clamp(this.pinch.scale*d/this.pinch.distance,.2,2.8);this.tx=mid.x-this.pinch.wx*this.scale;this.ty=mid.y-this.pinch.wy*this.scale;}
        else{this.tx+=p.x-this.last.x;this.ty+=p.y-this.last.y;this.last=p;if(Math.hypot(p.x-this.start.x,p.y-this.start.y)>6)this.dragged=true;}this.transform();});
      const finish=(e,cancel=false)=>{if(!this.pointers.has(e.pointerId))return;this.pointers.delete(e.pointerId);if(!this.pointers.size){this.el.classList.remove('dragging');if(!cancel&&!this.dragged&&!this.multi&&this.downTarget)this.onSelect(this.downTarget);this.pinch=null;}else if(this.pointers.size===1){this.last=[...this.pointers.values()][0];this.start=this.last;this.pinch=null;}else this.resetPinch();};
      this.el.addEventListener('pointerup',e=>finish(e));this.el.addEventListener('pointercancel',e=>finish(e,true));this.el.addEventListener('lostpointercapture',e=>finish(e,true));
      this.el.addEventListener('keydown',e=>{const p=e.target.closest('[data-place]');if(p&&['Enter',' '].includes(e.key)){e.preventDefault();this.onSelect(p.dataset.place);return;}const d=70;if(e.key==='ArrowLeft')this.tx+=d;else if(e.key==='ArrowRight')this.tx-=d;else if(e.key==='ArrowUp')this.ty+=d;else if(e.key==='ArrowDown')this.ty-=d;else if(e.key==='+'||e.key==='=')this.zoom(1.2);else if(e.key==='-')this.zoom(1/1.2);else if(e.key==='Home')this.fit();else return;e.preventDefault();this.transform();});
    }
  };
})(globalThis);
