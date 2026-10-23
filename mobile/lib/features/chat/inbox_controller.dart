import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:stackstep/api/api_client.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/core/providers.dart';

/// The seeded team lead the server falls back to when no persona is chosen.
const defaultPersonaId = '00000000-0000-4000-8000-000000000001';

/// Which conversation a chat screen shows. Students omit `enrollmentId`; admins replying as a
/// persona set it to the student's enrollment.
typedef ChatTarget = ({String personaId, String? enrollmentId});

extension ChatTargetX on ChatTarget {
  bool get isStaff => enrollmentId != null;

  /// Whether a delivered message was written by "our side" of this conversation.
  bool isMine(Message m) => isStaff ? m.author == Author.persona : m.author == Author.student;

  bool contains(Message m) => m.personaId == personaId && (enrollmentId == null || m.enrollmentId == enrollmentId);
}

/// Chat screens report reads here so inboxes can clear their badges without refetching.
final class InboxReads {
  final _reads = StreamController<ChatTarget>.broadcast();

  Stream<ChatTarget> get stream => _reads.stream;

  void markedRead(ChatTarget t) {
    if (!_reads.isClosed) _reads.add(t);
  }
}

final Provider<InboxReads> inboxReadsProvider = Provider<InboxReads>((ref) {
  final r = InboxReads();
  ref.onDispose(r._reads.close);
  return r;
});

/// Applies one live message to a thread list. Returns null when the message belongs to a
/// thread the list doesn't have yet (the caller refetches), or the list unchanged for a
/// duplicate or older frame. Unread grows only for messages from the other side.
List<Thread>? applyMessage(List<Thread> threads, Message m, {required bool staff, bool Function(Thread)? isOpen}) {
  final i = threads.indexWhere((t) => t.persona.id == m.personaId && t.enrollmentId == m.enrollmentId);
  if (i < 0) return null;
  final t = threads[i];
  final last = t.lastMessage;
  if (last != null && (last.id == m.id || last.sentAt.isAfter(m.sentAt))) return threads;
  final fromOther = staff ? m.author == Author.student : m.author == Author.persona;
  final open = isOpen?.call(t) ?? false;
  final next = t.copyWith(lastMessage: m, unread: fromOther && !open ? t.unread + 1 : t.unread);
  return [next, ...threads.take(i), ...threads.skip(i + 1)];
}

List<Thread> clearUnread(List<Thread> threads, ChatTarget target) => [
  for (final t in threads)
    if (t.persona.id == target.personaId && (target.enrollmentId == null || t.enrollmentId == target.enrollmentId))
      t.copyWith(unread: 0)
    else
      t,
];

int totalUnread(List<Thread> threads) => threads.fold(0, (n, t) => n + t.unread);

/// The student's conversations, one per persona, most recent first.
final AsyncNotifierProvider<StudentInboxController, List<Thread>> studentInboxProvider =
    AsyncNotifierProvider.autoDispose<StudentInboxController, List<Thread>>(StudentInboxController.new);

final class StudentInboxController extends AsyncNotifier<List<Thread>> {
  ApiClient get _api => ref.read(apiClientProvider);

  @override
  Future<List<Thread>> build() async {
    final frames = ref.watch(realtimeProvider).frames.listen((f) {
      switch (f) {
        case MessageFrame(:final message):
          _apply(message);
        case ReadyFrame():
          unawaited(refresh());
        case TaskFrame():
          break;
      }
    });
    final reads = ref.watch(inboxReadsProvider).stream.listen((t) {
      if (t.isStaff) return;
      final s = state.value;
      if (s != null) state = AsyncData(clearUnread(s, t));
    });
    ref.onDispose(() {
      unawaited(frames.cancel());
      unawaited(reads.cancel());
    });
    return await _api.threads();
  }

  void _apply(Message m) {
    final s = state.value;
    if (s == null) return;
    final next = applyMessage(s, m, staff: false);
    if (next == null) {
      unawaited(refresh());
    } else if (!identical(next, s)) {
      state = AsyncData(next);
    }
  }

