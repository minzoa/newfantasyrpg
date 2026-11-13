import type { Settings, ZoneId } from './contracts';
type Sound = 'swing'|'hit'|'hurt'|'dash'|'magic'|'lance'|'loot'|'level'|'warning'|'step'|'menu'|'death'|'win';

/** Original synthesized score and sound design. No external assets or network requests. */
export class GameAudio {
  private context: AudioContext | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private ambience: GainNode | null = null;
  private ambientFilter:BiquadFilterNode|null=null;
  private ambientSource:AudioBufferSourceNode|null=null;
  private nextAmbient=0;
  private nextNote=0;
  private beat=0;
  private zone:ZoneId='haven';
  private enabled=false;
  private settings:Settings;
  constructor(settings:Settings) {this.settings=settings;}
  async start() {
    try {
      if(!this.context) {
        this.context=new AudioContext();
        this.music=this.context.createGain();this.effects=this.context.createGain();this.ambience=this.context.createGain();
        const compressor=this.context.createDynamicsCompressor();compressor.connect(this.context.destination);
        this.music.connect(compressor);this.effects.connect(compressor);this.ambience.connect(compressor);this.apply(this.settings);
        const noise=this.context.createBuffer(1,this.context.sampleRate*3,this.context.sampleRate),data=noise.getChannelData(0);
        for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.06;
        this.ambientSource=this.context.createBufferSource();this.ambientSource.buffer=noise;this.ambientSource.loop=true;
        this.ambientFilter=this.context.createBiquadFilter();this.ambientFilter.type='bandpass';this.ambientFilter.Q.value=.6;
        this.ambientSource.connect(this.ambientFilter);this.ambientFilter.connect(this.ambience);this.ambientSource.start();this.setZone(this.zone);
      }
      if(this.context.state==='suspended') await this.context.resume();
      this.enabled=true;this.nextNote=this.context.currentTime;
    } catch { /* Audio is optional; gameplay remains functional. */ }
  }
  apply(settings:Settings) {
    this.settings=settings;
    if(this.music) this.music.gain.value=settings.music*.22;
    if(this.effects) this.effects.gain.value=settings.effects*.32;
    if(this.ambience) this.ambience.gain.value=settings.ambience*.45;
  }
  setZone(zone:ZoneId) {this.zone=zone;this.beat=0;this.nextAmbient=0;if(this.ambientFilter)this.ambientFilter.frequency.value={haven:780,forest:1400,temple:320,rift:160}[zone];}
  private tone(frequency:number,time:number,duration:number,gain:number,type:OscillatorType,bus:GainNode,slide?:number) {
    const ctx=this.context!;
    const osc=ctx.createOscillator(), env=ctx.createGain();
    osc.type=type;osc.frequency.setValueAtTime(frequency,time);
    if(slide) osc.frequency.exponentialRampToValueAtTime(slide,time+duration);
    env.gain.setValueAtTime(.001,time);env.gain.linearRampToValueAtTime(gain,time+.015);
    env.gain.exponentialRampToValueAtTime(.001,time+duration);
    osc.connect(env);env.connect(bus);osc.start(time);osc.stop(time+duration+.03);
    osc.onended=()=>{osc.disconnect();env.disconnect();};
  }
  update() {
    if(!this.context || !this.enabled || this.context.state!=='running' || !this.music) return;
    const now=this.context.currentTime;
    if(this.ambience&&now>this.nextAmbient) {
      if(this.zone==='haven'||this.zone==='forest') {
        this.tone(this.zone==='forest'?1700:1250,now,.18,.045,'sine',this.ambience,2400);
        this.tone(2200,now+.22,.13,.035,'sine',this.ambience,1600);
      } else {
        this.tone(this.zone==='rift'?92:390,now,3,.055,'sine',this.ambience,this.zone==='rift'?65:385);
      }
      this.nextAmbient=now+4+Math.random()*4;
    }
    if(this.nextNote<now-.5) this.nextNote=now;
    if(this.nextNote>now+.1) return;
    const scales:Record<ZoneId,number[]>={haven:[62,69,74,78,81,78,74,69],forest:[64,71,76,79,83,79,76,71],temple:[57,64,69,72,76,72,69,64],rift:[50,57,62,65,69,65,62,57]};
    const notes=scales[this.zone],note=notes[this.beat%notes.length];
    const freq=440*Math.pow(2,(note-69)/12);
    this.tone(freq,this.nextNote,2.4,.18,'sine',this.music);
    this.tone(freq*2,this.nextNote+.04,1.1,.035,'triangle',this.music);
    if(this.beat%4===0) this.tone(440*Math.pow(2,(notes[0]-81)/12),this.nextNote,4,.23,'sine',this.music);
    // A soft airy shimmer at sparse intervals gives each musical region room to breathe.
    this.nextNote+=(this.zone==='rift'?.48:.75);this.beat++;
  }
  play(sound:Sound) {
    if(!this.context||!this.enabled||!this.effects) return;
    const t=this.context.currentTime,b=this.effects;
    const tone=(f:number,d:number,g:number,type:OscillatorType='sine',slide?:number,delay=0)=>this.tone(f,t+delay,d,g,type,b,slide);
    switch(sound) {
      case 'swing': tone(370,.12,.14,'triangle',70);break;
      case 'hit':tone(140,.14,.25,'triangle',40);tone(1700,.04,.12,'square',400);break;
      case 'hurt':tone(110,.25,.24,'sawtooth',45);break;
      case 'dash':tone(170,.24,.12,'triangle',800);break;
      case 'magic':tone(220,.5,.18,'sine',880);tone(554,.65,.13,'triangle',1108);break;
      case 'lance':tone(120,.7,.18,'sawtooth',1800);tone(880,.8,.14,'sine',220);break;
      case 'loot': [660,880,1320].forEach((f,i)=>tone(f,.35,.16,'sine',undefined,i*.09));break;
      case 'level': [440,554,659,880,1320].forEach((f,i)=>tone(f,.8,.2,'sine',undefined,i*.13));break;
      case 'warning':tone(150,.5,.15,'triangle',330);break;
      case 'step':tone(75,.045,.035,'triangle',40);break;
      case 'menu':tone(580,.08,.09);break;
      case 'death':tone(180,1.5,.2,'triangle',40);break;
      case 'win':[523,659,784,1047,1318].forEach((f,i)=>tone(f,2,.2,'sine',undefined,i*.24));break;
    }
  }
  suspend() {this.context?.suspend().catch(()=>{});}
  dispose() {this.enabled=false;this.ambientSource?.stop();this.ambientSource?.disconnect();this.ambientFilter?.disconnect();this.context?.close().catch(()=>{});this.context=null;}
}
