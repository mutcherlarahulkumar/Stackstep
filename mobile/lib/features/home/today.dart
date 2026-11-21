import 'package:stackstep/api/models.dart';

/// Pure helpers behind the Today screen, so they can be tested without widgets.

/// "Good morning", "Good afternoon" or "Good evening" for a local hour.
String greeting(int hour) => switch (hour) {
  < 5 => 'Working late',
  < 12 => 'Good morning',
  < 17 => 'Good afternoon',
  _ => 'Good evening',
};

/// What to work on next: changes requested first, then to do and in progress by due time.
/// Waiting for review and finished tasks are left out.
List<Task> upNext(Iterable<Task> tasks, {int limit = 3}) {
  final open =
      tasks
          .where((t) => t.status == TaskStatus.changesRequested || t.status == TaskStatus.todo || t.status == TaskStatus.inProgress)
          .toList()
        ..sort((a, b) {
          final ca = a.status == TaskStatus.changesRequested ? 0 : 1;
          final cb = b.status == TaskStatus.changesRequested ? 0 : 1;
          return ca != cb ? ca.compareTo(cb) : a.dueAt.compareTo(b.dueAt);
        });
  return open.take(limit).toList();
}

/// The next live class that hasn't started more than an hour ago, or null.
CalendarEntry? nextClass(Calendar? cal, DateTime now) {
  if (cal == null) return null;
  final soon =
      cal.items
          .where((e) => e.kind == CalendarKind.classSession && e.at != null && e.at!.isAfter(now.subtract(const Duration(hours: 1))))
          .toList()
        ..sort((a, b) => a.at!.compareTo(b.at!));
  return soon.firstOrNull;
}

/// The team room thread, if the student has one.
Thread? teamThread(Iterable<Thread> threads) => threads.where((t) => t.persona.team).firstOrNull;
