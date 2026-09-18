/* Wall time is converted in one place. All pause reasons compose independently. */
(function(root){
  'use strict';
  const G=root.NightCourier;
  G.GameClock=class {
    constructor(advance,onSuspend=()=>{}){
      this.advance=advance;this.onSuspend=onSuspend;this.reasons=new Set(['manual']);this.speed=1;this.last=null;
    }
    get paused(){return this.reasons.size>0;}
    pause(reason='manual'){if(!this.reasons.has(reason)){this.reasons.add(reason);this.last=null;}}
    release(reason){if(this.reasons.delete(reason))this.last=null;}
    reset(){this.last=null;}
    setSpeed(speed){if(![1,3,10].includes(speed))throw new Error('无效时间倍率。');this.speed=speed;this.last=null;}
    frame(timestamp){
      if(!Number.isFinite(timestamp)||this.paused){this.last=null;return;}
      const previous=this.last;this.last=timestamp;if(previous===null)return;
      const elapsed=timestamp-previous;
      // A suspended/throttled renderer must never deliver a burst of offline time.
      if(elapsed<0||elapsed>1000){this.pause('manual');this.onSuspend();return;}
      if(elapsed>0)this.advance(elapsed/1000*this.speed);
    }
  };
})(globalThis);
