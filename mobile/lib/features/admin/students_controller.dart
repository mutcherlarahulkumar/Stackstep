import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:stackstep/api/api_client.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/api/validation.dart';
import 'package:stackstep/core/providers.dart';

final class StudentsState {
  const StudentsState({
    required this.query,
    required this.items,
    required this.nextCursor,
    this.loadingMore = false,
    this.searching = false,
  });

  final String query;
  final List<StudentRow> items;
  final String? nextCursor;
  final bool loadingMore;

  /// A newer query is loading; the current items stay visible meanwhile.
  final bool searching;
}

final AsyncNotifierProvider<StudentsController, StudentsState> studentsProvider =
    AsyncNotifierProvider.autoDispose<StudentsController, StudentsState>(StudentsController.new);

final class StudentsController extends AsyncNotifier<StudentsState> {
  ApiClient get _api => ref.read(apiClientProvider);
  Timer? _debounce;
  var _generation = 0;

  @override
  Future<StudentsState> build() async {
    ref.onDispose(() => _debounce?.cancel());
    return await _load('');
  }

  Future<StudentsState> _load(String query) async {
    final page = await _api.students(query: query);
    return StudentsState(query: query, items: page.items, nextCursor: page.nextCursor);
  }

  /// Debounced search. Older responses are ignored if a newer query started.
  void search(String raw) {
    final q = normalizeLine(raw);
    final clipped = q.runes.length > 100 ? String.fromCharCodes(q.runes.take(100)) : q;
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () async {
      final gen = ++_generation;
      final current = state.value;
      if (current != null) {
        state = AsyncData(StudentsState(query: current.query, items: current.items, nextCursor: current.nextCursor, searching: true));
      }
      final next = await AsyncValue.guard(() => _load(clipped));
      if (ref.mounted && gen == _generation) state = next;
    });
  }

  Future<void> loadMore() async {
    final s = state.value;
    if (s == null || s.loadingMore || s.nextCursor == null) return;
    state = AsyncData(StudentsState(query: s.query, items: s.items, nextCursor: s.nextCursor, loadingMore: true));
    try {
      final page = await _api.students(query: s.query, cursor: s.nextCursor);
      if (!ref.mounted) return;
      state = AsyncData(StudentsState(query: s.query, items: [...s.items, ...page.items], nextCursor: page.nextCursor));
    } on Exception {
      if (ref.mounted) state = AsyncData(s);
    }
  }
}
