import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:stackstep/api/api_client.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/api/validation.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/features/chat/inbox_controller.dart';
import 'package:stackstep/shared/errors.dart';
import 'package:uuid/uuid.dart';

export 'package:stackstep/features/chat/inbox_controller.dart' show ChatTarget, ChatTargetX;

/// A row in the chat: a delivered message, or one of ours still sending or failed.
sealed class ChatItem {
  const ChatItem();
  DateTime get at;
  String get key;
}

final class Delivered extends ChatItem {
  const Delivered(this.message);
  final Message message;

  @override
  DateTime get at => message.sentAt;

  @override
  String get key => message.id;
}

final class Outgoing extends ChatItem {
  const Outgoing({required this.clientId, required this.body, required this.at, this.error});

  final String clientId;
  final String body;
  @override
  final DateTime at;

  /// Null while sending; a user-facing reason once it failed.
  final String? error;

  @override
  String get key => 'out-$clientId';

  Outgoing failed(String reason) => Outgoing(clientId: clientId, body: body, at: at, error: reason);
  Outgoing sending() => Outgoing(clientId: clientId, body: body, at: at);
}

final class ChatState {
  const ChatState({required this.delivered, required this.outgoing, required this.nextCursor, this.loadingOlder = false});

  /// Newest first, unique by id.
  final List<Message> delivered;

  /// Oldest first.
  final List<Outgoing> outgoing;
  final String? nextCursor;
  final bool loadingOlder;

  /// Everything to render, newest first (the list view is reversed).
  List<ChatItem> get items => [...outgoing.reversed, ...delivered.map(Delivered.new)];

  ChatState copyWith({List<Message>? delivered, List<Outgoing>? outgoing, String? Function()? nextCursor, bool? loadingOlder}) => ChatState(
    delivered: delivered ?? this.delivered,
    outgoing: outgoing ?? this.outgoing,
    nextCursor: nextCursor != null ? nextCursor() : this.nextCursor,
    loadingOlder: loadingOlder ?? this.loadingOlder,
  );
}

/// Merges pages and live frames: dedupes by id and keeps newest first.
List<Message> mergeMessages(List<Message> a, List<Message> b) {
  final byId = <String, Message>{for (final m in a) m.id: m, for (final m in b) m.id: m};
  return byId.values.toList()..sort((x, y) {
    final c = y.sentAt.compareTo(x.sentAt);
    return c != 0 ? c : y.id.compareTo(x.id);
  });
}

final AsyncNotifierProviderFamily<ChatController, ChatState, ChatTarget> chatProvider = AsyncNotifierProvider.autoDispose
    .family<ChatController, ChatState, ChatTarget>(ChatController.new);

final class ChatController extends AsyncNotifier<ChatState> {
  ChatController(this.target);

  final ChatTarget target;
  ApiClient get _api => ref.read(apiClientProvider);
  static const _uuid = Uuid();

  Future<Page<Message>> _page({String? cursor}) => switch (target.enrollmentId) {
    final enrollment? => _api.staffMessages(enrollment, target.personaId, cursor: cursor),
    null => _api.messages(target.personaId, cursor: cursor),
  };

  Future<Message> _post(String clientId, String body) => switch (target.enrollmentId) {
    final enrollment? => _api.staffSend(enrollment, target.personaId, clientId: clientId, body: body),
    null => _api.sendMessage(target.personaId, clientId: clientId, body: body),
  };

  Future<void> _markRead() async {
    try {
      await switch (target.enrollmentId) {
        final enrollment? => _api.staffMarkRead(enrollment, target.personaId),
        null => _api.markRead(target.personaId),
      };
      if (ref.mounted) ref.read(inboxReadsProvider).markedRead(target);
    } on Exception {
      // Unread counts are best effort; the next open retries.
    }
  }

  @override
  Future<ChatState> build() async {
    final rt = ref.watch(realtimeProvider);
    final sub = rt.frames.listen((f) {
      switch (f) {
        case MessageFrame(:final message) when target.contains(message):
          _receive([message]);
          if (!target.isMine(message)) unawaited(_markRead());
        case ReadyFrame():
          unawaited(_catchUp());
        case MessageFrame() || TaskFrame():
          break;
      }
    });
    ref.onDispose(sub.cancel);
    final page = await _page();
    unawaited(_markRead());
    return ChatState(delivered: page.items, outgoing: const [], nextCursor: page.nextCursor);
  }

  void _receive(List<Message> msgs) {
    final s = state.value;
    if (s == null) return;
    final ids = {for (final m in msgs) m.clientId};
    state = AsyncData(
      s.copyWith(delivered: mergeMessages(s.delivered, msgs), outgoing: s.outgoing.where((o) => !ids.contains(o.clientId)).toList()),
    );
  }

  /// After a reconnect, pull the newest page so nothing sent while offline is missed.
  Future<void> _catchUp() async {
    try {
      final page = await _page();
      if (ref.mounted) _receive(page.items);
    } on Exception {
      // The next reconnect tries again.
    }
  }

  Future<void> loadOlder() async {
    final s = state.value;
    if (s == null || s.loadingOlder || s.nextCursor == null) return;
    state = AsyncData(s.copyWith(loadingOlder: true));
    try {
      final page = await _page(cursor: s.nextCursor);
      final now = state.value!;
      if (!ref.mounted) return;
      state = AsyncData(
        now.copyWith(delivered: mergeMessages(now.delivered, page.items), nextCursor: () => page.nextCursor, loadingOlder: false),
      );
    } on Exception {
      if (ref.mounted) state = AsyncData(state.value!.copyWith(loadingOlder: false));
    }
  }

  /// Validates and sends. Returns a validation message, or null when queued.
  String? send(String raw) {
    final problem = validateMessage(raw);
    if (problem != null) return problem;
    final s = state.value;
    if (s == null) return null;
    final out = Outgoing(clientId: _uuid.v4(), body: raw.trim(), at: ref.read(clockProvider)().toUtc());
    state = AsyncData(s.copyWith(outgoing: [...s.outgoing, out]));
    unawaited(_deliver(out));
    return null;
  }

  /// Retries with the same client id, so the server never stores a duplicate.
  void retry(Outgoing o) {
    _replaceOutgoing(o.clientId, o.sending());
    unawaited(_deliver(o));
  }

  void discard(Outgoing o) {
    final s = state.value;
    if (s == null) return;
    state = AsyncData(s.copyWith(outgoing: s.outgoing.where((x) => x.clientId != o.clientId).toList()));
  }

  Future<void> _deliver(Outgoing o) async {
    try {
      final msg = await _post(o.clientId, o.body);
      if (ref.mounted) _receive([msg]);
    } on Exception catch (e) {
      if (ref.mounted) _replaceOutgoing(o.clientId, o.failed(messageFor(e)));
    }
  }

  void _replaceOutgoing(String clientId, Outgoing next) {
    final s = state.value;
    if (s == null) return;
    state = AsyncData(
      s.copyWith(
        outgoing: [
          for (final x in s.outgoing)
            if (x.clientId == clientId) next else x,
        ],
      ),
    );
  }
}