  Future<void> refresh() async {
    final next = await AsyncValue.guard(_api.threads);
    if (!ref.mounted) return;
    if (next is AsyncError && state.hasValue) return; // keep the old list on a background failure
    state = next;
  }
}

final class StaffInboxState {
  const StaffInboxState({required this.items, required this.nextCursor, required this.unreadOnly, this.loadingMore = false});

  final List<Thread> items;
  final String? nextCursor;
  final bool unreadOnly;
  final bool loadingMore;

  StaffInboxState copyWith({List<Thread>? items, bool? loadingMore}) =>
      StaffInboxState(items: items ?? this.items, nextCursor: nextCursor, unreadOnly: unreadOnly, loadingMore: loadingMore ?? false);
}

/// The admin inbox: every student conversation in the admin's scope.
final AsyncNotifierProvider<StaffInboxController, StaffInboxState> staffInboxProvider =
    AsyncNotifierProvider.autoDispose<StaffInboxController, StaffInboxState>(StaffInboxController.new);

final class StaffInboxController extends AsyncNotifier<StaffInboxState> {
  ApiClient get _api => ref.read(apiClientProvider);
  var _unreadOnly = false;
  var _generation = 0;

  @override
  Future<StaffInboxState> build() async {
    final frames = ref.watch(realtimeProvider).frames.listen((f) {
      switch (f) {
        case MessageFrame(:final message):
          _apply(message);
        case ReadyFrame():
          unawaited(refresh());
        case TaskFrame():
          break;
      }
    });
    final reads = ref.watch(inboxReadsProvider).stream.listen((t) {
      if (!t.isStaff) return;
      final s = state.value;
      if (s != null) state = AsyncData(s.copyWith(items: clearUnread(s.items, t)));
    });
    ref.onDispose(() {
      unawaited(frames.cancel());
      unawaited(reads.cancel());
    });
    return await _load();
  }

  Future<StaffInboxState> _load() async {
    final page = await _api.staffThreads(unreadOnly: _unreadOnly);
    return StaffInboxState(items: page.items, nextCursor: page.nextCursor, unreadOnly: _unreadOnly);
  }

  void _apply(Message m) {
    final s = state.value;
    if (s == null) return;
    final next = applyMessage(s.items, m, staff: true);
    if (next == null) {
      unawaited(refresh()); // a new conversation, or one beyond the loaded pages
    } else if (!identical(next, s.items)) {
      state = AsyncData(s.copyWith(items: next));
    }
  }

  Future<void> setUnreadOnly({required bool unreadOnly}) async {
    final v = unreadOnly;
    if (v == _unreadOnly) return;
    _unreadOnly = v;
    state = const AsyncLoading<StaffInboxState>();
    await refresh();
  }

  /// Reloads the first page. Responses from an older filter are ignored.
  Future<void> refresh() async {
    final gen = ++_generation;
    final next = await AsyncValue.guard(_load);
    if (!ref.mounted || gen != _generation) return;
    if (next is AsyncError && state.hasValue) return;
    state = next;
  }

  Future<void> loadMore() async {
    final s = state.value;
    if (s == null || s.loadingMore || s.nextCursor == null) return;
    final gen = _generation;
    state = AsyncData(s.copyWith(loadingMore: true));
    try {
      final page = await _api.staffThreads(unreadOnly: s.unreadOnly, cursor: s.nextCursor);
      if (!ref.mounted || gen != _generation) return;
      final seen = {for (final t in s.items) t.key};
      state = AsyncData(
        StaffInboxState(
          items: [...s.items, ...page.items.where((t) => !seen.contains(t.key))],
          nextCursor: page.nextCursor,
          unreadOnly: s.unreadOnly,
        ),
      );
    } on Exception {
      if (ref.mounted && gen == _generation) state = AsyncData(s);
    }
  }
}

/// Personas admins can write as (archived ones hidden).
final FutureProvider<List<Persona>> personasProvider = FutureProvider.autoDispose<List<Persona>>((ref) async {
  final all = await ref.read(apiClientProvider).personas();
  return all.where((p) => !p.archived).toList();
});
