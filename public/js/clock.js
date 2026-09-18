/* One monotonic clock for foreground frames and the background heartbeat. */
(function(root){
  'use strict';
  const G=root.NightCourier;
  G.GameClock=class {
    constructor(advance){
      this.advance=advance;this.reasons=new Set(['manual']);this.speed=1;this.last=null;this.pendingMinutes=0;
    }
    get paused(){return this.reasons.size>0;}
    reset(){this.last=null;this.pendingMinutes=0;}
    pause(reason='manual'){if(!this.reasons.has(reason)){this.reasons.add(reason);this.reset();}}
    release(reason){if(this.reasons.delete(reason))this.reset();}
    setSpeed(speed){if(![1,3,10].includes(speed))throw new Error('无效时间倍率。');this.speed=speed;this.reset();}
    frame(timestamp){
      if(!Number.isFinite(timestamp))return;
      if(this.paused){this.reset();return;}
      const previous=this.last;
      if(previous===null){this.last=timestamp;return;}
      // Two schedulers share this timestamp: duplicates/stale callbacks must not
      // double-count elapsed time or move the monotonic baseline backwards.
      if(timestamp<previous)return;
      this.last=timestamp;
      this.pendingMinutes+=(timestamp-previous)/1000*this.speed;
      // Throttling is not a pause. Drain live-session elapsed time in bounded
      // batches; preserve the remainder for the next callback instead of losing
      // it. Events/manual pauses clear the debt immediately, including the part
      // of a batch that the engine intentionally leaves unused at an event.
      for(let i=0;i<4&&this.pendingMinutes>0&&!this.paused;i++){
        const minutes=Math.min(60,this.pendingMinutes);
        this.pendingMinutes-=minutes;
        this.advance(minutes);
      }
    }
  };
})(globalThis);
