import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:stackstep/api/api_client.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/shared/errors.dart';

enum BoardColumn {
  today('Today'),
  inReview('In review'),
  changes('Changes'),
  done('Done');

  BoardColumn(this.label);
  final String label;

  static BoardColumn of(TaskStatus s) => switch (s) {
    TaskStatus.todo || TaskStatus.inProgress => today,
    TaskStatus.inReview => inReview,
    TaskStatus.changesRequested => changes,
    TaskStatus.done || TaskStatus.cancelled => done,
  };
}

/// Groups visible tasks into board columns, earliest due first. Cancelled tasks are dropped.
Map<BoardColumn, List<Task>> groupBoard(Iterable<Task> tasks) {
  final out = {for (final c in BoardColumn.values) c: <Task>[]};
  for (final t in tasks) {
    if (t.status == TaskStatus.cancelled) continue;
    out[BoardColumn.of(t.status)]!.add(t);
  }
  for (final list in out.values) {
    list.sort((a, b) => a.dueAt.compareTo(b.dueAt));
  }
  return out;
}

final AsyncNotifierProvider<BoardController, List<Task>> boardProvider = AsyncNotifierProvider.autoDispose<BoardController, List<Task>>(
  BoardController.new,
);

final class BoardController extends AsyncNotifier<List<Task>> {
  ApiClient get _api => ref.read(apiClientProvider);

  @override
  Future<List<Task>> build() async {
    final rt = ref.watch(realtimeProvider);
    final sub = rt.frames.listen((f) {
      switch (f) {
        case TaskFrame(:final task):
          _upsert(task);
        case ReadyFrame():
          unawaited(refresh());
        case MessageFrame():
          break;
      }
    });
    ref.onDispose(sub.cancel);
    return await _api.myTasks();
  }

  Future<void> refresh() async {
    final next = await AsyncValue.guard(_api.myTasks);
    if (!ref.mounted) return;
    // Keep showing the old board if a background refresh fails.
    if (next is AsyncError && state.hasValue) return;
    state = next;
  }

  void _upsert(Task t) {
    final current = state.value;
    if (current == null) return;
    final i = current.indexWhere((x) => x.id == t.id);
    if (i >= 0 && current[i].version > t.version) return; // stale frame
    final next = [...current];
    if (t.status == TaskStatus.cancelled) {
      if (i >= 0) next.removeAt(i);
    } else if (i >= 0) {
      next[i] = t;
    } else {
      next.add(t);
    }
    state = AsyncData(next);
  }

  /// Moves a task optimistically. Returns a message for the user on failure, or null.
  Future<String?> move(Task task, TaskStatus to) async {
    final before = state.value;
    if (before == null) return null;
    state = AsyncData([
      for (final t in before)
        if (t.id == task.id)
          Task(
            id: t.id,
            enrollmentId: t.enrollmentId,
            type: t.type,
            title: t.title,
            brief: t.brief,
            status: to,
            scheduledFor: t.scheduledFor,
            dueAt: t.dueAt,
            version: t.version,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
          )
        else
          t,
    ]);
    try {
      final updated = await _api.transition(taskId: task.id, to: to, expectedVersion: task.version);
      if (ref.mounted) _upsert(updated);
      return null;
    } on ApiException catch (e) {
      if (!ref.mounted) return null;
      state = AsyncData(before);
      if (e.code == ErrorCode.versionConflict || e.code == ErrorCode.invalidTransition) {
        unawaited(refresh());
        return 'This task changed on another device. We refreshed your board.';
      }
      return messageFor(e);
    } on NetworkException {
      if (ref.mounted) state = AsyncData(before);
      return "You're offline. The task wasn't moved.";
    }
  }
}
