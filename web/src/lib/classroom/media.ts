/**
 * Live class media over WebRTC, hub and spoke: the presenter's browser keeps one connection
 * per viewer. It sends its screen (video) and a voice mix (audio) to each viewer, and receives
 * each viewer's microphone. The presenter mixes only the students a host has let speak, so a
 * tampered client can't talk over the class. One offer per viewer: later changes (sharing
 * starts or stops, a mic opens) swap tracks without renegotiating.
 */

export type SignalData = {
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit | null;
};
type Send = (to: string, data: SignalData) => void;

function isSignal(d: unknown): d is SignalData {
  return typeof d === "object" && d !== null;
}

type ViewerLink = {
  pc: RTCPeerConnection;
  video: RTCRtpSender;
  audio: RTCRtpSender;
  mix: MediaStreamAudioDestinationNode;
  /** This viewer's microphone in the mix, when they're allowed to speak. */
  voice: { source: MediaStreamAudioSourceNode; el: HTMLAudioElement } | null;
  allowed: boolean;
};

export class PresenterMedia {
  private ctx = new AudioContext();
  private links = new Map<string, ViewerLink>();
  private screen: MediaStream | null = null;
  private mic: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  onScreenEnded: (() => void) | null = null;

  constructor(
    private ice: RTCIceServer[],
    private send: Send,
  ) {}

  get screenStream(): MediaStream | null {
    return this.screen;
  }

  async startScreen(): Promise<MediaStream> {
    const s = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 15, max: 30 } },
      audio: false,
    });
    this.screen = s;
    const track = s.getVideoTracks()[0] ?? null;
    if (track) {
      track.contentHint = "detail";
      track.onended = () => {
        this.stopScreen();
        this.onScreenEnded?.();
      };
    }
    for (const l of this.links.values()) await l.video.replaceTrack(track);
    return s;
  }

  stopScreen() {
    this.screen?.getTracks().forEach((t) => t.stop());
    this.screen = null;
    for (const l of this.links.values()) void l.video.replaceTrack(null);
  }

  async setMic(on: boolean): Promise<void> {
    if (!on) {
      // Release the microphone straight away; nothing here may wait on a closing context.
      this.micSource?.disconnect();
      this.micSource = null;
      this.mic?.getTracks().forEach((t) => t.stop());
      this.mic = null;
      return;
    }
    await this.ctx.resume();
    if (this.mic) return;
    this.mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    this.micSource = this.ctx.createMediaStreamSource(this.mic);
    for (const l of this.links.values()) this.micSource.connect(l.mix);
  }

  /** A viewer joined (or presenting started): open a connection and send the offer. */
  async addViewer(id: string): Promise<void> {
    if (this.links.has(id)) return;
    await this.ctx.resume().catch(() => undefined);
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    const mix = this.ctx.createMediaStreamDestination();
    this.micSource?.connect(mix);
    // Students already allowed to speak are heard by this newcomer too.
    for (const other of this.links.values())
      if (other.voice && other.allowed) other.voice.source.connect(mix);
    const video = pc.addTransceiver("video", { direction: "sendonly" }).sender;
    const audio = pc.addTransceiver("audio", { direction: "sendrecv" }).sender;
    const link: ViewerLink = {
      pc,
      video,
      audio,
      mix,
      voice: null,
      allowed: false,
    };
    this.links.set(id, link);
    await video.replaceTrack(this.screen?.getVideoTracks()[0] ?? null);
    await audio.replaceTrack(mix.stream.getAudioTracks()[0] ?? null);
    pc.onicecandidate = (e) =>
      this.send(id, { candidate: e.candidate ? e.candidate.toJSON() : null });
    pc.ontrack = (e) => {
      if (e.track.kind !== "audio") return;
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      // Chrome only feeds WebAudio from a remote stream that is also attached to an element.
      const el = new Audio();
      el.muted = true;
      el.srcObject = stream;
      void el.play().catch(() => undefined);
      link.voice = { source: this.ctx.createMediaStreamSource(stream), el };
      this.applyVoice(id);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") void this.offer(id, true);
    };
    await this.offer(id, false);
  }

  private async offer(id: string, restart: boolean) {
    const l = this.links.get(id);
    if (!l) return;
    const o = await l.pc.createOffer({ iceRestart: restart });
    await l.pc.setLocalDescription(o);
    if (l.pc.localDescription)
      this.send(id, { sdp: l.pc.localDescription.toJSON() });
  }

  /** Drops every viewer connection (after our own reconnect, their peer ids are all new). */
  resetViewers() {
    for (const id of [...this.links.keys()]) this.removeViewer(id);
  }

  removeViewer(id: string) {
    const l = this.links.get(id);
    if (!l) return;
    l.voice?.source.disconnect();
    l.voice?.el.pause();
    l.pc.close();
    this.links.delete(id);
  }

  /** A host let a student speak (or stopped them): mix their voice for everyone else. */
  allowVoice(id: string, allowed: boolean) {
    const l = this.links.get(id);
    if (!l) return;
    l.allowed = allowed;
    this.applyVoice(id);
  }

  private applyVoice(id: string) {
    const l = this.links.get(id);
    if (!l?.voice) return;
    l.voice.source.disconnect();
    if (!l.allowed) return;
    l.voice.source.connect(this.ctx.destination);
    for (const [other, o] of this.links)
      if (other !== id) l.voice.source.connect(o.mix);
  }

  async onSignal(from: string, data: unknown) {
    const l = this.links.get(from);
    if (!l || !isSignal(data)) return;
    if (data.sdp?.type === "answer") await l.pc.setRemoteDescription(data.sdp);
    else if (data.candidate)
      await l.pc.addIceCandidate(data.candidate).catch(() => undefined);
  }

  close() {
    for (const id of [...this.links.keys()]) this.removeViewer(id);
    this.stopScreen();
    void this.setMic(false);
    void this.ctx.close();
  }
}

