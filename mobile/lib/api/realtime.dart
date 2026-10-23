import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:stackstep/api/json.dart';
import 'package:stackstep/api/models.dart';
import 'package:web_socket_channel/io.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

enum SocketStatus { connecting, live, offline }

typedef ChannelFactory = WebSocketChannel Function(Uri uri, List<String> protocols);

WebSocketChannel _defaultChannel(Uri uri, List<String> protocols) =>
    IOWebSocketChannel.connect(uri, protocols: protocols, pingInterval: const Duration(seconds: 20));

/// Keeps one WebSocket open with exponential backoff (1 s → 30 s, ±20 % jitter).
/// Every time the socket becomes live again, [onLive] fires so callers refetch
/// whatever they may have missed while offline.
final class Realtime {
  Realtime({
    required this.wsUrl,
    required this.token,
    this.onLive,
    ChannelFactory? channelFactory,
    Random? random,
  }) : _factory = channelFactory ?? _defaultChannel,
       _random = random ?? Random();

  final Uri wsUrl;
  final Future<String?> Function() token;
  final void Function()? onLive;
  final ChannelFactory _factory;
  final Random _random;

  final _frames = StreamController<Frame>.broadcast();
  final _status = StreamController<SocketStatus>.broadcast();
  WebSocketChannel? _channel;
  StreamSubscription<Object?>? _sub;
  Timer? _retry;
  var _attempt = 0;
  var _stopped = false;
  SocketStatus _current = SocketStatus.connecting;

  Stream<Frame> get frames => _frames.stream;
  Stream<SocketStatus> get status => _status.stream;
  SocketStatus get current => _current;

  void start() {
    _stopped = false;
    unawaited(_connect());
  }

  Future<void> stop() async {
    _stopped = true;
    _retry?.cancel();
    await _sub?.cancel();
    await _channel?.sink.close();
    _channel = null;
  }

  Future<void> dispose() async {
    await stop();
    await _frames.close();
    await _status.close();
  }

  void _set(SocketStatus s) {
    _current = s;
    if (!_status.isClosed) _status.add(s);
  }

  Future<void> _connect() async {
    if (_stopped) return;
    _set(SocketStatus.connecting);
    final t = await token();
    if (_stopped) return;
    if (t == null) {
      _set(SocketStatus.offline);
      return; // signed out; the session layer takes over
    }
    try {
      final ch = _factory(wsUrl, ['stackstep.v1', 'bearer.$t']);
      _channel = ch;
      await ch.ready;
      _sub = ch.stream.listen(_onData, onDone: _onClosed, onError: (Object _) => _onClosed());
    } on Object {
      _onClosed();
    }
  }

  void _onData(Object? data) {
    if (data is! String) return;
    final Frame frame;
    try {
      frame = Frame.fromJson(asObject(jsonDecode(data)));
    } on Object {
      return; // a malformed frame is dropped; the next refetch heals state
    }
    if (frame is ReadyFrame) {
      _attempt = 0;
      _set(SocketStatus.live);
      onLive?.call();
    }
    if (!_frames.isClosed) _frames.add(frame);
  }

  void _onClosed() {
    final code = _channel?.closeCode;
    _channel = null;
    unawaited(_sub?.cancel());
    _sub = null;
    if (_stopped) return;
    _set(SocketStatus.offline);
    // 4409: no enrollment — retrying won't help until the state changes.
    if (code == 4409) return;
    final base = min(30, pow(2, _attempt).toInt());
    final jitter = 0.8 + _random.nextDouble() * 0.4;
    _attempt = min(_attempt + 1, 10);
    _retry?.cancel();
    _retry = Timer(Duration(milliseconds: (base * 1000 * jitter).round()), () => unawaited(_connect()));
  }
}