/** A viewer: answers the presenter's offer, plays what arrives, and opens its mic when allowed. */
export class ViewerMedia {
  private pc: RTCPeerConnection | null = null;
  private presenter = "";
  private mic: MediaStream | null = null;
  private audioSender: RTCRtpSender | null = null;
  onStream: ((s: MediaStream | null) => void) | null = null;

  constructor(
    private ice: RTCIceServer[],
    private send: Send,
  ) {}

  async onSignal(from: string, data: unknown) {
    if (!isSignal(data)) return;
    if (data.sdp?.type === "offer") {
      if (!this.pc || this.presenter !== from) this.reset(from);
      const pc = this.pc;
      if (!pc) return;
      await pc.setRemoteDescription(data.sdp);
      // Answer with a send-capable audio slot, so opening the mic later is a track swap.
      for (const t of pc.getTransceivers()) {
        if (t.receiver.track.kind === "audio") {
          t.direction = "sendrecv";
          this.audioSender = t.sender;
          await t.sender.replaceTrack(this.mic?.getAudioTracks()[0] ?? null);
        }
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (pc.localDescription)
        this.send(from, { sdp: pc.localDescription.toJSON() });
    } else if (data.candidate && this.pc && from === this.presenter) {
      await this.pc.addIceCandidate(data.candidate).catch(() => undefined);
    }
  }

  private reset(presenter: string) {
    this.pc?.close();
    this.presenter = presenter;
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    this.pc = pc;
    pc.onicecandidate = (e) =>
      this.send(presenter, {
        candidate: e.candidate ? e.candidate.toJSON() : null,
      });
    // Video and audio arrive as separate tracks; keep them in one stream for the stage.
    const remote = new MediaStream();
    pc.ontrack = (e) => {
      remote
        .getTracks()
        .filter((t) => t.kind === e.track.kind)
        .forEach((t) => remote.removeTrack(t));
      remote.addTrack(e.track);
      this.onStream?.(new MediaStream(remote.getTracks()));
    };
  }

  /** Opens or closes the mic. Only call it once a host has let this student speak. */
  async setMic(on: boolean): Promise<void> {
    if (!on) {
      // Stop the tracks first: the connection may already be closing, and the mic must go off.
      this.mic?.getTracks().forEach((t) => t.stop());
      this.mic = null;
      await this.audioSender?.replaceTrack(null).catch(() => undefined);
      return;
    }
    this.mic ??= await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    await this.audioSender?.replaceTrack(this.mic.getAudioTracks()[0] ?? null);
  }

  /** The presenter left: drop the connection and clear the stage. */
  presenterGone() {
    this.pc?.close();
    this.pc = null;
    this.presenter = "";
    this.onStream?.(null);
  }

  close() {
    void this.setMic(false);
    this.presenterGone();
  }
}
